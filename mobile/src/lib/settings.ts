import { load, save } from './storage'

/** The browser's own settings (the start page keeps its settings itself). */
export interface BrowserSettings {
  /** Google suggestions as you type in the search screen. */
  suggestions: boolean
}

const KEY = 'tabscape.settings'
const DEFAULTS: BrowserSettings = { suggestions: true }

export const loadSettings = async () => ({ ...DEFAULTS, ...(await load<Partial<BrowserSettings>>(KEY, {})) })

export const saveSettings = (settings: BrowserSettings) => save(KEY, settings)
