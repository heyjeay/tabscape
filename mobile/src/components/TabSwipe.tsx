import * as Haptics from 'expo-haptics'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, LayoutAnimation, PanResponder, StyleSheet, type GestureResponderHandlers } from 'react-native'
import type { Tab } from '../useTabs'
import { TabPicture } from './TabPicture'

/** How small the pages get while you swipe between them, and the gap between them (points). */
const SCALE = 0.88
const GAP = 20
/** How far (points) or how fast a swipe has to go to change tabs. */
const SWIPE = 60
const FLICK = 0.5
/** The corners the pages take while they're small, like cards. */
export const SWIPE_RADIUS = 44

interface Options {
  width: number
  /** The tabs either side of the one showing (of the same kind), if any. */
  prev?: Tab
  next?: Tab
  /** The one showing: when it changes after a swipe, the page grows back to full size. */
  currentId: string
  /** A swipe began: a good moment to take a picture of the page as it is. */
  onStart: () => void
  /** Swiped far enough: show this tab. */
  onSwitch: (tab: Tab) => void
}

/**
 * Swiping along the bar to change tabs, like an Exposé: the page shrinks into a card with
 * rounded corners and follows your finger, the tabs either side slide along next to it, and
 * when you let go far enough the next one glides into the middle and grows to fill the screen.
 * Not far enough, and everything springs back. Past the last tab it only stretches.
 *
 * Returns the touch handlers (for the bar), how to move the page, and the cards either side.
 */
export const useTabSwipe = ({ width, prev, next, currentId, onStart, onSwitch }: Options) => {
  /** Where the page is, following your finger (points). */
  const x = useRef(new Animated.Value(0)).current
  /** 0 full size, 1 shrunk into a card. */
  const small = useRef(new Animated.Value(0)).current
  const [swiping, setSwipingNow] = useState(false)
  /** The bar grows taller while you swipe (and shrinks back after), smoothly. */
  const setSwiping = (on: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity))
    setSwipingNow(on)
  }
  /** Mid-switch: the next touch waits until the new page has grown back. */
  const busy = useRef(false)
  /** A switch is under way: once the new tab is showing, the page comes back to the middle and grows. */
  const landing = useRef(false)

  const latest = useRef({ prev, next, width, onStart, onSwitch })
  latest.current = { prev, next, width, onStart, onSwitch }

  const settle = () =>
    Animated.parallel([
      Animated.spring(x, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }),
      Animated.spring(small, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 2 })
    ]).start(() => setSwiping(false))

  const finish = (dx: number, vx: number) => {
    const { prev, next, width } = latest.current
    const towardNext = dx < -SWIPE || vx < -FLICK
    const towardPrev = dx > SWIPE || vx > FLICK
    const target = towardNext ? next : towardPrev ? prev : undefined
    if (!target) {
      // Tried to go past the end: a soft tap, and back it comes.
      if (towardNext || towardPrev) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
      settle()
      return
    }
    busy.current = true
    Haptics.selectionAsync()
    const distance = SCALE * width + GAP
    Animated.timing(x, {
      toValue: towardNext ? -distance : distance,
      duration: 230,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start(() => {
      landing.current = true
      latest.current.onSwitch(target)
      // If the tab didn't change after all (it was closed meanwhile), don't stay stuck small.
      setTimeout(() => {
        if (!landing.current) return
        landing.current = false
        busy.current = false
        settle()
      }, 800)
    })
  }

  // The new tab is showing (in the middle card's place, still small): put it back in the middle,
  // in the same frame, and grow it to fill the screen.
  useLayoutEffect(() => {
    if (!landing.current) return
    landing.current = false
    x.setValue(0)
    Animated.spring(small, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 3 }).start(() => {
      busy.current = false
      setSwiping(false)
    })
  }, [currentId, x, small])

  const pan = useRef(
    PanResponder.create({
      // Mostly sideways, so taps on the bar's buttons still work. A thumb swipes in an arc, so a
      // fair bit of up or down is fine (the bar has nothing else to do with an upward swipe).
      onMoveShouldSetPanResponderCapture: (_, g) => !busy.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) >= Math.abs(g.dy) * 0.7,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        latest.current.onStart()
        setSwiping(true)
        Animated.timing(small, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
      },
      onPanResponderMove: (_, g) => {
        const { prev, next } = latest.current
        // Nothing that way: it gives a little, but only a little.
        const end = (g.dx > 0 && !prev) || (g.dx < 0 && !next)
        x.setValue(end ? g.dx * 0.25 : g.dx)
      },
      onPanResponderRelease: (_, g) => finish(g.dx, g.vx),
      onPanResponderTerminate: () => finish(0, 0)
    })
  ).current

  // Built once per screen width: rebuilt on every render they'd be unhooked and hooked up again natively.
  const motion = useMemo(() => {
    const scale = small.interpolate({ inputRange: [0, 1], outputRange: [1, SCALE] })
    // The cards either side sit a gap away from the page's edge, however small it is.
    const apart = Animated.add(Animated.multiply(scale, width), GAP)
    return { scale, nextX: Animated.add(x, apart), prevX: Animated.subtract(x, apart) }
  }, [x, small, width])

  const pageStyle = { transform: [{ translateX: x }, { scale: motion.scale }] }

  /** The tabs either side, as their pictures, while a swipe is going. */
  const sides = swiping ? (
    <>
      {prev && <Side tab={prev} x={motion.prevX} scale={motion.scale} />}
      {next && <Side tab={next} x={motion.nextX} scale={motion.scale} />}
    </>
  ) : null

  return { handlers: pan.panHandlers as GestureResponderHandlers, pageStyle, swiping, sides }
}

const Side = ({ tab, x, scale }: { tab: Tab; x: Animated.AnimatedAddition | Animated.AnimatedSubtraction; scale: Animated.AnimatedInterpolation<number> }) => (
  <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.side, { transform: [{ translateX: x }, { scale }] }]}>
    <TabPicture tab={tab} letterSize={72} style={StyleSheet.absoluteFill} />
  </Animated.View>
)

const styles = StyleSheet.create({
  side: { borderRadius: SWIPE_RADIUS, overflow: 'hidden', backgroundColor: '#24242c' }
})
