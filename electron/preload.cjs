const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  createIdentity: (name) => ipcRenderer.invoke('identity:create', name),
  removeIdentity: (identityId) => ipcRenderer.invoke('identity:remove', identityId),
  updateIdentityName: (payload) => ipcRenderer.invoke('identity:update-name', payload),
  updateIdentityProfile: (payload) => ipcRenderer.invoke('identity:update-profile', payload),
  createTab: (payload) => ipcRenderer.invoke('tab:create', payload),
  activateTab: (tabId) => ipcRenderer.invoke('tab:activate', tabId),
  closeTab: (tabId) => ipcRenderer.invoke('tab:close', tabId),
  navigateTab: (payload) => ipcRenderer.invoke('tab:navigate', payload),
  reorderTabs: (payload) => ipcRenderer.invoke('tab:reorder', payload),
  createBookmark: (payload) => ipcRenderer.invoke('bookmark:create', payload),
  updateBookmark: (payload) => ipcRenderer.invoke('bookmark:update', payload),
  removeBookmark: (bookmarkId) => ipcRenderer.invoke('bookmark:remove', bookmarkId),
  reorderBookmarks: (payload) => ipcRenderer.invoke('bookmark:reorder', payload),
  setViewBounds: (bounds) => ipcRenderer.invoke('view:set-bounds', bounds),
  setOverlayOpen: (open) => ipcRenderer.invoke('view:set-overlay-open', open),
  onStateUpdated: (handler) => {
    if (typeof handler !== 'function') return () => {}

    const listener = (_event, nextState) => {
      handler(nextState)
    }

    ipcRenderer.on('state:updated', listener)
    return () => {
      ipcRenderer.removeListener('state:updated', listener)
    }
  }
})
