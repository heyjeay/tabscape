import { CATALOG } from './catalog'
import type { Gradient } from './gradients'
import type { Section } from './defaults'

/**
 * Where a new bookmark belongs. Pure rules, no browser APIs, so they can be
 * tested on their own. In order:
 *
 * 1. A site the person has moved before goes where they moved it (learned rules).
 * 2. A bookmark saved into a folder named like a section goes to that section.
 * 3. A well-known site goes to its category, creating the section if needed.
 * 4. Anything else goes to "Saved".
 */
export interface NewBookmark {
  url: string
  title: string
  /** The bookmark folder it was saved into, if any. */
  folder?: string
}

export type Target =
  | { kind: 'section'; id: string }
  | { kind: 'create'; title: string; gradient: Gradient }

export const SAVED_TITLE = 'Saved'
const SAVED_GRADIENT: Gradient = ['#bdc3c7', '#ffffff']

/** Second-level names that sit under a country code: example.co.uk, example.com.au. */
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'])

export const hostOf = (url: string): string | null => {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/** The part of a hostname a person would call "the site": store.steampowered.com → steampowered.com. */
export const siteOf = (host: string): string => {
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const keep = parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? 3 : 2
  return parts.slice(-keep).join('.')
}

/**
 * Sites beyond the setup catalogue, by category id. Matched on the site, so
 * any subdomain counts. Keep it to sites most people would agree on.
 */
const HINTS: Record<string, string[]> = {
  streaming: ['youtube.com', 'youtu.be', 'twitch.tv', 'kick.com', 'netflix.com', 'disneyplus.com', 'primevideo.com', 'hulu.com', 'max.com', 'crunchyroll.com', 'vimeo.com'],
  gaming: ['steampowered.com', 'steamcommunity.com', 'steamdb.info', 'epicgames.com', 'ign.com', 'pcgamer.com', 'nexusmods.com', 'howlongtobeat.com', 'gog.com', 'itch.io', 'xbox.com', 'playstation.com', 'nintendo.com', 'gamespot.com', 'polygon.com'],
  social: ['instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'reddit.com', 'tiktok.com', 'linkedin.com', 'threads.net', 'bsky.app', 'pinterest.com', 'tumblr.com'],
  messaging: ['mail.google.com', 'gmail.com', 'outlook.live.com', 'outlook.com', 'whatsapp.com', 'messenger.com', 'discord.com', 'telegram.org', 'slack.com', 'proton.me'],
  shopping: ['amazon.com', 'amazon.co.uk', 'amazon.com.au', 'ebay.com', 'ebay.co.uk', 'ebay.com.au', 'aliexpress.com', 'etsy.com', 'jbhifi.com.au', 'ebgames.com.au', 'bestbuy.com', 'walmart.com', 'temu.com'],
  music: ['spotify.com', 'music.youtube.com', 'soundcloud.com', 'music.apple.com', 'bandcamp.com', 'deezer.com', 'tidal.com'],
  ai: ['claude.ai', 'chatgpt.com', 'openai.com', 'gemini.google.com', 'perplexity.ai', 'copilot.microsoft.com'],
  productivity: ['drive.google.com', 'docs.google.com', 'calendar.google.com', 'keep.google.com', 'notion.so', 'trello.com', 'todoist.com', 'dropbox.com', 'onedrive.live.com'],
  dev: ['github.com', 'gitlab.com', 'stackoverflow.com', 'developer.mozilla.org', 'codepen.io', 'npmjs.com', 'vercel.com', 'netlify.com', 'dev.to'],
  news: ['bbc.com', 'bbc.co.uk', 'reuters.com', 'theguardian.com', 'theverge.com', 'news.ycombinator.com', 'apnews.com', 'nytimes.com', 'abc.net.au', 'arstechnica.com'],
  design: ['dribbble.com', 'behance.net', 'figma.com', 'pinterest.com', 'unsplash.com', 'canva.com', 'coolors.co']
}

/** The category a host belongs to. More specific entries (mail.google.com) win over broad ones (google.com). */
export const categoryOf = (host: string): string | null => {
  let bestId: string | null = null
  let bestLength = 0
  // An entry matches the host itself or any subdomain of it: "github.com" covers "gist.github.com".
  const consider = (id: string, entry: string) => {
    if ((host === entry || host.endsWith('.' + entry)) && entry.length > bestLength) {
      bestId = id
      bestLength = entry.length
    }
  }
  for (const [id, entries] of Object.entries(HINTS)) entries.forEach(e => consider(id, e))
  for (const category of CATALOG) {
    for (const [, url] of category.links) {
      const h = hostOf(url)
      if (h) consider(category.id, h)
    }
  }
  return bestId
}

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Pick where a bookmark goes, given the page's sections and the rules learned from the person's moves. */
export const pickTarget = (bookmark: NewBookmark, sections: Section[], rules: Record<string, string>): Target => {
  const host = hostOf(bookmark.url)
  const byId = (id: string | undefined) => (id ? sections.find(s => s.id === id) : undefined)
  const byTitle = (title: string) => sections.find(s => sameTitle(s.title, title))

  // 1. Learned: this site was moved to a section before.
  if (host) {
    const learned = byId(rules[host]) ?? byId(rules[siteOf(host)])
    if (learned) return { kind: 'section', id: learned.id }
  }

  // 2. The bookmark folder names a section.
  if (bookmark.folder) {
    const match = byTitle(bookmark.folder)
    if (match) return { kind: 'section', id: match.id }
  }

  // 3. A well-known site: its category's section, made if it doesn't exist yet.
  const categoryId = host ? categoryOf(host) : null
  const category = CATALOG.find(c => c.id === categoryId)
  if (category) {
    const existing = byTitle(category.title)
    return existing ? { kind: 'section', id: existing.id } : { kind: 'create', title: category.title, gradient: [...category.gradient] }
  }

  // 4. Everything else.
  const saved = byTitle(SAVED_TITLE)
  return saved ? { kind: 'section', id: saved.id } : { kind: 'create', title: SAVED_TITLE, gradient: SAVED_GRADIENT }
}

/** For spotting a link that's already on the page: same address, ignoring case, "www.", a trailing slash and #fragments. */
export const sameAddress = (a: string, b: string) => {
  const key = (url: string) => {
    try {
      const u = new URL(url)
      return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.search}`
    } catch {
      return url.trim().toLowerCase()
    }
  }
  return key(a) === key(b)
}

/** A readable name when a bookmark has none: "github.com" → "Github". */
export const nameFromAddress = (url: string) => {
  const host = hostOf(url)
  if (!host) return url
  const word = siteOf(host).split('.')[0]
  return word.charAt(0).toUpperCase() + word.slice(1)
}
