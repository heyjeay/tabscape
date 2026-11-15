/** Typed as a full web address ("https://…"), rather than words to search for. */
export const isAddress = (input: string) => /^https?:\/\//i.test(input.trim())

/** "192.168.1.1:8080/admin" → "192.168.1.1". */
const hostPart = (input: string) => input.split(/[/?#]/)[0].replace(/:\d+$/, '')

/** This device or the home network (localhost, an IP address): these usually have no https. */
const isLocal = (host: string) => /^localhost$/i.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)

/**
 * "apple.com", "news.bbc.co.uk/sport", "localhost:8081", "192.168.1.1": somewhere to go, not
 * words. A number like "3.14" isn't (its last part has no letters), so it's searched for.
 */
const looksLikeHost = (input: string) => {
  if (input.includes(' ')) return false
  const host = hostPart(input)
  if (isLocal(host)) return true
  const parts = host.split('.')
  return parts.length > 1 && parts.every(Boolean) && /[a-z]/i.test(parts[parts.length - 1])
}

/** Turns what was typed into somewhere to go: an address ("apple.com", "https://…") or a search on the engine you picked. */
export const toUrl = (text: string, searchUrl = 'https://www.google.com/search?q='): string | null => {
  const input = text.trim()
  if (!input) return null
  if (isAddress(input)) return input
  if (looksLikeHost(input)) return `${isLocal(hostPart(input)) ? 'http' : 'https'}://${input}`
  return `${searchUrl}${encodeURIComponent(input)}`
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
  return !!words && !isAddress(words) && !looksLikeHost(words)
}
