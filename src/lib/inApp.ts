import { reactive } from 'vue'

/**
 * Running as the start page of the Tabscape iPhone app (it gives every page
 * `window.ReactNativeWebView` before the page's own scripts run). There, links
 * are big tiles to tap, like Safari's Favourites, rather than a list to point at.
 * In development, adding ?app to the address shows the page the app's way.
 */
export const inApp = typeof window !== 'undefined' &&
  ('ReactNativeWebView' in window || (import.meta.env.DEV && new URLSearchParams(location.search).has('app')))

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
