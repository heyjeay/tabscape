/**
 * Running as the start page of the Tabscape iPhone app (it gives every page
 * `window.ReactNativeWebView` before the page's own scripts run). There, links
 * are big tiles to tap, like Safari's Favourites, rather than a list to point at.
 * In development, adding ?app to the address shows the page the app's way.
 */
export const inApp = typeof window !== 'undefined' &&
  ('ReactNativeWebView' in window || (import.meta.env.DEV && new URLSearchParams(location.search).has('app')))

/**
 * A site's own icon, the way Safari finds one for its Favourites: the large
 * home-screen icon most sites keep at their root, else the small tab icon.
 * Only in the app, where tapping the tile goes to the site anyway.
 */
export const siteIconUrls = (url: string): string[] => {
  try {
    const { protocol, host } = new URL(url)
    if (!/^https?:$/.test(protocol) || !host) return []
    return [`${protocol}//${host}/apple-touch-icon.png`, `${protocol}//${host}/favicon.ico`]
  } catch {
    return []
  }
}
