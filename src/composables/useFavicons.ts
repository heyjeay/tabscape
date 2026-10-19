import { ref } from 'vue'
import { faviconsSupported, hasFaviconAccess, releaseFaviconAccess, requestFaviconAccess } from '@/lib/favicons'

/**
 * Whether links show real site icons. Kept per browser, like the permission
 * behind it. Shared across the page, so the panel switch and every link agree.
 */
const KEY = 'startpage_favicons'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const save = (on: boolean) => {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch (e) {
    console.warn("[tabscape] Couldn't save the icons setting", e)
  }
}

const supported = faviconsSupported()
const enabled = ref(supported && read())

// The permission can be taken away in the browser's extension settings.
if (enabled.value) {
  hasFaviconAccess().then(ok => {
    if (!ok) {
      enabled.value = false
      save(false)
    }
  })
}

export const useFavicons = () => {
  /** Turn real icons on. Shows the permission prompt, so call it straight from a click. */
  const enable = async () => {
    if (!(await requestFaviconAccess())) return false
    enabled.value = true
    save(true)
    return true
  }

  const disable = async () => {
    enabled.value = false
    save(false)
    await releaseFaviconAccess()
  }

  return { supported, enabled, enable, disable }
}
