import { onBeforeUnmount, onMounted, ref } from 'vue'
import { log } from '@/config'
import { useStartpage } from './useStartpage'
import {
  bookmarksSince, bookmarksSupported, hasBookmarkAccess, releaseBookmarkAccess, requestBookmarkAccess
} from '@/lib/bookmarks'

/**
 * Sorting new bookmarks into sections. It runs when a new tab opens and when the
 * page comes back into view: no background script, nothing running in between.
 *
 * Whether it's on is kept per browser, not synced, because the bookmarks
 * permission is granted per browser. The rules it learns do sync.
 */
const ENABLED_KEY = 'startpage_autosort'
/** The newest bookmark already looked at, so each one is sorted once. */
const SEEN_KEY = 'startpage_bookmarks_seen'

const local = {
  get: (key: string) => { try { return localStorage.getItem(key) } catch { return null } },
  set: (key: string, value: string | null) => {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch (e) {
      console.warn(`[tabscape] Couldn't save ${key}`, e)
    }
  }
}

/** Shared across the page: the panel switch and the sorter see the same state. */
const enabled = ref(bookmarksSupported() && local.get(ENABLED_KEY) === '1')
/** What was just sorted, for the "Saved to …" note; `existing` ones were already on the page. Cleared when the note closes. */
const justAdded = ref<{ sectionId: string; linkId: string; existing?: true }[]>([])
let running = false

export const useAutoSort = () => {
  const { addSortedBookmarks } = useStartpage()

  const sort = async (since: number, limit?: number) => {
    const found = await bookmarksSince(since, limit)
    if (!found.length) return 0
    const newest = Math.max(...found.map(b => b.dateAdded))
    if (newest > (Number(local.get(SEEN_KEY)) || 0)) local.set(SEEN_KEY, String(newest))
    // Oldest first, so they land in the order they were saved.
    const added = addSortedBookmarks(found.reverse())
    if (added.length) justAdded.value = added
    return added.filter(a => !a.existing).length
  }

  /** Sort anything bookmarked since the last look. Safe to call often. */
  const check = async () => {
    if (running || !enabled.value) return
    running = true
    try {
      // Permission can be taken away from the browser's extension settings.
      if (!(await hasBookmarkAccess())) {
        enabled.value = false
        local.set(ENABLED_KEY, null)
        return
      }
      const since = Number(local.get(SEEN_KEY)) || 0
      if (!since) {
        local.set(SEEN_KEY, String(Date.now()))
        return
      }
      await sort(since)
    } catch (e) {
      console.warn('[tabscape] Sorting bookmarks failed', e)
    } finally {
      running = false
    }
  }

  /** Turn sorting on. Shows the browser's permission prompt, so call it straight from a click. */
  const enable = async () => {
    if (!(await requestBookmarkAccess())) return false
    enabled.value = true
    local.set(ENABLED_KEY, '1')
    // Start from now: turning it on shouldn't pour every old bookmark onto the page.
    local.set(SEEN_KEY, String(Date.now()))
    log('bookmark sorting on')
    return true
  }

  /** Turn sorting off and hand the permission back. */
  const disable = async () => {
    enabled.value = false
    local.set(ENABLED_KEY, null)
    local.set(SEEN_KEY, null)
    await releaseBookmarkAccess()
    log('bookmark sorting off')
  }

  /** Sort the most recent bookmarks, on request: for trying it out, or catching up. */
  const sortRecent = async (count = 20) => {
    if (!enabled.value || running) return 0
    running = true
    try {
      return await sort(0, count)
    } finally {
      running = false
    }
  }

  const dismiss = () => { justAdded.value = [] }

  return { supported: bookmarksSupported(), enabled, justAdded, check, enable, disable, sortRecent, dismiss }
}

/** Run the sorter for as long as the page is open: on open, and whenever it comes back into view. */
export const useAutoSortWatcher = () => {
  const { check } = useAutoSort()
  const onVisible = () => {
    if (document.visibilityState === 'visible') check()
  }
  onMounted(() => {
    check()
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
}
