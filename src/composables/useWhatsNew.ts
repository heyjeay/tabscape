import { ref } from 'vue'
import { log } from '@/config'
import { freshBrowser } from './useStartpage'
import { isNewer, WHATS_NEW } from '@/lib/whatsNew'

/**
 * Whether to show the "What's new" card. It's for people updating: a browser that
 * had nothing saved when the page loaded (a new install, or a new computer filled in
 * by sync) counts as having seen this version already. Kept per browser, not synced,
 * so each computer shows it once.
 */
const SEEN_KEY = 'startpage_whats_new_seen'

const getSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}
const setSeen = (version: string) => {
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    // Private windows can refuse storage; the card just shows again next time.
  }
}

if (!getSeen() && freshBrowser) setSeen(WHATS_NEW.version)
const seen = getSeen() ?? '0'
const open = ref(isNewer(WHATS_NEW.version, seen))
log('what’s new: last seen', seen, open.value ? '- showing' : '')

export const useWhatsNew = () => ({
  open,
  show: () => { open.value = true },
  dismiss: () => {
    open.value = false
    setSeen(WHATS_NEW.version)
  }
})
