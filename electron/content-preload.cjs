function readBrowserProfile () {
  try {
    const marker = '--doppel-browser-profile='
    const arg = process.argv.find((item) => typeof item === 'string' && item.startsWith(marker))
    if (!arg) return null
    const base64 = arg.slice(marker.length)
    if (!base64) return null
    const parsed = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function defineGetter (target, key, value) {
  try {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      get: () => value
    })
  } catch {}
}

function applyBrowserProfile (profile) {
  if (!profile || typeof profile !== 'object') return

  const language = String(profile.language || 'zh-CN')
  const platform = String(profile.platform || 'MacIntel')
  const timezone = String(profile.timezone || 'Asia/Shanghai')
  const screenWidth = Math.max(320, Number(profile.screenWidth) || 1512)
  const screenHeight = Math.max(320, Number(profile.screenHeight) || 982)
  const deviceScaleFactor = Math.max(1, Number(profile.deviceScaleFactor) || 2)

  defineGetter(Navigator.prototype, 'language', language)
  defineGetter(Navigator.prototype, 'languages', Object.freeze([language, 'en-US', 'en']))
  defineGetter(Navigator.prototype, 'platform', platform)

  defineGetter(Screen.prototype, 'width', Math.round(screenWidth))
  defineGetter(Screen.prototype, 'height', Math.round(screenHeight))
  defineGetter(Screen.prototype, 'availWidth', Math.round(screenWidth))
  defineGetter(Screen.prototype, 'availHeight', Math.round(screenHeight - 40))

  defineGetter(window, 'devicePixelRatio', deviceScaleFactor)

  const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions
  Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptionsPatched (...args) {
    const result = originalResolvedOptions.apply(this, args)
    return { ...result, timeZone: timezone }
  }
}

const profile = readBrowserProfile()
if (profile) {
  applyBrowserProfile(profile)
}
