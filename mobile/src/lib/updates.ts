import * as Updates from 'expo-updates'
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { log } from '../config'

/**
 * New versions of the app's own code (and the start page inside it), sent over the air with EAS
 * Update (`npm run update:app`), without a new TestFlight build. Only to builds whose native side is
 * the same (the runtime version is the project's fingerprint), so an update never needs something
 * the installed app hasn't got. Not in Expo Go or development, where Updates isn't enabled.
 *
 * The app asks when it starts and whenever it comes back into view (at most every few minutes),
 * downloads a new version quietly, then says it's ready: a tap restarts into it; otherwise it's
 * what opens next time.
 */

/** The least time between two asks. */
const ASK_EVERY = 10 * 60_000

export const useAppUpdates = (onReady: () => void) => {
  const { isUpdatePending } = Updates.useUpdates()
  const ready = useRef(onReady)
  ready.current = onReady

  useEffect(() => {
    if (!Updates.isEnabled) return
    let askedAt = 0
    let busy = false
    const ask = async () => {
      if (busy || Date.now() - askedAt < ASK_EVERY) return
      busy = true
      askedAt = Date.now()
      try {
        const { isAvailable } = await Updates.checkForUpdateAsync()
        if (isAvailable) await Updates.fetchUpdateAsync()
      } catch (e) {
        log("couldn't check for an update", e)
      } finally {
        busy = false
      }
    }
    ask()
    const watching = AppState.addEventListener('change', state => {
      if (state === 'active') ask()
    })
    return () => watching.remove()
  }, [])

  // Downloaded (by the check above, or the one iOS makes at launch) and ready to run.
  useEffect(() => {
    if (isUpdatePending) ready.current()
  }, [isUpdatePending])
}

/** Restarts the app into the new version (the open tabs come back, as after any restart). */
export const restartIntoUpdate = () => {
  Updates.reloadAsync().catch(e => log("couldn't restart into the update", e))
}
