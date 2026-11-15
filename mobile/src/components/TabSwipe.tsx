import * as Haptics from 'expo-haptics'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, PanResponder, StyleSheet, type GestureResponderHandlers } from 'react-native'
import type { Tab } from '../useTabs'
import type { Rect } from './Hero'
import { TabPicture } from './TabPicture'

/** How far (points) or how fast a swipe has to go to change tabs. */
const SWIPE = 60
const FLICK = 0.5
/** The corners pages take once they're moving, like cards. */
export const SWIPE_RADIUS = 44
/** The tab button's front card (BottomBar's stack): its tilt and width, which cards fly into and out of. */
const DECK_TILT = 10
const DECK_WIDTH = 27

interface Options {
  width: number
  height: number
  /**
   * The strip along the bottom of the screen where iOS's own swipe (between apps, along the home
   * indicator) starts. A swipe starting there is left to iOS, so the two don't fight.
   */
  bottomInset: number
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
  /** On to the next tab (swiped right), or back to the one before (swiped left). */
  forward: boolean
}

/**
 * Swiping along the bar to change tabs, as Arc Search does it (measured frame by frame from a
 * recording of it). The tab button is a deck: its front card is the tab you were on last.
 *
 * While you drag, the page follows your finger, full size, over the dark behind it.
 *
 * Swiped right, on to the next tab: the page carries on a little and lifts towards you while the
 * next one slides in from the right over it; then the page you left, now a card, comes over the
 * top and flies down into the tab button, tilting as it goes, to land as its front card. The
 * button keeps its old front card until it lands.
 *
 * Swiped left, back a tab: the page lifts a little, then shrinks away towards the top right and
 * fades, while the tab comes out of the deck: a small tilted card at the tab button that
 * straightens as it grows to fill the screen.
 *
 * Not far enough and the page springs back; past the last tab it only gives a little.
 */
export const useTabSwipe = (options: Options) => {
  /** Where your finger has taken the page (points). */
  const x = useRef(new Animated.Value(0)).current
  // How the new page comes in: from the right, or out of the deck.
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

  /** Your finger is on the bar, or a switch is under way: the page has the corners of a card. */
  const [moving, setMoving] = useState(false)
  const [flight, setFlight] = useState<Flight | null>(null)
  /** Going on a tab, the page you left lifts behind the new one first, then comes over it to fly into the deck. */
  const [onTop, setOnTop] = useState(false)
  /** Mid-switch: the next touch waits until the new page is in place. */
  const busy = useRef(false)
  const lastDx = useRef(0)
  const deck = useRef<Rect | null>(null)

  const latest = useRef(options)
  latest.current = options

  /** The tab button's front card: where it is from the screen's middle, and how small a page is there. */
  const deckSpot = () => {
    const { width, height } = latest.current
    const d = deck.current ?? { x: 26, y: height - 66, width: 27, height: 33 }
    return { x: d.x + d.width / 2 - width / 2, y: d.y + d.height / 2 - height / 2, scale: DECK_WIDTH / width }
  }

  const finish = (dx: number, vx: number) => {
    const { prev, next, current } = latest.current
    const towardNext = dx > SWIPE || vx > FLICK
    const towardPrev = dx < -SWIPE || vx < -FLICK
    const target = towardNext ? next : towardPrev ? prev : undefined
    if (!target) {
      // Not far enough, or nothing that way (a soft tap for trying): back it comes.
      if (towardNext || towardPrev) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
      Animated.spring(x, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 3 }).start(() => setMoving(false))
      return
    }
    busy.current = true
    Haptics.selectionAsync()
    // The picture of this page takes its place, exactly where it is now, before it goes.
    leaveX.setValue(dx)
    leaveY.setValue(0)
    leaveScale.setValue(1)
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
      // In from the right edge, full size.
      enterX.setValue(width)
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
    let come: Animated.CompositeAnimation
    let go: { start: (done: () => void) => void }
    if (flight.forward) {
      come = Animated.timing(enterX, { ...native, toValue: 0, duration: 240, easing: Easing.out(Easing.cubic) })
      // It carries on a little and lifts, behind the page sliding in over it…
      const lift = { ...native, duration: 110, easing: Easing.out(Easing.quad) }
      const lifting = Animated.parallel([
        Animated.timing(leaveX, { ...lift, toValue: dx + width * 0.12 }),
        Animated.timing(leaveScale, { ...lift, toValue: 1.2 })
      ])
      // …then over the top, down and left into the tab button, shrinking and tilting, onto the front of the stack.
      const fly = { ...native, duration: 230, easing: Easing.bezier(0.3, 0.1, 0.25, 1) }
      const flying = Animated.parallel([
        Animated.timing(leaveX, { ...fly, toValue: spot.x }),
        Animated.timing(leaveY, { ...fly, toValue: spot.y, easing: Easing.bezier(0.5, 0, 0.3, 1) }),
        Animated.timing(leaveScale, { ...fly, toValue: spot.scale, easing: Easing.out(Easing.cubic) }),
        Animated.timing(leaveTilt, { ...fly, toValue: DECK_TILT })
      ])
      go = {
        start: done =>
          lifting.start(() => {
            setOnTop(true)
            flying.start(() => done())
          })
      }
    } else {
      // Out of the deck once the page you left has started to go, growing to fill the screen.
      const grow = { ...native, duration: 210, delay: 110, easing: Easing.out(Easing.cubic) }
      come = Animated.parallel([
        Animated.timing(enterX, { ...grow, toValue: 0 }),
        Animated.timing(enterY, { ...grow, toValue: 0 }),
        Animated.timing(enterScale, { ...grow, toValue: 1 }),
        Animated.timing(enterTilt, { ...grow, toValue: 0 })
      ])
      // It lifts a little, then shrinks away towards the top right and fades.
      const away = { ...native, duration: 190, easing: Easing.in(Easing.quad) }
      const leaving = Animated.sequence([
        Animated.timing(leaveScale, { ...native, toValue: 1.12, duration: 80, easing: Easing.out(Easing.quad) }),
        Animated.parallel([
          Animated.timing(leaveX, { ...away, toValue: width * 0.3 }),
          Animated.timing(leaveY, { ...away, toValue: -height * 0.3 }),
          Animated.timing(leaveScale, { ...away, toValue: 0.45 }),
          Animated.timing(leaveShown, { ...away, toValue: 0 })
        ])
      ])
      go = { start: done => leaving.start(() => done()) }
    }

    // Done once both have finished.
    let waiting = 2
    const one = () => {
      if (--waiting) return
      setFlight(null)
      setOnTop(false)
      setMoving(false)
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
      // Not from the strip along the very bottom, where iOS switches apps.
      onMoveShouldSetPanResponderCapture: (_, g) =>
        !busy.current &&
        g.y0 < latest.current.height - latest.current.bottomInset &&
        Math.abs(g.dx) > 10 &&
        Math.abs(g.dx) >= Math.abs(g.dy) * 0.7,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        latest.current.onStart()
        latest.current.measureDeck().then(rect => {
          deck.current = rect
        })
        lastDx.current = 0
        setMoving(true)
      },
      onPanResponderMove: (_, g) => {
        const { prev, next } = latest.current
        // Nothing that way: it gives a little, but only a little.
        const end = (g.dx > 0 && !next) || (g.dx < 0 && !prev)
        lastDx.current = end ? g.dx * 0.25 : g.dx
        x.setValue(lastDx.current)
      },
      onPanResponderRelease: (_, g) => finish(lastDx.current, g.vx),
      onPanResponderTerminate: () => finish(0, 0)
    })
  ).current

  // Built once per screen width: rebuilt on every render they'd be unhooked and hooked up again natively.
  const motion = useMemo(() => {
    const degrees = (value: Animated.Value) => value.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] })
    return {
      page: {
        transform: [
          { translateX: Animated.add(x, enterX) },
          { translateY: enterY },
          { rotate: degrees(enterTilt) },
          { scale: enterScale }
        ]
      },
      leaving: {
        opacity: leaveShown,
        transform: [{ translateX: leaveX }, { translateY: leaveY }, { rotate: degrees(leaveTilt) }, { scale: leaveScale }]
      }
    }
  }, [x, enterX, enterY, enterScale, enterTilt, leaveX, leaveY, leaveScale, leaveTilt, leaveShown])

  const card = (tab: Tab) => (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.card, motion.leaving]}>
      <TabPicture tab={tab} letterSize={72} style={StyleSheet.absoluteFill} />
    </Animated.View>
  )

  return {
    handlers: pan.panHandlers as GestureResponderHandlers,
    pageStyle: motion.page,
    /** The page has the corners of a card (your finger is on the bar, or a switch is under way). */
    moving,
    /** Going on a tab: the page you left is in the air, so the tab button keeps its old front card until it lands. */
    landing: !!flight?.forward,
    /** The page you left flying into the tab button: over everything, the bar included. */
    leavingOver: flight?.forward && onTop ? card(flight.from) : null,
    /** The page you left lifting, or shrinking away: under the page coming in. */
    leavingUnder: flight && !onTop ? card(flight.from) : null
  }
}

const styles = StyleSheet.create({
  card: { borderRadius: SWIPE_RADIUS, overflow: 'hidden', backgroundColor: '#24242c' }
})
