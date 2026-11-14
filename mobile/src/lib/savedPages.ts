import { File } from 'expo-file-system'
import { load, save } from './storage'

/** A page saved with "Add to Tabscape", waiting for a start page to sort it into your sections. */
export interface SavedPage {
  url: string
  title: string
}

const PAGES_KEY = 'tabscape.saved'
/** A Tabscape backup (exported from the extension's settings), waiting for a start page to take it in. */
const IMPORT_KEY = 'tabscape.import'

export const loadSavedPages = () => load<SavedPage[]>(PAGES_KEY, [])

/**
 * Changes to the list go one at a time, so saving a page while a start page is taking the
 * list in can't lose it or hand it over twice.
 */
let queue: Promise<unknown> = Promise.resolve()
const inTurn = <T,>(change: () => Promise<T>) => {
  const turn = queue.then(change)
  queue = turn.catch(() => {})
  return turn
}

export const addSavedPage = (page: SavedPage) =>
  inTurn(async () => {
    const all = await loadSavedPages()
    await save(PAGES_KEY, [...all, page])
  })

/** The start page took the first `count`; anything saved meanwhile stays for next time. */
export const removeDeliveredPages = (count: number) =>
  inTurn(async () => {
    const all = await loadSavedPages()
    await save(PAGES_KEY, all.slice(count))
  })

export const loadPendingImport = () => load<string | null>(IMPORT_KEY, null)

export const clearPendingImport = () => save(IMPORT_KEY, null)

/**
 * Reads a backup file chosen in the file picker and keeps it for the start page.
 * Returns false if it isn't a Tabscape backup.
 */
export const queueImport = async (uri: string) => {
  try {
    const json = await new File(uri).text()
    const data = JSON.parse(json) as { sections?: unknown }
    if (!Array.isArray(data?.sections)) return false
    await save(IMPORT_KEY, json)
    return true
  } catch {
    return false
  }
}

/**
 * JavaScript for a start page: hand it what's waiting (window.tabscapeAddPages and
 * window.tabscapeImport, from the start page's useAutoSort), and report back what it took.
 * -1 means it isn't ready yet.
 */
export const deliveryScript = (pages: SavedPage[], backup: string | null) => `(function () {
  var ready = typeof window.tabscapeAddPages === 'function' && typeof window.tabscapeImport === 'function';
  var imported = ready && ${backup !== null} ? window.tabscapeImport(${JSON.stringify(backup ?? '')}) : null;
  var taken = ready ? window.tabscapeAddPages(${JSON.stringify(pages)}) : -1;
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'delivered', taken: taken, offered: ${pages.length}, imported: imported }));
})(); true;`
