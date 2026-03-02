import { create } from 'zustand'

const DEFAULT_IDENTITY_COLOR = '#3b82f6'
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024
const BOOKMARKS_PAGE_URL = 'doppel://bookmarks'
const BROWSER_PROFILE_PRESETS = [
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    language: 'zh-CN',
    timezone: 'Asia/Shanghai',
    platform: 'MacIntel',
    screenWidth: 1512,
    screenHeight: 982,
    deviceScaleFactor: 2
  },
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    language: 'en-US',
    timezone: 'America/Los_Angeles',
    platform: 'Win32',
    screenWidth: 1920,
    screenHeight: 1080,
    deviceScaleFactor: 1
  },
  {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    language: 'en-GB',
    timezone: 'Europe/London',
    platform: 'Linux x86_64',
    screenWidth: 1440,
    screenHeight: 900,
    deviceScaleFactor: 1.5
  }
]

const EMPTY_MAIN_STATE = {
  identities: [],
  tabs: [],
  bookmarks: [],
  activeTabId: null
}

function getActiveTab (appState) {
  return appState.tabs.find((tab) => tab.id === appState.activeTabId) || null
}

function normalizeColor (value) {
  const color = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : DEFAULT_IDENTITY_COLOR
}

function createDefaultBrowserProfile () {
  return { ...BROWSER_PROFILE_PRESETS[0] }
}

function sanitizeBrowserProfile (value) {
  const fallback = createDefaultBrowserProfile()
  const profile = value && typeof value === 'object' ? value : {}
  return {
    userAgent: String(profile.userAgent || '').trim() || fallback.userAgent,
    language: String(profile.language || '').trim() || fallback.language,
    timezone: String(profile.timezone || '').trim() || fallback.timezone,
    platform: String(profile.platform || '').trim() || fallback.platform,
    screenWidth: Math.max(320, Math.min(7680, Number(profile.screenWidth) || fallback.screenWidth)),
    screenHeight: Math.max(320, Math.min(4320, Number(profile.screenHeight) || fallback.screenHeight)),
    deviceScaleFactor: Math.max(1, Math.min(4, Number(profile.deviceScaleFactor) || fallback.deviceScaleFactor))
  }
}

function pickRandomBrowserProfile () {
  const index = Math.floor(Math.random() * BROWSER_PROFILE_PRESETS.length)
  return { ...BROWSER_PROFILE_PRESETS[index] }
}

function loadImageFromFile (file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('头像图片读取失败。'))
    }
    image.src = objectUrl
  })
}

async function convertAvatarToDataUrl (file, size = 40) {
  if (!file || typeof file !== 'object') throw new Error('未选择头像文件。')
  if (!String(file.type || '').startsWith('image/')) throw new Error('请选择图片文件。')
  if (file.size > MAX_AVATAR_SIZE_BYTES) throw new Error('头像文件过大，请控制在 5MB 以内。')

  const image = await loadImageFromFile(file)
  const sourceSize = Math.max(1, Math.min(image.width, image.height))
  const sx = Math.max(0, Math.floor((image.width - sourceSize) / 2))
  const sy = Math.max(0, Math.floor((image.height - sourceSize) / 2))

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('头像处理失败，请重试。')

  context.clearRect(0, 0, size, size)
  context.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, size, size)

  const webpDataUrl = canvas.toDataURL('image/webp', 0.85)
  if (webpDataUrl && webpDataUrl !== 'data:,') return webpDataUrl
  return canvas.toDataURL('image/png')
}

export const useUiStore = create((set, get) => ({
  initialized: false,
  hasApi: typeof window !== 'undefined' && Boolean(window.api),
  appState: EMPTY_MAIN_STATE,
  selectedIdentityId: '',
  newIdentityName: '',
  editModalOpen: false,
  editingIdentityId: '',
  editingIdentityName: '',
  editingIdentityColor: DEFAULT_IDENTITY_COLOR,
  editingIdentityAvatarDataUrl: '',
  editingBrowserProfile: createDefaultBrowserProfile(),
  newTabUrl: BOOKMARKS_PAGE_URL,
  addressInput: '',
  error: '',
  unsubscribe: null,

  setError: (error) => set({ error: String(error || '') }),
  clearError: () => set({ error: '' }),
  setNewIdentityName: (name) => set({ newIdentityName: name }),
  setEditingIdentityName: (name) => set({ editingIdentityName: name }),
  setEditingIdentityColor: (color) => set({ editingIdentityColor: normalizeColor(color) }),
  setEditingIdentityAvatarDataUrl: (avatarDataUrl) => set({ editingIdentityAvatarDataUrl: String(avatarDataUrl || '') }),
  setEditingBrowserProfileField: (key, value) => {
    const current = get().editingBrowserProfile
    const next = { ...current, [key]: value }
    set({ editingBrowserProfile: sanitizeBrowserProfile(next) })
  },
  refreshEditingBrowserProfile: () => {
    set({ editingBrowserProfile: sanitizeBrowserProfile(pickRandomBrowserProfile()) })
  },
  setNewTabUrl: (url) => set({ newTabUrl: url }),
  setAddressInput: (url) => set({ addressInput: url }),
  selectIdentity: (identityId) => set({ selectedIdentityId: identityId }),

  applyMainState: (nextState, options = {}) => {
    const { selectIdentityId = null, keepAddressInput = false } = options
    set((current) => {
      const identities = nextState?.identities || []
      const tabs = nextState?.tabs || []
      const bookmarks = nextState?.bookmarks || []
      const activeTabId = nextState?.activeTabId || null
      const activeTab = tabs.find((tab) => tab.id === activeTabId) || null

      const fallbackIdentityId = identities[0]?.id || ''
      const previousSelectedValid = identities.some((identity) => identity.id === current.selectedIdentityId)
      const requestedSelectedValid = selectIdentityId && identities.some((identity) => identity.id === selectIdentityId)

      const selectedIdentityId = requestedSelectedValid
        ? selectIdentityId
        : previousSelectedValid
          ? current.selectedIdentityId
          : fallbackIdentityId

      return {
        appState: {
          identities,
          tabs,
          bookmarks,
          activeTabId
        },
        selectedIdentityId,
        addressInput: keepAddressInput ? current.addressInput : (activeTab?.url === BOOKMARKS_PAGE_URL ? '' : (activeTab?.url || '')),
        initialized: true
      }
    })
  },

  init: async () => {
    const api = window.api
    if (!api) {
      set({ initialized: true, hasApi: false })
      return
    }

    if (get().unsubscribe) return

    const nextState = await api.getState()
    get().applyMainState(nextState)

    const unsubscribe = api.onStateUpdated((updatedState) => {
      get().applyMainState(updatedState)
    })

    set({ unsubscribe, hasApi: true })
  },

  teardown: () => {
    const unsubscribe = get().unsubscribe
    if (unsubscribe) unsubscribe()
    set({ unsubscribe: null })
  },

  createIdentity: async () => {
    const api = window.api
    const name = get().newIdentityName.trim()
    if (!name) throw new Error('身份名称不能为空。')
    if (!api) throw new Error('Electron API unavailable.')

    const currentIds = new Set(get().appState.identities.map((identity) => identity.id))
    const nextState = await api.createIdentity(name)
    const created = (nextState.identities || []).find((identity) => !currentIds.has(identity.id))

    get().applyMainState(nextState, { selectIdentityId: created?.id || null })
    set({ newIdentityName: '' })
  },

  removeIdentity: async (identityId) => {
    const api = window.api
    if (!api) throw new Error('Electron API unavailable.')
    const id = String(identityId || '')
    if (!id) throw new Error('未选择身份。')
    const nextState = await api.removeIdentity(id)
    get().applyMainState(nextState)
    get().closeEditIdentity()
  },

  openEditIdentity: (identityId) => {
    const identity = get().appState.identities.find((item) => item.id === identityId)
    if (!identity) return
    set({
      editModalOpen: true,
      editingIdentityId: identity.id,
      editingIdentityName: identity.name,
      editingIdentityColor: normalizeColor(identity.color),
      editingIdentityAvatarDataUrl: String(identity.avatarDataUrl || ''),
      editingBrowserProfile: sanitizeBrowserProfile(identity.browserProfile)
    })
  },

  closeEditIdentity: () => {
    set({
      editModalOpen: false,
      editingIdentityId: '',
      editingIdentityName: '',
      editingIdentityColor: DEFAULT_IDENTITY_COLOR,
      editingIdentityAvatarDataUrl: '',
      editingBrowserProfile: createDefaultBrowserProfile()
    })
  },

  chooseEditingIdentityAvatar: async (file) => {
    const dataUrl = await convertAvatarToDataUrl(file)
    set({ editingIdentityAvatarDataUrl: dataUrl })
  },

  clearEditingIdentityAvatar: () => {
    set({ editingIdentityAvatarDataUrl: '' })
  },

  submitEditIdentityProfile: async () => {
    const api = window.api
    if (!api) throw new Error('Electron API unavailable.')

    const identityId = get().editingIdentityId
    const name = get().editingIdentityName.trim()
    const color = normalizeColor(get().editingIdentityColor)
    const avatarDataUrl = String(get().editingIdentityAvatarDataUrl || '')
    const browserProfile = sanitizeBrowserProfile(get().editingBrowserProfile)
    if (!identityId) throw new Error('未选择身份。')
    if (!name) throw new Error('身份名称不能为空。')

    const nextState = await (api.updateIdentityProfile || api.updateIdentityName)({
      identityId,
      name,
      color,
      avatarDataUrl,
      browserProfile
    })
    get().applyMainState(nextState, { selectIdentityId: identityId })
    get().closeEditIdentity()
  },

  createTab: async () => {
    const api = window.api
    const identityId = get().selectedIdentityId
    if (!identityId) throw new Error('请先选择一个身份。')
    if (!api) throw new Error('Electron API unavailable.')

    const nextState = await api.createTab({
      identityId,
      url: get().newTabUrl.trim() || BOOKMARKS_PAGE_URL
    })
    get().applyMainState(nextState)
  },

  activateTab: async (tabId) => {
    const api = window.api
    if (!api) throw new Error('Electron API unavailable.')
    const nextState = await api.activateTab(tabId)
    get().applyMainState(nextState)
  },

  closeTab: async (tabId) => {
    const api = window.api
    if (!api) throw new Error('Electron API unavailable.')
    const nextState = await api.closeTab(tabId)
    get().applyMainState(nextState)
  },

  reorderTabs: async (orderedTabIds) => {
    const api = window.api
    if (!api) throw new Error('Electron API unavailable.')
    const ids = Array.isArray(orderedTabIds) ? orderedTabIds.map((id) => String(id || '')).filter(Boolean) : []
    if (ids.length === 0) return
    const nextState = await api.reorderTabs({ orderedTabIds: ids })
    get().applyMainState(nextState, { keepAddressInput: true })
  },

  createBookmark: async ({ title, url }) => {
    const api = window.api
    if (!api) throw new Error('Electron API unavailable.')
    const nextState = await api.createBookmark({ title, url })
    get().applyMainState(nextState, { keepAddressInput: true })
  },

  updateBookmark: async ({ bookmarkId, title, url }) => {
    const api = window.api
    if (!api) throw new Error('Electron API unavailable.')
    const nextState = await api.updateBookmark({ bookmarkId, title, url })
    get().applyMainState(nextState, { keepAddressInput: true })
  },

  removeBookmark: async (bookmarkId) => {
    const api = window.api
    if (!api) throw new Error('Electron API unavailable.')
    const nextState = await api.removeBookmark(bookmarkId)
    get().applyMainState(nextState, { keepAddressInput: true })
  },

  reorderBookmarks: async (orderedBookmarkIds) => {
    const api = window.api
    if (!api) throw new Error('Electron API unavailable.')
    const ids = Array.isArray(orderedBookmarkIds) ? orderedBookmarkIds.map((id) => String(id || '')).filter(Boolean) : []
    if (ids.length === 0) return
    const nextState = await api.reorderBookmarks({ orderedBookmarkIds: ids })
    get().applyMainState(nextState, { keepAddressInput: true })
  },

  openBookmarkInCurrentTab: async (url) => {
    const api = window.api
    if (!api) throw new Error('Electron API unavailable.')
    const activeTab = getActiveTab(get().appState)
    const activeTabId = activeTab?.id
    if (!activeTabId) throw new Error('没有可用的活动 Tab。')
    const nextState = await api.navigateTab({ tabId: activeTabId, url })
    get().applyMainState(nextState)
  },

  navigateActiveTab: async () => {
    const api = window.api
    const tabId = get().appState.activeTabId
    if (!tabId) throw new Error('没有可用的活动 Tab。')
    if (!api) throw new Error('Electron API unavailable.')

    const nextState = await api.navigateTab({
      tabId,
      url: get().addressInput
    })
    get().applyMainState(nextState)
  },

  withGuard: async (action) => {
    try {
      set({ error: '' })
      await action()
    } catch (error) {
      set({ error: error?.message || String(error) })
    }
  },

  getActiveTab: () => getActiveTab(get().appState)
}))
