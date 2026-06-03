// src/core/rag/searcher.ts
// 关键词检索实现

import { IndexedDocument, TextChunk, SearchResult, SearchRequest } from './types'

export class Searcher {
  private documents: Map<string, IndexedDocument>
  private chunks: TextChunk[]

  constructor(documents: Map<string, IndexedDocument>) {
    this.documents = documents
    this.chunks = this.buildChunkIndex(documents)
  }

  private buildChunkIndex(documents: Map<string, IndexedDocument>): TextChunk[] {
    const chunks: TextChunk[] = []
    for (const doc of documents.values()) {
      chunks.push(...doc.chunks)
    }
    return chunks
  }

  /**
   * 关键词检索
   * 使用简化的 BM25 算法思路
   */
  search(request: SearchRequest): SearchResult[] {
    const { query, topK = 5, minScore = 0.1 } = request

    // 提取查询关键词
    const queryKeywords = this.extractQueryKeywords(query)

    if (queryKeywords.length === 0) {
      return []
    }

    // 计算每个 chunk 的相关度分数
    const results: SearchResult[] = []

    for (const chunk of this.chunks) {
      // 找到对应的文档
      const doc = this.findDocument(chunk.documentId)
      if (!doc) continue

      const { score, highlights } = this.calculateScore(queryKeywords, chunk)

      if (score >= minScore) {
        results.push({
          document: doc,
          chunk,
          score,
          highlights
        })
      }
    }

    // 按分数排序，取前 topK
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }

  /**
   * 提取查询关键词
   */
  private extractQueryKeywords(query: string): string[] {
    const keywords: string[] = []

    // 提取中文词汇
    const chineseMatches = query.match(/[一-龥]+/g) || []
    for (const match of chineseMatches) {
      if (match.length <= 4) {
        keywords.push(match)
      } else {
        // 长文本按 2-4 字分词
        for (let i = 0; i <= match.length - 2; i++) {
          keywords.push(match.slice(i, i + 2))
        }
      }
    }

    // 提取英文词汇
    const englishMatches = query.match(/[a-zA-Z]+/g) || []
    keywords.push(...englishMatches)

    return [...new Set(keywords)]
  }

  /**
   * 计算相关度分数
   */
  private calculateScore(
    queryKeywords: string[],
    chunk: TextChunk
  ): { score: number; highlights: string[] } {
    const chunkKeywords = chunk.keywords
    const chunkContent = chunk.content.toLowerCase()

    let score = 0
    const matchedKeywords: string[] = []

    for (const queryKeyword of queryKeywords) {
      const keywordLower = queryKeyword.toLowerCase()

      // 精确匹配
      if (chunkKeywords.some((k) => k.toLowerCase() === keywordLower)) {
        score += 1.0
        matchedKeywords.push(queryKeyword)
      }
      // 包含匹配 (关键词包含在内容中)
      else if (chunkContent.includes(keywordLower)) {
        score += 0.5
        matchedKeywords.push(queryKeyword)
      }
    }

    // 计算覆盖率
    const coverage = matchedKeywords.length / queryKeywords.length

    // 最终分数 = 匹配分数 * 覆盖率权重
    const finalScore = score * (0.5 + coverage * 0.5) / queryKeywords.length

    // 提取高亮片段
    const highlights: string[] = []
    for (const keyword of matchedKeywords.slice(0, 5)) {
      const index = chunkContent.indexOf(keyword.toLowerCase())
      if (index !== -1) {
        const start = Math.max(0, index - 20)
        const end = Math.min(chunkContent.length, index + keyword.length + 20)
        const highlight = chunk.content.slice(start, end)
        highlights.push(`...${highlight}...`)
      }
    }

    return { score: Math.min(finalScore, 1.0), highlights }
  }

  /**
   * 根据 chunk 的 documentId 找到对应的文档
   */
  private findDocument(documentId: string): IndexedDocument | null {
    for (const doc of this.documents.values()) {
      if (doc.id === documentId) {
        return doc
      }
    }
    return null
  }

  /**
   * 更新索引
   */
  updateIndex(documents: Map<string, IndexedDocument>): void {
    this.documents = documents
    this.chunks = this.buildChunkIndex(documents)
  }
}