import { File } from 'expo-file-system'
import { useCallback, useEffect, useRef, useState } from 'react'
import { log } from './config'
import type { Rgb } from './lib/color'
import { addArchived, addClosed, takeClosed, type Visit } from './lib/history'
import { pictureFromLastLaunch, tidyPictures } from './lib/pictures'
import { keys, load, save } from './lib/storage'

/** One open tab. A null url is the Tabscape start page. */
export interface Tab {
  id: string
  url: string | null
  title: string
  /** A small picture of the page, for the tab button and the carousel (kept between launches: lib/pictures). */
  thumbnail?: string
  /** The site's accent colour, which tints the bar like Arc's. */
  accent?: Rgb
  /** The page's own background, which fills the strip under the clock (as in Safari). */
  background?: Rgb
  /** Keeps no history, cookies or anything else, and isn't brought back next launch. */
  private?: boolean
  /** Asks sites for their full desktop version. */
  desktop?: boolean
  /** When it was last the tab showing (ms since 1970), for tidying away old tabs. */
  lastSeen?: number
}

interface Saved {
  tabs: Tab[]
  currentId: string
}

/** How long to wait for changes to settle before writing the tabs to storage. */
const SAVE_AFTER = 600

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const blankTab = (url: string | null = null, isPrivate = false): Tab => ({
  id: newId(), url, title: url ? '' : 'Start page', lastSeen: Date.now(), ...(isPrivate && { private: true })
})

/** Tab pictures are files; once nothing shows one any more it's deleted, so they don't pile up. */
const deletePicture = (uri?: string) => {
  if (!uri) return
  try {
    const file = new File(uri)
    if (file.exists) file.delete()
  } catch (e) {
    log("couldn't delete a tab picture", e)
  }
}

/** Whether a change would change anything (so a page reporting the same thing again costs nothing). */
const changes = (tab: Tab, change: Partial<Tab>) =>
  (Object.keys(change) as (keyof Tab)[]).some(key => {
    const before = tab[key]
    const after = change[key]
    if (Array.isArray(before) && Array.isArray(after)) return before.some((v, i) => v !== after[i])
    return before !== after
  })

/** A tab worth bringing back: a page, not a start page, and not a private one. */
const remembered = (tabs: Tab[]): Visit[] =>
  tabs.filter(t => t.url && !t.private).map(t => ({ url: t.url!, title: t.title, at: Date.now() }))

export interface OpenOptions {
  private?: boolean
  /** Opens behind the one showing, which stays showing. */
  background?: boolean
  title?: string
}

/**
 * The open tabs and which one is showing, kept on the device so they're there next launch
 * (private ones aren't). Only the showing tab has a live web view; the rest are an address,
 * a title and a picture.
 */
export const useTabs = () => {
  const [tabs, setTabs] = useState<Tab[]>(() => [blankTab()])
  const [currentId, setCurrentId] = useState(tabs[0].id)
  const ready = useRef(false)
  /** Last launch's tabs are back (or there were none): until then nothing loads a page. */
  const [restored, setRestored] = useState(false)
  /** The tabs as they are now, for working out what closing one leaves. */
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const currentRef = useRef(currentId)
  currentRef.current = currentId

  // Bring back last launch's tabs, with their pictures (kept in the app's documents: lib/pictures).
  // Tabs from before tabs had a time are taken as seen now, so none is tidied away at once.
  useEffect(() => {
    load<Saved | null>(keys.tabs, null).then(saved => {
      if (saved?.tabs?.length) {
        const now = Date.now()
        const back = saved.tabs.map(t => ({ ...t, thumbnail: pictureFromLastLaunch(t.thumbnail), lastSeen: t.lastSeen ?? now }))
        tidyPictures(back.map(t => t.thumbnail))
        setTabs(back)
        setCurrentId(saved.tabs.some(t => t.id === saved.currentId) ? saved.currentId : saved.tabs[0].id)
        log('restored', saved.tabs.length, 'tabs')
      }
      ready.current = true
      setRestored(true)
    })
  }, [])

  // Saved once things settle, not on every title and picture change while a page loads.
  // Private tabs aren't kept at all.
  useEffect(() => {
    if (!ready.current) return
    const timer = setTimeout(() => {
      const kept = tabs.filter(t => !t.private)
      save(keys.tabs, { tabs: kept, currentId: kept.some(t => t.id === currentId) ? currentId : (kept[0]?.id ?? '') } satisfies Saved)
    }, SAVE_AFTER)
    return () => clearTimeout(timer)
  }, [tabs, currentId])

  const current = tabs.find(t => t.id === currentId) ?? tabs[0]

  /** Shows a tab. It and the one you left are marked as seen now. */
  const select = useCallback((id: string) => {
    const now = Date.now()
    const left = currentRef.current
    setTabs(all => all.map(t => (t.id === id || t.id === left ? { ...t, lastSeen: now } : t)))
    setCurrentId(id)
  }, [])

  const openTab = useCallback((url: string | null = null, options: OpenOptions = {}) => {
    const tab = { ...blankTab(url, options.private), ...(options.title && { title: options.title }) }
    if (options.background) {
      // Just after the one showing, as Safari puts it.
      setTabs(all => {
        const at = all.findIndex(t => t.id === currentRef.current)
        return [...all.slice(0, at + 1), tab, ...all.slice(at + 1)]
      })
      return tab
    }
    setTabs(all => [...all, tab])
    setCurrentId(tab.id)
    return tab
  }, [])

  const updateTab = useCallback((id: string, change: Partial<Tab>) => {
    // A new picture replaces the old one's file.
    const before = tabsRef.current.find(t => t.id === id)?.thumbnail
    if ('thumbnail' in change && before && before !== change.thumbnail) deletePicture(before)
    // Nothing new (a page often reports the same title again): the same list, so nothing redraws or saves.
    setTabs(all => {
      const tab = all.find(t => t.id === id)
      if (!tab || !changes(tab, change)) return all
      return all.map(t => (t === tab ? { ...t, ...change } : t))
    })
  }, [])

  /** Takes tabs away; if none would be left, a fresh start page takes their place. */
  const remove = useCallback((ids: string[]) => {
    const all = tabsRef.current
    const going = all.filter(t => ids.includes(t.id))
    if (!going.length) return
    going.forEach(t => deletePicture(t.thumbnail))
    const rest = all.filter(t => !ids.includes(t.id))
    if (!rest.length) {
      const fresh = blankTab()
      tabsRef.current = [fresh]
      setTabs([fresh])
      setCurrentId(fresh.id)
      return
    }
    tabsRef.current = rest
    setTabs(rest)
    setCurrentId(now => {
      if (!ids.includes(now)) return now
      // The showing tab went: the one that took its place, of the same kind (private or not) if there is one.
      const was = all.find(t => t.id === now)
      const index = all.findIndex(t => t.id === now)
      const alike = rest.filter(t => !!t.private === !!was?.private)
      const pool = alike.length ? alike : rest
      const after = pool.find(t => all.indexOf(t) > index)
      return (after ?? pool[pool.length - 1]).id
    })
  }, [])

  const closeTab = useCallback((id: string) => {
    addClosed(remembered(tabsRef.current.filter(t => t.id === id)))
    remove([id])
  }, [remove])

  /** Closes every tab, or every private one, or every one that isn't. */
  const closeAll = useCallback((isPrivate?: boolean) => {
    const going = tabsRef.current.filter(t => isPrivate === undefined || !!t.private === isPrivate)
    addClosed(remembered(going))
    remove(going.map(t => t.id))
  }, [remove])

  /** Brings back the tab closed most recently. */
  const reopenClosed = useCallback(async () => {
    const visit = await takeClosed()
    if (!visit) return null
    return openTab(visit.url, { title: visit.title })
  }, [openTab])

  /**
   * Tidies away tabs not opened for a while (never the one showing, and never private ones,
   * which go when the app does anyway). Returns how many.
   */
  const archiveOld = useCallback((afterHours: number) => {
    if (afterHours <= 0) return 0
    const cutoff = Date.now() - afterHours * 3600_000
    const old = tabsRef.current.filter(t => t.id !== currentRef.current && !t.private && (t.lastSeen ?? Date.now()) < cutoff)
    if (!old.length) return 0
    addArchived(remembered(old))
    remove(old.map(t => t.id))
    log('tidied away', old.length, 'tabs')
    return old.length
  }, [remove])

  return { restored, tabs, current, currentId, select, openTab, updateTab, closeTab, closeAll, reopenClosed, archiveOld }
}
