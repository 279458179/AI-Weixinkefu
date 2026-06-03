// src/core/local-hooks.ts
// LocalHooks — AgentHooks 的本地实现
//
// 用 AIClient 直接调用豆包模型，替代旧项目的 WebSocket + 后端服务。
// v0.2: 增加 RAG 知识库检索支持

import { AgentHooks, MessageContext, ReplyAction, ActionItem, ActionResult } from './hooks'
import { AIClient, AIClientConfig } from './ai-client'
import { RAGService, RAGConfig } from './rag'

export interface LocalHooksConfig {
  ai: Partial<AIClientConfig> & { apiKey: string }
  rag?: RAGConfig
}

export class LocalHooks implements AgentHooks {
  private aiClient: AIClient
  private ragService: RAGService | null = null

  constructor(config: LocalHooksConfig) {
    this.aiClient = new AIClient(config.ai)

    // 初始化 RAG 服务
    if (config.rag?.enabled && config.rag?.directory) {
      this.ragService = new RAGService(config.rag)
    }
  }

  async onEngineStart(): Promise<void> {
    console.log('[LocalHooks] Engine started')

    // 验证 AI API 连接
    const testResult = await this.aiClient.testConnection()
    if (!testResult.success) {
      console.error('[LocalHooks] AI API 连接测试失败:', testResult.error)
    } else {
      console.log('[LocalHooks] AI API 连接正常')
    }

    // 初始化 RAG 服务
    if (this.ragService) {
      const ragResult = await this.ragService.initialize()
      if (ragResult.success) {
        console.log('[LocalHooks] RAG 服务初始化成功:', ragResult.stats)
      } else {
        console.error('[LocalHooks] RAG 服务初始化失败:', ragResult.error)
      }
    }
  }

  async onEngineStop(): Promise<void> {
    console.log('[LocalHooks] Engine stopped')
  }

  /**
   * 核心方法：检测到新消息后，拿截图问 AI，返回回复 action
   *
   * 流程：
   * 1. 收到 MessageContext（包含截图）
   * 2. RAG 检索相关知识（如果启用）
   * 3. 发送截图 + RAG 上下文给 AI
   * 4. AI 返回回复文字
   * 5. yield { type: 'text', content: '回复内容' }
   */
  async *getReply(context: MessageContext): AsyncIterable<ReplyAction> {
    if (!context.screenshot) {
      console.warn('[LocalHooks] 没有截图，跳过')
      yield { type: 'skip' }
      return
    }

    // 通知 UI：AI 正在思考
    yield { type: 'thinking', content: '正在分析聊天内容...' }

    try {
      // 1. RAG 检索 (如果启用且有 OCR 文本)
      let ragContext = ''
      if (this.ragService && context.ocrText) {
        const searchResults = this.ragService.search(context.ocrText)
        if (searchResults.length > 0) {
          ragContext = this.ragService.generateContextText(searchResults)
          console.log(`[LocalHooks] RAG 检索到 ${searchResults.length} 条相关知识`)
          yield { type: 'thinking', content: `已检索到 ${searchResults.length} 条相关知识...` }
        }
      }

      // 2. 构建包含 RAG 上下文的 system prompt
      const enrichedPrompt = this.buildSystemPrompt(ragContext)

      // 3. 调用 AI
      const reply = await this.aiClient.getReply(context.screenshot, enrichedPrompt)

      if (!reply) {
        // AI 判定不需要回复
        yield { type: 'skip' }
        return
      }

      // 返回回复文字
      yield { type: 'text', content: reply }
    } catch (error: any) {
      console.error('[LocalHooks] AI 回复失败:', error)
      yield { type: 'skip' }
    }
  }

  /**
   * 构建包含 RAG 上下文的 system prompt
   */
  private buildSystemPrompt(ragContext: string): string {
    const basePrompt = this.aiClient.getSystemPrompt()

    if (!ragContext) {
      return basePrompt
    }

    // 将 RAG 上下文注入到 system prompt
    return `${basePrompt}

## 知识库参考
${ragContext}`
  }

  /**
   * 执行外部触发的动作列表（主动任务）
   */
  async *executeActions(params: {
    actions: ActionItem[]
    targets?: string[]
  }): AsyncIterable<ActionResult> {
    for (const action of params.actions) {
      try {
        yield { action, success: true }
      } catch (error: any) {
        yield { action, success: false, error: error?.message || String(error) }
      }
    }
  }

  onActionComplete(action: ActionItem, result: { success: boolean }): void {
    console.log('[LocalHooks] Action completed:', action.type, result.success ? '✓' : '✗')
  }

  onError(error: Error, phase: string): void {
    console.error(`[LocalHooks] Error in ${phase}:`, error.message)
  }

  /**
   * 更新 AI 配置
   */
  updateAIConfig(config: Partial<AIClientConfig>): void {
    this.aiClient.updateConfig(config)
  }

  /**
   * 更新 RAG 配置
   */
  async updateRAGConfig(config: Partial<RAGConfig>): Promise<{ success: boolean; error?: string }> {
    if (this.ragService) {
      return await this.ragService.updateConfig(config)
    } else if (config.enabled && config.directory) {
      // 创建新的 RAG 服务
      this.ragService = new RAGService({
        enabled: true,
        directory: config.directory,
        maxResults: config.maxResults || 5,
        minScore: config.minScore || 0.1
      })
      return await this.ragService.initialize()
    }
    return { success: true }
  }

  /**
   * 获取 RAG 状态
   */
  getRAGStatus(): {
    enabled: boolean
    initialized: boolean
    directory: string
    documentCount: number
    chunkCount: number
  } {
    if (!this.ragService) {
      return { enabled: false, initialized: false, directory: '', documentCount: 0, chunkCount: 0 }
    }
    return this.ragService.getStatus()
  }

  /**
   * 重建 RAG 索引
   */
  async rebuildRAGIndex(): Promise<{ success: boolean; error?: string; stats?: any }> {
    if (!this.ragService) {
      return { success: false, error: 'RAG 服务未启用' }
    }
    return await this.ragService.rebuildIndex()
  }
}