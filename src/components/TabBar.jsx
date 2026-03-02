import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { useEffect, useRef } from 'react'
import { useUiStore } from '../store/uiStore'

const DEFAULT_IDENTITY_COLOR = '#3b82f6'
const TAB_SORT_GROUP = 'tab-sort-group'

function normalizeColor (value) {
  const color = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : DEFAULT_IDENTITY_COLOR
}

function getContrastTextColor (hexColor) {
  const hex = normalizeColor(hexColor).slice(1)
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#0f172a' : '#f8fafc'
}

function moveItem (items, fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

function SortableTabItem ({
  tab,
  index,
  activeTabId,
  identity,
  onActivate,
  onClose
}) {
  const { ref, isDragSource } = useSortable({
    id: tab.id,
    index,
    group: TAB_SORT_GROUP
  })

  const active = tab.id === activeTabId
  const tabColor = normalizeColor(identity?.color)
  const textColor = getContrastTextColor(tabColor)
  const avatarDataUrl = String(identity?.avatarDataUrl || '')
  const identityName = String(identity?.name || 'Unknown Identity')
  const closeButtonBackground = textColor === '#0f172a' ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.26)'

  return (
    <div
      ref={ref}
      className='flex min-w-56 items-center rounded-xl transition-[opacity,transform,box-shadow,filter] duration-150'
      style={{
        backgroundColor: tabColor,
        opacity: isDragSource ? 0.45 : (active ? 1 : 0.8),
        filter: active ? 'saturate(1)' : 'saturate(0.8)',
        transform: active ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: active
          ? '0 14px 30px -20px rgba(2, 6, 23, 0.7)'
          : '0 8px 24px -20px rgba(2, 6, 23, 0.35)',
        cursor: 'grab',
        touchAction: 'none'
      }}
    >
      <div
        role='button'
        tabIndex={0}
        onClick={() => onActivate(tab.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onActivate(tab.id)
          }
        }}
        className='flex h-12 min-w-0 flex-1 items-center gap-2 px-3 text-left'
        title={tab.url}
        style={{ color: textColor }}
      >
        {avatarDataUrl && (
          <img
            src={avatarDataUrl}
            alt=''
            className='h-5 w-5 rounded-full object-cover'
          />
        )}
        <span className='min-w-0 flex-1'>
          <span className={`block truncate text-sm ${active ? 'font-semibold' : 'font-medium'}`}>
            {tab.title || tab.url}
          </span>
          <span className='block truncate text-[11px] opacity-80'>
            {identityName}
          </span>
        </span>
      </div>
      <button
        type='button'
        onClick={(event) => {
          event.stopPropagation()
          onClose(tab.id)
        }}
        className='mr-1 h-8 w-8 rounded-lg text-sm font-semibold transition'
        aria-label='Close tab'
        style={{
          color: textColor,
          backgroundColor: closeButtonBackground
        }}
      >
        ×
      </button>
    </div>
  )
}

export default function TabBar () {
  const tabs = useUiStore((state) => state.appState.tabs)
  const identities = useUiStore((state) => state.appState.identities)
  const activeTabId = useUiStore((state) => state.appState.activeTabId)
  const editModalOpen = useUiStore((state) => state.editModalOpen)
  const newTabUrl = useUiStore((state) => state.newTabUrl)
  const setNewTabUrl = useUiStore((state) => state.setNewTabUrl)
  const withGuard = useUiStore((state) => state.withGuard)
  const createTab = useUiStore((state) => state.createTab)
  const activateTab = useUiStore((state) => state.activateTab)
  const closeTab = useUiStore((state) => state.closeTab)
  const reorderTabs = useUiStore((state) => state.reorderTabs)
  const identityMap = new Map(identities.map((identity) => [identity.id, identity]))
  const newTabInputRef = useRef(null)

  useEffect(() => {
    const onKeyDown = (event) => {
      if (editModalOpen) return
      const isMod = event.metaKey || event.ctrlKey
      if (!isMod || event.altKey) return

      const key = String(event.key || '').toLowerCase()
      if (key === 'l') {
        event.preventDefault()
        newTabInputRef.current?.focus()
        newTabInputRef.current?.select()
        return
      }
      if (key === 't') {
        event.preventDefault()
        withGuard(createTab)
        return
      }
      if (key === 'w' && activeTabId) {
        event.preventDefault()
        withGuard(() => closeTab(activeTabId))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activeTabId, closeTab, createTab, editModalOpen, withGuard])

  return (
    <section className='rounded-2xl border border-slate-300/70 bg-white/85 p-3 shadow-[0_14px_48px_-32px_rgba(15,23,42,0.5)] backdrop-blur'>
      <div className='mb-3 flex gap-2'>
        <input
          ref={newTabInputRef}
          value={newTabUrl}
          onChange={(event) => setNewTabUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              withGuard(createTab)
            }
          }}
          placeholder='输入 URL 并新建 Tab'
          className='h-10 flex-1 rounded-xl border border-slate-300/80 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500'
        />
        <button
          type='button'
          onClick={() => withGuard(createTab)}
          className='h-10 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500'
        >
          新建 Tab
        </button>
      </div>

      <DragDropProvider
        onDragEnd={(event) => {
          if (event?.canceled) return
          const sourceId = String(event?.operation?.source?.id || '')
          const targetId = String(event?.operation?.target?.id || '')
          if (!sourceId || !targetId || sourceId === targetId) return

          const orderedIds = tabs.map((tab) => tab.id)
          const fromIndex = orderedIds.indexOf(sourceId)
          const toIndex = orderedIds.indexOf(targetId)
          if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return

          const nextOrder = moveItem(orderedIds, fromIndex, toIndex)
          withGuard(() => reorderTabs(nextOrder))
        }}
      >
        <div className='flex gap-2 overflow-x-auto pb-1'>
          {tabs.map((tab, index) => (
            <SortableTabItem
              key={tab.id}
              tab={tab}
              index={index}
              activeTabId={activeTabId}
              identity={identityMap.get(tab.identityId)}
              onActivate={(tabId) => withGuard(() => activateTab(tabId))}
              onClose={(tabId) => withGuard(() => closeTab(tabId))}
            />
          ))}
        </div>
      </DragDropProvider>
    </section>
  )
}
