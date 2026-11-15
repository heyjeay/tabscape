import type { EngineId } from './engines'
import { load, save } from './storage'

/** The browser's own settings (the start page keeps its settings itself). */
export interface BrowserSettings {
  /** Suggestions from the search engine as you type in the search screen. */
  suggestions: boolean
  searchEngine: EngineId
  /** A new tab opens with the keyboard up, ready to search. */
  autoKeyboard: boolean
  /** Ad and tracking networks aren't loaded (only in Tabscape's own builds; see modules/tabscape-native). */
  blockTrackers: boolean
  /** Tabs not opened for this many hours are tidied away into the archive, like Arc. 0 is never. */
  archiveAfter: number
  /** Reader text size (points), and whether it's in a book typeface or the system one. */
  readerSize: number
  readerSerif: boolean
}

const KEY = 'tabscape.settings'
const DEFAULTS: BrowserSettings = {
  suggestions: true, searchEngine: 'google', autoKeyboard: true, blockTrackers: true, archiveAfter: 24, readerSize: 19, readerSerif: true
}

/** The choices for tidying away tabs, in hours. */
export const ARCHIVE_CHOICES: { hours: number; label: string }[] = [
  { hours: 0, label: 'Never' },
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '1 day' },
  { hours: 24 * 7, label: '1 week' }
]

export const loadSettings = async () => ({ ...DEFAULTS, ...(await load<Partial<BrowserSettings>>(KEY, {})) })

export const saveSettings = (settings: BrowserSettings) => save(KEY, settings)

/** Changes some settings, keeping the rest as they are. */
export const changeSettings = async (change: Partial<BrowserSettings>) => {
  const next = { ...(await loadSettings()), ...change }
  await saveSettings(next)
  return next
}
