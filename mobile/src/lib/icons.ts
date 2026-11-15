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
const KEY = 'tabscape.icons'
/** A site with no icon to be found is asked again after this long. */
const RETRY_AFTER = 7 * 24 * 3600_000
/** Icons fetched at once. */
const AT_ONCE = 4

/** What's known for each site: the saved icon's file name, or none found (and when that was). */
type Entry = { file: string } | { none: number }
let index: Record<string, Entry> = {}
const ready = load<Record<string, Entry>>(KEY, {}).then(found => {
  index = found && typeof found === 'object' ? found : {}
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

/** The icons a homepage names, best first: home-screen icons, then the biggest other icons. */
const iconsNamedIn = (html: string, base: string) => {
  const touch: string[] = []
  const other: { href: string; size: number }[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? ''
    const href = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1]
    if (!href || !/icon/.test(rel)) continue
    const url = absolute(href.replace(/&amp;/g, '&'), base)
    if (!url) continue
    if (rel.includes('apple-touch-icon')) touch.push(url)
    else {
      const size = Number(/\bsizes\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? 0)
      other.push({ href: url, size: /\.svg(\?|$)/i.test(url) ? -1 : size })
    }
  }
  other.sort((a, b) => b.size - a.size)
  return [...touch, ...other.filter(o => o.size >= 0).map(o => o.href)]
}

/** Downloads an image, if it is one (not an error page), up to 1 MB. */
const download = async (url: string): Promise<{ bytes: Uint8Array; ext: string } | null> => {
  try {
    const response = await fetch(url)
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !type.startsWith('image/') || type.includes('svg')) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length < 64 || bytes.length > 1_000_000) return null
    const ext = type.includes('png') ? 'png' : type.includes('icon') ? 'ico' : type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'png'
    return { bytes, ext }
  } catch {
    return null
  }
}

/** Finds a site's best icon and saves it: its home-screen icon, an icon its homepage names, or its favicon. */
const find = async (key: string): Promise<string | null> => {
  const home = `https://${key}/`
  const candidates = [`${home}apple-touch-icon.png`]
  try {
    const response = await fetch(home)
    if (response.ok) candidates.unshift(...iconsNamedIn((await response.text()).slice(0, 200_000), response.url || home))
  } catch {
    // No homepage to read: try the usual places.
  }
  candidates.push(`${home}apple-touch-icon-precomposed.png`, `${home}favicon.ico`)
  for (const url of [...new Set(candidates)]) {
    const image = await download(url)
    if (!image) continue
    folder.create({ idempotent: true, intermediates: true })
    const name = `${key.replace(/[^a-z0-9.-]/g, '_')}.${image.ext}`
    const file = new File(folder, name)
    if (file.exists) file.delete()
    file.create()
    await file.write(image.bytes)
    index[key] = { file: name }
    persist()
    log('icon for', key, 'from', url)
    return file.uri
  }
  index[key] = { none: Date.now() }
  persist()
  return null
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
