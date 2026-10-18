import type { Gradient } from './gradients'
import { DEFAULT_WALLPAPER } from './wallpapers'

export interface Link {
  id: string
  name: string
  url: string
}

export interface Section {
  id: string
  title: string
  gradient: Gradient
  links: Link[]
}

export type ClockStyle = 'off' | '12h' | '24h'
export type SearchEngine = 'google' | 'duckduckgo' | 'bing'
/** Where the greeting and links sit on the screen. */
export type Position = 'top' | 'center' | 'bottom'

export interface Settings {
  /** A wallpaper id from lib/wallpapers, 'custom' for an image URL, or 'none'. */
  background: string
  /** The image used when `background` is 'custom'. */
  customImage: string
  /** How much the background is dimmed, 0 to 0.7. Below zero follows the wallpaper. */
  dim: number
  /** Blur on image backgrounds, in pixels. */
  blur: number
  greeting: boolean
  /** Added to the greeting when set: "Good Evening, Jeay." */
  name: string
  date: boolean
  /** Lead the date with the day of the week: "Tuesday, October 14th". */
  weekday: boolean
  clock: ClockStyle
  search: boolean
  engine: SearchEngine
  /** Open links in a new tab rather than this one. */
  newTab: boolean
  position: Position
  /** Run the animated backgrounds; off leaves them as a still. */
  animate: boolean
  /** Learned from the person's own moves: a site (host) → the section id it belongs in. */
  sortRules: Record<string, string>
}

export const DEFAULT_SETTINGS: Settings = {
  background: DEFAULT_WALLPAPER,
  customImage: '',
  dim: 0.35,
  blur: 0,
  greeting: true,
  name: '',
  date: true,
  weekday: false,
  clock: 'off',
  search: false,
  engine: 'google',
  newTab: false,
  position: 'center',
  animate: true,
  sortRules: {}
}

export const SEARCH_URLS: Record<SearchEngine, string> = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q='
}

/** randomUUID needs a secure context; the page may be opened from a file. */
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)

const links = (pairs: [string, string][]): Link[] => pairs.map(([name, url]) => ({ id: uid(), name, url }))

/** The page's original four columns - what a first visit, or a reset, starts from. */
export const defaultSections = (): Section[] => [
  {
    id: uid(),
    title: 'Routine',
    gradient: ['#fc4a1a', '#f7b733'],
    links: links([
      ['Keep', 'https://keep.google.com/#home'],
      ['Twitch', 'https://twitch.tv'],
      ['YouTube', 'https://youtube.com/feed/subscriptions'],
      ['Kick', 'https://kick.com/'],
      ['Dribbble', 'https://dribbble.com/']
    ])
  },
  {
    id: uid(),
    title: 'Messaging',
    gradient: ['#0072ff', '#00c6ff'],
    links: links([
      ['Email', 'https://gmail.com/'],
      ['Messenger', 'https://messenger.com/'],
      ['Instagram', 'https://www.instagram.com'],
      ['WhatsApp', 'https://web.whatsapp.com/'],
      ['Tinder', 'https://tinder.com/']
    ])
  },
  {
    id: uid(),
    title: 'Shopping',
    gradient: ['#11998e', '#38ef7d'],
    links: links([
      ['Amazon', 'https://amazon.com/'],
      ['Ebay', 'https://ebay.com/'],
      ['EBgames', 'https://www.ebgames.com.au/'],
      ['JBHIFI', 'https://www.jbhifi.com.au/'],
      ['Harvey Norman', 'https://www.harveynorman.com.au/']
    ])
  },
  {
    id: uid(),
    title: 'Gaming',
    gradient: ['#dd2476', '#ff512f'],
    links: links([
      ['Steam', 'https://store.steampowered.com/'],
      ['SteamDB Charts', 'https://steamdb.info/charts/'],
      ['Epic Games', 'https://store.epicgames.com/'],
      ['IGN', 'https://www.ign.com/'],
      ['PC Gamer', 'https://www.pcgamer.com/'],
      ['Nexus Mods', 'https://www.nexusmods.com/']
    ])
  }
]

/** Bare domains get a scheme so they don't resolve relative to the page. */
export const normalizeUrl = (raw: string) => {
  const url = raw.trim()
  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) return url
  return 'https://' + url
}
