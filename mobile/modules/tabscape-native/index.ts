import { requireOptionalNativeModule } from 'expo'

/**
 * Tabscape's native extras (modules/tabscape-native/ios): bottom-edge swipes go to the app first,
 * and ad and tracker blocking in its pages. They're only in Tabscape's own builds; in Expo Go the
 * module isn't there, and all of this quietly does nothing.
 *
 * Asking for the module starts it: the edge swipes and the blocker are set up then.
 */
interface TabscapeNative {
  setBlocking(on: boolean): void
  blockedNetworkCount(): number
}

const native = requireOptionalNativeModule<TabscapeNative>('TabscapeNative')

/** Whether this is Tabscape's own build (with the native extras), not Expo Go. */
export const hasNativeExtras = !!native

/** Turns ad and tracker blocking on or off, for pages as they load. */
export const setBlocking = (on: boolean) => native?.setBlocking(on)

/** How many ad and tracking networks are blocked (0 where blocking isn't available). */
export const blockedNetworkCount = () => native?.blockedNetworkCount() ?? 0
