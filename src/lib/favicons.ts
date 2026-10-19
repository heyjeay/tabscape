/**
 * Real site icons, read from the browser's own icon cache through Chrome's
 * favicon feature, so nothing is fetched from the internet. Only Chrome-based
 * browsers have it (Chrome, Edge, Brave, Opera, Helium); Firefox and the
 * website demo show letter badges instead.
 *
 * It needs the optional "favicon" permission, which shows an install warning
 * ("Read the icons of the websites you visit"), so it's asked for only when
 * the person turns real icons on.
 */
type Api = typeof chrome
const api = (): Api | undefined => (globalThis as { chrome?: Api }).chrome
const PERMISSION = { permissions: ['favicon'] as chrome.runtime.ManifestPermissions[] }

export const faviconsSupported = () =>
  !!api()?.permissions?.request && !!api()?.runtime?.getURL && !navigator.userAgent.includes('Firefox')

export const hasFaviconAccess = async (): Promise<boolean> => {
  try {
    return !!(await api()?.permissions?.contains(PERMISSION))
  } catch {
    return false
  }
}

/** Shows the browser's permission prompt. Must be called straight from a click. */
export const requestFaviconAccess = async (): Promise<boolean> => {
  try {
    return !!(await api()?.permissions?.request(PERMISSION))
  } catch (e) {
    console.warn('[tabscape] Icon permission request failed', e)
    return false
  }
}

export const releaseFaviconAccess = async () => {
  try {
    await api()?.permissions?.remove(PERMISSION)
  } catch {
    // Already gone: nothing to do.
  }
}

/** The cached icon for a page. Sites the browser has never visited get its default globe. */
export const faviconUrl = (pageUrl: string, size = 32) =>
  api()!.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`)
