// src/core/rag/indexer.ts
// 文档索引管理

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { IndexedDocument, TextChunk, RAGConfig, IndexCache } from './types'
import { FileParser } from './file-parser'
import { TextProcessor } from './text-processor'

const INDEX_VERSION = '1.0'

export class Indexer {
  private parser: FileParser
  private processor: TextProcessor
  private documents: Map<string, IndexedDocument> = new Map()
  private config: RAGConfig

  constructor(config: RAGConfig) {
    this.config = config
    this.parser = new FileParser()
    this.processor = new TextProcessor()
  }

  /**
   * 构建索引
   * 扫描目录，解析所有支持的文件
   */
  async buildIndex(): Promise<{ total: number; added: number; updated: number; errors: string[] }> {
    const errors: string[] = []
    let total = 0
    let added = 0
    let updated = 0

    if (!this.config.directory) {
      throw new Error('RAG directory not configured')
    }

    // 检查目录是否存在
    if (!fs.existsSync(this.config.directory)) {
      throw new Error(`RAG directory does not exist: ${this.config.directory}`)
    }

    // 扫描目录
    const files = await this.scanDirectory(this.config.directory)
    total = files.length

    for (const filePath of files) {
      try {
        const result = await this.indexFile(filePath)
        if (result === 'added') added++
        else if (result === 'updated') updated++
      } catch (error: any) {
        errors.push(`${filePath}: ${error.message}`)
      }
    }

    // 清理已删除文件的索引
    await this.cleanDeletedFiles(files)

    console.log(
      `[RAG] Index built: ${total} files, ${added} added, ${updated} updated, ${errors.length} errors`
    )

    return { total, added, updated, errors }
  }

  /**
   * 扫描目录获取所有支持的文件
   */
  private async scanDirectory(dir: string): Promise<string[]> {
    const files: string[] = []
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // 递归扫描子目录
        const subFiles = await this.scanDirectory(fullPath)
        files.push(...subFiles)
      } else if (entry.isFile() && this.parser.isSupported(fullPath)) {
        files.push(fullPath)
      }
    }

    return files
  }

  /**
   * 索引单个文件
   */
  async indexFile(filePath: string): Promise<'added' | 'updated' | 'skipped'> {
    const stats = await fs.promises.stat(filePath)
    const lastModified = stats.mtimeMs
    const existingDoc = this.documents.get(filePath)

    // 检查是否需要更新
    if (existingDoc && existingDoc.lastModified >= lastModified) {
      return 'skipped'
    }

    // 解析文件
    const parsed = await this.parser.parse(filePath)

    // 分块
    const chunks = this.processor.chunkText(parsed.content)

    // 创建文档索引
    const docId = this.generateDocId(filePath, lastModified)
    const document: IndexedDocument = {
      id: docId,
      filePath,
      fileName: path.basename(filePath),
      fileType: this.parser.getFileType(filePath),
      title: parsed.title,
      content: parsed.content,
      chunks: chunks.map((content, index) => ({
        id: `${docId}_chunk_${index}`,
        documentId: docId,
        content,
        keywords: this.processor.extractKeywords(content),
        position: index
      })),
      keywords: this.processor.extractKeywords(parsed.content),
      lastModified,
      indexedAt: Date.now()
    }

    this.documents.set(filePath, document)

    return existingDoc ? 'updated' : 'added'
  }

  /**
   * 清理已删除文件的索引
   */
  private async cleanDeletedFiles(existingFiles: string[]): Promise<void> {
    const existingSet = new Set(existingFiles)

    for (const [filePath] of this.documents) {
      if (!existingSet.has(filePath)) {
        this.documents.delete(filePath)
        console.log(`[RAG] Removed deleted file from index: ${filePath}`)
      }
    }
  }

  /**
   * 获取所有文档
   */
  getAllDocuments(): IndexedDocument[] {
    return [...this.documents.values()]
  }

  /**
   * 获取所有 chunks
   */
  getAllChunks(): TextChunk[] {
    const chunks: TextChunk[] = []
    for (const doc of this.documents.values()) {
      chunks.push(...doc.chunks)
    }
    return chunks
  }

  /**
   * 获取文档 Map
   */
  getDocumentsMap(): Map<string, IndexedDocument> {
    return this.documents
  }

  /**
   * 导出索引用于持久化
   */
  exportIndex(): IndexCache {
    return {
      version: INDEX_VERSION,
      documents: this.getAllDocuments(),
      timestamp: Date.now()
    }
  }

  /**
   * 导入索引
   */
  importIndex(data: IndexCache): void {
    if (data.version !== INDEX_VERSION) {
      console.warn(
        `[RAG] Index version mismatch: ${data.version} vs ${INDEX_VERSION}, rebuilding...`
      )
      return
    }

    this.documents.clear()
    for (const doc of data.documents) {
      this.documents.set(doc.filePath, doc)
    }

    console.log(`[RAG] Imported ${this.documents.size} documents from cache`)
  }

  /**
   * 生成文档 ID
   */
  private generateDocId(filePath: string, lastModified: number): string {
    return crypto
      .createHash('md5')
      .update(`${filePath}:${lastModified}`)
      .digest('hex')
      .slice(0, 12)
  }
}