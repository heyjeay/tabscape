import { reactive, watch } from 'vue'
import { log } from '@/config'
import { onRemoteChange, pushSnapshot, readSnapshot, syncAvailable, SyncTooBig, type Snapshot } from '@/lib/sync'
import { hostOf, nameFromAddress, pickTarget, sameAddress, type NewBookmark } from '@/lib/autosort'
import {
  DEFAULT_SETTINGS, defaultSections, uid,
  type Link, type Section, type Settings
} from '@/lib/defaults'
import type { Gradient } from '@/lib/gradients'

/**
 * The page's links and options, kept in localStorage so edits survive a
 * reload, and synced between open tabs. In the extension they also go to
 * Chrome's synced storage (lib/sync), so they follow the person between
 * computers; localStorage stays the copy the page reads from.
 *
 * One store for the whole app, created on first import: its watchers and the
 * storage listener live as long as the page does, so there is nothing to tear down.
 */
// Storage keys keep the project's old name, so links saved before the rename still load.
const SECTIONS_KEY = 'startpage_sections'
const SETTINGS_KEY = 'startpage_settings'
/** Set once the first-run setup has been finished or skipped. */
const WELCOMED_KEY = 'startpage_welcomed'
/** When this browser's copy last changed, to tell which side of a sync is newer. */
const UPDATED_KEY = 'startpage_updated'
/** Whether this browser syncs. Kept per browser, never synced itself. */
const SYNC_PREF_KEY = 'startpage_sync'
/** This browser's links from before sync first replaced them, for undoing that. */
const PRESYNC_KEY = 'startpage_presync_backup'
/** How long to gather edits before pushing them: typing would otherwise exceed Chrome's write rate. */
const SYNC_DELAY_MS = 1500

/** What each key last held, so a write that changes nothing is skipped - and a sync from another tab isn't echoed back. */
const lastWritten: Record<string, string | null> = {}

const read = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key)
    lastWritten[key] = raw
    return raw ? JSON.parse(raw) : undefined
  } catch (e) {
    console.warn(`[tabscape] Couldn't read ${key}, using defaults`, e)
    return undefined
  }
}

/** Save a value, returning whether it changed anything. */
const write = (key: string, value: unknown): boolean => {
  const json = JSON.stringify(value)
  if (json === lastWritten[key]) return false
  try {
    localStorage.setItem(key, json)
    lastWritten[key] = json
    log('saved', key)
  } catch (e) {
    console.warn(`[tabscape] Couldn't save ${key}`, e)
  }
  return true
}

const getRaw = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const setRaw = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch (e) {
    console.warn(`[tabscape] Couldn't save ${key}`, e)
  }
}

const isString = (v: unknown): v is string => typeof v === 'string'

/** Rebuild sections from untrusted JSON (storage or an import), dropping anything malformed. */
const cleanSections = (input: unknown): Section[] | undefined => {
  if (!Array.isArray(input)) return undefined
  return input
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map(s => {
      const g = s.gradient
      const gradient: Gradient = Array.isArray(g) && isString(g[0]) && isString(g[1])
        ? [g[0], g[1]]
        : ['#bdc3c7', '#ffffff']
      const links: Link[] = Array.isArray(s.links)
        ? s.links
          .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
          .map(l => ({
            id: isString(l.id) ? l.id : uid(),
            name: isString(l.name) ? l.name : '',
            url: isString(l.url) ? l.url : ''
          }))
        : []
      return {
        id: isString(s.id) ? s.id : uid(),
        title: isString(s.title) ? s.title : 'Untitled',
        gradient,
        links
      }
    })
}

/** Learned sort rules from untrusted JSON: a plain map of host → section id, nothing else. */
const cleanRules = (input: unknown): Record<string, string> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string')
  )
}

/** Keep only known settings of the right type, filling the rest from the defaults. */
const cleanSettings = (input: unknown): Settings => {
  const next = { ...DEFAULT_SETTINGS, sortRules: {} }
  if (!input || typeof input !== 'object') return next
  const raw = input as Record<string, unknown>
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (key === 'sortRules') next.sortRules = cleanRules(raw.sortRules)
    else if (typeof raw[key] === typeof DEFAULT_SETTINGS[key]) {
      (next as Record<string, unknown>)[key] = raw[key]
    }
  }
  return next
}

const savedSections = cleanSections(read(SECTIONS_KEY))

let updatedAt = Number(getRaw(UPDATED_KEY)) || 0

const state = reactive({
  sections: savedSections ?? defaultSections(),
  settings: cleanSettings(read(SETTINGS_KEY)),
  // Anyone who already has links saved has been using the page: don't greet them as new.
  welcomed: !!savedSections || getRaw(WELCOMED_KEY) === '1',
  sync: {
    available: syncAvailable(),
    enabled: syncAvailable() && getRaw(SYNC_PREF_KEY) !== '0',
    status: 'idle' as 'idle' | 'syncing' | 'synced' | 'error',
    message: '',
    /** Sync replaced this browser's own links; they can be put back. */
    canRestore: !!getRaw(PRESYNC_KEY)
  }
})
log('loaded', state.sections.length, 'sections')

let syncTimer: ReturnType<typeof setTimeout> | undefined

const pushNow = async () => {
  clearTimeout(syncTimer)
  syncTimer = undefined
  if (!state.sync.enabled) return
  state.sync.status = 'syncing'
  try {
    await pushSnapshot({ updatedAt, welcomed: state.welcomed, sections: state.sections, settings: state.settings })
    state.sync.status = 'synced'
    state.sync.message = ''
  } catch (e) {
    state.sync.status = 'error'
    state.sync.message = e instanceof SyncTooBig ? e.message : "Couldn't reach sync. Your changes are saved on this computer."
    console.warn('[tabscape] Sync push failed', e)
  }
}

const scheduleSync = () => {
  if (!state.sync.enabled) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(pushNow, SYNC_DELAY_MS)
}

/** Something here changed: stamp it, and pass it on to sync. */
const touched = () => {
  updatedAt = Date.now()
  setRaw(UPDATED_KEY, String(updatedAt))
  scheduleSync()
}

watch(() => state.sections, v => { if (write(SECTIONS_KEY, v)) touched() }, { deep: true })
watch(() => state.settings, v => { if (write(SETTINGS_KEY, v)) touched() }, { deep: true })

/** Take a newer copy from sync. Saved straight away, so the watchers see nothing new and don't push it back. */
const applyRemote = (remote: Snapshot) => {
  const sections = cleanSections(remote.sections)
  if (!sections) return
  // The first time sync replaces links this browser already had, keep them so they can be put back.
  if (!getRaw(UPDATED_KEY) && savedSections && !getRaw(PRESYNC_KEY)) {
    setRaw(PRESYNC_KEY, lastWritten[SECTIONS_KEY] ?? null)
    state.sync.canRestore = true
  }
  const settings = cleanSettings(remote.settings)
  write(SECTIONS_KEY, sections)
  write(SETTINGS_KEY, settings)
  state.sections = sections
  Object.assign(state.settings, settings)
  if (remote.welcomed && !state.welcomed) {
    state.welcomed = true
    setRaw(WELCOMED_KEY, '1')
  }
  updatedAt = remote.updatedAt
  setRaw(UPDATED_KEY, String(updatedAt))
  log('took the synced copy from', new Date(updatedAt).toISOString())
}

/** Line this browser up with sync: take the synced copy if it's newer, otherwise send ours. */
const reconcile = async () => {
  if (!state.sync.enabled) return
  state.sync.status = 'syncing'
  try {
    const remote = await readSnapshot()
    if (remote && remote.updatedAt > updatedAt) {
      applyRemote(remote)
      state.sync.status = 'synced'
    } else if (state.welcomed) {
      await pushNow()
    } else {
      state.sync.status = 'idle'
    }
  } catch (e) {
    state.sync.status = 'error'
    state.sync.message = "Couldn't reach sync. Your links are saved on this computer."
    console.warn('[tabscape] Sync read failed', e)
  }
}

// Another device pushed something newer.
onRemoteChange(remoteUpdatedAt => {
  if (state.sync.enabled && remoteUpdatedAt > updatedAt) reconcile()
})

/**
 * Settles once a synced copy has been taken (or there's none). The app mounts
 * after it, so a new computer opens straight on the person's links rather than
 * on the setup. Capped, so a slow sync never holds the page back.
 */
export const storeReady: Promise<void> = Promise.race([
  reconcile(),
  new Promise<void>(resolve => setTimeout(resolve, 800))
])

const parse = (json: string | null): unknown => {
  try {
    return json ? JSON.parse(json) : undefined
  } catch {
    return undefined
  }
}

// Another tab saved: take its version.
window.addEventListener('storage', e => {
  if (e.key === SECTIONS_KEY) {
    lastWritten[SECTIONS_KEY] = e.newValue
    const next = cleanSections(parse(e.newValue))
    if (next) state.sections = next
    log('synced sections from another tab')
  } else if (e.key === WELCOMED_KEY) {
    state.welcomed = e.newValue === '1'
  } else if (e.key === UPDATED_KEY) {
    updatedAt = Number(e.newValue) || 0
  } else if (e.key === SETTINGS_KEY) {
    lastWritten[SETTINGS_KEY] = e.newValue
    Object.assign(state.settings, cleanSettings(parse(e.newValue)))
    log('synced settings from another tab')
  }
})

const findSection = (id: string) => state.sections.find(s => s.id === id)

export const useStartpage = () => {
  const addSection = () => {
    const section: Section = { id: uid(), title: 'New section', gradient: ['#8e2de2', '#c471f5'], links: [] }
    state.sections.push(section)
    return section
  }

  const removeSection = (id: string) => {
    state.sections = state.sections.filter(s => s.id !== id)
  }

  /** Swap a section with its neighbour, -1 for left and 1 for right. */
  const shiftSection = (id: string, by: -1 | 1) => {
    const from = state.sections.findIndex(s => s.id === id)
    const to = from + by
    if (from < 0 || to < 0 || to >= state.sections.length) return
    const [section] = state.sections.splice(from, 1)
    state.sections.splice(to, 0, section)
  }

  const addLink = (sectionId: string) => {
    const link: Link = { id: uid(), name: '', url: '' }
    findSection(sectionId)?.links.push(link)
    return link
  }

  const removeLink = (sectionId: string, linkId: string) => {
    const section = findSection(sectionId)
    if (section) section.links = section.links.filter(l => l.id !== linkId)
  }

  /** Move a link into a section, before another link, or to the end when `beforeId` is null. */
  const moveLink = (fromSectionId: string, linkId: string, toSectionId: string, beforeId: string | null) => {
    if (linkId === beforeId) return
    const from = findSection(fromSectionId)
    const to = findSection(toSectionId)
    const index = from?.links.findIndex(l => l.id === linkId) ?? -1
    if (!from || !to || index < 0) return
    const [link] = from.links.splice(index, 1)
    const at = beforeId ? to.links.findIndex(l => l.id === beforeId) : -1
    to.links.splice(at < 0 ? to.links.length : at, 0, link)
    // Moving a site to another section teaches auto-sort where it belongs next time.
    const host = hostOf(link.url)
    if (host && from !== to) state.settings.sortRules = { ...state.settings.sortRules, [host]: to.id }
  }

  /**
   * Put new bookmarks where they belong (see lib/autosort). One already on the
   * page isn't added again, but is reported (`existing`), so the note can say
   * where it is rather than staying silent.
   */
  const addSortedBookmarks = (bookmarks: NewBookmark[]) => {
    const added: { sectionId: string; linkId: string; existing?: true }[] = []
    for (const bookmark of bookmarks) {
      const home = state.sections.find(s => s.links.some(l => sameAddress(l.url, bookmark.url)))
      if (home) {
        const link = home.links.find(l => sameAddress(l.url, bookmark.url))!
        if (!added.some(a => a.linkId === link.id)) added.push({ sectionId: home.id, linkId: link.id, existing: true })
        continue
      }
      const target = pickTarget(bookmark, state.sections, state.settings.sortRules)
      let section = target.kind === 'section' ? findSection(target.id) : undefined
      if (target.kind === 'create') {
        section = { id: uid(), title: target.title, gradient: target.gradient, links: [] }
        state.sections.push(section)
        section = state.sections[state.sections.length - 1]
      }
      if (!section) continue
      const link: Link = { id: uid(), name: bookmark.title.trim() || nameFromAddress(bookmark.url), url: bookmark.url }
      section.links.push(link)
      added.push({ sectionId: section.id, linkId: link.id })
    }
    log('auto-sorted', added.filter(a => !a.existing).length, 'bookmarks')
    return added
  }

  /** Everything as one JSON document, for backing up or moving to another browser. */
  const exportData = () => JSON.stringify({ version: 1, sections: state.sections, settings: state.settings }, null, 2)

  /** Replace everything from an export. Throws if the file isn't one. */
  const importData = (json: string) => {
    const data = JSON.parse(json) as Record<string, unknown>
    const sections = cleanSections(data?.sections)
    if (!sections) throw new Error('No sections in that file')
    state.sections = sections
    if (data.settings) Object.assign(state.settings, cleanSettings(data.settings))
  }

  const resetLinks = () => { state.sections = defaultSections() }

  /** Finish the first-run setup, with the sections it built or the classic set. */
  const completeWelcome = (sections: Section[] = defaultSections()) => {
    state.sections = sections
    state.welcomed = true
    setRaw(WELCOMED_KEY, '1')
    touched()
    log('setup finished with', sections.length, 'sections')
  }

  /** Turn sync on or off for this browser. Turning it off leaves the synced copy alone for other devices. */
  const setSyncEnabled = (on: boolean) => {
    state.sync.enabled = on && state.sync.available
    setRaw(SYNC_PREF_KEY, on ? '1' : '0')
    if (state.sync.enabled) reconcile()
    else {
      clearTimeout(syncTimer)
      state.sync.status = 'idle'
      state.sync.message = ''
    }
  }

  /** Put back the links this browser had before sync first replaced them. */
  const restorePreSync = () => {
    const backup = cleanSections(parse(getRaw(PRESYNC_KEY)))
    if (backup) state.sections = backup
    setRaw(PRESYNC_KEY, null)
    state.sync.canRestore = false
  }
  const resetSettings = () => { Object.assign(state.settings, DEFAULT_SETTINGS) }

  return {
    state,
    addSection, removeSection, shiftSection,
    addLink, removeLink, moveLink,
    exportData, importData, resetLinks, resetSettings,
    completeWelcome, setSyncEnabled, restorePreSync,
    addSortedBookmarks
  }
}
