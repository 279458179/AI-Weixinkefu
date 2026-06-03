// src/renderer/src/i18n.ts
// 简单的中英文国际化

export type Locale = 'zh' | 'en'

const translations = {
  zh: {
    // Header
    'app.title': 'SightFlow Desktop',
    'app.version': 'v0.1.0',

    // Tabs
    'tab.control': '控制',
    'tab.settings': '设置',

    // Control
    'control.status': '引擎状态',
    'status.idle': '待命',
    'status.running': '运行中',
    'status.error': '异常',
    'control.start': '启动引擎',
    'control.stop': '停止引擎',
    'control.start.nokey': '请先在设置页填写 API Key',
    'control.log': '运行日志',
    'control.log.empty': '引擎尚未启动',
    'control.log.thinking': '思考',
    'control.log.reply': '回复',
    'control.log.skip': '跳过',
    'control.log.error': '错误',

    // Settings
    'settings.ai': 'AI 模型配置',
    'settings.apiKey': 'API Key',
    'settings.apiKey.placeholder': '输入你的豆包 API Key',
    'settings.apiKey.hint': '在火山引擎控制台获取',
    'settings.model': '模型',
    'settings.model.placeholder': 'doubao-seed-1-6-251015',
    'settings.baseURL': 'Base URL',
    'settings.baseURL.placeholder': 'https://ark.cn-beijing.volces.com/api/v3',
    'settings.systemPrompt': 'System Prompt',
    'settings.systemPrompt.placeholder': '你是一个微信自动回复助手。根据截图中的聊天内容，生成合适的回复...',
    'settings.testConnection': '测试连接',
    'settings.testConnection.testing': '测试中...',
    'settings.testConnection.success': '连接成功',
    'settings.testConnection.fail': '连接失败',
    'settings.save': '保存配置',
    'settings.saved': '配置已保存',

    'settings.general': '通用设置',
    'settings.language': '语言',

    // RAG 知识库
    'settings.rag': '知识库配置 (RAG)',
    'settings.rag.enable': '启用知识库',
    'settings.rag.enable.hint': 'AI 将从知识库中检索相关内容，辅助生成回复',
    'settings.rag.directory': '知识库目录',
    'settings.rag.directory.placeholder': '选择包含知识文档的目录',
    'settings.rag.directory.browse': '浏览',
    'settings.rag.maxResults': '最大检索结果数',
    'settings.rag.minScore': '最低相关度分数',
    'settings.rag.minScore.hint': '低于此分数的结果将被过滤 (0-1)',
    'settings.rag.status.documents': '文档数量',
    'settings.rag.status.chunks': '文本片段',
    'settings.rag.status.initialized': '索引状态',
    'settings.rag.status.yes': '已就绪',
    'settings.rag.status.no': '未初始化',
    'settings.rag.rebuild': '重建索引',
    'settings.rag.rebuild.rebuilding': '正在重建...',
    'settings.rag.rebuild.success': '索引重建成功',
    'settings.rag.rebuild.fail': '索引重建失败',

    // Toast
    'toast.engineStarted': '引擎已启动',
    'toast.engineStopped': '引擎已停止',
    'toast.startFailed': '启动失败',
  },
  en: {
    'app.title': 'SightFlow Desktop',
    'app.version': 'v0.1.0',

    'tab.control': 'Control',
    'tab.settings': 'Settings',

    'control.status': 'Engine Status',
    'status.idle': 'Idle',
    'status.running': 'Running',
    'status.error': 'Error',
    'control.start': 'Start Engine',
    'control.stop': 'Stop Engine',
    'control.start.nokey': 'Please set API Key in Settings first',
    'control.log': 'Activity Log',
    'control.log.empty': 'Engine not started yet',
    'control.log.thinking': 'Thinking',
    'control.log.reply': 'Reply',
    'control.log.skip': 'Skip',
    'control.log.error': 'Error',

    'settings.ai': 'AI Model Configuration',
    'settings.apiKey': 'API Key',
    'settings.apiKey.placeholder': 'Enter your Doubao API Key',
    'settings.apiKey.hint': 'Get it from Volcengine Console',
    'settings.model': 'Model',
    'settings.model.placeholder': 'doubao-seed-1-6-251015',
    'settings.baseURL': 'Base URL',
    'settings.baseURL.placeholder': 'https://ark.cn-beijing.volces.com/api/v3',
    'settings.systemPrompt': 'System Prompt',
    'settings.systemPrompt.placeholder': 'You are a WeChat auto-reply assistant...',
    'settings.testConnection': 'Test Connection',
    'settings.testConnection.testing': 'Testing...',
    'settings.testConnection.success': 'Connection OK',
    'settings.testConnection.fail': 'Connection Failed',
    'settings.save': 'Save',
    'settings.saved': 'Settings saved',

    'settings.general': 'General',
    'settings.language': 'Language',

    // RAG Knowledge Base
    'settings.rag': 'Knowledge Base (RAG)',
    'settings.rag.enable': 'Enable Knowledge Base',
    'settings.rag.enable.hint': 'AI will retrieve relevant content from knowledge base to assist replies',
    'settings.rag.directory': 'Knowledge Base Directory',
    'settings.rag.directory.placeholder': 'Select a directory containing knowledge documents',
    'settings.rag.directory.browse': 'Browse',
    'settings.rag.maxResults': 'Max Results',
    'settings.rag.minScore': 'Min Score Threshold',
    'settings.rag.minScore.hint': 'Results below this score will be filtered (0-1)',
    'settings.rag.status.documents': 'Documents',
    'settings.rag.status.chunks': 'Text Chunks',
    'settings.rag.status.initialized': 'Index Status',
    'settings.rag.status.yes': 'Ready',
    'settings.rag.status.no': 'Not Initialized',
    'settings.rag.rebuild': 'Rebuild Index',
    'settings.rag.rebuild.rebuilding': 'Rebuilding...',
    'settings.rag.rebuild.success': 'Index rebuilt successfully',
    'settings.rag.rebuild.fail': 'Failed to rebuild index',

    // Toast
    'toast.engineStarted': 'Engine started',
    'toast.engineStopped': 'Engine stopped',
    'toast.startFailed': 'Failed to start',
  }
} as const

type TranslationKey = keyof typeof translations['zh']

let currentLocale: Locale = 'zh'

export function setLocale(locale: Locale) {
  currentLocale = locale
}

export function getLocale(): Locale {
  return currentLocale
}

export function t(key: TranslationKey): string {
  return translations[currentLocale]?.[key] || translations.zh[key] || key
}
