import { reactive } from 'vue'

/**
 * Running as the start page of the Tabscape iPhone app (it gives every page
 * `window.ReactNativeWebView` before the page's own scripts run). There, links
 * are big tiles to tap, like Safari's Favourites, rather than a list to point at.
 * In development, adding ?app to the address shows the page the app's way.
 */
export const inApp = typeof window !== 'undefined' &&
  ('ReactNativeWebView' in window || (import.meta.env.DEV && new URLSearchParams(location.search).has('app')))

/** What a link's icon is kept under (in lib/iconSite, which the computer uses too, to share its icons). */
export { iconSiteOf } from './iconSite'

type AppWindow = Window & {
  ReactNativeWebView?: { postMessage: (data: string) => void }
  /** The icons the app has saved, handed over before the page's own scripts run. */
  tabscapeKnownIcons?: Record<string, string>
  /** The app hands over icons as it finds them. */
  tabscapeIcons?: (found: Record<string, string | null>) => void
}
const appWindow = (typeof window !== 'undefined' ? window : {}) as AppWindow

/**
 * Site icons, by host, from the app: it fetches each site's best icon once (its home-screen
 * icon, as Safari's Favourites use) and keeps it on the phone, so the tiles show it at once,
 * every time, without asking the site again. A file:// address, or null for a site with none.
 */
export const appIcons = reactive<Record<string, string | null>>(inApp ? { ...(appWindow.tabscapeKnownIcons ?? {}) } : {})
if (inApp) {
  appWindow.tabscapeIcons = found => {
    Object.assign(appIcons, found)
  }
}

const asked = new Set<string>()
let waiting: string[] = []
let timer: ReturnType<typeof setTimeout> | undefined

/** Hands the app the computer's icons (from sync), to keep where they're better than its own. */
export const handIconsToApp = (sites: Record<string, string>) => {
  if (inApp && Object.keys(sites).length) appWindow.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'desktopIcons', sites }))
}

/** Asks the app for a site's icon (once; sites asked for together go in one message). */
export const askAppForIcon = (host: string) => {
  if (!inApp || host in appIcons || asked.has(host)) return
  asked.add(host)
  waiting.push(host)
  clearTimeout(timer)
  timer = setTimeout(() => {
    appWindow.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'icons', hosts: waiting }))
    waiting = []
  }, 50)
}

/**
 * Holding a finger on an empty part of the start page asks the app for its Customise card (Start
 * Page Icons), as holding the iPhone's home screen does. Not on a tile, a button or a field, and
 * not while links are being edited (then holds are for moving them).
 */
if (inApp && typeof document !== 'undefined') {
  const HOLD_MS = 550
  let hold: ReturnType<typeof setTimeout> | undefined
  let x = 0
  let y = 0
  const stop = () => {
    clearTimeout(hold)
    hold = undefined
  }
  document.addEventListener('touchstart', e => {
    stop()
    if (e.touches.length !== 1) return
    const target = e.target instanceof Element ? e.target : null
    if (target?.closest('a, button, input, textarea, select, label, [contenteditable], [role="dialog"], .tl-link')) return
    // Editing links (the pencil's Done is showing instead of the pencil).
    if (!document.querySelector('[aria-label="Edit links"]')) return
    x = e.touches[0].clientX
    y = e.touches[0].clientY
    hold = setTimeout(() => {
      hold = undefined
      appWindow.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'customise' }))
    }, HOLD_MS)
  }, { passive: true })
  document.addEventListener('touchmove', e => {
    const t = e.touches[0]
    if (hold && t && (Math.abs(t.clientX - x) > 10 || Math.abs(t.clientY - y) > 10)) stop()
  }, { passive: true })
  document.addEventListener('touchend', stop, { passive: true })
  document.addEventListener('touchcancel', stop, { passive: true })
}
