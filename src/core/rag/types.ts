// src/core/rag/types.ts
// RAG 类型定义

// RAG 配置
export interface RAGConfig {
  enabled: boolean
  directory: string // RAG 文件目录路径
  maxResults: number // 最大检索结果数，默认 5
  minScore: number // 最小相关度阈值，默认 0.1
}

// 支持的文件类型
export type FileType = 'txt' | 'md' | 'json' | 'docx' | 'xlsx' | 'pdf'

// 文本分块
export interface TextChunk {
  id: string // chunk 唯一标识
  documentId: string // 所属文档 ID
  content: string // chunk 内容
  keywords: string[] // chunk 级别关键词
  position: number // 在文档中的位置
}

// 索引后的文档
export interface IndexedDocument {
  id: string // 文档唯一标识
  filePath: string // 文件绝对路径
  fileName: string // 文件名
  fileType: FileType // 文件类型
  title: string // 标题
  content: string // 纯文本内容
  chunks: TextChunk[] // 分块后的内容
  keywords: string[] // 提取的关键词
  lastModified: number // 文件修改时间戳
  indexedAt: number // 索引时间戳
}

// 检索结果
export interface SearchResult {
  document: IndexedDocument
  chunk: TextChunk
  score: number // 相关度分数 0-1
  highlights: string[] // 匹配的关键词高亮
}

// 检索请求
export interface SearchRequest {
  query: string // 检索查询
  topK?: number // 返回结果数量
  minScore?: number // 最小相关度
}

// 索引缓存格式
export interface IndexCache {
  version: string
  documents: IndexedDocument[]
  timestamp: number
}

// 解析后的文件内容
export interface ParsedFile {
  content: string
  title: string
  metadata?: Record<string, any>
}