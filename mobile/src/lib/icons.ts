import { Directory, File, Paths } from 'expo-file-system'
import { useEffect, useState } from 'react'
import { log } from '../config'
import { load, save } from './storage'

/**
 * Site icons, downloaded once and kept on the phone, for the tab cards and the start page's tiles.
 *
 * The start page is a local page (no web address of its own), and WebKit doesn't keep what such a
 * page downloads, so it fetched every icon again each time it opened. Here each site's best icon
 * (its home-screen icon if it has one, as Safari's Favourites use) is fetched once, saved as a file
 * in the app's documents (which the start page may read), and used from there ever after.
 */

/** A site's key: its host, lower case, without "www." (as the start page names them). */
export const iconKey = (host: string) => host.toLowerCase().replace(/^www\./, '')

const folder = new Directory(Paths.document, 'icons')
/**
 * Version 3 asks as Safari does (shops that turn away anything else gave nothing before), reads
 * an image by its bytes, and has more places to look: everything's found again once.
 */
const KEY = 'tabscape.icons.3'
/** A site with no icon to be found is asked again after this long. */
const RETRY_AFTER = 7 * 24 * 3600_000
/** Icons fetched at once. */
const AT_ONCE = 4

/** What's known for each site: the saved icon's file name (and how wide it is), or none found (and when that was). */
type Entry = { file: string; width?: number } | { none: number }
let index: Record<string, Entry> = {}
const ready = load<Record<string, Entry> | null>(KEY, null).then(found => {
  index = found && typeof found === 'object' ? found : {}
  // First launch with this version: the old icons go, and each is found again (the better way) when it's next wanted.
  if (!found) {
    try {
      if (folder.exists) folder.list().forEach(item => item.delete())
    } catch (e) {
      log("couldn't clear the old icons", e)
    }
  }
})

const listeners = new Set<(key: string, uri: string | null) => void>()
const inFlight = new Map<string, Promise<string | null>>()
const queue: (() => Promise<void>)[] = []
let running = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined

const persist = () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => save(KEY, index), 1000)
}

const uriOf = (entry: Entry | undefined): string | null | undefined => {
  if (!entry) return undefined
  if ('none' in entry) return Date.now() - entry.none > RETRY_AFTER ? undefined : null
  return new File(folder, entry.file).uri
}

/** A site's saved icon (a file:// address), null if it has none, or undefined if not known yet. */
export const savedIcon = (host: string) => uriOf(index[iconKey(host)])

/** Every saved icon, by site, once they're read from storage. */
export const loadSavedIcons = () => ready.then(() => savedIcons())

/** Every saved icon, by site: for the start page, so its tiles have them from the first moment. */
export const savedIcons = () => {
  const all: Record<string, string> = {}
  for (const [key, entry] of Object.entries(index)) {
    if ('file' in entry) all[key] = new File(folder, entry.file).uri
  }
  return all
}

/** Hears about each icon as it's found (or found not to exist). Returns how to stop. */
export const onIcon = (tell: (key: string, uri: string | null) => void) => {
  listeners.add(tell)
  return () => {
    listeners.delete(tell)
  }
}

const absolute = (href: string, base: string) => {
  try {
    return new URL(href, base).href
  } catch {
    return null
  }
}

/** What a homepage says about its icons: home-screen icons, other icons (with the size they say), and its web app manifest. */
const iconsNamedIn = (html: string, base: string) => {
  const touch: string[] = []
  const other: { href: string; size: number }[] = []
  let manifest: string | null = null
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? ''
    const href = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1]
    if (!href) continue
    const url = absolute(href.replace(/&amp;/g, '&'), base)
    if (!url) continue
    if (rel.includes('manifest')) manifest ??= url
    else if (!/icon/.test(rel)) continue
    else if (rel.includes('apple-touch-icon')) touch.push(url)
    else if (!/\.svg(\?|$)/i.test(url)) other.push({ href: url, size: Number(/\bsizes\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? 0) })
  }
  return { touch, other, manifest }
}

/** A web app manifest's icons, biggest first (they're often 192 or 512 pixels: the sharpest there is). */
const manifestIcons = async (url: string) => {
  try {
    const response = await fetchAsSafari(url, 'application/manifest+json,application/json;q=0.9,*/*;q=0.5')
    const json = (await response.json()) as { icons?: { src?: string; sizes?: string; type?: string }[] }
    return (json.icons ?? [])
      .filter(icon => icon.src && !/svg/i.test(`${icon.type ?? ''}${icon.src}`))
      .map(icon => ({ href: absolute(icon.src!, response.url || url), size: Math.max(0, ...(icon.sizes ?? '').split(/\s+/).map(s => Number(s.split('x')[0]) || 0)) }))
      .filter((icon): icon is { href: string; size: number } => !!icon.href)
      .sort((a, b) => b.size - a.size)
  } catch {
    return []
  }
}

/** How wide an image really is (pixels), read from its first bytes: PNG, ICO (its biggest), JPEG, WebP; 0 if it can't tell. */
export const imageWidth = (b: Uint8Array): number => {
  const at16 = (i: number) => (b[i] << 8) | b[i + 1]
  // PNG: the width is in the header chunk.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]
  // ICO: a list of the sizes inside (0 means 256); the biggest.
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) {
    let widest = 0
    for (let i = 0; i < b[4] && 6 + i * 16 < b.length; i++) widest = Math.max(widest, b[6 + i * 16] || 256)
    return widest
  }
  // JPEG: the frame header (SOF0–SOF3) holds the size.
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) return 0
      const marker = b[i + 1]
      if (marker >= 0xc0 && marker <= 0xc3) return at16(i + 7)
      i += 2 + at16(i + 2)
    }
    return 0
  }
  // WebP: lossy (VP8), lossless (VP8L) or extended (VP8X).
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15])
    if (kind === 'VP8 ') return ((b[27] << 8) | b[26]) & 0x3fff
    if (kind === 'VP8L') return 1 + (((b[22] & 0x3f) << 8) | b[21])
    if (kind === 'VP8X') return 1 + (b[24] | (b[25] << 8) | (b[26] << 16))
  }
  return 0
}

/**
 * Asked as Safari on a Mac asks (desktop pages name more icons): many shops (IGN, Centre Com…) turn away requests
 * that don't look like a browser's, so they gave no icon at all.
 */
const AS_SAFARI = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en'
}
/**
 * Images are asked for as PNG (or ICO, JPEG): image services that can send AVIF or WebP do when
 * they're told they may, and it's PNG whose size is surest to be read.
 */
const IMAGES = 'image/png,image/x-icon,image/jpeg;q=0.9,image/*;q=0.5'
export const fetchAsSafari = (url: string, accept = AS_SAFARI.accept) => fetch(url, { headers: { ...AS_SAFARI, accept } })

/** What kind of image the bytes are (going by the bytes, not what the server called them), or null if none it can show. */
export const imageKind = (b: Uint8Array): string | null => {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ico'
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg'
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return 'webp'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
  return null
}

/** Downloads an image, if it is one (not an error page or an SVG), up to 1 MB, with how wide it really is. */
const download = async (url: string): Promise<{ bytes: Uint8Array; ext: string; width: number } | null> => {
  try {
    const response = await fetchAsSafari(url, IMAGES)
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length < 64 || bytes.length > 1_000_000) return null
    const ext = imageKind(bytes)
    return ext ? { bytes, ext, width: imageWidth(bytes) } : null
  } catch {
    return null
  }
}

/** Wide enough to fill a start page tile sharply (a 76-point tile, at 2–3 pixels a point, wants 150 or more). */
const SHARP = 150
/** Narrower than this, an icon is shown small in the middle of a light tile rather than stretched. */
export const SMALL = 96
/** Downloads tried for one site at most, looking for a sharp one. */
const TRIES = 8

/** Where anyone can have a site of their own, so a subdomain's site isn't the brand's. */
const SHARED_HOSTS = /^(pages\.dev|workers\.dev|github\.io|gitlab\.io|vercel\.app|netlify\.app|web\.app|firebaseapp\.com|herokuapp\.com|onrender\.com|fly\.dev|glitch\.me|blogspot\.com|wordpress\.com|substack\.com|tumblr\.com|wixsite\.com|myshopify\.com|squarespace\.com|neocities\.org|ngrok\.io|ngrok-free\.app)$/

/**
 * The site a subdomain belongs to ("store.epicgames.com" → "epicgames.com"), to look at when the
 * subdomain has no icon; null when there's none (or it would be a country's ending, like com.au).
 */
export const parentSite = (key: string) => {
  const labels = key.split('.')
  if (labels.length < 3 || /^\d+$/.test(labels[labels.length - 1])) return null
  const parent = labels.slice(1)
  // Somewhere many people's sites live (pages.dev, github.io…): its icon isn't theirs.
  if (SHARED_HOSTS.test(parent.join('.'))) return null
  // "shop.example.com.au" → "example.com.au", but never just "com.au" or "co.uk".
  if (parent.length === 2 && parent[1].length === 2 && parent[0].length <= 3) return null
  return parent.join('.')
}

/** Where the icons for a site might be, best first, from its homepage. */
const candidatesFor = async (key: string) => {
  const home = `https://${key}/`
  let named: ReturnType<typeof iconsNamedIn> = { touch: [], other: [], manifest: null }
  try {
    const response = await fetchAsSafari(home)
    if (response.ok) named = iconsNamedIn((await response.text()).slice(0, 300_000), response.url || home)
  } catch {
    // No homepage to read: try the usual places.
  }
  return ranked(named, home)
}

/**
 * The same icon bigger, where it's asked for small from an image service that makes any size
 * (Shopify shops name a 32-pixel one: "…&width=32", or "…_48x48.png"); null if it isn't.
 */
export const biggerCopy = (href: string) => {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  let changed = false
  for (const name of ['width', 'height']) {
    const size = Number(url.searchParams.get(name))
    if (size && size < SHARP) {
      url.searchParams.set(name, '192')
      changed = true
    }
  }
  if (url.pathname.includes('/cdn/shop/') || url.hostname === 'cdn.shopify.com') {
    const resized = url.pathname.replace(/_(\d+)x(\d+)(\.\w+)$/, (whole, w: string, h: string, ext: string) =>
      Number(w) < SHARP && Number(h) < SHARP ? `_192x192${ext}` : whole)
    if (resized !== url.pathname) {
      url.pathname = resized
      changed = true
    }
  }
  return changed ? url.href : null
}

/** A page's icons, best first: home-screen icons, the manifest's big ones, the others biggest first, then the favicon. */
const ranked = async (named: ReturnType<typeof iconsNamedIn>, home: string) => {
  const fromManifest = named.manifest ? await manifestIcons(named.manifest) : []
  return [
    ...named.touch,
    `${home}apple-touch-icon.png`,
    `${home}apple-touch-icon-precomposed.png`,
    ...fromManifest.filter(icon => icon.size >= SHARP).map(icon => icon.href),
    // A bigger copy of each first, where the image service can make one.
    ...[...named.other].sort((a, b) => b.size - a.size).flatMap(icon => [biggerCopy(icon.href), icon.href].filter((href): href is string => !!href)),
    ...fromManifest.filter(icon => icon.size < SHARP).map(icon => icon.href),
    `${home}favicon.ico`
  ]
}

/**
 * The last place to ask: DuckDuckGo's icon service, which keeps sites' icons (and doesn't track
 * people). Only for a site that gave none itself; it does tell DuckDuckGo which site it was.
 */
const iconService = (key: string) => `https://icons.duckduckgo.com/ip3/${key}.ico`

type Found = { bytes: Uint8Array; ext: string; width: number; url: string }

/** The widest icon of these (up to `limit` downloads), stopping at the first sharp one; better than `best` or `best` itself. */
const bestOf = async (candidates: string[], limit: number, best: Found | null = null): Promise<Found | null> => {
  for (const url of [...new Set(candidates)].slice(0, limit)) {
    const image = await download(url)
    if (!image) continue
    // A width it couldn't read is taken as middling: better than nothing, not as good as a known big one.
    const width = image.width || 64
    if (!best || width > best.width) best = { ...image, width, url }
    if (width >= SHARP) break
  }
  return best
}

/**
 * Saves a site's icon, in place of any it had. Its width is in the name, so a better one is a new
 * file (never one a page has already shown, and kept); a small one is marked small (".s.").
 */
const keep = async (key: string, found: Found) => {
  folder.create({ idempotent: true, intermediates: true })
  const name = `${key.replace(/[^a-z0-9.-]/g, '_')}.${found.width}${found.width < SMALL ? '.s' : ''}.${found.ext}`
  const old = index[key]
  if (old && 'file' in old && old.file !== name) {
    try {
      new File(folder, old.file).delete()
    } catch {
      // Already gone.
    }
  }
  const file = new File(folder, name)
  if (file.exists) file.delete()
  file.create()
  await file.write(found.bytes)
  index[key] = { file: name, width: found.width }
  persist()
  log('icon for', key, 'from', found.url, found.width, 'px')
  return file.uri
}

/** How wide a site's saved icon is (0 if it has none): older entries only say whether it's small. */
const widthOf = (entry: Entry | undefined) =>
  !entry || !('file' in entry) ? 0 : (entry.width ?? (/\.s\.\w+$/.test(entry.file) ? 32 : SHARP))

/**
 * Finds a site's best icon and saves it. It tries, best first: home-screen icons its homepage
 * names, the usual home-screen icon addresses, its web app manifest's icons, the other icons its
 * homepage names (biggest first), then its favicon (then the site it belongs to, then DuckDuckGo's copy); and keeps the widest it finds, stopping at
 * the first that's sharp. A small one is saved marked small (".s." in its name), so the start
 * page shows it small in the middle of its tile instead of stretching it blurry.
 */
const find = async (key: string): Promise<string | null> => {
  const parent = parentSite(key)
  let best = await bestOf(await candidatesFor(key), TRIES)
  // Nothing on the subdomain: the site it belongs to (its icon is usually the same brand's).
  if (!best && parent) best = await bestOf(await candidatesFor(parent), TRIES)
  // Still nothing, or only a tiny one: DuckDuckGo's copy (the site's, or the one it belongs to).
  if (!best || best.width < 32) best = await bestOf([iconService(key), ...(parent ? [iconService(parent)] : [])], 2, best)
  if (!best) {
    index[key] = { none: Date.now() }
    persist()
    return null
  }
  return keep(key, best)
}

const next = () => {
  while (running < AT_ONCE && queue.length) {
    const job = queue.shift()!
    running += 1
    job().finally(() => {
      running -= 1
      next()
    })
  }
}

/** A site's icon: saved already, or fetched now (once, however often it's asked for). */
export const iconFor = async (host: string): Promise<string | null> => {
  await ready
  const key = iconKey(host)
  const known = uriOf(index[key])
  if (known !== undefined) return known
  let pending = inFlight.get(key)
  if (!pending) {
    pending = new Promise<string | null>(resolve => {
      queue.push(async () => {
        const uri = await find(key).catch(() => null)
        inFlight.delete(key)
        listeners.forEach(tell => tell(key, uri))
        resolve(uri)
      })
      next()
    })
    inFlight.set(key, pending)
  }
  return pending
}

/** Sites whose open pages have offered their icons this time the app's open: once each is enough. */
const offered = new Set<string>()

/**
 * A page you have open, telling the app its icons (the link tags it has, with addresses made
 * whole). The page was loaded by the browser itself, so it's never turned away as the app's
 * own requests can be by shops' bot checks; and what it names is the site's real icon. Taken
 * when the site has no icon saved, or only a smaller one.
 */
export const iconsFromPage = (pageUrl: string, links: { rel: string; href: string; sizes: string }[]) => {
  let home: URL
  try {
    home = new URL('/', pageUrl)
  } catch {
    return
  }
  if (!/^https?:$/.test(home.protocol)) return
  const key = iconKey(home.hostname)
  ready.then(() => {
    const have = widthOf(index[key])
    if (have >= SHARP || offered.has(key) || inFlight.has(key)) return
    offered.add(key)
    const named: ReturnType<typeof iconsNamedIn> = { touch: [], other: [], manifest: null }
    for (const link of links.slice(0, 30)) {
      const rel = String(link.rel).toLowerCase()
      const href = absolute(String(link.href), home.href)
      if (!href || !/^https?:/i.test(href)) continue
      if (rel.includes('manifest')) named.manifest ??= href
      else if (!rel.includes('icon')) continue
      else if (rel.includes('apple-touch-icon')) named.touch.push(href)
      else if (!/\.svg(\?|$)/i.test(href)) named.other.push({ href, size: Number(/\d+/.exec(String(link.sizes))?.[0] ?? 0) })
    }
    queue.push(async () => {
      try {
        const best = await bestOf(await ranked(named, home.href), TRIES)
        if (!best || best.width <= have) return
        const uri = await keep(key, best)
        listeners.forEach(tell => tell(key, uri))
      } catch (e) {
        log("couldn't take the icon", key, 'offered', e)
      }
    })
    next()
  })
}

/** A site's icon for a view: the saved file at once if there is one, fetched (and then shown) if not; a better one when it's found. */
export const useIcon = (host: string | null) => {
  const [uri, setUri] = useState(() => (host ? (savedIcon(host) ?? null) : null))
  useEffect(() => {
    if (!host) return
    let live = true
    iconFor(host).then(found => live && setUri(found))
    const key = iconKey(host)
    const stop = onIcon((found, better) => {
      if (live && found === key && better) setUri(better)
    })
    return () => {
      live = false
      stop()
    }
  }, [host])
  return uri
}
