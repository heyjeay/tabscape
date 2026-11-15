import { log } from '../config'
import { keys, load, save } from './storage'

/** A page you went to, or a tab that was closed or tidied away. */
export interface Visit {
  url: string
  title: string
  /** When (ms since 1970). */
  at: number
}

/** How many of each are kept on the device. */
const LIMITS = { history: 1000, closed: 25, archived: 100 }

type Kind = keyof typeof LIMITS
const KEYS: Record<Kind, string> = { history: keys.history, closed: keys.closedTabs, archived: keys.archivedTabs }

/** How long to wait for visits to settle before writing (a page reports several times as it loads). */
const SAVE_AFTER = 1000

/**
 * The lists, read once and kept in memory; writes wait a moment so a burst of changes is one
 * write. Nothing here ever leaves the device, and private tabs never add to it.
 */
const lists: Partial<Record<Kind, Visit[]>> = {}
const reading: Partial<Record<Kind, Promise<Visit[]>>> = {}
const timers: Partial<Record<Kind, ReturnType<typeof setTimeout>>> = {}
const listeners = new Set<() => void>()

const list = (kind: Kind) => {
  if (lists[kind]) return Promise.resolve(lists[kind])
  reading[kind] ??= load<Visit[]>(KEYS[kind], []).then(found => {
    lists[kind] ??= Array.isArray(found) ? found : []
    return lists[kind]
  })
  return reading[kind]
}

const change = async (kind: Kind, update: (all: Visit[]) => Visit[]) => {
  const next = update(await list(kind)).slice(0, LIMITS[kind])
  lists[kind] = next
  clearTimeout(timers[kind])
  timers[kind] = setTimeout(() => save(KEYS[kind], next), SAVE_AFTER)
  listeners.forEach(tell => tell())
}

/** Hears about every change, so an open history list stays current. Returns how to stop. */
export const onHistoryChange = (tell: () => void) => {
  listeners.add(tell)
  return () => {
    listeners.delete(tell)
  }
}

export const loadVisits = (kind: Kind) => list(kind)

/**
 * A page finished loading. The same page reporting again (it often does, as its title arrives)
 * updates the newest entry instead of adding another.
 */
export const recordVisit = (url: string, title: string) =>
  change('history', all => {
    const newest = all[0]
    if (newest?.url === url) return [{ url, title: title || newest.title, at: Date.now() }, ...all.slice(1)]
    return [{ url, title, at: Date.now() }, ...all]
  })

/** Closed tabs, newest first, for "reopen closed tab". */
export const addClosed = (visits: Visit[]) => {
  if (visits.length) change('closed', all => [...visits, ...all])
}

/** Takes the most recently closed tab off the list. */
export const takeClosed = async (): Promise<Visit | null> => {
  const [newest] = await list('closed')
  if (!newest) return null
  await change('closed', all => all.slice(1))
  return newest
}

/** Tabs tidied away for not being opened in a while. */
export const addArchived = (visits: Visit[]) => {
  if (visits.length) change('archived', all => [...visits, ...all])
}

/** Takes one entry off a list (opened again, or removed). */
export const removeVisit = (kind: Kind, visit: Visit) =>
  change(kind, all => all.filter(v => v !== visit && !(v.url === visit.url && v.at === visit.at)))

export const clearVisits = (kind: Kind) => change(kind, () => [])

/** Forgets everything on a list from a time on (ms since 1970); 0 forgets it all. */
export const clearVisitsSince = (kind: Kind, since: number) => change(kind, all => all.filter(v => v.at < since))

/** Pages you've been to whose address or title has the words in it: for the search screen. */
export const findInHistory = async (text: string, limit: number) => {
  const words = text.trim().toLowerCase()
  if (words.length < 2) return []
  const seen = new Set<string>()
  const found: Visit[] = []
  for (const visit of await list('history')) {
    if (found.length >= limit) break
    if (seen.has(visit.url)) continue
    if (visit.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').includes(words) || visit.title.toLowerCase().includes(words)) {
      seen.add(visit.url)
      found.push(visit)
    }
  }
  log('history matches for', words, found.length)
  return found
}
