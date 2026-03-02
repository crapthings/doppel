import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { useState } from 'react'
import { useUiStore } from '../store/uiStore'

const BOOKMARK_SORT_GROUP = 'bookmark-sort-group'

function moveItem (items, fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

function BookmarkRow ({ bookmark, index, onOpen, onEdit, onRemove }) {
  const { ref, isDragSource } = useSortable({
    id: bookmark.id,
    index,
    group: BOOKMARK_SORT_GROUP
  })

  return (
    <div
      ref={ref}
      className='flex items-center gap-3 rounded-xl border border-slate-300/80 bg-white px-3 py-2 shadow-sm transition'
      style={{
        opacity: isDragSource ? 0.5 : 1,
        cursor: 'grab',
        touchAction: 'none'
      }}
    >
      <button
        type='button'
        onClick={() => onOpen(bookmark.url)}
        className='min-w-0 flex-1 text-left'
      >
        <p className='truncate text-sm font-medium text-slate-800'>{bookmark.title}</p>
        <p className='truncate text-xs text-slate-500'>{bookmark.url}</p>
      </button>
      <button
        type='button'
        onClick={() => onEdit(bookmark)}
        className='h-8 rounded-lg border border-slate-300/90 bg-white px-2 text-xs font-medium text-slate-600 transition hover:border-slate-400'
      >
        编辑
      </button>
      <button
        type='button'
        onClick={() => onRemove(bookmark)}
        className='h-8 rounded-lg border border-rose-300/90 bg-white px-2 text-xs font-medium text-rose-700 transition hover:border-rose-400'
      >
        删除
      </button>
    </div>
  )
}

export default function BookmarksPage () {
  const bookmarks = useUiStore((state) => state.appState.bookmarks || [])
  const withGuard = useUiStore((state) => state.withGuard)
  const createBookmark = useUiStore((state) => state.createBookmark)
  const updateBookmark = useUiStore((state) => state.updateBookmark)
  const removeBookmark = useUiStore((state) => state.removeBookmark)
  const reorderBookmarks = useUiStore((state) => state.reorderBookmarks)
  const openBookmarkInCurrentTab = useUiStore((state) => state.openBookmarkInCurrentTab)

  const [titleInput, setTitleInput] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [editingBookmarkId, setEditingBookmarkId] = useState('')

  const resetForm = () => {
    setEditingBookmarkId('')
    setTitleInput('')
    setUrlInput('')
  }

  return (
    <section className='h-full rounded-2xl border border-slate-300/70 bg-white/85 p-4 shadow-[0_20px_70px_-40px_rgba(2,6,23,0.7)] backdrop-blur'>
      <div className='mb-4'>
        <h2 className='text-xl font-semibold text-slate-900'>收藏夹</h2>
        <p className='mt-1 text-sm text-slate-600'>所有身份共用。点击条目会在当前 Tab 打开。</p>
      </div>

      <div className='mb-4 grid grid-cols-[1fr_1fr_auto_auto] gap-2'>
        <input
          value={titleInput}
          onChange={(event) => setTitleInput(event.target.value)}
          placeholder='标题（可空）'
          className='h-10 rounded-xl border border-slate-300/80 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500'
        />
        <input
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            withGuard(async () => {
              if (editingBookmarkId) {
                await updateBookmark({ bookmarkId: editingBookmarkId, title: titleInput, url: urlInput })
              } else {
                await createBookmark({ title: titleInput, url: urlInput })
              }
              resetForm()
            })
          }}
          placeholder='https://example.com'
          className='h-10 rounded-xl border border-slate-300/80 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500'
        />
        <button
          type='button'
          onClick={() => {
            withGuard(async () => {
              if (editingBookmarkId) {
                await updateBookmark({ bookmarkId: editingBookmarkId, title: titleInput, url: urlInput })
              } else {
                await createBookmark({ title: titleInput, url: urlInput })
              }
              resetForm()
            })
          }}
          className='h-10 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500'
        >
          {editingBookmarkId ? '保存' : '添加'}
        </button>
        <button
          type='button'
          onClick={resetForm}
          className='h-10 rounded-xl border border-slate-300/90 bg-white px-4 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900'
        >
          清空
        </button>
      </div>

      <DragDropProvider
        onDragEnd={(event) => {
          if (event?.canceled) return
          const sourceId = String(event?.operation?.source?.id || '')
          const targetId = String(event?.operation?.target?.id || '')
          if (!sourceId || !targetId || sourceId === targetId) return

          const orderedIds = bookmarks.map((item) => item.id)
          const fromIndex = orderedIds.indexOf(sourceId)
          const toIndex = orderedIds.indexOf(targetId)
          if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return

          const nextOrder = moveItem(orderedIds, fromIndex, toIndex)
          withGuard(() => reorderBookmarks(nextOrder))
        }}
      >
        <div className='flex max-h-[calc(100%-7.75rem)] flex-col gap-2 overflow-y-auto'>
          {bookmarks.length === 0 && (
            <p className='rounded-xl border border-dashed border-slate-300/80 bg-white/70 px-3 py-4 text-sm text-slate-500'>
              暂无收藏。添加后可拖拽排序。
            </p>
          )}
          {bookmarks.map((bookmark, index) => (
            <BookmarkRow
              key={bookmark.id}
              bookmark={bookmark}
              index={index}
              onOpen={(url) => withGuard(() => openBookmarkInCurrentTab(url))}
              onEdit={(item) => {
                setEditingBookmarkId(item.id)
                setTitleInput(item.title)
                setUrlInput(item.url)
              }}
              onRemove={(item) => {
                const confirmed = window.confirm(`删除收藏「${item.title}」？`)
                if (!confirmed) return
                withGuard(() => removeBookmark(item.id))
              }}
            />
          ))}
        </div>
      </DragDropProvider>
    </section>
  )
}
