/** Keep in step with iconSiteOf in the app's mobile/src/lib/icons.ts (the app keeps icons by the same key). */
/** Hosts on your own network (an IP address, a name with no dots, .local…), often plain http. */
const LOCAL_HOST = /^(\d+\.\d+\.\d+\.\d+|\[[0-9a-f:.]+\]|[^.]+|.+\.(local|lan|home|internal|localhost|test))$/i

/**
 * What the app keeps a link's icon under. An ordinary site: its host, lower case, without "www."
 * A server with a port, or a plain-http one on your own network (a game server's panel, a NAS):
 * its whole origin, "http://192.168.1.5:40120", since that's the only place its icon is.
 */
export const iconSiteOf = (url: string | null): string | null => {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const host = u.hostname.toLowerCase()
    if (!host) return null
    return u.port || (u.protocol === 'http:' && LOCAL_HOST.test(host)) ? u.origin.toLowerCase() : host.replace(/^www\./, '')
  } catch {
    return null
  }
}
