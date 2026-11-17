// Added by the RUOK fork on 2026-11-17: 风格库的收藏与最近打开，只存本机。
const FAVORITES_KEY = 'ruok-style-favorites'
const RECENT_KEY = 'ruok-style-recent'
const RECENT_LIMIT = 8

function readIds(key: string) {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function writeIds(key: string, ids: readonly string[]) {
  try { window.localStorage.setItem(key, JSON.stringify(ids)) } catch { /* 存不下只影响这两处小功能 */ }
}

export const readFavorites = () => readIds(FAVORITES_KEY)
export const readRecent = () => readIds(RECENT_KEY).slice(0, RECENT_LIMIT)

export function toggleFavorite(id: string) {
  const current = readIds(FAVORITES_KEY)
  const next = current.includes(id) ? current.filter(item => item !== id) : [id, ...current]
  writeIds(FAVORITES_KEY, next)
  return next
}

export function pushRecent(id: string) {
  const next = [id, ...readIds(RECENT_KEY).filter(item => item !== id)].slice(0, RECENT_LIMIT)
  writeIds(RECENT_KEY, next)
  return next
}
