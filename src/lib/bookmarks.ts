import type { NewBookmark } from './autosort'

/**
 * The browser's bookmarks, behind an optional permission. Tabscape asks for it
 * only when the person turns on auto-sorting, so nobody else sees a warning,
 * and gives it back when they turn it off.
 */
type Api = typeof chrome
const api = (): Api | undefined => (globalThis as { chrome?: Api }).chrome
const PERMISSION = { permissions: ['bookmarks'] as chrome.runtime.ManifestPermissions[] }

/** Only the extension can ask for bookmarks; the website demo and the double-click build can't. */
export const bookmarksSupported = () => !!api()?.permissions?.request

export const hasBookmarkAccess = async (): Promise<boolean> => {
  try {
    return !!(await api()?.permissions?.contains(PERMISSION))
  } catch {
    return false
  }
}

/** Shows the browser's own permission prompt. Must be called straight from a click. */
export const requestBookmarkAccess = async (): Promise<boolean> => {
  try {
    return !!(await api()?.permissions?.request(PERMISSION))
  } catch (e) {
    console.warn('[tabscape] Bookmark permission request failed', e)
    return false
  }
}

export const releaseBookmarkAccess = async () => {
  try {
    await api()?.permissions?.remove(PERMISSION)
  } catch {
    // Already gone, or never granted: nothing to do.
  }
}

export interface FoundBookmark extends NewBookmark {
  dateAdded: number
}

/**
 * Bookmarks added after `since` (newest first), up to `limit`, with the name of
 * the folder each was saved into. Folders and non-web addresses are skipped.
 */
export const bookmarksSince = async (since: number, limit = 50): Promise<FoundBookmark[]> => {
  const bookmarks = api()?.bookmarks
  if (!bookmarks) return []
  const recent = (await bookmarks.getRecent(limit)).filter(
    b => b.url && /^https?:/i.test(b.url) && (b.dateAdded ?? 0) > since
  )
  if (!recent.length) return []

  const parentIds = [...new Set(recent.map(b => b.parentId).filter((id): id is string => !!id))]
  const folders = new Map<string, string>()
  if (parentIds.length) {
    try {
      const nodes: chrome.bookmarks.BookmarkTreeNode[] = await bookmarks.get(parentIds as [string, ...string[]])
      for (const folder of nodes) folders.set(folder.id, folder.title)
    } catch {
      // A folder can vanish between the two calls; the bookmark just goes in without one.
    }
  }

  return recent.map(b => ({
    url: b.url!,
    title: b.title,
    folder: b.parentId ? folders.get(b.parentId) : undefined,
    dateAdded: b.dateAdded ?? Date.now()
  }))
}
