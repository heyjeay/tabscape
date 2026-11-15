import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hostOf } from './address'
import { keys, load, save } from './storage'

/** Text sizes to step through, as Safari's aA does (percent). */
export const TEXT_SIZES = [50, 75, 85, 100, 115, 125, 150, 175, 200]

/** Each site's text size (percent), by host; 100 isn't stored. */
type Zooms = Record<string, number>

/**
 * Text size per site, remembered like Safari's. In a private tab a change lasts only while
 * the app is open, so the site isn't written down anywhere.
 */
export const useTextSizes = () => {
  const [saved, setSaved] = useState<Zooms>({})
  const [forNow, setForNow] = useState<Zooms>({})
  const savedRef = useRef(saved)
  savedRef.current = saved

  useEffect(() => {
    load<Zooms>(keys.sites, {}).then(found => setSaved(found && typeof found === 'object' ? found : {}))
  }, [])

  const sizeFor = useCallback((url: string | null, isPrivate?: boolean) => {
    const host = hostOf(url)
    if (!host) return 100
    return (isPrivate ? forNow[host] : undefined) ?? saved[host] ?? 100
  }, [saved, forNow])

  const setSize = useCallback((url: string | null, size: number, isPrivate?: boolean) => {
    const host = hostOf(url)
    if (!host) return
    const apply = (all: Zooms) => {
      const next = { ...all }
      if (size === 100) delete next[host]
      else next[host] = size
      return next
    }
    if (isPrivate) return setForNow(apply)
    const next = apply(savedRef.current)
    savedRef.current = next
    setSaved(next)
    save(keys.sites, next)
  }, [])

  /** Every site with its own size, for the script that sets it as each page starts. */
  const both = useMemo(() => ({ ...saved, ...forNow }), [saved, forNow])
  const sizesFor = useCallback((isPrivate?: boolean) => (isPrivate ? both : saved), [saved, both])

  /** Puts a site (or every site, with null) back to its normal text size. */
  const resetSize = useCallback((host: string | null) => {
    const next = host ? Object.fromEntries(Object.entries(savedRef.current).filter(([h]) => h !== host)) : {}
    savedRef.current = next
    setSaved(next)
    save(keys.sites, next)
    setForNow(all => (host ? Object.fromEntries(Object.entries(all).filter(([h]) => h !== host)) : {}))
  }, [])

  return { sizeFor, setSize, sizesFor, saved, resetSize }
}

/** The next size up or down. */
export const stepSize = (size: number, up: boolean) => {
  const i = TEXT_SIZES.indexOf(size)
  const at = i < 0 ? TEXT_SIZES.indexOf(100) : i
  return TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, at + (up ? 1 : -1)))]
}

/** Sets a page's text size: what Safari's aA does, through the CSS iOS reads for it. */
const applySize = (size: string) =>
  `document.documentElement && document.documentElement.style.setProperty('-webkit-text-size-adjust', ${size}, 'important');`

/** For the page showing now: its text size, straight away. */
export const textSizeScript = (size: number) => `(function () { ${applySize(JSON.stringify(`${size}%`))} })(); true;`

/** Run as each page starts: the size for that page's site, if it has one. */
export const textSizesAtStart = (sizes: Zooms) => `(function () {
  var sizes = ${JSON.stringify(sizes)};
  var size = sizes[location.hostname.replace(/^www\\./, '')];
  if (size && size !== 100) { ${applySize("size + '%'")} }
})();`
