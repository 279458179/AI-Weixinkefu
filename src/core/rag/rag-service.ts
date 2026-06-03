// src/core/rag/rag-service.ts
// RAG 主服务

import * as fs from 'fs'
import * as path from 'path'
import * as electron from 'electron'
import { RAGConfig, IndexedDocument, SearchResult, SearchRequest, IndexCache } from './types'
import { Indexer } from './indexer'
import { Searcher } from './searcher'

export class RAGService {
  private config: RAGConfig
  private indexer: Indexer | null = null
  private searcher: Searcher | null = null
  private initialized: boolean = false
  private indexCachePath: string

  constructor(config: RAGConfig) {
    this.config = config

    // 索引缓存路径 (存储在用户数据目录)
    const app = electron.app
    const userDataPath = app.getPath('userData')
    this.indexCachePath = path.join(userDataPath, 'rag-index.json')
  }

  /**
   * 初始化 RAG 服务
   */
  async initialize(): Promise<{ success: boolean; error?: string; stats?: any }> {
    if (!this.config.enabled) {
      console.log('[RAG] RAG is disabled')
      return { success: true, stats: { enabled: false } }
    }

    if (!this.config.directory) {
      console.log('[RAG] No RAG directory configured')
      return { success: true, stats: { directory: null } }
    }

    try {
      this.indexer = new Indexer(this.config)

      // 尝试加载缓存索引
      const loaded = await this.loadIndexCache()

      if (!loaded) {
        // 缓存不存在或无效，重新构建
        console.log('[RAG] Building new index...')
        const result = await this.indexer.buildIndex()

        // 保存索引缓存
        await this.saveIndexCache()

        this.searcher = new Searcher(this.indexer.getDocumentsMap())
        this.initialized = true

        return { success: true, stats: result }
      }

      this.searcher = new Searcher(this.indexer.getDocumentsMap())
      this.initialized = true

      const stats = {
        documents: this.indexer.getAllDocuments().length,
        chunks: this.indexer.getAllChunks().length,
        loadedFromCache: true
      }

      console.log(`[RAG] Initialized with ${stats.documents} documents, ${stats.chunks} chunks`)
      return { success: true, stats }
    } catch (error: any) {
      console.error('[RAG] Initialization failed:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 重建索引
   */
  async rebuildIndex(): Promise<{ success: boolean; error?: string; stats?: any }> {
    if (!this.indexer) {
      return { success: false, error: 'Indexer not initialized' }
    }

    try {
      const result = await this.indexer.buildIndex()
      await this.saveIndexCache()
      this.searcher = new Searcher(this.indexer.getDocumentsMap())

      return { success: true, stats: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 检索
   */
  search(query: string, topK?: number, minScore?: number): SearchResult[] {
    if (!this.initialized || !this.searcher) {
      console.warn('[RAG] Search called before initialization')
      return []
    }

    const request: SearchRequest = {
      query,
      topK: topK ?? this.config.maxResults,
      minScore: minScore ?? this.config.minScore
    }

    const results = this.searcher.search(request)
    console.log(`[RAG] Search "${query.slice(0, 50)}..." found ${results.length} results`)

    return results
  }

  /**
   * 生成 RAG 上下文文本
   * 用于注入到 system prompt
   */
  generateContextText(results: SearchResult[], maxTokens: number = 2000): string {
    if (results.length === 0) {
      return ''
    }

    const contextParts: string[] = ['以下是相关知识库内容，请参考这些信息来回答问题：\n']
    let currentLength = 0
    const maxChars = maxTokens * 2 // 粗略估计

    for (const result of results) {
      const part = `【${result.document.title}】\n${result.chunk.content}\n`

      if (currentLength + part.length > maxChars) {
        break
      }

      contextParts.push(part)
      currentLength += part.length
    }

    contextParts.push(
      '\n请基于以上知识库内容回答用户问题。如果知识库中没有相关信息，请基于你的通用知识回答。'
    )

    return contextParts.join('\n---\n')
  }

  /**
   * 更新配置
   */
  async updateConfig(config: Partial<RAGConfig>): Promise<{ success: boolean; error?: string }> {
    const oldDirectory = this.config.directory
    const oldEnabled = this.config.enabled

    this.config = { ...this.config, ...config }

    // 如果目录或启用状态变化，需要重新初始化
    if (oldDirectory !== this.config.directory || oldEnabled !== this.config.enabled) {
      this.initialized = false
      this.indexer = null
      this.searcher = null

      if (this.config.enabled && this.config.directory) {
        return await this.initialize()
      }
    }

    return { success: true }
  }

  /**
   * 获取状态
   */
  getStatus(): {
    enabled: boolean
    initialized: boolean
    directory: string
    documentCount: number
    chunkCount: number
  } {
    return {
      enabled: this.config.enabled,
      initialized: this.initialized,
      directory: this.config.directory,
      documentCount: this.indexer?.getAllDocuments().length ?? 0,
      chunkCount: this.indexer?.getAllChunks().length ?? 0
    }
  }

  /**
   * 保存索引缓存
   */
  private async saveIndexCache(): Promise<void> {
    if (!this.indexer) return

    try {
      const data = this.indexer.exportIndex()
      await fs.promises.writeFile(this.indexCachePath, JSON.stringify(data, null, 2), 'utf-8')
      console.log(`[RAG] Index cache saved to ${this.indexCachePath}`)
    } catch (error: any) {
      console.error('[RAG] Failed to save index cache:', error)
    }
  }

  /**
   * 加载索引缓存
   */
  private async loadIndexCache(): Promise<boolean> {
    if (!fs.existsSync(this.indexCachePath)) {
      return false
    }

    try {
      const content = await fs.promises.readFile(this.indexCachePath, 'utf-8')
      const data: IndexCache = JSON.parse(content)

      // 检查是否有文件变更
      if (await this.hasFilesChanged(data.documents)) {
        console.log('[RAG] Files have changed, need to rebuild index')
        return false
      }

      this.indexer!.importIndex(data)
      return true
    } catch (error: any) {
      console.error('[RAG] Failed to load index cache:', error)
      return false
    }
  }

  /**
   * 检查文件是否有变更
   */
  private async hasFilesChanged(documents: IndexedDocument[]): Promise<boolean> {
    for (const doc of documents) {
      try {
        const stats = await fs.promises.stat(doc.filePath)
        if (stats.mtimeMs > doc.lastModified + 1000) {
          return true
        }
      } catch {
        // 文件不存在
        return true
      }
    }
    return false
  }
}