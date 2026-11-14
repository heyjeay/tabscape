import { useEffect, useRef, useState } from 'react'
import { Animated } from 'react-native'

/**
 * Brings a bottom panel up with a quick spring, and takes it away again, like Arc's sheets.
 * It stays mounted until it has gone, and moves only (no fading: Liquid Glass doesn't render faded).
 */
export const useSlideUp = (visible: boolean, distance = 600) => {
  const [mounted, setMounted] = useState(visible)
  const offset = useRef(new Animated.Value(visible ? 0 : distance)).current

  useEffect(() => {
    if (visible) {
      setMounted(true)
      offset.setValue(distance)
      Animated.spring(offset, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 3 }).start()
    } else {
      Animated.timing(offset, { toValue: distance, duration: 180, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false)
      })
    }
  }, [visible, distance, offset])

  return { mounted, offset }
}
