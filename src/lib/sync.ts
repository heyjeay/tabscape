import { log } from '@/config'
import type { Page, Section, Settings } from './defaults'

/**
 * Chrome's synced storage: what the extension saves here follows the person to
 * every browser signed into their account. Absent outside the extension (the
 * web demo, the double-click build), and present but inert in browsers that
 * don't sync, such as Helium.
 *
 * Laid out to fit its limits - 8 KB per item, ~100 KB in all, a capped write
 * rate: each section is its own item, `meta` carries the order and a timestamp,
 * and a push sends only the items that changed.
 */
type Area = chrome.storage.SyncStorageArea

const area = (): Area | undefined => (globalThis as { chrome?: typeof chrome }).chrome?.storage?.sync

export const syncAvailable = () => !!area()

/** Chrome's own limits, less a little room. */
const ITEM_LIMIT = 8192 - 64
const TOTAL_LIMIT = 102400 - 1024

const sectionKey = (id: string) => `s:${id}`

/**
 * A list, even if it was saved as {"0": a, "1": b}: versions before 1.3 pushed
 * reactive lists, which storage kept in that shape. Anything else becomes [].
 */
export const asList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length && entries.every(([k]) => /^\d+$/.test(k))) {
      return entries.sort((a, b) => Number(a[0]) - Number(b[0])).map(([, v]) => v)
    }
  }
  return []
}

export interface Snapshot {
  updatedAt: number
  welcomed: boolean
  sections: unknown[]
  settings: unknown
  /** Absent in snapshots from before pages existed. */
  pages?: unknown
}

interface Meta {
  v: 1
  updatedAt: number
  welcomed: boolean
  order: string[]
  pages?: Page[]
}

/** What each synced item last held, as JSON, so a push sends only what changed and removes what's gone. */
let lastPushed: Record<string, string> = {}

export class SyncTooBig extends Error {}

export const readSnapshot = async (): Promise<Snapshot | null> => {
  const store = area()
  if (!store) return null
  const all = await store.get(null)
  lastPushed = Object.fromEntries(
    Object.entries(all)
      .filter(([k]) => k === 'meta' || k === 'settings' || k.startsWith('s:'))
      .map(([k, v]) => [k, JSON.stringify(v)])
  )
  const meta = all.meta as Meta | undefined
  if (!meta) return null
  meta.order = asList(meta.order) as string[]
  if (!meta.order.length) return null
  return {
    updatedAt: Number(meta.updatedAt) || 0,
    welcomed: !!meta.welcomed,
    settings: all.settings,
    pages: meta.pages,
    sections: meta.order.map(id => all[sectionKey(id)]).filter(Boolean)
  }
}

export const pushSnapshot = async (s: { updatedAt: number; welcomed: boolean; sections: Section[]; settings: Settings; pages: Page[] }) => {
  const store = area()
  if (!store) return
  const meta: Meta = { v: 1, updatedAt: s.updatedAt, welcomed: s.welcomed, order: s.sections.map(x => x.id), pages: s.pages }
  const items: Record<string, unknown> = { settings: s.settings, meta }
  for (const section of s.sections) items[sectionKey(section.id)] = section

  const encoder = new TextEncoder()
  const json: Record<string, string> = {}
  let total = 0
  for (const [key, value] of Object.entries(items)) {
    json[key] = JSON.stringify(value)
    const size = encoder.encode(key + json[key]).length
    total += size
    if (size > ITEM_LIMIT) {
      const title = (value as Partial<Section>).title
      throw new SyncTooBig(title ? `"${title}" has too many links to sync` : 'Settings are too large to sync')
    }
  }
  if (total > TOTAL_LIMIT) throw new SyncTooBig('Too many links to sync in all')

  // Push plain copies, never the page's reactive objects: storage saves a reactive
  // list as an object ({"0": …}), and another computer would then read no links.
  const changed = Object.fromEntries(
    Object.keys(items).filter(k => json[k] !== lastPushed[k]).map(k => [k, JSON.parse(json[k])])
  )
  const stale = Object.keys(lastPushed).filter(k => k.startsWith('s:') && !(k in items))
  // Sections and meta land in one write, so another device never sees an order without its sections.
  if (Object.keys(changed).length) await store.set(changed)
  if (stale.length) await store.remove(stale)
  lastPushed = json
  log('synced', Object.keys(changed).length, 'items, removed', stale.length)
}

/** Call back when another device (or another tab) pushes, with that push's timestamp. */
export const onRemoteChange = (cb: (updatedAt: number) => void) => {
  const api = (globalThis as { chrome?: typeof chrome }).chrome?.storage?.onChanged
  api?.addListener((changes, areaName) => {
    const meta = changes.meta?.newValue as Meta | undefined
    if (areaName === 'sync' && meta) cb(Number(meta.updatedAt) || 0)
  })
}
