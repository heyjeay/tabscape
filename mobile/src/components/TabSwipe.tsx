import * as Haptics from 'expo-haptics'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, LayoutAnimation, PanResponder, StyleSheet, type GestureResponderHandlers } from 'react-native'
import type { Tab } from '../useTabs'
import type { Rect } from './Hero'
import { TabPicture } from './TabPicture'

/** How far (points) or how fast a swipe has to go to change tabs. */
const SWIPE = 60
const FLICK = 0.5
/** How small the page gets as you drag it right across. */
const DRAG_SCALE = 0.86
/** The corners the page takes once it's moving, like a card. */
export const SWIPE_RADIUS = 44
/** The tilt of the card at the back of the tab button (BottomBar's stack), which cards fly into and out of. */
const DECK_TILT = -14
/** How wide a page is once it's a card in the tab button (points). */
const DECK_WIDTH = 30

interface Options {
  width: number
  height: number
  /** The tab showing, and the ones either side of it (of the same kind), if any. */
  current: Tab
  prev?: Tab
  next?: Tab
  /** Where the tab button's cards are, on screen. */
  measureDeck: () => Promise<Rect | null>
  /** A swipe began: a good moment to take a picture of the page as it is. */
  onStart: () => void
  /** Swiped far enough: show this tab. */
  onSwitch: (tab: Tab) => void
}

/** A switch under way: the old tab's picture leaving, and which way. */
interface Flight {
  from: Tab
  to: Tab
  /** To the next tab (swiped left), or back to the one before (swiped right). */
  forward: boolean
}

/**
 * Swiping along the bar to change tabs, the way Arc does it.
 *
 * While you drag, the page follows your finger, shrinking a little into a card with rounded
 * corners. Let go far enough and:
 * - to the next tab: it slides in from the right, full size, while the page you left turns into
 *   a small tilted card and flies down into the tab button, like a card put on a deck;
 * - back to the one before: that tab comes out of the deck, a tilted card that straightens and
 *   grows to fill the screen, while the page you left slides off and fades.
 * Not far enough, and the page springs back. Past the last tab it only gives a little.
 *
 * Returns the touch handlers (for the bar), how to move the page, and the leaving card (drawn
 * over the page when it flies into the deck, under it when it slides away).
 */
export const useTabSwipe = (options: Options) => {
  const { width } = options
  /** Where your finger has taken the page (points). */
  const x = useRef(new Animated.Value(0)).current
  // How the new page comes in: from the side, or out of the deck.
  const enterX = useRef(new Animated.Value(0)).current
  const enterY = useRef(new Animated.Value(0)).current
  const enterScale = useRef(new Animated.Value(1)).current
  const enterTilt = useRef(new Animated.Value(0)).current
  // The picture of the page you left, as it goes.
  const leaveX = useRef(new Animated.Value(0)).current
  const leaveY = useRef(new Animated.Value(0)).current
  const leaveScale = useRef(new Animated.Value(1)).current
  const leaveTilt = useRef(new Animated.Value(0)).current
  const leaveShown = useRef(new Animated.Value(1)).current

  const [swiping, setSwipingNow] = useState(false)
  const [flight, setFlight] = useState<Flight | null>(null)
  /** The bar grows taller while you swipe (and shrinks back after), smoothly. */
  const setSwiping = (on: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity))
    setSwipingNow(on)
  }
  /** Mid-switch: the next touch waits until the new page is in place. */
  const busy = useRef(false)
  const lastDx = useRef(0)
  const deck = useRef<Rect | null>(null)

  const latest = useRef(options)
  latest.current = options

  /** How much the page has shrunk for a drag this far. */
  const dragScaleAt = (dx: number) => 1 - (1 - DRAG_SCALE) * Math.min(1, Math.abs(dx) / latest.current.width)

  /** Where a page sits once it's a card in the tab button: from the screen's middle, and how small. */
  const deckSpot = () => {
    const { width, height } = latest.current
    const d = deck.current ?? { x: 20, y: height - 70, width: 27, height: 33 }
    // The card at the back of the stack sits a little left of and below the front one.
    return { x: d.x + d.width / 2 - 9 - width / 2, y: d.y + d.height / 2 + 4 - height / 2, scale: DECK_WIDTH / width }
  }

  const finish = (dx: number, vx: number) => {
    const { prev, next, current } = latest.current
    const towardNext = dx < -SWIPE || vx < -FLICK
    const towardPrev = dx > SWIPE || vx > FLICK
    const target = towardNext ? next : towardPrev ? prev : undefined
    if (!target) {
      // Not far enough, or nothing that way (a soft tap for trying): back it comes.
      if (towardNext || towardPrev) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
      Animated.spring(x, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }).start(() => setSwiping(false))
      return
    }
    busy.current = true
    Haptics.selectionAsync()
    // The picture of this page takes its place, exactly where it is now, before it goes.
    leaveX.setValue(dx)
    leaveY.setValue(0)
    leaveScale.setValue(dragScaleAt(dx))
    leaveTilt.setValue(0)
    leaveShown.setValue(1)
    setFlight({ from: current, to: target, forward: target === next })
  }

  // The leaving picture is up: switch tabs, put the new page where it comes in from, and run both.
  useLayoutEffect(() => {
    if (!flight) return
    const { width, height, onSwitch } = latest.current
    const spot = deckSpot()
    x.setValue(0)
    if (flight.forward) {
      // In from the right, full size.
      enterX.setValue(width)
      enterY.setValue(0)
      enterScale.setValue(1)
      enterTilt.setValue(0)
    } else {
      // Out of the deck: small and tilted, where the tab button is.
      enterX.setValue(spot.x)
      enterY.setValue(spot.y)
      enterScale.setValue(spot.scale)
      enterTilt.setValue(DECK_TILT)
    }
    onSwitch(flight.to)

    const native = { useNativeDriver: true }
    const intoDeck = { ...native, duration: 420, easing: Easing.bezier(0.45, 0, 0.2, 1) }
    const outOfDeck = { ...native, duration: 440, easing: Easing.bezier(0.2, 0.85, 0.25, 1) }
    const away = { ...native, duration: 380, easing: Easing.out(Easing.cubic) }
    const come = flight.forward
      ? Animated.timing(enterX, { ...native, toValue: 0, duration: 340, easing: Easing.out(Easing.cubic) })
      : Animated.parallel([
          Animated.timing(enterX, { ...outOfDeck, toValue: 0 }),
          Animated.timing(enterY, { ...outOfDeck, toValue: 0 }),
          Animated.timing(enterScale, { ...outOfDeck, toValue: 1 }),
          Animated.timing(enterTilt, { ...outOfDeck, toValue: 0 })
        ])
    const go = flight.forward
      ? Animated.parallel([
          // Down into the tab button, shrinking and tilting as it goes, then gone into the stack.
          Animated.timing(leaveX, { ...intoDeck, toValue: spot.x }),
          Animated.timing(leaveY, { ...intoDeck, toValue: spot.y }),
          Animated.timing(leaveScale, { ...intoDeck, toValue: spot.scale }),
          Animated.timing(leaveTilt, { ...intoDeck, toValue: DECK_TILT }),
          Animated.timing(leaveShown, { ...native, toValue: 0, duration: 90, delay: 340 })
        ])
      : Animated.parallel([
          // Off to the side, shrinking back and fading, behind the tab coming out of the deck.
          Animated.timing(leaveX, { ...away, toValue: width * 0.75 }),
          Animated.timing(leaveY, { ...away, toValue: -height * 0.06 }),
          Animated.timing(leaveScale, { ...away, toValue: 0.7 }),
          Animated.timing(leaveShown, { ...native, toValue: 0, duration: 260, delay: 120 })
        ])
    Animated.parallel([come, go]).start(() => {
      setFlight(null)
      setSwiping(false)
      busy.current = false
    })
    // Once per switch: the animated values never change, and the rest is read as it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight])

  const pan = useRef(
    PanResponder.create({
      // Mostly sideways, so taps on the bar's buttons still work. A thumb swipes in an arc, so a
      // fair bit of up or down is fine (the bar has nothing else to do with an upward swipe).
      onMoveShouldSetPanResponderCapture: (_, g) => !busy.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) >= Math.abs(g.dy) * 0.7,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        latest.current.onStart()
        latest.current.measureDeck().then(rect => {
          deck.current = rect
        })
        lastDx.current = 0
        setSwiping(true)
      },
      onPanResponderMove: (_, g) => {
        const { prev, next } = latest.current
        // Nothing that way: it gives a little, but only a little.
        const end = (g.dx > 0 && !prev) || (g.dx < 0 && !next)
        lastDx.current = end ? g.dx * 0.25 : g.dx
        x.setValue(lastDx.current)
      },
      onPanResponderRelease: (_, g) => finish(lastDx.current, g.vx),
      onPanResponderTerminate: () => finish(0, 0)
    })
  ).current

  // Built once per screen width: rebuilt on every render they'd be unhooked and hooked up again natively.
  const motion = useMemo(() => {
    const dragScale = x.interpolate({ inputRange: [-width, 0, width], outputRange: [DRAG_SCALE, 1, DRAG_SCALE], extrapolate: 'clamp' })
    const degrees = (value: Animated.Value) => value.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] })
    return {
      page: {
        transform: [
          { translateX: Animated.add(x, enterX) },
          { translateY: enterY },
          { rotate: degrees(enterTilt) },
          { scale: Animated.multiply(dragScale, enterScale) }
        ]
      },
      leaving: {
        opacity: leaveShown,
        transform: [{ translateX: leaveX }, { translateY: leaveY }, { rotate: degrees(leaveTilt) }, { scale: leaveScale }]
      }
    }
  }, [x, enterX, enterY, enterScale, enterTilt, leaveX, leaveY, leaveScale, leaveTilt, leaveShown, width])

  const leaving = flight && (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.card, motion.leaving]}>
      <TabPicture tab={flight.from} letterSize={72} style={StyleSheet.absoluteFill} />
    </Animated.View>
  )

  return {
    handlers: pan.panHandlers as GestureResponderHandlers,
    pageStyle: motion.page,
    swiping,
    /** The page you left flying into the tab button: over everything, the bar included. */
    leavingOver: flight?.forward ? leaving : null,
    /** The page you left sliding away: under the tab coming out of the deck. */
    leavingUnder: flight && !flight.forward ? leaving : null
  }
}

const styles = StyleSheet.create({
  card: { borderRadius: SWIPE_RADIUS, overflow: 'hidden', backgroundColor: '#24242c' }
})
