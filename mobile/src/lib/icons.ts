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
/** Version 2 picks icons by their real size; version 1's (often small, stretched) are found again once. */
const KEY = 'tabscape.icons.2'
/** A site with no icon to be found is asked again after this long. */
const RETRY_AFTER = 7 * 24 * 3600_000
/** Icons fetched at once. */
const AT_ONCE = 4

/** What's known for each site: the saved icon's file name, or none found (and when that was). */
type Entry = { file: string } | { none: number }
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
    const response = await fetch(url)
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

/** Downloads an image, if it is one (not an error page), up to 1 MB, with how wide it really is. */
const download = async (url: string): Promise<{ bytes: Uint8Array; ext: string; width: number } | null> => {
  try {
    const response = await fetch(url)
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !type.startsWith('image/') || type.includes('svg')) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length < 64 || bytes.length > 1_000_000) return null
    const ext = type.includes('png') ? 'png' : type.includes('icon') ? 'ico' : type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'png'
    return { bytes, ext, width: imageWidth(bytes) }
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

/**
 * Finds a site's best icon and saves it. It tries, best first: home-screen icons its homepage
 * names, the usual home-screen icon addresses, its web app manifest's icons, the other icons its
 * homepage names (biggest first), then its favicon; and keeps the widest it finds, stopping at
 * the first that's sharp. A small one is saved marked small (".s." in its name), so the start
 * page shows it small in the middle of its tile instead of stretching it blurry.
 */
const find = async (key: string): Promise<string | null> => {
  const home = `https://${key}/`
  let named: ReturnType<typeof iconsNamedIn> = { touch: [], other: [], manifest: null }
  try {
    const response = await fetch(home)
    if (response.ok) named = iconsNamedIn((await response.text()).slice(0, 300_000), response.url || home)
  } catch {
    // No homepage to read: try the usual places.
  }
  const fromManifest = named.manifest ? await manifestIcons(named.manifest) : []
  const candidates = [
    ...named.touch,
    `${home}apple-touch-icon.png`,
    `${home}apple-touch-icon-precomposed.png`,
    ...fromManifest.filter(icon => icon.size >= SHARP).map(icon => icon.href),
    ...named.other.sort((a, b) => b.size - a.size).map(icon => icon.href),
    ...fromManifest.filter(icon => icon.size < SHARP).map(icon => icon.href),
    `${home}favicon.ico`
  ]
  let best: { bytes: Uint8Array; ext: string; width: number; url: string } | null = null
  let tries = 0
  for (const url of [...new Set(candidates)]) {
    if (tries >= TRIES) break
    tries += 1
    const image = await download(url)
    if (!image) continue
    // A width it couldn't read is taken as middling: better than nothing, not as good as a known big one.
    const width = image.width || 64
    if (!best || width > best.width) best = { ...image, width, url }
    if (width >= SHARP) break
  }
  if (!best) {
    index[key] = { none: Date.now() }
    persist()
    return null
  }
  folder.create({ idempotent: true, intermediates: true })
  const name = `${key.replace(/[^a-z0-9.-]/g, '_')}${best.width < SMALL ? '.s' : ''}.${best.ext}`
  const file = new File(folder, name)
  if (file.exists) file.delete()
  file.create()
  await file.write(best.bytes)
  index[key] = { file: name }
  persist()
  log('icon for', key, 'from', best.url, best.width, 'px')
  return file.uri
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

/** A site's icon for a view: the saved file at once if there is one, fetched (and then shown) if not. */
export const useIcon = (host: string | null) => {
  const [uri, setUri] = useState(() => (host ? (savedIcon(host) ?? null) : null))
  useEffect(() => {
    if (!host) return
    let live = true
    iconFor(host).then(found => live && setUri(found))
    return () => {
      live = false
    }
  }, [host])
  return uri
}
