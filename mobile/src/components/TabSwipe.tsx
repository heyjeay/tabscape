import * as Haptics from 'expo-haptics'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, LayoutAnimation, PanResponder, StyleSheet, type GestureResponderHandlers } from 'react-native'
import type { Tab } from '../useTabs'
import type { Rect } from './Hero'
import { TabPicture } from './TabPicture'

/** How far (points) or how fast a swipe has to go to change tabs. */
const SWIPE = 60
const FLICK = 0.5
/** While you drag, the page lifts towards you (this much bigger at a full drag) and drifts the other way. */
const LIFT = 0.12
const DRIFT = 0.45
/** The corners pages take once they're moving, like cards. */
export const SWIPE_RADIUS = 44
/** The front card of the tab button (BottomBar's stack): its tilt and width, which cards fly into and out of. */
const DECK_TILT = 10
const DECK_WIDTH = 27

interface Options {
  width: number
  height: number
  /** The tab showing, and the ones either side of it (of the same kind), if any. */
  current: Tab
  prev?: Tab
  next?: Tab
  /** Where the tab button's front card is, on screen. */
  measureDeck: () => Promise<Rect | null>
  /** A swipe began: a good moment to take a picture of the page as it is. */
  onStart: () => void
  /** Swiped far enough: show this tab. */
  onSwitch: (tab: Tab) => void
}

/** A switch under way. */
interface Flight {
  from: Tab
  to: Tab
  /** To the next tab (swiped left), or back to the one before (swiped right). */
  forward: boolean
}

/**
 * Swiping along the bar to change tabs, as Arc Search does it (taken frame by frame from a
 * recording of it). The tab button is a deck holding the tab you were on last.
 *
 * Swipe left, to the next tab: the next page slides in from the right, over this one, which
 * lifts a little and drifts the other way. Let go and it fills the screen, while the page you
 * left becomes a card that flies down into the tab button, tilting as it goes, and lands as
 * its front card.
 *
 * Swipe right, back a tab: this page lifts and drifts the other way. Let go and the tab comes
 * out of the deck, a tilted card that straightens as it grows to fill the screen, while the
 * page you left shrinks away towards the top and fades.
 *
 * Not far enough and it all springs back; past the last tab it only gives a little.
 */
export const useTabSwipe = (options: Options) => {
  const { width } = options
  /** Where your finger has got to along the bar (points). */
  const x = useRef(new Animated.Value(0)).current
  // How the new page comes in: from where it was (sliding in), or out of the deck.
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
  /** Going on a tab, the page you left shrinks into a card behind the new one first, then comes over it to fly into the deck. */
  const [onTop, setOnTop] = useState(false)
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

  /** How the page you're on sits for a drag this far: drifted the other way, and lifted. */
  const lifted = (dx: number) => ({
    x: -dx * DRIFT,
    scale: 1 + LIFT * Math.min(1, Math.abs(dx) / latest.current.width)
  })

  /** The tab button's front card: where it is from the screen's middle, and how small a page is there. */
  const deckSpot = () => {
    const { width, height } = latest.current
    const d = deck.current ?? { x: 26, y: height - 66, width: 27, height: 33 }
    return { x: d.x + d.width / 2 - width / 2, y: d.y + d.height / 2 - height / 2, scale: DECK_WIDTH / width }
  }

  const finish = (dx: number, vx: number) => {
    const { prev, next, current } = latest.current
    const towardNext = dx < -SWIPE || vx < -FLICK
    const towardPrev = dx > SWIPE || vx > FLICK
    const target = towardNext ? next : towardPrev ? prev : undefined
    if (!target) {
      // Not far enough, or nothing that way (a soft tap for trying): back it all comes.
      if (towardNext || towardPrev) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
      Animated.spring(x, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 3 }).start(() => setSwiping(false))
      return
    }
    busy.current = true
    Haptics.selectionAsync()
    // The picture of this page takes its place, exactly as it is now (lifted and drifted), before it goes.
    const now = lifted(dx)
    leaveX.setValue(now.x)
    leaveY.setValue(0)
    leaveScale.setValue(now.scale)
    leaveTilt.setValue(0)
    leaveShown.setValue(1)
    setOnTop(false)
    setFlight({ from: current, to: target, forward: target === next })
  }

  // The leaving picture is up: switch tabs, put the new page where it comes in from, and run both.
  useLayoutEffect(() => {
    if (!flight) return
    const { width, height, onSwitch } = latest.current
    const spot = deckSpot()
    const dx = lastDx.current
    x.setValue(0)
    if (flight.forward) {
      // Already sliding in from the right with your finger: carry on from there.
      enterX.setValue(Math.max(0, width + dx))
      enterY.setValue(0)
      enterScale.setValue(1)
      enterTilt.setValue(0)
    } else {
      // Out of the deck: the tab button's front card, small and tilted.
      enterX.setValue(spot.x)
      enterY.setValue(spot.y)
      enterScale.setValue(spot.scale)
      enterTilt.setValue(DECK_TILT)
    }
    onSwitch(flight.to)

    const native = { useNativeDriver: true }
    const slide = { ...native, duration: 260, easing: Easing.out(Easing.cubic) }
    const grow = { ...native, duration: 300, easing: Easing.out(Easing.cubic) }
    const fly = { ...native, duration: 230, easing: Easing.bezier(0.3, 0.1, 0.25, 1) }
    const away = { ...native, duration: 240, easing: Easing.out(Easing.quad) }
    const come = flight.forward
      ? Animated.timing(enterX, { ...slide, toValue: 0 })
      : Animated.parallel([
          Animated.timing(enterX, { ...grow, toValue: 0 }),
          Animated.timing(enterY, { ...grow, toValue: 0 }),
          Animated.timing(enterScale, { ...grow, toValue: 1 }),
          Animated.timing(enterTilt, { ...grow, toValue: 0 })
        ])
    // Going on: first it shrinks into a card, behind the page sliding in over it…
    const shrink = { ...native, duration: 100, easing: Easing.out(Easing.quad) }
    const intoCard = Animated.parallel([
      Animated.timing(leaveScale, { ...shrink, toValue: 0.7 }),
      Animated.timing(leaveTilt, { ...shrink, toValue: 3 })
    ])
    // …then over it, down and left into the tab button, shrinking and tilting as it goes, onto the front of the stack.
    const intoDeck = Animated.parallel([
      Animated.timing(leaveX, { ...fly, toValue: spot.x }),
      Animated.timing(leaveY, { ...fly, toValue: spot.y, easing: Easing.bezier(0.5, 0, 0.3, 1) }),
      Animated.timing(leaveScale, { ...fly, toValue: spot.scale, easing: Easing.out(Easing.cubic) }),
      Animated.timing(leaveTilt, { ...fly, toValue: DECK_TILT })
    ])
    const go = flight.forward
      ? {
          start: (done: () => void) =>
            intoCard.start(() => {
              setOnTop(true)
              intoDeck.start(done)
            })
        }
      : Animated.parallel([
          // Shrinking away towards the top right and fading, behind the tab coming out of the deck.
          Animated.timing(leaveX, { ...away, toValue: width * 0.3 }),
          Animated.timing(leaveY, { ...away, toValue: -height * 0.28 }),
          Animated.timing(leaveScale, { ...away, toValue: 0.45 }),
          Animated.timing(leaveShown, { ...away, toValue: 0 })
        ])
    // Done once both have finished.
    let waiting = 2
    const one = () => {
      if (--waiting) return
      setFlight(null)
      setOnTop(false)
      setSwiping(false)
      busy.current = false
    }
    come.start(one)
    go.start(one)
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
    const lift = x.interpolate({ inputRange: [-width, 0, width], outputRange: [1 + LIFT, 1, 1 + LIFT], extrapolate: 'clamp' })
    const degrees = (value: Animated.Value) => value.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] })
    return {
      page: {
        transform: [
          { translateX: Animated.add(Animated.multiply(x, -DRIFT), enterX) },
          { translateY: enterY },
          { rotate: degrees(enterTilt) },
          { scale: Animated.multiply(lift, enterScale) }
        ]
      },
      // The next tab, sliding in from the right with your finger (only while swiping left).
      incoming: {
        transform: [{ translateX: x.interpolate({ inputRange: [-width, 0], outputRange: [0, width], extrapolate: 'clamp' }) }]
      },
      leaving: {
        opacity: leaveShown,
        transform: [{ translateX: leaveX }, { translateY: leaveY }, { rotate: degrees(leaveTilt) }, { scale: leaveScale }]
      }
    }
  }, [x, enterX, enterY, enterScale, enterTilt, leaveX, leaveY, leaveScale, leaveTilt, leaveShown, width])

  const card = (tab: Tab, style: object) => (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.card, style]}>
      <TabPicture tab={tab} letterSize={72} style={StyleSheet.absoluteFill} />
    </Animated.View>
  )

  return {
    handlers: pan.panHandlers as GestureResponderHandlers,
    pageStyle: motion.page,
    swiping,
    /** A switch is under way: the tab button's front card is in the air, so the button doesn't show it. */
    flying: !!flight,
    /** Over the page while you drag left: the next tab coming in. */
    incoming: swiping && !flight && options.next ? card(options.next, motion.incoming) : null,
    /** The page you left flying into the tab button: over everything, the bar included. */
    leavingOver: flight?.forward && onTop ? card(flight.from, motion.leaving) : null,
    /** The page you left shrinking into a card, or shrinking away: under the page coming in. */
    leavingUnder: flight && !onTop ? card(flight.from, motion.leaving) : null
  }
}

const styles = StyleSheet.create({
  card: { borderRadius: SWIPE_RADIUS, overflow: 'hidden', backgroundColor: '#24242c' }
})
