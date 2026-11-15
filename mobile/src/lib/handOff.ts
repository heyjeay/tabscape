import { Alert, Linking } from 'react-native'
import { log } from '../config'

/**
 * Addresses a page sends to another app (youtube://, mailto:, itms-apps://…), as Safari treats
 * them. Many sites try to open their own app as soon as they load, or from a hidden frame: that
 * mustn't whisk you out of the browser. So:
 * - from a frame inside the page: ignored;
 * - a phone number, email or message you tapped: opens, as it says on the link;
 * - anything else (an app, or the page acting by itself): Tabscape asks first, once.
 */

/** iOS's own apps, opened by a tap on a link as it says: a call, an email, a message, FaceTime, Maps. */
const SYSTEM = /^(tel|telprompt|mailto|sms|facetime|facetime-audio|maps):/i

/** Some apps by the address they're opened with, to name them in the question. */
const APPS: Record<string, string> = {
  youtube: 'YouTube', 'vnd.youtube': 'YouTube', reddit: 'Reddit', twitter: 'X', x: 'X', instagram: 'Instagram',
  fb: 'Facebook', 'fb-messenger': 'Messenger', whatsapp: 'WhatsApp', spotify: 'Spotify', tiktok: 'TikTok',
  snssdk1233: 'TikTok', discord: 'Discord', slack: 'Slack', zoomus: 'Zoom', 'itms-apps': 'the App Store',
  'itms-appss': 'the App Store', twitch: 'Twitch', linkedin: 'LinkedIn', pinterest: 'Pinterest', amazon: 'Amazon',
  googlechrome: 'Chrome', comgooglemaps: 'Google Maps', netflix: 'Netflix', steam: 'Steam', kick: 'Kick'
}

let asking = false
let lastAsked = { url: '', at: 0 }

export const handOff = (url: string, { tapped, inFrame }: { tapped: boolean; inFrame: boolean }) => {
  if (inFrame) {
    log('ignored an app address from a frame:', url)
    return
  }
  if (tapped && SYSTEM.test(url)) {
    Linking.openURL(url).catch(() => {})
    return
  }
  // One question at a time, and not the same one again straight after (pages often try twice).
  const now = Date.now()
  if (asking || (url === lastAsked.url && now - lastAsked.at < 10_000)) return
  lastAsked = { url, at: now }
  asking = true
  const done = () => {
    asking = false
  }
  const scheme = url.slice(0, Math.max(0, url.indexOf(':'))).toLowerCase()
  const app = APPS[scheme]
  Alert.alert(
    app ? `Open in ${app}?` : 'Open in another app?',
    tapped ? undefined : 'This page wants to open an app.',
    [
      { text: 'Cancel', style: 'cancel', onPress: done },
      {
        text: 'Open',
        onPress: () => {
          done()
          Linking.openURL(url).catch(() => Alert.alert("There's no app for this on your iPhone."))
        }
      }
    ],
    { onDismiss: done }
  )
}
