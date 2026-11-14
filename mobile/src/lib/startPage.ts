import { Paths } from 'expo-file-system'
import startPageHtml from '../startpage.generated'

/**
 * The Tabscape start page: the same single-file page as the extension, built into the app
 * (npm run build:mobile). It's loaded with the app's documents folder as its address, so it
 * keeps the same origin every launch and remembers your links.
 */
export const startPageSource = { html: startPageHtml, baseUrl: Paths.document.uri }

/** The start page shows up as a file:// address; a tab that hasn't loaded yet has none. */
export const isStartPageUrl = (url: string | null | undefined) => !url || url.startsWith('file:') || url === 'about:blank'
