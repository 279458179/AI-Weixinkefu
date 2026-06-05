import {
  ChannelContext,
  ChannelSession,
  ProviderAdapter,
  ProviderInput,
  RuntimeHostControls,
  SessionEvent
} from './session-types'
import { AppType } from './rpa/types'

interface KnowledgeBaseConfig {
  enabled: boolean
  path: string
}

interface RuntimeHostOptions<TState> {
  appType: AppType
  channel: ChannelSession<TState>
  provider: ProviderAdapter
  initialState: TState
  knowledgeBase?: KnowledgeBaseConfig
  onLog?: (type: 'thinking' | 'reply' | 'skip' | 'error', content: string) => void
}

export class RuntimeHost<TState> {
  private running = false
  private stopping = false
  private processingQueue = false
  private readonly queue: SessionEvent[] = []
  private readonly timers = new Set<NodeJS.Timeout>()
  private readonly context: ChannelContext<TState>
  private knowledgeBaseContent: string = ''

  constructor(private readonly options: RuntimeHostOptions<TState>) {
    this.context = {
      appType: options.appType,
      state: options.initialState,
      host: this.createControls()
    }
  }

  async startSession(): Promise<void> {
    if (this.running) return

    this.running = true
    this.stopping = false

    // 加载知识库内容
    if (this.options.knowledgeBase?.enabled && this.options.knowledgeBase.path) {
      try {
        const { readFile, readdir } = await import('node:fs/promises')
        const { join } = await import('path')
        const { existsSync } = await import('node:fs')

        const kbPath = this.options.knowledgeBase.path
        if (existsSync(kbPath)) {
          const entries = await readdir(kbPath, { withFileTypes: true })
          const contents: string[] = []

          for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.md')) {
              const filePath = join(kbPath, entry.name)
              const content = await readFile(filePath, 'utf-8')
              contents.push(`--- ${entry.name} ---\n${content}\n`)
            }
          }

          this.knowledgeBaseContent = contents.join('\n')
          this.log('thinking', `已加载知识库 (${contents.length} 个文件)`)
        }
      } catch (error: any) {
        this.log('error', `知识库加载失败: ${error?.message || String(error)}`)
      }
    }

    this.log('reply', '引擎已启动')

    try {
      await this.options.channel.onStart(this.context)
    } catch (error: any) {
      this.log('error', error?.message || String(error))
      await this.stopSession('start_failed')
      throw error
    }
  }

  async stopSession(_reason?: string): Promise<void> {
    if (!this.running || this.stopping) return

    this.stopping = true
    this.running = false

    for (const timer of this.timers) {
      clearTimeout(timer)
    }
    this.timers.clear()
    this.queue.length = 0

    try {
      await this.options.channel.onStop(this.context)
    } finally {
      this.processingQueue = false
      this.stopping = false
      this.log('skip', '引擎已停止')
    }
  }

  isRunning(): boolean {
    return this.running
  }

  updateAppType(appType: AppType): void {
    this.context.appType = appType
  }

  private createControls(): RuntimeHostControls {
    return {
      enqueue: (event) => this.enqueue(event),
      schedule: (event, delayMs) => this.schedule(event, delayMs),
      runProvider: (input: ProviderInput) => {
        // 注入知识库内容
        if (this.options.knowledgeBase?.enabled && this.knowledgeBaseContent) {
          input.knowledgeBase = {
            enabled: true,
            content: this.knowledgeBaseContent
          }
        }
        return this.options.provider.run(input)
      },
      log: (type, content) => this.log(type, content),
      isRunning: () => this.running,
      stopSession: async (reason?: string) => this.stopSession(reason)
    }
  }

  private enqueue(event: SessionEvent): void {
    if (!this.running) return

    this.queue.push(event)
    void this.drainQueue()
  }

  private schedule(event: SessionEvent, delayMs: number): void {
    if (!this.running) return

    const timer = setTimeout(() => {
      this.timers.delete(timer)
      this.enqueue(event)
    }, delayMs)

    this.timers.add(timer)
  }

  private async drainQueue(): Promise<void> {
    if (this.processingQueue || !this.running) return

    this.processingQueue = true
    try {
      while (this.queue.length > 0 && this.running) {
        const event = this.queue.shift()
        if (!event) continue

        await this.options.channel.onEvent(event, this.context)
      }
    } catch (error: any) {
      this.log('error', error?.message || String(error))
      await this.stopSession('runtime_error')
    } finally {
      this.processingQueue = false
    }
  }

  private log(type: 'thinking' | 'reply' | 'skip' | 'error', content: string): void {
    if (this.options.onLog) {
      this.options.onLog(type, content)
    } else {
      console.log(`[RuntimeHost] [${type}] ${content}`)
    }
  }
}
