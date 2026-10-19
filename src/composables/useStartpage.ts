import { reactive, watch } from 'vue'
import { log } from '@/config'
import { asList, onRemoteChange, pushSnapshot, readSnapshot, syncAvailable, SyncTooBig, type Snapshot } from '@/lib/sync'
import { hostOf, nameFromAddress, pickTarget, sameAddress, type NewBookmark } from '@/lib/autosort'
import {
  DEFAULT_SETTINGS, defaultPages, defaultSections, uid,
  type Link, type Page, type Section, type Settings
} from '@/lib/defaults'
import { GRADIENTS, sameGradient, type Gradient } from '@/lib/gradients'

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
/** The pages sections are spread across. Synced, like the sections. */
const PAGES_KEY = 'startpage_pages'
/** People's own link images, by link id. Kept on this computer only: they'd overflow sync's small items. */
const ICONS_KEY = 'startpage_icons'

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
  // Lists may arrive as {"0": …} from older versions' sync; asList puts them right.
  if (!Array.isArray(input) && !(input && typeof input === 'object')) return undefined
  return asList(input)
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map(s => {
      const g = s.gradient
      const colours = asList(g)
      const gradient: Gradient = isString(colours[0]) && isString(colours[1])
        ? [colours[0], colours[1]]
        : ['#bdc3c7', '#ffffff']
      const links: Link[] = asList(s.links).length
        ? asList(s.links)
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
        links,
        ...(isString(s.page) ? { page: s.page } : {})
      }
    })
}

/** Pages from untrusted JSON. There's always at least one. */
const cleanPages = (input: unknown): Page[] => {
  const pages = asList(input)
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map(p => ({ id: isString(p.id) ? p.id : uid(), name: isString(p.name) ? p.name : 'Page' }))
  return pages.length ? pages : defaultPages()
}

/** Link images from untrusted JSON: only image data URLs, keyed by link id. */
const cleanIcons = (input: unknown): Record<string, string> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].startsWith('data:image/'))
  )
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
/** Nothing was saved in this browser when the page opened: a new install, or a new computer. */
export const freshBrowser = !savedSections

let updatedAt = Number(getRaw(UPDATED_KEY)) || 0

const state = reactive({
  sections: savedSections ?? defaultSections(),
  settings: cleanSettings(read(SETTINGS_KEY)),
  // Anyone who already has links saved has been using the page: don't greet them as new.
  welcomed: !!savedSections || getRaw(WELCOMED_KEY) === '1',
  pages: cleanPages(read(PAGES_KEY)),
  icons: cleanIcons(read(ICONS_KEY)),
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
    await pushSnapshot({ updatedAt, welcomed: state.welcomed, sections: state.sections, settings: state.settings, pages: state.pages })
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
watch(() => state.pages, v => { if (write(PAGES_KEY, v)) touched() }, { deep: true })
// Images stay on this computer: saved, but never pushed to sync.
watch(() => state.icons, v => { write(ICONS_KEY, v) }, { deep: true })

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
  const pages = cleanPages(remote.pages)
  write(SECTIONS_KEY, sections)
  write(SETTINGS_KEY, settings)
  write(PAGES_KEY, pages)
  state.sections = sections
  state.pages = pages
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
  } else if (e.key === PAGES_KEY) {
    lastWritten[PAGES_KEY] = e.newValue
    state.pages = cleanPages(parse(e.newValue))
  } else if (e.key === ICONS_KEY) {
    lastWritten[ICONS_KEY] = e.newValue
    state.icons = cleanIcons(parse(e.newValue))
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

/** The page a section is on: its own if that page still exists, else the first. */
/**
 * A bookmark that sorting dealt with: where it went, whether it was there already,
 * and whether its section was made just for it (so it can go again if left empty).
 */
export interface SortedEntry {
  sectionId: string
  linkId: string
  existing?: true
  createdSection?: true
}

export const pageOf = (section: Section) =>
  section.page && state.pages.some(p => p.id === section.page) ? section.page : state.pages[0].id

/** Drop images whose links are gone (deleted elsewhere, or replaced by sync). */
const pruneIcons = () => {
  const ids = new Set(state.sections.flatMap(s => s.links.map(l => l.id)))
  const stale = Object.keys(state.icons).filter(id => !ids.has(id))
  stale.forEach(id => delete state.icons[id])
  if (stale.length) log('pruned', stale.length, 'unused link images')
}
storeReady.then(pruneIcons)

export const useStartpage = () => {
  /** A new, empty section, on the given page (the first if none). */
  const addSection = (page?: string, title = 'New section') => {
    // A colour no other section has yet, while there are some left.
    const free = GRADIENTS.find(g => !state.sections.some(s => sameGradient(s.gradient, g.colors)))
    const gradient: Gradient = free ? [...free.colors] : ['#8e2de2', '#c471f5']
    const section: Section = { id: uid(), title, gradient, links: [], ...(page ? { page } : {}) }
    state.sections.push(section)
    return state.sections[state.sections.length - 1]
  }

  const removeSection = (id: string) => {
    findSection(id)?.links.forEach(l => delete state.icons[l.id])
    state.sections = state.sections.filter(s => s.id !== id)
  }

  /** Swap a section with its neighbour on the same page, -1 for left and 1 for right. */
  const shiftSection = (id: string, by: -1 | 1) => {
    const section = findSection(id)
    if (!section) return
    const onPage = state.sections.filter(s => pageOf(s) === pageOf(section))
    const neighbour = onPage[onPage.indexOf(section) + by]
    if (!neighbour) return
    const a = state.sections.indexOf(section)
    const b = state.sections.indexOf(neighbour)
    state.sections.splice(a, 1, neighbour)
    state.sections.splice(b, 1, section)
  }

  const addPage = (name = 'New page') => {
    const page: Page = { id: uid(), name }
    state.pages.push(page)
    return page
  }

  /** Remove a page. Its sections aren't lost: they move to the first page that's left. */
  const removePage = (id: string) => {
    if (state.pages.length <= 1) return
    const remaining = state.pages.filter(p => p.id !== id)
    for (const s of state.sections) if (pageOf(s) === id) s.page = remaining[0].id
    state.pages = remaining
  }

  /** Give a link its own image (a data URL), or null to go back to the site icon or letter. */
  const setLinkIcon = (linkId: string, image: string | null) => {
    if (image) state.icons[linkId] = image
    else delete state.icons[linkId]
  }

  const addLink = (sectionId: string) => {
    const link: Link = { id: uid(), name: '', url: '' }
    findSection(sectionId)?.links.push(link)
    return link
  }

  const removeLink = (sectionId: string, linkId: string) => {
    const section = findSection(sectionId)
    if (section) section.links = section.links.filter(l => l.id !== linkId)
    delete state.icons[linkId]
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
    const added: SortedEntry[] = []
    const created = new Set<string>()
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
        created.add(section.id)
      }
      if (!section) continue
      const link: Link = { id: uid(), name: bookmark.title.trim() || nameFromAddress(bookmark.url), url: bookmark.url }
      section.links.push(link)
      added.push({ sectionId: section.id, linkId: link.id, ...(created.has(section.id) ? { createdSection: true as const } : {}) })
    }
    log('auto-sorted', added.filter(a => !a.existing).length, 'bookmarks')
    return added
  }

  /** Everything as one JSON document, for backing up or moving to another browser. */
  const exportData = () =>
    JSON.stringify({ version: 1, sections: state.sections, pages: state.pages, settings: state.settings, icons: state.icons }, null, 2)

  /** Replace everything from an export. Throws if the file isn't one. */
  const importData = (json: string) => {
    const data = JSON.parse(json) as Record<string, unknown>
    const sections = cleanSections(data?.sections)
    if (!sections) throw new Error('No sections in that file')
    state.sections = sections
    state.pages = cleanPages(data.pages)
    if (data.icons) state.icons = cleanIcons(data.icons)
    if (data.settings) Object.assign(state.settings, cleanSettings(data.settings))
  }

  const resetLinks = () => {
    state.sections = defaultSections()
    state.pages = defaultPages()
    state.icons = {}
  }

  /** Finish the first-run setup, with the sections it built or the classic set. */
  const completeWelcome = (sections: Section[] = defaultSections()) => {
    state.sections = sections
    // A fresh setup starts on one page; new sections there have no page of their own.
    state.pages = defaultPages()
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
    addSortedBookmarks, addPage, removePage, setLinkIcon
  }
}
