import { app, shell, BrowserWindow, ipcMain, desktopCapturer, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { checkAndRequestPermissions } from './permission'
import Store from 'electron-store'
import { Engine } from '../core/engine'
import { LocalHooks } from '../core/local-hooks'
import { AIClient } from '../core/ai-client'
import { RPADevice } from '../core/rpa-device'
import { validateLicense, LicenseValidateResult } from '../core/license-service'

const StoreClass = typeof Store === 'function' ? Store : ((Store as any).default as typeof Store)
const settingsStore = new StoreClass({
  name: 'settings',
  defaults: {
    apiKey: '',
    model: '',
    baseURL: '',
    systemPrompt: '',
    locale: 'zh',
    appType: 'weixin',
    // RAG 配置
    ragEnabled: false,
    ragDirectory: '',
    ragMaxResults: 5,
    ragMinScore: 0.1,
    // License 配置
    licenseKey: '',
    licenseValid: false,
    licenseExpiry: '',
    licenseProduct: '',
    licenseName: ''
  }
})

let engine: Engine | null = null
let localHooks: LocalHooks | null = null

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 420,
    height: 700,
    minWidth: 360,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#ffffff',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  await checkAndRequestPermissions()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  // ── Settings 持久化 ──
  ipcMain.handle('settings:getAll', async () => {
    return settingsStore.store
  })

  ipcMain.handle('settings:get', async (_event, key: string) => {
    return settingsStore.get(key)
  })

  ipcMain.handle('settings:set', async (_event, data: Record<string, any>) => {
    for (const [key, value] of Object.entries(data)) {
      settingsStore.set(key, value)
    }
    return { success: true }
  })

  // ── 文件目录选择对话框 ──
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ── Engine 操控 ──
  ipcMain.handle('engine:start', async (_event, config) => {
    if (engine?.isRunning()) return { success: false, error: '引擎已在运行中' }
    try {
      // 构建 RAG 配置
      const ragConfig = config.ragEnabled
        ? {
            enabled: true,
            directory: config.ragDirectory || '',
            maxResults: config.ragMaxResults || 5,
            minScore: config.ragMinScore || 0.1
          }
        : undefined

      localHooks = new LocalHooks({
        ai: {
          apiKey: config.apiKey,
          model: config.model,
          baseURL: config.baseURL,
          systemPrompt: config.systemPrompt
        },
        rag: ragConfig
      })

      const device = new RPADevice()
      device.setAppType(config.appType || 'weixin')
      device.setAIConfig({
        apiKey: config.apiKey,
        model: config.model,
        baseURL: config.baseURL
      })

      const mainWindow = BrowserWindow.getAllWindows()[0]
      engine = new Engine(localHooks, device, (type, content) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('engine:log', { type, content })
        }
      })

      engine.start().catch((err: any) => {
        console.error('[Main] Engine loop error:', err)
      })

      return { success: true }
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('engine:stop', async () => {
    if (!engine?.isRunning()) return { success: false, error: '引擎未运行' }
    engine.stop()
    return { success: true }
  })

  ipcMain.handle('engine:status', async () => {
    return { running: engine?.isRunning() ?? false }
  })

  ipcMain.handle('engine:updateConfig', async (_event, config) => {
    if (localHooks) {
      localHooks.updateAIConfig(config)

      // 更新 RAG 配置
      if (config.ragEnabled !== undefined || config.ragDirectory !== undefined) {
        await localHooks.updateRAGConfig({
          enabled: config.ragEnabled,
          directory: config.ragDirectory,
          maxResults: config.ragMaxResults,
          minScore: config.ragMinScore
        })
      }

      if (engine) {
        if (config.appType) {
          (engine as any).device?.setAppType(config.appType)
        }
        if (config.apiKey) {
          (engine as any).device?.setAIConfig({
            apiKey: config.apiKey,
            model: config.model,
            baseURL: config.baseURL
          })
        }
      }
      return { success: true }
    }
    return { success: false, error: '引擎未初始化' }
  })

  ipcMain.handle('engine:testConnection', async (_event, config) => {
    const client = new AIClient(config)
    return client.testConnection()
  })

  // ── RAG 相关 IPC ──
  ipcMain.handle('rag:status', async () => {
    if (!localHooks) {
      return { enabled: false, initialized: false, directory: '', documentCount: 0, chunkCount: 0 }
    }
    return localHooks.getRAGStatus()
  })

  ipcMain.handle('rag:rebuild', async () => {
    if (!localHooks) {
      return { success: false, error: '引擎未初始化' }
    }
    return await localHooks.rebuildRAGIndex()
  })

  // ── License 验证 IPC ──
  ipcMain.handle('license:validate', async (_event, licenseId: string) => {
    const result: LicenseValidateResult = await validateLicense(licenseId)

    if (result.valid && result.details) {
      // 验证成功，保存 license 信息
      settingsStore.set('licenseKey', licenseId)
      settingsStore.set('licenseValid', true)
      settingsStore.set('licenseExpiry', result.details.expiry || '')
      settingsStore.set('licenseProduct', result.details.product || '')
      settingsStore.set('licenseName', result.details.name || '')
      console.log('[Main] License 验证成功，已保存')
    } else {
      // 验证失败，清除无效状态
      settingsStore.set('licenseValid', false)
    }

    return result
  })

  ipcMain.handle('license:getStatus', async () => {
    return {
      licenseKey: settingsStore.get('licenseKey') || '',
      licenseValid: settingsStore.get('licenseValid') || false,
      licenseExpiry: settingsStore.get('licenseExpiry') || '',
      licenseProduct: settingsStore.get('licenseProduct') || '',
      licenseName: settingsStore.get('licenseName') || ''
    }
  })

  ipcMain.handle('license:clear', async () => {
    settingsStore.set('licenseKey', '')
    settingsStore.set('licenseValid', false)
    settingsStore.set('licenseExpiry', '')
    settingsStore.set('licenseProduct', '')
    settingsStore.set('licenseName', '')
    return { success: true }
  })

  ipcMain.handle('capture-screen', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      })
      if (sources && sources.length > 0) {
        return sources[0].thumbnail.toDataURL()
      }
      return null
    } catch (error) {
      console.error('Screen capture failed:', error)
      return null
    }
  })

  // ── 测试入口：VLM 并行 vs 串行 ──
  ipcMain.handle('test:vlm-parallel', async () => {
    const apiKey = settingsStore.get('apiKey') as string
    if (!apiKey) return { error: '请先在设置中填写 API Key' }
    const { runVlmParallelTest } = await import('../core/rpa/tests/test-vlm-parallel')
    return await runVlmParallelTest(apiKey, 'weixin')
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})