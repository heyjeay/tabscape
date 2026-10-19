import type { Settings } from './defaults'

/**
 * The fonts to pick from for the header and the links. All bundled (style.css,
 * @font-face, Latin only) under the SIL Open Font License, so nothing is fetched;
 * a browser only reads a font's file once something uses it.
 */
export interface Font {
  id: string
  name: string
  /** What it's like, shown under its name in the picker. */
  kind: string
  family: string
  /** Some fonts run large or small at the same size; this evens them out. */
  adjust?: number
}

export const FONTS: Font[] = [
  { id: 'google-sans', name: 'Google Sans', kind: 'Default', family: "'Google Sans Flex'" },
  { id: 'system', name: 'System', kind: 'Your computer’s', family: "system-ui, -apple-system, 'Segoe UI'" },
  { id: 'inter', name: 'Inter', kind: 'Clean', family: "'Inter Variable'" },
  { id: 'lexend', name: 'Lexend', kind: 'Easy to read', family: "'Lexend Variable'" },
  { id: 'outfit', name: 'Outfit', kind: 'Geometric', family: "'Outfit Variable'" },
  { id: 'nunito', name: 'Nunito', kind: 'Rounded', family: "'Nunito Variable'" },
  { id: 'comfortaa', name: 'Comfortaa', kind: 'Soft', family: "'Comfortaa Variable'" },
  { id: 'space-grotesk', name: 'Space Grotesk', kind: 'Techy', family: "'Space Grotesk Variable'" },
  { id: 'fraunces', name: 'Fraunces', kind: 'Warm serif', family: "'Fraunces Variable'" },
  { id: 'playfair', name: 'Playfair', kind: 'Elegant serif', family: "'Playfair Display Variable'" },
  { id: 'jetbrains-mono', name: 'JetBrains Mono', kind: 'Code', family: "'JetBrains Mono Variable'", adjust: 0.9 },
  { id: 'orbitron', name: 'Orbitron', kind: 'Sci-fi', family: "'Orbitron Variable'", adjust: 0.85 },
  { id: 'caveat', name: 'Caveat', kind: 'Handwritten', family: "'Caveat Variable'", adjust: 1.3 },
  { id: 'press-start', name: 'Press Start', kind: 'Pixel', family: "'Press Start 2P'", adjust: 0.6 }
]

export const DEFAULT_FONT = 'google-sans'

export const findFont = (id: string) => FONTS.find(f => f.id === id) ?? FONTS[0]

/** The family with fallbacks, for CSS. */
export const fontStack = (id: string) => `${findFont(id).family}, 'Google Sans Flex', system-ui, sans-serif`

/** Sizes are a multiple of the usual size; synced values are kept within these. */
export const SIZE_MIN = 0.6
export const SIZE_MAX = 1.6
const clampSize = (n: number) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number.isFinite(n) ? n : 1))

/** How much bigger than usual the header's text is, with the font's own correction. */
export const headScale = (s: Settings) => clampSize(s.headerSize) * (findFont(s.headerFont).adjust ?? 1)
export const titleScale = (s: Settings) => clampSize(s.titleSize) * (findFont(s.titleFont).adjust ?? 1)
export const linkScale = (s: Settings) => clampSize(s.linkSize) * (findFont(s.linkFont).adjust ?? 1)

/** CSS variables for the page: the header (.tl-head), section titles (.tl-title) and links (.tl-links) read them. */
export const fontVars = (s: Settings) => ({
  '--tl-font-head': fontStack(s.headerFont),
  '--tl-font-title': fontStack(s.titleFont),
  '--tl-font-link': fontStack(s.linkFont),
  '--tl-head-scale': String(headScale(s)),
  '--tl-title-scale': String(titleScale(s)),
  '--tl-link-scale': String(linkScale(s))
})
