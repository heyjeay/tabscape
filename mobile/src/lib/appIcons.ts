import { requireOptionalNativeModule } from 'expo'
import type { ImageSourcePropType } from 'react-native'

/**
 * The app's icon on the home screen, chosen in Settings → App Icon. Midnight glass is the main one
 * (app.json ios.icon); the others are alternate icons, built into the app by the
 * expo-alternate-app-icons plugin (names as in app.json). Each but Classic has iOS's dark and
 * tinted versions too, so it follows the home screen's look.
 *
 * The module is asked for optionally (not through the package's own import, which throws where it
 * isn't): it's only in builds made since it was added, not in Expo Go.
 */
interface AlternateIcons {
  supportsAlternateIcons: boolean
  setAlternateAppIcon(name: string | null): Promise<string | null>
  getAppIconName(): string | null
}
const native = requireOptionalNativeModule<AlternateIcons>('ExpoAlternateAppIcons')

export interface AppIcon {
  /** The alternate icon's name in app.json, or null for the main one. */
  name: string | null
  label: string
  thumb: ImageSourcePropType
}

export const APP_ICONS: AppIcon[] = [
  { name: null, label: 'Midnight', thumb: require('../../assets/app-icons/thumbs/midnight.png') },
  { name: 'Clear', label: 'Clear', thumb: require('../../assets/app-icons/thumbs/clear.png') },
  { name: 'Aurora', label: 'Aurora', thumb: require('../../assets/app-icons/thumbs/aurora.png') },
  { name: 'Gold', label: 'Gold', thumb: require('../../assets/app-icons/thumbs/gold.png') },
  { name: 'Violet', label: 'Violet', thumb: require('../../assets/app-icons/thumbs/tinted.png') },
  { name: 'Layered', label: 'Layered', thumb: require('../../assets/app-icons/thumbs/layered.png') },
  { name: 'Classic', label: 'Classic', thumb: require('../../assets/app-icons/thumbs/classic.png') }
]

/** Whether this build (and this iPhone) can change its icon. */
export const canChangeAppIcon = !!native?.supportsAlternateIcons

/** The icon in use: an alternate's name, or null for the main one. */
export const currentAppIcon = () => {
  try {
    return native?.getAppIconName() ?? null
  } catch {
    return null
  }
}

/** Changes the icon (iOS says so in an alert of its own). Null puts the main one back. */
export const setAppIcon = async (name: string | null) => {
  if (!native) return null
  return native.setAlternateAppIcon(name)
}
