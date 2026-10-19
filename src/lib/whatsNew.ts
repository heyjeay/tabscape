import { BookmarkCheck, Image as ImageIcon, Layers, RefreshCw, SlidersHorizontal, Type } from 'lucide-vue-next'

/**
 * The "What's new" card, shown once on the first new tab after an update. Keep it to
 * the handful of things people will notice; CHANGELOG.md has the full list. A release
 * without notes worth a card (a quick fix) just leaves this alone: the card only shows
 * for a version newer than the last one seen.
 */
export const WHATS_NEW = {
  version: '1.3.0',
  title: 'Customize to your heart’s content',
  items: [
    { icon: SlidersHorizontal, title: 'A new settings drawer', text: 'Everything sorted into categories, with your page in clear view as you change it.' },
    { icon: Type, title: 'Fonts and sizes', text: '14 built-in fonts, picked separately for the greeting, section titles and links.' },
    { icon: Layers, title: 'Pages', text: 'Spread your links over more pages. Switch with the page bar, the arrow keys, a swipe or a scroll.' },
    { icon: ImageIcon, title: 'Icons and hover effects', text: 'Site icons or your own images next to links, and 8 hover animations.' },
    { icon: BookmarkCheck, title: 'Bookmarks sort themselves', text: 'Optional: new bookmarks land in the right section, and Tabscape learns as you move them.' },
    { icon: RefreshCw, title: 'Sync, fixed', text: 'Your links now come with you to a new computer.' }
  ]
}

/** Whether version a is newer than b ("1.10.0" > "1.9.2"). */
export const isNewer = (a: string, b: string) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0
  }
  return false
}
