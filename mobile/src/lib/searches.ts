import { isAddress } from './address'
import { keys, load, save } from './storage'

/** Searches you've made, newest first, kept on this device only. */
export const loadRecentSearches = () => load<string[]>(keys.recentSearches, [])

export const addRecentSearch = async (search: string) => {
  const all = await loadRecentSearches()
  const next = [search, ...all.filter(s => s.toLowerCase() !== search.toLowerCase())].slice(0, 20)
  await save(keys.recentSearches, next)
  return next
}

export const clearRecentSearches = () => save(keys.recentSearches, [])

/**
 * Search suggestions from your search engine, as you type (what its own search box does).
 * Every engine here answers in the same shape: [what was typed, [suggestions…]].
 */
export const fetchSuggestions = async (query: string, signal: AbortSignal, suggestUrl: string): Promise<string[]> => {
  const input = query.trim()
  if (input.length < 2 || isAddress(input)) return []
  try {
    const response = await fetch(
      `${suggestUrl}${encodeURIComponent(input)}`,
      { signal }
    )
    const json = (await response.json()) as [string, string[]]
    return Array.isArray(json?.[1]) ? json[1].slice(0, 6) : []
  } catch {
    return []
  }
}
