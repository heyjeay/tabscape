import { faviconsSupported, faviconUrl, hasFaviconAccess } from './favicons'
import { iconSiteOf } from './iconSite'
import type { SharedIcons } from './relay'

/**
 * The icons this computer shows, gathered for the phone (sent through the relay with the rest of
 * sync, sealed the same way). Chrome keeps every site's icon as you browse, so it has icons the
 * phone can't fetch for itself: shops that turn away anything but a browser, servers only
 * reachable from home. Its own copies only, read through Chrome's favicon feature (so only when
 * real site icons are on); nothing is fetched from the internet. Images given to links by hand
 * go too.
 */

/**
 * Room for them all, in base64 characters: sealed, they grow by about a third, and the relay
 * keeps up to 512 KB. Chrome's icons are small (a few KB each), so it's hundreds of sites.
 */
const ROOM = 340_000

const toBase64 = (bytes: Uint8Array) => {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

/** A page's icon from Chrome's store, as a PNG, 64 pixels (sharp on the phone's screen as a small icon). */
const chromeIcon = async (pageUrl: string) => {
  try {
    const response = await fetch(faviconUrl(pageUrl, 64))
    return response.ok ? toBase64(new Uint8Array(await response.arrayBuffer())) : null
  } catch {
    return null
  }
}

export const collectIcons = async (links: { id: string; url: string }[], own: Record<string, string>): Promise<SharedIcons> => {
  const shared: SharedIcons = { v: 1, sites: {}, own: {} }
  let used = 0
  // Images chosen by hand first: there are few, and they're what the person picked.
  for (const link of links) {
    const image = own[link.id]
    if (typeof image !== 'string' || !image.startsWith('data:image/') || used + image.length > ROOM) continue
    shared.own[link.id] = image
    used += image.length
  }
  if (!faviconsSupported() || !(await hasFaviconAccess())) return shared
  // What Chrome gives for a site it has never seen (a grey globe): not worth sending.
  const globe = await chromeIcon('https://tabscape-never-visited.invalid/')
  const seen = new Set<string>()
  for (const link of links) {
    const site = iconSiteOf(link.url)
    if (!site || seen.has(site)) continue
    seen.add(site)
    const png = await chromeIcon(link.url)
    if (!png || png.length < 100 || png === globe) continue
    if (used + png.length > ROOM) break
    shared.sites[site] = png
    used += png.length
  }
  return shared
}

/** A short fingerprint of the icons, to tell whether they've changed since they were last sent. */
export const fingerprint = (text: string) => {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x5bd1e995)
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${text.length.toString(36)}`
}
