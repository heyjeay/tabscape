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
  /** How the start page's site tiles look, like the iPhone's own home screen. */
  tiles: TileSettings
}

/**
 * The start page's site tiles (Settings → Start Page Icons), handed to start pages as they load
 * and whenever they change (tileScript); the page's app-touch.css draws them.
 */
export interface TileSettings {
  /** As the iPhone's home screen has them: the icons' own colours, dark, clear (see-through), or all in one colour. */
  look: 'default' | 'dark' | 'clear' | 'tinted'
  /** Tinted's colour: one of TINTS, or 'accent' for the start page's own colour. */
  tint: string
  shape: 'rounded' | 'circle' | 'square'
  /** Tiles per row: small 5, medium 4, large 3. */
  size: 'small' | 'medium' | 'large'
  /** The site's name under each tile. */
  names: boolean
}

export const DEFAULT_TILES: TileSettings = { look: 'default', tint: 'accent', shape: 'rounded', size: 'medium', names: true }

/** Tinted's colours, after iOS's own; 'accent' (the start page's colour) comes first. */
export const TINTS = ['#0a84ff', '#64d2ff', '#30d158', '#ffd60a', '#ff9f0a', '#ff375f', '#bf5af2', '#e5e5ea']

const LOOKS = ['default', 'dark', 'clear', 'tinted'] as const
const SHAPES = ['rounded', 'circle', 'square'] as const
const SIZES = ['small', 'medium', 'large'] as const

/** Tile settings as saved, with anything missing or unknown back to its default. */
const cleanTiles = (saved: Partial<TileSettings> | undefined): TileSettings => ({
  look: LOOKS.includes(saved?.look as TileSettings['look']) ? saved!.look! : DEFAULT_TILES.look,
  tint: saved?.tint === 'accent' || TINTS.includes(saved?.tint ?? '') ? saved!.tint! : DEFAULT_TILES.tint,
  shape: SHAPES.includes(saved?.shape as TileSettings['shape']) ? saved!.shape! : DEFAULT_TILES.shape,
  size: SIZES.includes(saved?.size as TileSettings['size']) ? saved!.size! : DEFAULT_TILES.size,
  names: typeof saved?.names === 'boolean' ? saved.names : DEFAULT_TILES.names
})

/**
 * Tells a start page how its tiles look: as attributes on its <html>, which app-touch.css reads.
 * Only a start page (a local file) takes it; other pages are left alone.
 */
export const tileScript = (tiles: TileSettings) => {
  const tint = tiles.tint === 'accent' ? 'var(--accent)' : tiles.tint
  return `(function () {
  if (location.protocol !== 'file:') return;
  var d = document.documentElement;
  d.setAttribute('data-tile-look', ${JSON.stringify(tiles.look)});
  d.setAttribute('data-tile-shape', ${JSON.stringify(tiles.shape)});
  d.setAttribute('data-tile-size', ${JSON.stringify(tiles.size)});
  d.setAttribute('data-tile-names', ${JSON.stringify(tiles.names ? 'on' : 'off')});
  d.style.setProperty('--tile-tint', ${JSON.stringify(tint)});
})();`
}

const KEY = 'tabscape.settings'
const DEFAULTS: BrowserSettings = {
  suggestions: true, searchEngine: 'google', autoKeyboard: true, blockTrackers: true, archiveAfter: 24, readerSize: 19, readerSerif: true,
  tiles: DEFAULT_TILES
}

/** The choices for tidying away tabs, in hours. */
export const ARCHIVE_CHOICES: { hours: number; label: string }[] = [
  { hours: 0, label: 'Never' },
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '1 day' },
  { hours: 24 * 7, label: '1 week' }
]

export const loadSettings = async (): Promise<BrowserSettings> => {
  const saved = await load<Partial<BrowserSettings>>(KEY, {})
  return { ...DEFAULTS, ...saved, tiles: cleanTiles(saved.tiles) }
}

export const saveSettings = (settings: BrowserSettings) => save(KEY, settings)

/** Changes some settings, keeping the rest as they are. */
export const changeSettings = async (change: Partial<BrowserSettings>) => {
  const next = { ...(await loadSettings()), ...change }
  await saveSettings(next)
  return next
}
