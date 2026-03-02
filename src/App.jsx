import { useEffect, useRef } from 'react'
import AddressBar from './components/AddressBar'
import BookmarksPage from './components/BookmarksPage'
import IdentityPanel from './components/IdentityPanel'
import TabBar from './components/TabBar'
import { useUiStore } from './store/uiStore'

const BOOKMARKS_PAGE_URL = 'doppel://bookmarks'

export default function App () {
  const hasApi = useUiStore((state) => state.hasApi)
  const initialized = useUiStore((state) => state.initialized)
  const error = useUiStore((state) => state.error)
  const activeTabUrl = useUiStore((state) => {
    const activeTab = state.appState.tabs.find((tab) => tab.id === state.appState.activeTabId)
    return activeTab?.url || ''
  })
  const init = useUiStore((state) => state.init)
  const teardown = useUiStore((state) => state.teardown)
  const withGuard = useUiStore((state) => state.withGuard)
  const editModalOpen = useUiStore((state) => state.editModalOpen)
  const editingIdentityName = useUiStore((state) => state.editingIdentityName)
  const editingIdentityId = useUiStore((state) => state.editingIdentityId)
  const editingIdentityColor = useUiStore((state) => state.editingIdentityColor)
  const editingIdentityAvatarDataUrl = useUiStore((state) => state.editingIdentityAvatarDataUrl)
  const editingBrowserProfile = useUiStore((state) => state.editingBrowserProfile)
  const setEditingIdentityName = useUiStore((state) => state.setEditingIdentityName)
  const setEditingIdentityColor = useUiStore((state) => state.setEditingIdentityColor)
  const chooseEditingIdentityAvatar = useUiStore((state) => state.chooseEditingIdentityAvatar)
  const clearEditingIdentityAvatar = useUiStore((state) => state.clearEditingIdentityAvatar)
  const setEditingBrowserProfileField = useUiStore((state) => state.setEditingBrowserProfileField)
  const refreshEditingBrowserProfile = useUiStore((state) => state.refreshEditingBrowserProfile)
  const closeEditIdentity = useUiStore((state) => state.closeEditIdentity)
  const removeIdentity = useUiStore((state) => state.removeIdentity)
  const submitEditIdentityProfile = useUiStore((state) => state.submitEditIdentityProfile)
  const contentHostRef = useRef(null)
  const avatarInputRef = useRef(null)
  const bookmarksPageOpen = activeTabUrl === BOOKMARKS_PAGE_URL

  useEffect(() => {
    init().catch(() => {})
    return () => {
      teardown()
    }
  }, [init, teardown])

  useEffect(() => {
    if (!hasApi || !initialized || !window.api?.setViewBounds || !contentHostRef.current) return

    let disposed = false
    let frameId = 0
    let warmupFrameId = 0
    let lastSent = ''
    const visualViewport = window.visualViewport

    const syncBounds = () => {
      if (disposed || !contentHostRef.current) return
      const rect = contentHostRef.current.getBoundingClientRect()
      const payload = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height))
      }
      const serialized = `${payload.x},${payload.y},${payload.width},${payload.height}`
      if (serialized === lastSent) return
      lastSent = serialized
      window.api.setViewBounds(payload).catch(() => {})
    }

    const scheduleSync = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(syncBounds)
    }

    const observer = new ResizeObserver(() => {
      scheduleSync()
    })
    observer.observe(contentHostRef.current)
    window.addEventListener('resize', scheduleSync)
    window.addEventListener('scroll', scheduleSync, true)
    visualViewport?.addEventListener('resize', scheduleSync)
    visualViewport?.addEventListener('scroll', scheduleSync)
    document.addEventListener('transitionend', scheduleSync, true)

    // Warm up for the first frames to catch late CSS/layout stabilization.
    let warmupFrames = 0
    const warmup = () => {
      if (disposed) return
      scheduleSync()
      warmupFrames += 1
      if (warmupFrames < 30) {
        warmupFrameId = requestAnimationFrame(warmup)
      }
    }
    warmupFrameId = requestAnimationFrame(warmup)

    const pollId = window.setInterval(() => {
      syncBounds()
    }, 500)

    scheduleSync()

    return () => {
      disposed = true
      observer.disconnect()
      window.removeEventListener('resize', scheduleSync)
      window.removeEventListener('scroll', scheduleSync, true)
      visualViewport?.removeEventListener('resize', scheduleSync)
      visualViewport?.removeEventListener('scroll', scheduleSync)
      document.removeEventListener('transitionend', scheduleSync, true)
      cancelAnimationFrame(frameId)
      cancelAnimationFrame(warmupFrameId)
      window.clearInterval(pollId)
    }
  }, [hasApi, initialized, bookmarksPageOpen])

  useEffect(() => {
    if (!editModalOpen) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeEditIdentity()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [editModalOpen, closeEditIdentity])

  useEffect(() => {
    if (!hasApi || !window.api?.setOverlayOpen) return
    window.api.setOverlayOpen(editModalOpen || bookmarksPageOpen).catch(() => {})
  }, [hasApi, editModalOpen, bookmarksPageOpen])

  useEffect(() => {
    if (!hasApi || editModalOpen || bookmarksPageOpen || !window.api?.setViewBounds || !contentHostRef.current) return

    const syncNow = () => {
      if (!contentHostRef.current) return
      const rect = contentHostRef.current.getBoundingClientRect()
      window.api.setViewBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height))
      }).catch(() => {})
    }

    const rafId = requestAnimationFrame(syncNow)
    const timeoutId = window.setTimeout(syncNow, 50)
    return () => {
      cancelAnimationFrame(rafId)
      window.clearTimeout(timeoutId)
    }
  }, [hasApi, editModalOpen, bookmarksPageOpen])

  useEffect(() => {
    if (!hasApi || !window.api?.setOverlayOpen) return
    return () => {
      window.api.setOverlayOpen(false).catch(() => {})
    }
  }, [hasApi])

  if (!hasApi) {
    return (
      <div className='grid h-screen place-items-center p-8'>
        <div className='w-full max-w-xl rounded-2xl border border-slate-300/80 bg-white/90 p-8 shadow-xl'>
          <h1 className='font-["Avenir_Next","Trebuchet_MS","PingFang_SC"] text-3xl font-semibold text-slate-900'>Electron Session Tabs</h1>
          <p className='mt-3 text-sm text-slate-600'>请使用 <code>pnpm dev:electron</code> 运行桌面版界面。</p>
        </div>
      </div>
    )
  }

  if (!initialized) {
    return (
      <div className='grid h-screen place-items-center'>
        <p className='rounded-xl border border-slate-300/80 bg-white/80 px-5 py-3 text-sm text-slate-700 shadow-sm'>正在加载身份和标签状态...</p>
      </div>
    )
  }

  return (
    <div className='h-screen overflow-hidden p-4'>
      <div className='grid h-full grid-cols-[304px_1fr] gap-4'>
        <IdentityPanel />

        <section className='flex min-w-0 flex-col gap-3'>
          <TabBar />
          <AddressBar />
          {bookmarksPageOpen
            ? <BookmarksPage />
            : <div ref={contentHostRef} className='min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-300/70 bg-white/40 shadow-[0_20px_70px_-40px_rgba(2,6,23,0.7)]' />}
        </section>
      </div>

      {error && (
        <div className='pointer-events-none absolute bottom-5 right-5'>
          <p className='max-w-md rounded-xl border border-rose-300/80 bg-rose-50/95 px-4 py-3 text-sm text-rose-700 shadow-lg'>
            {error}
          </p>
        </div>
      )}

      {editModalOpen && (
        <div className='absolute inset-0 z-20 grid place-items-center bg-slate-900/30 p-4 backdrop-blur-[2px]'>
          <div className='w-full max-w-md rounded-2xl border border-slate-300/80 bg-white p-5 shadow-2xl'>
            <h2 className='font-["Avenir_Next","Trebuchet_MS","PingFang_SC"] text-xl font-semibold text-slate-900'>修改身份名称</h2>
            <p className='mt-1 text-sm text-slate-500'>仅修改显示名称，不改变 session 分区。</p>

            <input
              autoFocus
              value={editingIdentityName}
              onChange={(event) => setEditingIdentityName(event.target.value)}
              className='mt-4 h-11 w-full rounded-xl border border-slate-300/80 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500'
              placeholder='输入新的身份名称'
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  withGuard(submitEditIdentityProfile)
                }
              }}
            />

            <div className='mt-4 flex items-center gap-3'>
              <label htmlFor='identity-color' className='text-sm text-slate-600'>主题色</label>
              <input
                id='identity-color'
                type='color'
                value={editingIdentityColor}
                onChange={(event) => setEditingIdentityColor(event.target.value)}
                className='h-10 w-14 cursor-pointer rounded-lg border border-slate-300/80 bg-white p-1'
              />
              <span className='text-xs text-slate-500'>{editingIdentityColor}</span>
            </div>

            <div className='mt-4 rounded-xl border border-slate-300/80 bg-slate-50/70 p-3'>
              <p className='text-sm text-slate-600'>头像</p>
              <div className='mt-2 flex items-center gap-3'>
                {editingIdentityAvatarDataUrl && (
                  <img
                    src={editingIdentityAvatarDataUrl}
                    alt='identity avatar preview'
                    className='h-10 w-10 rounded-full border border-slate-300/90 object-cover'
                  />
                )}
                <div className='flex gap-2'>
                  <input
                    ref={avatarInputRef}
                    type='file'
                    accept='image/*'
                    className='hidden'
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (!file) return
                      withGuard(async () => {
                        await chooseEditingIdentityAvatar(file)
                      })
                      event.target.value = ''
                    }}
                  />
                  <button
                    type='button'
                    onClick={() => avatarInputRef.current?.click()}
                    className='h-9 rounded-lg border border-slate-300/90 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-slate-400'
                  >
                    上传头像
                  </button>
                  {editingIdentityAvatarDataUrl && (
                    <button
                      type='button'
                      onClick={clearEditingIdentityAvatar}
                      className='h-9 rounded-lg border border-slate-300/90 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900'
                    >
                      移除
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className='mt-4 rounded-xl border border-slate-300/80 bg-slate-50/70 p-3'>
              <div className='flex items-center justify-between gap-2'>
                <p className='text-sm text-slate-600'>浏览器配置（身份隔离）</p>
                <button
                  type='button'
                  onClick={refreshEditingBrowserProfile}
                  className='h-8 rounded-lg border border-slate-300/90 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-slate-400'
                >
                  刷新配置
                </button>
              </div>

              <div className='mt-3 grid grid-cols-2 gap-2'>
                <input
                  value={editingBrowserProfile.language}
                  onChange={(event) => setEditingBrowserProfileField('language', event.target.value)}
                  placeholder='语言，如 zh-CN'
                  className='h-9 rounded-lg border border-slate-300/80 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-blue-500'
                />
                <input
                  value={editingBrowserProfile.timezone}
                  onChange={(event) => setEditingBrowserProfileField('timezone', event.target.value)}
                  placeholder='时区，如 Asia/Shanghai'
                  className='h-9 rounded-lg border border-slate-300/80 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-blue-500'
                />
                <input
                  value={editingBrowserProfile.platform}
                  onChange={(event) => setEditingBrowserProfileField('platform', event.target.value)}
                  placeholder='平台，如 MacIntel'
                  className='h-9 rounded-lg border border-slate-300/80 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-blue-500'
                />
                <input
                  value={editingBrowserProfile.deviceScaleFactor}
                  onChange={(event) => setEditingBrowserProfileField('deviceScaleFactor', event.target.value)}
                  placeholder='DPR，如 2'
                  className='h-9 rounded-lg border border-slate-300/80 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-blue-500'
                />
                <input
                  value={editingBrowserProfile.screenWidth}
                  onChange={(event) => setEditingBrowserProfileField('screenWidth', event.target.value)}
                  placeholder='屏宽，如 1512'
                  className='h-9 rounded-lg border border-slate-300/80 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-blue-500'
                />
                <input
                  value={editingBrowserProfile.screenHeight}
                  onChange={(event) => setEditingBrowserProfileField('screenHeight', event.target.value)}
                  placeholder='屏高，如 982'
                  className='h-9 rounded-lg border border-slate-300/80 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-blue-500'
                />
              </div>

              <textarea
                value={editingBrowserProfile.userAgent}
                onChange={(event) => setEditingBrowserProfileField('userAgent', event.target.value)}
                className='mt-2 h-20 w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2 text-[11px] text-slate-700 outline-none transition focus:border-blue-500'
                placeholder='User-Agent'
              />
            </div>

            <div className='mt-4 flex items-center justify-between gap-2'>
              <button
                type='button'
                onClick={() => {
                  const confirmed = window.confirm(`删除身份「${editingIdentityName}」？该身份下所有 Tab 会一并关闭。`)
                  if (!confirmed) return
                  withGuard(async () => {
                    await removeIdentity(editingIdentityId)
                  })
                }}
                className='h-10 rounded-xl border border-rose-300/90 bg-white px-4 text-sm font-medium text-rose-700 transition hover:border-rose-400'
              >
                删除身份
              </button>

              <div className='flex gap-2'>
              <button
                type='button'
                onClick={closeEditIdentity}
                className='h-10 rounded-xl border border-slate-300/90 bg-white px-4 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900'
              >
                取消
              </button>
              <button
                type='button'
                onClick={() => withGuard(submitEditIdentityProfile)}
                className='h-10 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500'
              >
                保存
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
