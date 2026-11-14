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

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const blankTab = (url: string | null = null): Tab => ({ id: newId(), url, title: url ? '' : 'Start page' })

/**
 * The open tabs and which one is showing, kept on the device so they're there next launch.
 * Only the showing tab has a live web view; the rest are an address, a title and a picture.
 */
export const useTabs = () => {
  const [tabs, setTabs] = useState<Tab[]>(() => [blankTab()])
  const [currentId, setCurrentId] = useState(tabs[0].id)
  const ready = useRef(false)

  // Bring back last launch's tabs. Pictures are temporary files that may be gone, so they're dropped.
  useEffect(() => {
    load<Saved | null>(keys.tabs, null).then(saved => {
      if (saved?.tabs?.length) {
        setTabs(saved.tabs.map(t => ({ ...t, thumbnail: undefined })))
        setCurrentId(saved.tabs.some(t => t.id === saved.currentId) ? saved.currentId : saved.tabs[0].id)
        log('restored', saved.tabs.length, 'tabs')
      }
      ready.current = true
    })
  }, [])

  useEffect(() => {
    if (ready.current) save(keys.tabs, { tabs, currentId } satisfies Saved)
  }, [tabs, currentId])

  const current = tabs.find(t => t.id === currentId) ?? tabs[0]

  const openTab = useCallback((url: string | null = null) => {
    const tab = blankTab(url)
    setTabs(all => [...all, tab])
    setCurrentId(tab.id)
    return tab
  }, [])

  const updateTab = useCallback((id: string, change: Partial<Tab>) => {
    setTabs(all => all.map(t => (t.id === id ? { ...t, ...change } : t)))
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs(all => {
      const index = all.findIndex(t => t.id === id)
      const rest = all.filter(t => t.id !== id)
      if (!rest.length) {
        const fresh = blankTab()
        setCurrentId(fresh.id)
        return [fresh]
      }
      setCurrentId(now => (now === id ? rest[Math.min(index, rest.length - 1)].id : now))
      return rest
    })
  }, [])

  const closeAll = useCallback(() => {
    const fresh = blankTab()
    setTabs([fresh])
    setCurrentId(fresh.id)
  }, [])

  return { tabs, current, currentId, select: setCurrentId, openTab, updateTab, closeTab, closeAll }
}
