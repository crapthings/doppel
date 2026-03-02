const { app, BrowserWindow, WebContentsView, dialog, ipcMain, session } = require('electron')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const DEV_SERVER_TIMEOUT_MS = 20000
const STATE_WRITE_DEBOUNCE_MS = 250
const DEFAULT_HOME_URL = 'https://example.com/'
const BOOKMARKS_PAGE_URL = 'doppel://bookmarks'
const BOOKMARKS_PAGE_TITLE = '收藏夹'
const APP_DISPLAY_NAME = 'Doppel'
const MIN_VIEW_EDGE_PX = 80
const DEFAULT_IDENTITY_COLOR = '#3b82f6'
const CONTENT_PRELOAD_PATH = path.join(__dirname, 'content-preload.cjs')
const APP_ICON_PATH = path.join(__dirname, '..', 'icon.png')

let mainWindow = null
let state = { identities: [], tabs: [], activeTabId: null, bookmarks: [], deletedPartitions: [] }
let persistTimer = null
let rendererViewBounds = null
let overlayOpen = false
const tabViews = new Map()
const sessionHeaderConfigured = new Set()
const sessionLanguageOverrides = new Map()

app.setName(APP_DISPLAY_NAME)

function id (prefix) {
  return `${prefix}-${crypto.randomUUID()}`
}

function stateFilePath () {
  return path.join(app.getPath('userData'), 'state.json')
}

function stateBackupPath () {
  return path.join(app.getPath('userData'), `state.bad.${Date.now()}.json`)
}

function safeStateSnapshot () {
  return JSON.parse(JSON.stringify(state))
}

function broadcastState () {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('state:updated', safeStateSnapshot())
}

function persistStateNow () {
  const file = stateFilePath()
  const tmp = `${file}.tmp`

  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
    fs.renameSync(tmp, file)
  } catch (error) {
    console.error('Failed to persist state', error)
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch {}
  }
}

function schedulePersist () {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistStateNow()
  }, STATE_WRITE_DEBOUNCE_MS)
}

function findIdentityById (identityId) {
  return state.identities.find((item) => item.id === identityId)
}

function findTabById (tabId) {
  return state.tabs.find((item) => item.id === tabId)
}

function normalizeUrl (input) {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('URL cannot be empty.')
  if (raw === BOOKMARKS_PAGE_URL) return BOOKMARKS_PAGE_URL

  const value = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`
  const parsed = new URL(value)

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported.')
  }

  return parsed.toString()
}

function ensureDefaultState () {
  if (!Array.isArray(state.deletedPartitions)) {
    state.deletedPartitions = []
  }
  if (!Array.isArray(state.bookmarks)) {
    state.bookmarks = []
  }

  if (state.identities.length === 0) {
    const identityId = id('identity')
    state.identities.push({
      id: identityId,
      name: 'Default',
      partition: `persist:identity-${identityId}`,
      color: DEFAULT_IDENTITY_COLOR,
      avatarDataUrl: '',
      browserProfile: createDefaultBrowserProfile()
    })
  }

  const validIdentityIds = new Set(state.identities.map((item) => item.id))
  state.tabs = state.tabs.filter((tab) => validIdentityIds.has(tab.identityId))

  if (state.tabs.length === 0) {
    const tabId = id('tab')
    state.tabs.push({
      id: tabId,
      identityId: state.identities[0].id,
      url: BOOKMARKS_PAGE_URL,
      title: BOOKMARKS_PAGE_TITLE,
      isActive: true
    })
    state.activeTabId = tabId
  }

  if (!findTabById(state.activeTabId)) {
    state.activeTabId = state.tabs[0].id
  }

  for (const tab of state.tabs) {
    tab.isActive = tab.id === state.activeTabId
  }
}

function recoverOrphanIdentityPartitions () {
  const partitionsDir = path.join(app.getPath('userData'), 'Partitions')
  let partitionFolders = []

  try {
    if (!fs.existsSync(partitionsDir)) return
    partitionFolders = fs.readdirSync(partitionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('identity-'))
      .map((entry) => entry.name)
  } catch (error) {
    console.error('Failed to scan partitions directory', error)
    return
  }

  const existingPartitions = new Set(state.identities.map((identity) => identity.partition))
  const deletedPartitions = new Set((state.deletedPartitions || []).map((item) => String(item)))
  let recoveredCount = 0

  for (const folder of partitionFolders) {
    const partition = `persist:${folder}`
    if (existingPartitions.has(partition) || deletedPartitions.has(partition)) continue

    const inferredIdentityId = folder.slice('identity-'.length) || id('identity')
    state.identities.push({
      id: inferredIdentityId,
      name: `Recovered ${inferredIdentityId.slice(-6)}`,
      partition,
      color: DEFAULT_IDENTITY_COLOR,
      avatarDataUrl: '',
      browserProfile: createDefaultBrowserProfile()
    })

    existingPartitions.add(partition)
    recoveredCount += 1
  }

  if (recoveredCount > 0) {
    console.log(`Recovered ${recoveredCount} identity partition(s) from disk.`)
    schedulePersist()
  }
}

function loadStateFromDisk () {
  const file = stateFilePath()

  try {
    if (!fs.existsSync(file)) return
    const payload = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(payload)

    if (!parsed || !Array.isArray(parsed.identities) || !Array.isArray(parsed.tabs)) {
      throw new Error('Malformed state data.')
    }

    state = {
      identities: parsed.identities
        .filter((item) => item && item.id && item.name && item.partition)
        .map((item) => ({
          id: String(item.id),
          name: String(item.name),
          partition: String(item.partition),
          color: sanitizeIdentityColor(item.color),
          avatarDataUrl: sanitizeAvatarDataUrl(item.avatarDataUrl),
          browserProfile: sanitizeBrowserProfile(item.browserProfile)
        })),
      tabs: parsed.tabs
        .filter((item) => item && item.id && item.identityId)
        .map((item) => ({
          id: String(item.id),
          identityId: String(item.identityId),
          url: String(item.url || BOOKMARKS_PAGE_URL),
          title: String(item.title || item.url || BOOKMARKS_PAGE_TITLE),
          isActive: false
        })),
      bookmarks: Array.isArray(parsed.bookmarks)
        ? parsed.bookmarks
            .filter((item) => item && item.id && item.url)
            .map((item) => {
              try {
                const url = normalizeUrl(item.url)
                if (url === BOOKMARKS_PAGE_URL) return null
                return {
                  id: String(item.id),
                  title: String(item.title || '').trim() || inferBookmarkTitle(url),
                  url
                }
              } catch {
                return null
              }
            })
            .filter(Boolean)
        : [],
      activeTabId: parsed.activeTabId ? String(parsed.activeTabId) : null,
      deletedPartitions: Array.isArray(parsed.deletedPartitions)
        ? parsed.deletedPartitions
            .map((item) => String(item || '').trim())
            .filter((item) => item.startsWith('persist:'))
        : []
    }
  } catch (error) {
    console.error('Failed to load state, falling back to defaults.', error)
    try {
      fs.copyFileSync(file, stateBackupPath())
    } catch {}
    state = { identities: [], tabs: [], activeTabId: null, bookmarks: [], deletedPartitions: [] }
  }
}

function sanitizeIdentityColor (value) {
  const color = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : DEFAULT_IDENTITY_COLOR
}

function sanitizeAvatarDataUrl (value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,[a-zA-Z0-9+/=\s]+$/.test(raw)) return ''
  return raw
}

function inferBookmarkTitle (url) {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return '未命名书签'
  }
}

function createDefaultBrowserProfile () {
  return {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    language: 'zh-CN',
    timezone: 'Asia/Shanghai',
    platform: 'MacIntel',
    screenWidth: 1512,
    screenHeight: 982,
    deviceScaleFactor: 2
  }
}

function sanitizeBrowserProfile (value) {
  const fallback = createDefaultBrowserProfile()
  const profile = value && typeof value === 'object' ? value : {}
  const userAgent = String(profile.userAgent || '').trim() || fallback.userAgent
  const language = String(profile.language || '').trim() || fallback.language
  const timezone = String(profile.timezone || '').trim() || fallback.timezone
  const platform = String(profile.platform || '').trim() || fallback.platform
  const screenWidth = Math.max(320, Math.min(7680, Number(profile.screenWidth) || fallback.screenWidth))
  const screenHeight = Math.max(320, Math.min(4320, Number(profile.screenHeight) || fallback.screenHeight))
  const deviceScaleFactor = Math.max(1, Math.min(4, Number(profile.deviceScaleFactor) || fallback.deviceScaleFactor))
  return { userAgent, language, timezone, platform, screenWidth, screenHeight, deviceScaleFactor }
}

function encodeBrowserProfileArg (browserProfile) {
  return `--doppel-browser-profile=${Buffer.from(JSON.stringify(browserProfile), 'utf8').toString('base64')}`
}

function applySessionLanguageHeaders (tabSession, browserProfile) {
  const sessionKey = String(tabSession?.partition || '')
  if (!sessionKey) return
  sessionLanguageOverrides.set(sessionKey, String(browserProfile.language || '').trim())
  if (sessionHeaderConfigured.has(sessionKey)) return
  sessionHeaderConfigured.add(sessionKey)

  tabSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const nextHeaders = { ...(details.requestHeaders || {}) }
    const language = sessionLanguageOverrides.get(sessionKey)
    if (language) {
      nextHeaders['Accept-Language'] = `${language},zh;q=0.9,en;q=0.8`
    }
    callback({ requestHeaders: nextHeaders })
  })
}

function applyWebContentsProfile (webContents, identity) {
  if (!webContents || webContents.isDestroyed() || !identity) return
  const browserProfile = sanitizeBrowserProfile(identity.browserProfile)
  if (browserProfile.userAgent) {
    webContents.setUserAgent(browserProfile.userAgent)
  }
  applySessionLanguageHeaders(webContents.session, browserProfile)
}

async function waitForDevServer (url, timeoutMs) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET', cache: 'no-store' })
      if (response.ok) return
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for dev server: ${url}`)
}

function layoutActiveView () {
  if (!mainWindow || mainWindow.isDestroyed() || !state.activeTabId) return
  if (overlayOpen) return

  const view = tabViews.get(state.activeTabId)
  if (!view) return

  const [width, height] = mainWindow.getContentSize()
  const fallbackBounds = createFallbackBounds(width, height)

  const nextBounds = normalizeViewBounds(rendererViewBounds, width, height) || fallbackBounds

  view.setBounds({
    x: nextBounds.x,
    y: nextBounds.y,
    width: nextBounds.width,
    height: nextBounds.height
  })
}

function createFallbackBounds (contentWidth, contentHeight) {
  return {
    x: 340,
    y: 170,
    width: Math.max(0, contentWidth - 356),
    height: Math.max(0, contentHeight - 186)
  }
}

function normalizeViewBounds (bounds, contentWidth, contentHeight) {
  if (!bounds || typeof bounds !== 'object') return null

  const rawX = Number(bounds.x)
  const rawY = Number(bounds.y)
  const rawWidth = Number(bounds.width)
  const rawHeight = Number(bounds.height)

  if (![rawX, rawY, rawWidth, rawHeight].every(Number.isFinite)) return null
  if (rawWidth < MIN_VIEW_EDGE_PX || rawHeight < MIN_VIEW_EDGE_PX) return null

  // Reject implausibly tiny renderer bounds to avoid top-left mini-rect regressions.
  const fallback = createFallbackBounds(contentWidth, contentHeight)
  if (rawWidth < fallback.width * 0.5 || rawHeight < fallback.height * 0.5) return null

  const x = Math.max(0, Math.min(Math.round(rawX), Math.max(0, contentWidth - MIN_VIEW_EDGE_PX)))
  const y = Math.max(0, Math.min(Math.round(rawY), Math.max(0, contentHeight - MIN_VIEW_EDGE_PX)))

  const maxWidth = Math.max(0, contentWidth - x)
  const maxHeight = Math.max(0, contentHeight - y)
  const width = Math.min(Math.max(0, Math.round(rawWidth)), maxWidth)
  const height = Math.min(Math.max(0, Math.round(rawHeight)), maxHeight)

  if (width < MIN_VIEW_EDGE_PX || height < MIN_VIEW_EDGE_PX) return null
  return { x, y, width, height }
}

function attachActiveView () {
  if (!mainWindow || mainWindow.isDestroyed()) return

  for (const [tabId, view] of tabViews.entries()) {
    if (tabId !== state.activeTabId || overlayOpen) {
      try {
        mainWindow.contentView.removeChildView(view)
      } catch {}
    }
  }

  if (!state.activeTabId || overlayOpen) return

  const activeView = tabViews.get(state.activeTabId)
  if (!activeView) return

  try {
    mainWindow.contentView.addChildView(activeView)
  } catch {}

  layoutActiveView()
}

function wireTabEvents (tab, view) {
  view.webContents.on('did-navigate', (_event, url) => {
    tab.url = url
    schedulePersist()
    broadcastState()
  })

  view.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame === false) return
    tab.url = url
    schedulePersist()
    broadcastState()
  })

  view.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault()
    tab.title = title || tab.url || 'New Tab'
    schedulePersist()
    broadcastState()
  })

  view.webContents.on('render-process-gone', (_event, details) => {
    console.error('Tab render process gone', { tabId: tab.id, details })
  })

  view.webContents.setWindowOpenHandler(() => {
    const identity = findIdentityById(tab.identityId)
    if (!identity) return { action: 'deny' }

    const browserProfile = sanitizeBrowserProfile(identity.browserProfile)
    const popupSession = session.fromPartition(identity.partition)
    applySessionLanguageHeaders(popupSession, browserProfile)

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 980,
        height: 760,
        minWidth: 720,
        minHeight: 560,
        parent: mainWindow || undefined,
        autoHideMenuBar: true,
        webPreferences: {
          session: popupSession,
          preload: CONTENT_PRELOAD_PATH,
          additionalArguments: [encodeBrowserProfileArg(browserProfile)],
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      }
    }
  })

  view.webContents.on('did-create-window', (window) => {
    const identity = findIdentityById(tab.identityId)
    if (!identity) return
    applyWebContentsProfile(window.webContents, identity)
  })
}

function createViewForTab (tab) {
  if (tab.url === BOOKMARKS_PAGE_URL) return null
  if (tabViews.has(tab.id)) return tabViews.get(tab.id)

  const identity = findIdentityById(tab.identityId)
  if (!identity) throw new Error(`Identity not found for tab: ${tab.id}`)
  const browserProfile = sanitizeBrowserProfile(identity.browserProfile)

  const tabSession = session.fromPartition(identity.partition)
  applySessionLanguageHeaders(tabSession, browserProfile)
  const view = new WebContentsView({
    webPreferences: {
      session: tabSession,
      preload: CONTENT_PRELOAD_PATH,
      additionalArguments: [encodeBrowserProfileArg(browserProfile)],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  applyWebContentsProfile(view.webContents, identity)

  wireTabEvents(tab, view)
  tabViews.set(tab.id, view)

  view.webContents.loadURL(tab.url).catch((error) => {
    console.error('Failed to load tab URL', { tabId: tab.id, url: tab.url, error })
  })

  return view
}

function activateTab (tabId) {
  const tab = findTabById(tabId)
  if (!tab) throw new Error('Tab not found.')

  state.activeTabId = tabId
  for (const item of state.tabs) {
    item.isActive = item.id === tabId
  }

  attachActiveView()
  schedulePersist()
  broadcastState()
}

function destroyTabView (tabId) {
  const view = tabViews.get(tabId)
  if (!view) return
  try {
    mainWindow.contentView.removeChildView(view)
  } catch {}
  try {
    if (!view.webContents.isDestroyed()) {
      view.webContents.destroy()
    }
  } catch {}
  tabViews.delete(tabId)
}

function closeTab (tabId) {
  const index = state.tabs.findIndex((item) => item.id === tabId)
  if (index === -1) throw new Error('Tab not found.')

  const [removedTab] = state.tabs.splice(index, 1)
  destroyTabView(removedTab.id)

  if (state.tabs.length === 0) {
    const identity = state.identities[0]
    const newTab = {
      id: id('tab'),
      identityId: identity.id,
      url: BOOKMARKS_PAGE_URL,
      title: BOOKMARKS_PAGE_TITLE,
      isActive: true
    }
    state.tabs.push(newTab)
    createViewForTab(newTab)
    state.activeTabId = newTab.id
  } else if (removedTab.id === state.activeTabId) {
    state.activeTabId = state.tabs[Math.max(0, index - 1)]?.id || state.tabs[0].id
  }

  activateTab(state.activeTabId)
}

function removeIdentity (identityId) {
  const index = state.identities.findIndex((item) => item.id === identityId)
  if (index === -1) throw new Error('Identity not found.')

  const [removedIdentity] = state.identities.splice(index, 1)
  if (removedIdentity?.partition) {
    const partition = String(removedIdentity.partition)
    if (!Array.isArray(state.deletedPartitions)) state.deletedPartitions = []
    if (!state.deletedPartitions.includes(partition)) {
      state.deletedPartitions.push(partition)
    }
    removeIdentityPartitionFolder(partition)
  }

  const removedTabIds = state.tabs
    .filter((tab) => tab.identityId === identityId)
    .map((tab) => tab.id)
  state.tabs = state.tabs.filter((tab) => tab.identityId !== identityId)
  for (const tabId of removedTabIds) {
    destroyTabView(tabId)
  }

  if (state.identities.length === 0) {
    const fallbackIdentityId = id('identity')
    state.identities.push({
      id: fallbackIdentityId,
      name: 'Default',
      partition: `persist:identity-${fallbackIdentityId}`,
      color: DEFAULT_IDENTITY_COLOR,
      avatarDataUrl: '',
      browserProfile: createDefaultBrowserProfile()
    })
  }

  if (!findTabById(state.activeTabId)) {
    state.activeTabId = state.tabs[0]?.id || null
  }

  if (state.tabs.length === 0) {
    const identity = state.identities[0]
    const tab = {
      id: id('tab'),
      identityId: identity.id,
      url: BOOKMARKS_PAGE_URL,
      title: BOOKMARKS_PAGE_TITLE,
      isActive: true
    }
    state.tabs.push(tab)
    createViewForTab(tab)
    state.activeTabId = tab.id
  }

  for (const tab of state.tabs) {
    tab.isActive = tab.id === state.activeTabId
  }

  attachActiveView()
  schedulePersist()
  broadcastState()
}

function removeIdentityPartitionFolder (partition) {
  try {
    const partitionName = String(partition || '').replace(/^persist:/, '')
    if (!partitionName) return
    const partitionPath = path.join(app.getPath('userData'), 'Partitions', partitionName)
    fs.rmSync(partitionPath, { recursive: true, force: true })
  } catch (error) {
    console.warn('Failed to remove identity partition folder', { partition, error: String(error?.message || error) })
  }
}

async function navigateTab (tabId, inputUrl) {
  const tab = findTabById(tabId)
  if (!tab) throw new Error('Tab not found.')

  const normalized = normalizeUrl(inputUrl)
  tab.url = normalized
  tab.title = normalized === BOOKMARKS_PAGE_URL ? BOOKMARKS_PAGE_TITLE : normalized

  if (normalized === BOOKMARKS_PAGE_URL) {
    destroyTabView(tabId)
    attachActiveView()
    schedulePersist()
    broadcastState()
    return
  }

  let view = tabViews.get(tabId)
  if (!view) {
    view = createViewForTab(tab)
  }
  if (!view) throw new Error('Tab view not found.')
  await view.webContents.loadURL(normalized)
  attachActiveView()
  schedulePersist()
  broadcastState()
}

function createIdentity (name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('Identity name cannot be empty.')

  const identityId = id('identity')
  state.identities.push({
    id: identityId,
    name: trimmed,
    partition: `persist:identity-${identityId}`,
    color: DEFAULT_IDENTITY_COLOR,
    avatarDataUrl: '',
    browserProfile: createDefaultBrowserProfile()
  })
  state.deletedPartitions = (state.deletedPartitions || []).filter((partition) => partition !== `persist:identity-${identityId}`)

  schedulePersist()
  broadcastState()
}

function updateIdentityProfile (payload) {
  const identityId = payload?.identityId
  const identity = findIdentityById(identityId)
  if (!identity) throw new Error('Identity not found.')

  const trimmed = String(payload?.name || '').trim()
  if (!trimmed) throw new Error('Identity name cannot be empty.')

  identity.name = trimmed
  identity.color = sanitizeIdentityColor(payload?.color)
  identity.avatarDataUrl = sanitizeAvatarDataUrl(payload?.avatarDataUrl)
  identity.browserProfile = sanitizeBrowserProfile(payload?.browserProfile)

  for (const tab of state.tabs) {
    if (tab.identityId !== identity.id) continue
    const view = tabViews.get(tab.id)
    if (!view) continue
    applyWebContentsProfile(view.webContents, identity)
  }
  schedulePersist()
  broadcastState()
}

function createTab (identityId, inputUrl, options = {}) {
  const identity = findIdentityById(identityId)
  if (!identity) throw new Error('Identity not found.')
  const shouldActivate = options.activate !== false

  const url = normalizeUrl(inputUrl || BOOKMARKS_PAGE_URL)
  const tab = {
    id: id('tab'),
    identityId,
    url,
    title: url === BOOKMARKS_PAGE_URL ? BOOKMARKS_PAGE_TITLE : url,
    isActive: false
  }

  state.tabs.push(tab)
  if (url !== BOOKMARKS_PAGE_URL) {
    createViewForTab(tab)
  }
  if (shouldActivate) {
    activateTab(tab.id)
    return
  }

  schedulePersist()
  broadcastState()
}

function reorderTabs (orderedTabIds) {
  if (!Array.isArray(orderedTabIds) || orderedTabIds.length === 0) return

  const existingTabsById = new Map(state.tabs.map((tab) => [tab.id, tab]))
  const nextTabs = []
  const seen = new Set()

  for (const rawId of orderedTabIds) {
    const tabId = String(rawId || '')
    if (!tabId || seen.has(tabId)) continue
    const tab = existingTabsById.get(tabId)
    if (!tab) continue
    nextTabs.push(tab)
    seen.add(tabId)
  }

  for (const tab of state.tabs) {
    if (seen.has(tab.id)) continue
    nextTabs.push(tab)
  }

  state.tabs = nextTabs
  for (const tab of state.tabs) {
    tab.isActive = tab.id === state.activeTabId
  }

  schedulePersist()
  broadcastState()
}

function createBookmark (payload) {
  const url = normalizeUrl(payload?.url)
  if (url === BOOKMARKS_PAGE_URL) throw new Error('该地址不能添加为书签。')
  if (state.bookmarks.some((item) => item.url === url)) {
    throw new Error('该网址已在收藏夹中。')
  }
  const title = String(payload?.title || '').trim() || inferBookmarkTitle(url)
  state.bookmarks.push({
    id: id('bookmark'),
    title,
    url
  })
  schedulePersist()
  broadcastState()
}

function updateBookmark (payload) {
  const bookmarkId = String(payload?.bookmarkId || '')
  const bookmark = state.bookmarks.find((item) => item.id === bookmarkId)
  if (!bookmark) throw new Error('Bookmark not found.')

  const url = normalizeUrl(payload?.url)
  if (url === BOOKMARKS_PAGE_URL) throw new Error('该地址不能添加为书签。')
  if (state.bookmarks.some((item) => item.id !== bookmarkId && item.url === url)) {
    throw new Error('该网址已在收藏夹中。')
  }
  const title = String(payload?.title || '').trim() || inferBookmarkTitle(url)
  bookmark.title = title
  bookmark.url = url
  schedulePersist()
  broadcastState()
}

function removeBookmark (bookmarkId) {
  const idValue = String(bookmarkId || '')
  const index = state.bookmarks.findIndex((item) => item.id === idValue)
  if (index === -1) throw new Error('Bookmark not found.')
  state.bookmarks.splice(index, 1)
  schedulePersist()
  broadcastState()
}

function reorderBookmarks (orderedBookmarkIds) {
  if (!Array.isArray(orderedBookmarkIds) || orderedBookmarkIds.length === 0) return
  const existingById = new Map(state.bookmarks.map((bookmark) => [bookmark.id, bookmark]))
  const seen = new Set()
  const next = []

  for (const rawId of orderedBookmarkIds) {
    const bookmarkId = String(rawId || '')
    if (!bookmarkId || seen.has(bookmarkId)) continue
    const item = existingById.get(bookmarkId)
    if (!item) continue
    next.push(item)
    seen.add(bookmarkId)
  }

  for (const item of state.bookmarks) {
    if (seen.has(item.id)) continue
    next.push(item)
  }

  state.bookmarks = next
  schedulePersist()
  broadcastState()
}

function registerIpcHandlers () {
  ipcMain.handle('app:get-state', () => safeStateSnapshot())
  ipcMain.handle('identity:create', (_event, name) => {
    createIdentity(name)
    return safeStateSnapshot()
  })
  ipcMain.handle('identity:update-name', (_event, payload) => {
    updateIdentityProfile(payload)
    return safeStateSnapshot()
  })
  ipcMain.handle('identity:update-profile', (_event, payload) => {
    updateIdentityProfile(payload)
    return safeStateSnapshot()
  })
  ipcMain.handle('identity:remove', (_event, identityId) => {
    removeIdentity(identityId)
    return safeStateSnapshot()
  })
  ipcMain.handle('tab:create', (_event, payload) => {
    createTab(payload?.identityId, payload?.url)
    return safeStateSnapshot()
  })
  ipcMain.handle('tab:activate', (_event, tabId) => {
    activateTab(tabId)
    return safeStateSnapshot()
  })
  ipcMain.handle('tab:close', (_event, tabId) => {
    closeTab(tabId)
    return safeStateSnapshot()
  })
  ipcMain.handle('tab:navigate', async (_event, payload) => {
    await navigateTab(payload?.tabId, payload?.url)
    return safeStateSnapshot()
  })
  ipcMain.handle('tab:reorder', (_event, payload) => {
    reorderTabs(payload?.orderedTabIds)
    return safeStateSnapshot()
  })
  ipcMain.handle('bookmark:create', (_event, payload) => {
    createBookmark(payload)
    return safeStateSnapshot()
  })
  ipcMain.handle('bookmark:update', (_event, payload) => {
    updateBookmark(payload)
    return safeStateSnapshot()
  })
  ipcMain.handle('bookmark:remove', (_event, bookmarkId) => {
    removeBookmark(bookmarkId)
    return safeStateSnapshot()
  })
  ipcMain.handle('bookmark:reorder', (_event, payload) => {
    reorderBookmarks(payload?.orderedBookmarkIds)
    return safeStateSnapshot()
  })
  ipcMain.handle('view:set-bounds', (_event, bounds) => {
    if (!bounds || typeof bounds !== 'object' || !mainWindow || mainWindow.isDestroyed()) return false

    const [contentWidth, contentHeight] = mainWindow.getContentSize()
    const normalized = normalizeViewBounds(bounds, contentWidth, contentHeight)
    if (!normalized) return false

    rendererViewBounds = normalized
    layoutActiveView()
    return true
  })
  ipcMain.handle('view:set-overlay-open', (_event, open) => {
    overlayOpen = Boolean(open)
    attachActiveView()
    return true
  })
}

async function createMainWindow () {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 980,
    minHeight: 700,
    show: false,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('resize', () => {
    layoutActiveView()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Window load failed', { errorCode, errorDescription, validatedURL })
  })

  if (!app.isPackaged && DEV_SERVER_URL) {
    await waitForDevServer(DEV_SERVER_URL, DEV_SERVER_TIMEOUT_MS)
    await mainWindow.loadURL(DEV_SERVER_URL)
    return
  }

  const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
  await mainWindow.loadFile(indexPath)
}

function restoreTabs () {
  for (const tab of state.tabs) {
    try {
      tab.url = normalizeUrl(tab.url || DEFAULT_HOME_URL)
    } catch {
      tab.url = DEFAULT_HOME_URL
    }
    createViewForTab(tab)
  }

  attachActiveView()
}

process.on('uncaughtException', (error) => {
  console.error('uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason)
})

app.whenReady().then(async () => {
  try {
    if (process.platform === 'darwin' && app.dock && fs.existsSync(APP_ICON_PATH)) {
      app.dock.setIcon(APP_ICON_PATH)
    }
    loadStateFromDisk()
    recoverOrphanIdentityPartitions()
    ensureDefaultState()
    registerIpcHandlers()
    await createMainWindow()
    restoreTabs()
    broadcastState()
  } catch (error) {
    console.error('Failed to start application', error)
    dialog.showErrorBox('Startup Error', String(error.message || error))
    app.quit()
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow()
      restoreTabs()
      broadcastState()
    }
  })
})

app.on('before-quit', () => {
  persistStateNow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
