import { mdiCogOutline } from '@mdi/js'
import Icon from '@mdi/react'
import { useUiStore } from '../store/uiStore'

export default function IdentityPanel () {
  const identities = useUiStore((state) => state.appState.identities)
  const selectedIdentityId = useUiStore((state) => state.selectedIdentityId)
  const newIdentityName = useUiStore((state) => state.newIdentityName)
  const setNewIdentityName = useUiStore((state) => state.setNewIdentityName)
  const selectIdentity = useUiStore((state) => state.selectIdentity)
  const withGuard = useUiStore((state) => state.withGuard)
  const createIdentity = useUiStore((state) => state.createIdentity)
  const openEditIdentity = useUiStore((state) => state.openEditIdentity)

  return (
    <aside className='relative overflow-hidden rounded-2xl border border-slate-300/70 bg-white/90 p-5 shadow-[0_14px_48px_-28px_rgba(15,23,42,0.45)] backdrop-blur'>
      <div className='absolute -left-20 -top-20 h-40 w-40 rounded-full bg-cyan-200/40 blur-2xl' />
      <div className='absolute -bottom-10 -right-8 h-32 w-32 rounded-full bg-blue-300/30 blur-xl' />

      <div className='relative z-10 flex h-full flex-col gap-4'>
        <div>
          <p className='font-["Avenir_Next","Trebuchet_MS","PingFang_SC"] text-xs uppercase tracking-[0.18em] text-slate-500'>
            Identity Containers
          </p>
          <h1 className='mt-1 font-["Avenir_Next","Trebuchet_MS","PingFang_SC"] text-2xl font-semibold text-slate-900'>
            身份管理
          </h1>
        </div>

        <div className='flex gap-2'>
          <input
            value={newIdentityName}
            onChange={(event) => setNewIdentityName(event.target.value)}
            placeholder='例如：账号 A'
            className='h-10 flex-1 rounded-xl border border-slate-300/80 bg-white px-3 text-sm text-slate-700 outline-none ring-0 transition focus:border-blue-500'
          />
          <button
            type='button'
            onClick={() => withGuard(createIdentity)}
            className='h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700'
          >
            新建
          </button>
        </div>

        <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1'>
          {identities.map((identity) => {
            const active = identity.id === selectedIdentityId
            return (
              <div
                key={identity.id}
                className={`group flex items-center gap-2 rounded-xl border p-2 transition ${
                  active
                    ? 'border-blue-500 bg-blue-50 shadow-[0_8px_24px_-16px_rgba(37,99,235,0.8)]'
                    : 'border-slate-300/80 bg-white hover:border-slate-400'
                }`}
              >
                <button
                  type='button'
                  onClick={() => selectIdentity(identity.id)}
                  className='min-w-0 flex-1 text-left'
                >
                  <p className={`truncate text-sm font-medium ${active ? 'text-blue-700' : 'text-slate-800'}`}>
                    {identity.name}
                  </p>
                  <p className='truncate text-[11px] text-slate-500'>
                    {identity.partition}
                  </p>
                </button>
                <button
                  type='button'
                  onClick={() => openEditIdentity(identity.id)}
                  className='flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300/90 bg-white text-slate-600 transition hover:border-slate-400 hover:text-slate-900'
                  aria-label='编辑身份'
                >
                  <Icon path={mdiCogOutline} size={0.72} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
