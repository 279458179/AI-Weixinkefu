import { useState, useCallback, useRef, useEffect } from 'react'
import { t } from './i18n'
import logoUrl from './assets/logo.png'
import './index.css'

// ─── Types ───
interface LogEntry {
  time: string
  type: 'thinking' | 'reply' | 'skip' | 'error'
  content: string
}

type EngineStatus = 'idle' | 'running' | 'error'
type View = 'control' | 'settings' | 'license'

// License 状态
interface LicenseStatus {
  licenseKey: string
  licenseValid: boolean
  licenseExpiry: string
  licenseProduct: string
  licenseName: string
}

// ─── SVG Icons ───
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
)

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)

const GearIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
)

// ─── App ───
function App() {
  const [view, setView] = useState<View>('license')
  const [status, setStatus] = useState<EngineStatus>('idle')
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null)
  const [licenseLoading, setLicenseLoading] = useState(true)

  // 启动时检查 license 状态
  useEffect(() => {
    window.electron?.invoke('license:getStatus').then((status: LicenseStatus) => {
      setLicenseStatus(status)
      setLicenseLoading(false)
      // 如果已验证，直接进入控制面板
      if (status.licenseValid) {
        setView('control')
      }
    })
  }, [])

  // License 验证成功后切换到控制面板
  const handleLicenseValidated = useCallback((status: LicenseStatus) => {
    setLicenseStatus(status)
    setView('control')
  }, [])

  // 如果正在加载 license 状态，显示加载界面
  if (licenseLoading) {
    return (
      <div className="app">
        <header className="app-header">
          <img src={logoUrl} alt="SightFlow" className="app-logo" />
        </header>
        <div className="app-content">
          <div className="fade-in" style={{ textAlign: 'center', padding: 40 }}>
            <div className="status-indicator idle">
              <span className="status-text">{t('license.checking')}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        {view === 'settings' ? (
          <button
            className="bottom-btn bottom-btn-settings"
            onClick={() => setView('control')}
            style={{ width: 32, height: 32, marginRight: 4 }}
          >
            <BackIcon />
          </button>
        ) : view === 'license' ? null : null}
        <img src={logoUrl} alt="SightFlow" className="app-logo" />
      </header>

      <div className="app-content">
        {view === 'license' ? (
          <LicensePanel onValidated={handleLicenseValidated} />
        ) : view === 'control' ? (
          <ControlPanel status={status} setStatus={setStatus} />
        ) : (
          <SettingsPanel />
        )}
      </div>

      {view === 'control' && (
        <BottomBar
          status={status}
          setStatus={setStatus}
          onSettings={() => setView('settings')}
          licenseValid={licenseStatus?.licenseValid || false}
        />
      )}

      <Toast />
    </div>
  )
}

// ─── License Panel ───
function LicensePanel({ onValidated }: { onValidated: (status: LicenseStatus) => void }) {
  const [licenseId, setLicenseId] = useState('')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [expiredDate, setExpiredDate] = useState('')
  const [loaded, setLoaded] = useState(false)

  // 加载已保存的 license ID
  useEffect(() => {
    window.electron?.invoke('license:getStatus').then((status: LicenseStatus) => {
      if (status.licenseKey) {
        setLicenseId(status.licenseKey)
      }
      setLoaded(true)
    })
  }, [])

  const handleValidate = useCallback(async () => {
    if (!licenseId.trim()) {
      setError(t('license.empty'))
      return
    }

    setValidating(true)
    setError('')
    setExpired(false)
    setExpiredDate('')

    try {
      const result = await window.electron?.invoke('license:validate', licenseId.trim())

      if (result?.valid) {
        // 验证成功
        showToast(t('license.valid'), 'success')
        onValidated({
          licenseKey: licenseId.trim(),
          licenseValid: true,
          licenseExpiry: result.details?.expiry || '',
          licenseProduct: result.details?.product || '',
          licenseName: result.details?.name || ''
        })
      } else if (result?.expired) {
        // 已过期
        setExpired(true)
        setExpiredDate(result.details?.expiry || '')
        setError(t('license.expired'))
        showToast(t('license.expired'), 'error')
      } else {
        // 验证失败
        setError(result?.error || t('license.invalid'))
        showToast(result?.error || t('license.invalid'), 'error')
      }
    } catch (e: any) {
      setError(e?.message || t('license.error'))
      showToast(e?.message || t('license.error'), 'error')
    } finally {
      setValidating(false)
    }
  }, [licenseId, onValidated])

  if (!loaded) {
    return (
      <div className="fade-in" style={{ textAlign: 'center', padding: 40 }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="slide-up">
      <div className="card">
        <div className="card-title">{t('license.title')}</div>

        <div className="form-group">
          <label className="form-label">{t('license.id')}</label>
          <input
            className="form-input"
            value={licenseId}
            onChange={(e) => setLicenseId(e.target.value)}
            placeholder={t('license.id.placeholder')}
            disabled={validating}
          />
          <div className="form-hint">{t('license.id.hint')}</div>
        </div>

        {error && (
          <div className={`license-error ${expired ? 'expired' : 'invalid'}`}>
            {error}
            {expired && expiredDate && (
              <span className="license-error-date">
                {t('license.expiry')}: {expiredDate}
              </span>
            )}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleValidate}
          disabled={validating || !licenseId.trim()}
          style={{ width: '100%' }}
        >
          {validating ? t('license.validating') : t('license.validate')}
        </button>
      </div>

      <div className="card">
        <div className="card-title">{t('license.about')}</div>
        <div className="license-about">
          <p>{t('license.about.text')}</p>
          <p className="license-about-contact">{t('license.about.contact')}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Control Panel ───
function ControlPanel({
  status,
  setStatus
}: {
  status: EngineStatus
  setStatus: (s: EngineStatus) => void
}) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((type: LogEntry['type'], content: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false })
    setLogs((prev) => [...prev.slice(-99), { time, type, content }])
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  useEffect(() => {
    const cleanup = window.electron?.on('engine:log', (data: { type: string; content: string }) => {
      addLog(data.type as LogEntry['type'], data.content)

      if (data.type === 'error' && data.content.includes('引擎无法启动')) {
        setStatus('error')
      }
    })
    return cleanup
  }, [addLog, setStatus])

  const statusLabel =
    status === 'running'
      ? t('status.running')
      : status === 'error'
        ? t('status.error')
        : t('status.idle')

  return (
    <div className="fade-in">
      <div className={`status-indicator ${status}`}>
        <div className={`status-dot ${status}`} />
        <span className="status-text">{statusLabel}</span>
      </div>

      <div className="card">
        <div className="card-title">{t('control.log')}</div>
        <div className="message-log" ref={logRef}>
          {logs.length === 0 ? (
            <div className="message-log-empty">{t('control.log.empty')}</div>
          ) : (
            logs.map((entry, i) => (
              <div className="log-entry" key={i}>
                <span className="log-time">{entry.time}</span>
                <span className={`log-type ${entry.type}`}>
                  {t(`control.log.${entry.type}` as any)}
                </span>
                <span>{entry.content}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Bottom Bar ───
function BottomBar({
  status,
  setStatus,
  onSettings,
  licenseValid
}: {
  status: EngineStatus
  setStatus: (s: EngineStatus) => void
  onSettings: () => void
  licenseValid: boolean
}) {
  const handleStart = useCallback(async () => {
    // 1. 先检查 License
    if (!licenseValid) {
      showToast(t('license.required'), 'error')
      return
    }

    // 2. 检查 apiKey
    const settings = await window.electron?.invoke('settings:getAll')
    const apiKey = settings?.apiKey || ''
    if (!apiKey) {
      showToast(t('control.start.nokey'), 'error')
      return
    }

    const config = {
      apiKey,
      model: settings?.model || undefined,
      baseURL: settings?.baseURL || undefined,
      systemPrompt: settings?.systemPrompt || undefined,
      appType: settings?.appType || 'weixin',
      ragEnabled: settings?.ragEnabled || false,
      ragDirectory: settings?.ragDirectory || '',
      ragMaxResults: settings?.ragMaxResults || 5,
      ragMinScore: settings?.ragMinScore || 0.1
    }

    const result = await window.electron?.invoke('engine:start', config)
    if (result?.success) {
      setStatus('running')
      showToast(t('toast.engineStarted'), 'success')
    } else {
      setStatus('error')
      showToast(result?.error || t('toast.startFailed'), 'error')
    }
  }, [setStatus, licenseValid])

  const handleStop = useCallback(async () => {
    await window.electron?.invoke('engine:stop')
    setStatus('idle')
    showToast(t('toast.engineStopped'), 'success')
  }, [setStatus])

  const running = status === 'running'

  return (
    <div className="bottom-bar">
      {running ? (
        <button className="bottom-btn bottom-btn-stop" onClick={handleStop}>
          <StopIcon />
          {t('control.stop')}
        </button>
      ) : (
        <button className="bottom-btn bottom-btn-play" onClick={handleStart}>
          <PlayIcon />
          {t('control.start')}
        </button>
      )}
      <button className="bottom-btn bottom-btn-settings" onClick={onSettings}>
        <GearIcon />
      </button>
    </div>
  )
}

// ─── Settings Panel ───
function SettingsPanel() {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('qwen3.6-plus')
  const [baseURL, setBaseURL] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [appType, setAppType] = useState<'weixin' | 'wework'>('weixin')
  const [testing, setTesting] = useState(false)
  const [, setLoaded] = useState(false)

  // RAG 配置
  const [ragEnabled, setRagEnabled] = useState(false)
  const [ragDirectory, setRagDirectory] = useState('')
  const [ragMaxResults, setRagMaxResults] = useState(5)
  const [ragMinScore, setRagMinScore] = useState(0.1)
  const [ragStatus, setRagStatus] = useState<{
    enabled: boolean
    initialized: boolean
    directory: string
    documentCount: number
    chunkCount: number
  } | null>(null)
  const [ragRebuilding, setRagRebuilding] = useState(false)

  useEffect(() => {
    window.electron?.invoke('settings:getAll').then((settings: any) => {
      if (settings) {
        setApiKey(settings.apiKey || '')
        setModel(settings.model || 'qwen3.6-plus')
        setBaseURL(settings.baseURL || '')
        setSystemPrompt(settings.systemPrompt || '')
        setAppType(settings.appType || 'weixin')
        setRagEnabled(settings.ragEnabled || false)
        setRagDirectory(settings.ragDirectory || '')
        setRagMaxResults(settings.ragMaxResults || 5)
        setRagMinScore(settings.ragMinScore || 0.1)
      }
      setLoaded(true)
    })

    // 获取 RAG 状态
    window.electron?.invoke('rag:status').then((status: any) => {
      setRagStatus(status)
    })
  }, [])

  const handleSave = useCallback(async () => {
    await window.electron?.invoke('settings:set', {
      apiKey,
      model,
      baseURL,
      systemPrompt,
      appType,
      ragEnabled,
      ragDirectory,
      ragMaxResults,
      ragMinScore
    })

    window.electron?.invoke('engine:updateConfig', {
      apiKey: apiKey || undefined,
      model: model || undefined,
      baseURL: baseURL || undefined,
      systemPrompt: systemPrompt || undefined,
      appType,
      ragEnabled,
      ragDirectory,
      ragMaxResults,
      ragMinScore
    })

    // 更新 RAG 状态
    const status = await window.electron?.invoke('rag:status')
    setRagStatus(status)

    showToast(t('settings.saved'), 'success')
  }, [apiKey, model, baseURL, systemPrompt, appType, ragEnabled, ragDirectory, ragMaxResults, ragMinScore])

  const handleTestConnection = useCallback(async () => {
    if (!apiKey) return
    setTesting(true)
    try {
      const result = await window.electron?.invoke('engine:testConnection', {
        apiKey,
        model: model || undefined,
        baseURL: baseURL || undefined
      })
      if (result?.success) {
        showToast(t('settings.testConnection.success'), 'success')
      } else {
        showToast(`${t('settings.testConnection.fail')}: ${result?.error || ''}`, 'error')
      }
    } catch (e: any) {
      showToast(`${t('settings.testConnection.fail')}: ${e.message}`, 'error')
    } finally {
      setTesting(false)
    }
  }, [apiKey, model, baseURL])

  return (
    <div className="slide-up">
      <div className="card">
        <div className="card-title">{t('settings.ai')}</div>

        <div className="form-group">
          <label className="form-label">应用类型</label>
          <select
            className="form-input"
            value={appType}
            onChange={(e) => setAppType(e.target.value as any)}
          >
            <option value="weixin">微信</option>
            <option value="wework">企业微信</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">{t('settings.apiKey')}</label>
          <input
            className="form-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t('settings.apiKey.placeholder')}
            autoComplete="off"
          />
          <div className="form-hint">{t('settings.apiKey.hint')}</div>
        </div>

        <div className="form-group">
          <label className="form-label">{t('settings.model')}</label>
          <input
            className="form-input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={t('settings.model.placeholder')}
          />
        </div>

        <div className="form-group">
          <label className="form-label">{t('settings.baseURL')}</label>
          <input
            className="form-input"
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            placeholder={t('settings.baseURL.placeholder')}
          />
        </div>

        <div className="form-group">
          <label className="form-label">{t('settings.systemPrompt')}</label>
          <textarea
            className="form-input"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={t('settings.systemPrompt.placeholder')}
            rows={4}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={handleTestConnection}
            disabled={!apiKey || testing}
          >
            {testing ? t('settings.testConnection.testing') : t('settings.testConnection')}
          </button>
          <button className="btn btn-primary" onClick={handleSave} style={{ flex: 1 }}>
            {t('settings.save')}
          </button>
        </div>
      </div>

      {/* RAG 知识库配置 */}
      <div className="card">
        <div className="card-title">{t('settings.rag')}</div>

        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={ragEnabled}
              onChange={(e) => setRagEnabled(e.target.checked)}
            />
            {t('settings.rag.enable')}
          </label>
          <div className="form-hint">{t('settings.rag.enable.hint')}</div>
        </div>

        {ragEnabled && (
          <>
            <div className="form-group">
              <label className="form-label">{t('settings.rag.directory')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  value={ragDirectory}
                  onChange={(e) => setRagDirectory(e.target.value)}
                  placeholder={t('settings.rag.directory.placeholder')}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-secondary"
                  onClick={async () => {
                    const dir = await window.electron?.invoke('dialog:openDirectory')
                    if (dir) setRagDirectory(dir)
                  }}
                >
                  {t('settings.rag.directory.browse')}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('settings.rag.maxResults')}</label>
              <input
                className="form-input"
                type="number"
                min={1}
                max={20}
                value={ragMaxResults}
                onChange={(e) => setRagMaxResults(parseInt(e.target.value) || 5)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('settings.rag.minScore')}</label>
              <input
                className="form-input"
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={ragMinScore}
                onChange={(e) => setRagMinScore(parseFloat(e.target.value) || 0.1)}
              />
              <div className="form-hint">{t('settings.rag.minScore.hint')}</div>
            </div>

            {/* RAG 状态 */}
            {ragStatus && (
              <div className="rag-status">
                <div className="rag-status-item">
                  <span className="rag-status-label">{t('settings.rag.status.documents')}</span>
                  <span className="rag-status-value">{ragStatus.documentCount}</span>
                </div>
                <div className="rag-status-item">
                  <span className="rag-status-label">{t('settings.rag.status.chunks')}</span>
                  <span className="rag-status-value">{ragStatus.chunkCount}</span>
                </div>
                <div className="rag-status-item">
                  <span className="rag-status-label">{t('settings.rag.status.initialized')}</span>
                  <span className={`rag-status-value ${ragStatus.initialized ? 'success' : 'pending'}`}>
                    {ragStatus.initialized ? t('settings.rag.status.yes') : t('settings.rag.status.no')}
                  </span>
                </div>
              </div>
            )}

            <button
              className="btn btn-secondary"
              onClick={async () => {
                setRagRebuilding(true)
                try {
                  const result = await window.electron?.invoke('rag:rebuild')
                  if (result?.success) {
                    showToast(t('settings.rag.rebuild.success'), 'success')
                    const status = await window.electron?.invoke('rag:status')
                    setRagStatus(status)
                  } else {
                    showToast(`${t('settings.rag.rebuild.fail')}: ${result?.error || ''}`, 'error')
                  }
                } finally {
                  setRagRebuilding(false)
                }
              }}
              disabled={!ragDirectory || ragRebuilding}
            >
              {ragRebuilding ? t('settings.rag.rebuild.rebuilding') : t('settings.rag.rebuild')}
            </button>
          </>
        )}
      </div>

    </div>
  )
}

// ─── Toast ───
let _showToast: ((msg: string, type: 'success' | 'error') => void) | null = null

function showToast(msg: string, type: 'success' | 'error') {
  _showToast?.(msg, type)
}

function Toast() {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  const [type, setType] = useState<'success' | 'error'>('success')
  const timerRef = useRef<number | undefined>(undefined)

  _showToast = useCallback((msg: string, t: 'success' | 'error') => {
    setMessage(msg)
    setType(t)
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setVisible(false), 2500)
  }, [])

  return (
    <div className={`toast ${type} ${visible ? 'show' : ''}`}>{message}</div>
  )
}

export default App
