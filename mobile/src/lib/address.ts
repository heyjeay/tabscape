/** Typed as a full web address ("https://…"), rather than words to search for. */
export const isAddress = (input: string) => /^https?:\/\//i.test(input.trim())

/** Turns what was typed into somewhere to go: an address ("apple.com", "https://…") or a Google search. */
export const toUrl = (text: string): string | null => {
  const input = text.trim()
  if (!input) return null
  if (isAddress(input)) return input
  if (!input.includes(' ') && input.includes('.')) return `https://${input}`
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`
}

/** "www.theverge.com" → "theverge.com", for the address pill. */
export const hostOf = (url: string | null | undefined) => {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** A search worth remembering: words, not an address. */
export const isSearch = (input: string) => {
  const words = input.trim()
  return !!words && !isAddress(words) && (words.includes(' ') || !words.includes('.'))
}
