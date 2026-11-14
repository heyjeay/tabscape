import { File } from 'expo-file-system'
import { useCallback, useEffect, useRef, useState } from 'react'
import { log } from './config'
import type { Rgb } from './lib/color'
import { keys, load, save } from './lib/storage'

/** One open tab. A null url is the Tabscape start page. */
export interface Tab {
  id: string
  url: string | null
  title: string
  /** A small picture of the page, for the tab button and the carousel (a temporary file). */
  thumbnail?: string
  /** The site's accent colour, which tints the bar like Arc's. */
  accent?: Rgb
}

interface Saved {
  tabs: Tab[]
  currentId: string
}

/** How long to wait for changes to settle before writing the tabs to storage. */
const SAVE_AFTER = 600

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const blankTab = (url: string | null = null): Tab => ({ id: newId(), url, title: url ? '' : 'Start page' })

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

/**
 * The open tabs and which one is showing, kept on the device so they're there next launch.
 * Only the showing tab has a live web view; the rest are an address, a title and a picture.
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

  // Bring back last launch's tabs. Pictures are temporary files that may be gone, so they're dropped.
  useEffect(() => {
    load<Saved | null>(keys.tabs, null).then(saved => {
      if (saved?.tabs?.length) {
        setTabs(saved.tabs.map(t => ({ ...t, thumbnail: undefined })))
        setCurrentId(saved.tabs.some(t => t.id === saved.currentId) ? saved.currentId : saved.tabs[0].id)
        log('restored', saved.tabs.length, 'tabs')
      }
      ready.current = true
      setRestored(true)
    })
  }, [])

  // Saved once things settle, not on every title and picture change while a page loads.
  // Pictures aren't kept between launches, so they aren't written.
  useEffect(() => {
    if (!ready.current) return
    const timer = setTimeout(() => {
      save(keys.tabs, { tabs: tabs.map(({ thumbnail, ...rest }) => rest), currentId } satisfies Saved)
    }, SAVE_AFTER)
    return () => clearTimeout(timer)
  }, [tabs, currentId])

  const current = tabs.find(t => t.id === currentId) ?? tabs[0]

  const openTab = useCallback((url: string | null = null) => {
    const tab = blankTab(url)
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

  const closeTab = useCallback((id: string) => {
    const all = tabsRef.current
    const index = all.findIndex(t => t.id === id)
    if (index < 0) return
    deletePicture(all[index].thumbnail)
    const rest = all.filter(t => t.id !== id)
    if (!rest.length) {
      const fresh = blankTab()
      tabsRef.current = [fresh]
      setTabs([fresh])
      setCurrentId(fresh.id)
      return
    }
    tabsRef.current = rest
    setTabs(rest)
    setCurrentId(now => (now === id ? rest[Math.min(index, rest.length - 1)].id : now))
  }, [])

  const closeAll = useCallback(() => {
    tabsRef.current.forEach(t => deletePicture(t.thumbnail))
    const fresh = blankTab()
    tabsRef.current = [fresh]
    setTabs([fresh])
    setCurrentId(fresh.id)
  }, [])

  return { restored, tabs, current, currentId, select: setCurrentId, openTab, updateTab, closeTab, closeAll }
}
