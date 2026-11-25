const { app, BrowserWindow, Menu, Tray, clipboard, dialog, globalShortcut, ipcMain, net, protocol, session, shell } = require('electron')
const { createHash } = require('node:crypto')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { origin, shortcuts, appPage, assetPath, safeExternal, permittedModelHost } = require('./boundaries.cjs')

const root = path.resolve(__dirname, '../dist')
const icon = path.join(root, 'catch-native.png')
const validMime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm' }
const intervalMs = 900
const maxText = 150_000
const maxImageBytes = 25 * 1024 ** 2
const seen = new Map()
const state = { monitoring: false, images: false, shortcut: 'CommandOrControl+Alt+Shift+C' }
let window
let tray
let timer
let quitting = false
let consent = false
let last = ''
let imagePoll = 0
let sensitiveReason

if (process.env.CATCH_PROFILE_DIR) app.setPath('userData', path.resolve(process.env.CATCH_PROFILE_DIR))
protocol.registerSchemesAsPrivileged([{ scheme: 'catch', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true, corsEnabled: true } }])

function send(channel, value) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, value)
}

function refreshTray() {
  tray?.setToolTip('Catch · clipboard ' + (state.monitoring ? 'on' : 'paused'))
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Catch', click: reveal },
    { label: 'Quick capture', click: quickCapture },
    { label: state.monitoring ? 'Pause clipboard monitoring' : 'Resume clipboard monitoring', enabled: consent, click: () => toggle(!state.monitoring) },
    { type: 'separator' },
    { label: 'Exit Catch', click: () => app.quit() },
  ]))
  send('catch:status-changed', { ...state })
}

const fingerprint = value => createHash('sha256').update(value).digest('hex')

function textPayload(text, automatic) {
  if (!text.trim()) return undefined
  if (text.length > maxText) return { key: 'skipped:long text', reason: 'text over the capture limit' }
  const reason = automatic ? sensitiveReason(text) : undefined
  if (reason) return { key: 'skipped:' + reason, reason }
  return { key: 'text:' + fingerprint(text.normalize('NFC').replace(/\s+/g, ' ').trim()), value: { kind: 'text', text } }
}

function clipboardValue(automatic, forceImage = false) {
  const text = clipboard.readText()
  const payload = textPayload(text, automatic)
  if (payload) return payload
  if ((!automatic || state.images) && (forceImage || Date.now() - imagePoll > 2300)) {
    imagePoll = Date.now()
    const image = clipboard.readImage()
    if (!image.isEmpty()) {
      const { width, height } = image.getSize()
      if (width * height > 16_000_000) return { key: 'skipped:big image', reason: 'image over the capture limit' }
      const key = 'image:' + fingerprint(image.toBitmap())
      if (automatic && key === last) return { key }
      const data = image.toPNG()
      return data.length <= maxImageBytes ? { key, value: { kind: 'image', bytes: Uint8Array.from(data) } } :
        { key: 'skipped:big image', reason: 'image over the capture limit' }
    }
    return { key: '' }
  }
  return undefined
}

function monitor() {
  if (!state.monitoring || !window || window.webContents.isLoadingMainFrame()) return
  try {
    const item = clipboardValue(true)
    if (!item || item.key === last) return
    last = item.key
    if (item.reason) { state.lastSkipped = item.reason; refreshTray(); return }
    if (!item.value) return
    const now = Date.now()
    if (now - (seen.get(item.key) ?? 0) < 120_000) return
    seen.set(item.key, now)
    for (const [key, time] of seen) if (now - time > 120_000 || seen.size > 32) seen.delete(key)
    send('catch:clipboard-capture', item.value)
  } catch {
    state.lastSkipped = 'clipboard unavailable'
    refreshTray()
  }
}

function toggle(enabled) {
  if (enabled === state.monitoring) return { ...state }
  clearInterval(timer)
  timer = undefined
  state.monitoring = enabled
  if (enabled) {
    consent = true
    try { last = clipboardValue(true, true)?.key ?? '' } catch { last = '' }
    timer = setInterval(monitor, intervalMs)
  } else {
    seen.clear()
    last = ''
  }
  refreshTray()
  return { ...state }
}

function reveal() {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function quickCapture() {
  reveal()
  send('catch:quick-capture')
}

function setShortcut(value) {
  if (value !== state.shortcut || (value && !globalShortcut.isRegistered(value))) {
    if (value && !globalShortcut.register(value, quickCapture)) {
      state.shortcutError = 'That shortcut is already in use. Choose a different one.'
      refreshTray()
      return { ...state }
    }
    if (state.shortcut && state.shortcut !== value) globalShortcut.unregister(state.shortcut)
    state.shortcut = value
  }
  state.shortcutError = undefined
  refreshTray()
  return { ...state }
}

function allowIpc(channel, handler) {
  ipcMain.handle(channel, eventHandler)
  function eventHandler(event, ...args) {
    if (event.sender !== window?.webContents || event.senderFrame?.parent !== null || !appPage(event.senderFrame?.url)) throw new Error('Blocked IPC sender.')
    return handler(...args)
  }
}

function bindIpc() {
  const bool = value => { if (typeof value !== 'boolean') throw new Error('Expected a boolean.'); return value }
  allowIpc('catch:status', () => ({ ...state }))
  allowIpc('catch:monitor', value => toggle(bool(value)))
  allowIpc('catch:images', value => {
    state.images = bool(value)
    if (state.monitoring) {
      try { last = clipboardValue(true, true)?.key ?? '' } catch { last = '' }
    }
    refreshTray()
    return { ...state }
  })
  allowIpc('catch:shortcut', value => {
    if (!shortcuts.has(value)) throw new Error('Unsupported shortcut.')
    return setShortcut(value)
  })
  allowIpc('catch:read-clipboard', () => clipboardValue(false, true)?.value ?? null)
  allowIpc('catch:write-text', value => {
    if (typeof value !== 'string' || value.length > maxText) throw new Error('Unsupported clipboard content.')
    clipboard.writeText(value)
    if (state.monitoring) last = textPayload(value, true)?.key ?? ''
    return true
  })
}

async function boot() {
  ;({ sensitiveReason } = await import(pathToFileURL(path.join(root, 'desktop-sensitive.mjs')).href))
  const profile = session.fromPartition('persist:catch-library')
  profile.setPermissionRequestHandler((_inputs, _permission, callback) => callback(false))
  profile.setPermissionCheckHandler(() => false)
  profile.webRequest.onBeforeRequest((details, callback) => {
    const allowed = appPage(details.url) || details.url.startsWith('blob:catch://app/') ||
      (details.method === 'GET' && permittedModelHost(details.url)) || details.url.startsWith('data:')
    callback({ cancel: !allowed })
  })
  await profile.protocol.handle('catch', async request => {
    const filename = request.method === 'GET' && assetPath(request.url, root)
    if (!filename) return new Response('Not found', { status: 404 })
    try {
      const response = await net.fetch(pathToFileURL(filename).href)
      const type = validMime[path.extname(filename)]
      if (!type) return response
      const headers = new Headers(response.headers)
      headers.set('Content-Type', type)
      return new Response(response.body, { status: response.status, headers })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
  bindIpc()
  window = new BrowserWindow({
    width: 1260, height: 875, minWidth: 330, minHeight: 520, show: false, icon, title: 'Catch',
    backgroundColor: '#fcfcfb', autoHideMenuBar: true,
    webPreferences: { session: profile, nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  })
  window.setMenu(null)
  window.webContents.setWindowOpenHandler(({ url }) => {
    const target = safeExternal(url)
    if (target) void shell.openExternal(target).catch(() => undefined)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => { if (!appPage(url)) event.preventDefault() })
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.webContents.on('render-process-gone', () => { toggle(false) })
  window.on('close', event => {
    if (quitting || !tray) return
    event.preventDefault()
    window.hide()
  })
  try {
    tray = new Tray(icon)
    tray.on('click', reveal)
  } catch {
    tray = undefined
  }
  setShortcut(state.shortcut)
  refreshTray()
  window.once('ready-to-show', reveal)
  await window.loadURL(origin + '/index.html')
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', reveal)
  app.on('activate', reveal)
  app.on('before-quit', () => { quitting = true; toggle(false); globalShortcut.unregisterAll() })
  app.on('window-all-closed', () => app.quit())
  void app.whenReady().then(boot).catch(() => {
    dialog.showErrorBox('Catch could not start', 'Build the browser assets with npm run build before launching Catch.')
    app.exit(1)
  })
}
