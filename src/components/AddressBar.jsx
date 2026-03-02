import { useUiStore } from '../store/uiStore'

const BOOKMARKS_PAGE_URL = 'doppel://bookmarks'

export default function AddressBar () {
  const addressInput = useUiStore((state) => state.addressInput)
  const setAddressInput = useUiStore((state) => state.setAddressInput)
  const withGuard = useUiStore((state) => state.withGuard)
  const navigateActiveTab = useUiStore((state) => state.navigateActiveTab)
  const createBookmark = useUiStore((state) => state.createBookmark)
  const bookmarks = useUiStore((state) => state.appState.bookmarks)
  const tabs = useUiStore((state) => state.appState.tabs)
  const activeTabId = useUiStore((state) => state.appState.activeTabId)
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || null
  const isBookmarkedCurrent = Boolean(activeTab?.url && bookmarks.some((item) => item.url === activeTab.url))
  const canBookmark = Boolean(activeTabId && activeTab?.url && activeTab.url !== BOOKMARKS_PAGE_URL && !isBookmarkedCurrent)

  return (
    <section className='rounded-2xl border border-slate-300/70 bg-white/85 p-3 shadow-[0_14px_48px_-32px_rgba(15,23,42,0.5)] backdrop-blur'>
      <div className='flex gap-2'>
        <input
          value={addressInput}
          onChange={(event) => setAddressInput(event.target.value)}
          placeholder='输入地址后回车或点击打开'
          className='h-10 flex-1 rounded-xl border border-slate-300/80 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500'
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              withGuard(navigateActiveTab)
            }
          }}
        />
        <button
          type='button'
          disabled={!canBookmark}
          onClick={() => {
            withGuard(async () => {
              if (!activeTab?.url) throw new Error('当前页面不可收藏。')
              await createBookmark({
                title: activeTab.title || '',
                url: activeTab.url
              })
            })
          }}
          className={`h-10 rounded-xl border px-4 text-sm font-medium transition disabled:cursor-not-allowed ${
            isBookmarkedCurrent
              ? 'border-emerald-300/80 bg-emerald-50 text-emerald-700'
              : 'border-blue-300/80 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:border-slate-300/80 disabled:bg-slate-100 disabled:text-slate-400'
          }`}
        >
          {isBookmarkedCurrent ? '已收藏' : '收藏'}
        </button>
        <button
          type='button'
          disabled={!activeTabId}
          onClick={() => withGuard(navigateActiveTab)}
          className='h-10 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300'
        >
          打开
        </button>
      </div>
    </section>
  )
}
