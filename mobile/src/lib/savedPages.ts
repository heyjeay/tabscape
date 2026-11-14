import { keys, load, save } from './storage'

/** A page saved with "Add to Tabscape", waiting for a start page to sort it into your sections. */
export interface SavedPage {
  url: string
  title: string
}

export const loadSavedPages = () => load<SavedPage[]>(keys.savedPages, [])

export const addSavedPage = async (page: SavedPage) => {
  const all = await loadSavedPages()
  await save(keys.savedPages, [...all, page])
}

/** The start page took the first `count`; anything saved meanwhile stays for next time. */
export const removeDeliveredPages = async (count: number) => {
  const all = await loadSavedPages()
  await save(keys.savedPages, all.slice(count))
}

/**
 * JavaScript for a start page: hand it the saved pages (window.tabscapeAddPages, from the
 * start page's useAutoSort), and report back how many it took, or -1 if it isn't ready yet.
 */
export const deliveryScript = (pages: SavedPage[]) => `(function () {
  var taken = typeof window.tabscapeAddPages === 'function' ? window.tabscapeAddPages(${JSON.stringify(pages)}) : -1;
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'saved', taken: taken, offered: ${pages.length} }));
})(); true;`
