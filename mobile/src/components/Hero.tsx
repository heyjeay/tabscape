import { useRef, useState, type ComponentRef, type RefObject } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import type { Tab } from '../useTabs'
import { TabPicture } from './TabPicture'

/** What a ref to a View holds in React Native 0.88 (not the View component type itself). */
export type ViewRef = ComponentRef<typeof View>

/** A place on screen, in window coordinates. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Where a view is on screen right now, or null if it isn't laid out. */
export const measure = (ref: RefObject<ViewRef | null>) =>
  new Promise<Rect | null>(resolve => {
    const node = ref.current
    if (!node) return resolve(null)
    node.measureInWindow((x, y, width, height) => resolve(width > 0 ? { x, y, width, height } : null))
  })

interface Flight {
  tab: Tab
  from: Rect
  to: Rect
  /** Corner rounding at the destination. */
  radius: number
}

/**
 * A tab's picture flying from one place to another, like Arc's tab transitions: out of the
 * tab button into the tab browser, or from a card up to the full page. It's laid out at the
 * destination and transformed back to where it starts, so the spring runs on the native side.
 */
export const useHero = () => {
  const [flight, setFlight] = useState<Flight | null>(null)
  const progress = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current

  const fly = (tab: Tab, from: Rect, to: Rect, { radius = 30, fadeAtEnd = false } = {}) =>
    new Promise<void>(resolve => {
      progress.setValue(0)
      fade.setValue(1)
      setFlight({ tab, from, to, radius })
      requestAnimationFrame(() => {
        Animated.spring(progress, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 2 }).start(() => {
          resolve()
          // Landing on the page: linger a moment while the page underneath draws, then let go.
          if (fadeAtEnd) {
            Animated.timing(fade, { toValue: 0, duration: 200, delay: 180, useNativeDriver: true }).start(() => setFlight(null))
          } else {
            setFlight(null)
          }
        })
      })
    })

  const element = flight && (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.hero,
        {
          left: flight.to.x,
          top: flight.to.y,
          width: flight.to.width,
          height: flight.to.height,
          borderRadius: flight.radius,
          opacity: fade,
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [flight.from.x - flight.to.x, 0] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [flight.from.y - flight.to.y, 0] }) },
            { scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [flight.from.width / flight.to.width, 1] }) },
            { scaleY: progress.interpolate({ inputRange: [0, 1], outputRange: [flight.from.height / flight.to.height, 1] }) }
          ]
        }
      ]}
    >
      <TabPicture tab={flight.tab} letterSize={64} style={StyleSheet.absoluteFill} />
    </Animated.View>
  )

  return { fly, element }
}

const styles = StyleSheet.create({
  hero: { position: 'absolute', overflow: 'hidden', transformOrigin: 'top left' }
})
