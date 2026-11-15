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
/** The tab button's front card (BottomBar's stack): its tilt and size, which cards fly into and out of. */
const DECK_TILT = 10
const DECK_WIDTH = 27
const DECK_HEIGHT = 33

interface Options {
  width: number
  height: number
  /**
   * The strip along the bottom of the screen where iOS's own swipe (between apps, along the home
   * indicator) starts. A swipe starting there is left to iOS, so the two don't fight.
   */
  bottomInset: number
  /** The tab showing. */
  current: Tab
  /** Swiping right goes on to the next tab along… */
  next?: Tab
  /** …and swiping left goes back to the tab in the tab button (the tab before this one). */
  back?: Tab
  /** Where the tab button's front card is, on screen. */
  measureDeck: () => Promise<Rect | null>
  /** A finger touched the bar (at most once a second, as taps on its buttons count too): the moment to take a picture of the page, so it's ready if a swipe follows. */
  onTouch: () => void
  /** A swipe began. */
  onStart: () => void
  /** Swiped far enough: show this tab. */
  onSwitch: (tab: Tab) => void
}

/** A switch under way. */
interface Flight {
  from: Tab
  to: Tab
  /** On to the next tab (swiped right), or back to the tab in the button (swiped left). */
  forward: boolean
}

/**
 * How the tab button should look during a switch: as usual; kept as it was (the page you left is
 * still flying into it); just landed on (it shows the new cards, and the one that landed is
 * already in place); or kept with its front card gone (that tab is coming out of it).
 */
export type DeckState = 'live' | 'frozen' | 'landed' | 'lifted'

interface CardMotion {
  x: Animated.Value
  y: Animated.Value
  scale: Animated.Value
  tilt: Animated.Value
  /** How far it's squeezed towards the button card's shape (1 is a page's own shape). */
  squeeze: Animated.Value
  shown: Animated.Value
}

/** The values moving one card in the air. */
const useCardMotion = (): CardMotion => {
  const ref = useRef<CardMotion | null>(null)
  ref.current ??= {
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    scale: new Animated.Value(1),
    tilt: new Animated.Value(0),
    squeeze: new Animated.Value(1),
    shown: new Animated.Value(1)
  }
  return ref.current
}

const place = (card: CardMotion, to: Record<keyof CardMotion, number>) =>
  (Object.keys(to) as (keyof CardMotion)[]).forEach(key => card[key].setValue(to[key]))

/**
 * Swiping along the bar to change tabs, as Arc Search does it (measured frame by frame from a
 * recording of it). The tab button is a deck: its front card is the tab before this one, and behind it the one before that.
 *
 * While you drag, the page follows your finger, full size, over the dark behind it.
 *
 * Swiped right, on to the next tab: the page carries on a little and lifts towards you while the
 * next one slides in from the right over it; then the page you left, now a card, comes over the
 * top and flies down into the tab button, tilting as it goes and narrowing to the button card's
 * shape, to land exactly on its front card. Meanwhile the button keeps its old cards; once it
 * lands, the old front card slides round to the back.
 *
 * Swiped left, back to the tab in the button: its front card lifts off and grows out of the
 * button, straightening as it fills the screen, while the page you left lifts a little, then
 * shrinks away towards the top right and fades. Then the page you left takes the front of the
 * button.
 *
 * Not far enough and the page springs back; with nothing that way it only gives a little.
 */
export const useTabSwipe = (options: Options) => {
  /** Where your finger has taken the page (points). */
  const x = useRef(new Animated.Value(0)).current
  /** The next tab's page sliding in from the right. */
  const enterX = useRef(new Animated.Value(0)).current
  /** The page is hidden while a card coming out of the deck stands in for it. */
  const pageShown = useRef(new Animated.Value(1)).current
  /** The card in the air: the page you left going into the deck, or the tab coming out of it. */
  const card = useCardMotion()
  /** Going back: the page you left, shrinking away. */
  const old = useCardMotion()

  /** Your finger is on the bar, or a switch is under way: the page has the corners of a card. */
  const [moving, setMoving] = useState(false)
  const [flight, setFlight] = useState<Flight | null>(null)
  /** Going on: the page you left lifts behind the new one first, then comes over it to fly into the deck. */
  const [onTop, setOnTop] = useState(false)
  /** Going on: it has landed on the button, which can show its new cards while it fades into them. */
  const [landed, setLanded] = useState(false)
  /** Mid-switch: the next touch waits until the new page is in place. */
  const busy = useRef(false)
  const lastDx = useRef(0)
  const lastTouch = useRef(0)
  const deck = useRef<Rect | null>(null)

  const latest = useRef(options)
  latest.current = options

  /** The tab button's front card, as a card's place: from the screen's middle, how small, and how squeezed. */
  const deckSpot = () => {
    const { width, height } = latest.current
    const d = deck.current ?? { x: 26, y: height - 66, width: DECK_WIDTH, height: DECK_HEIGHT }
    const scale = DECK_WIDTH / width
    return {
      x: d.x + d.width / 2 - width / 2,
      y: d.y + d.height / 2 - height / 2,
      scale,
      // A page is much taller for its width than the button card: squeezed to its shape (and cropped, not squashed).
      squeeze: DECK_HEIGHT / (height * scale)
    }
  }

  const finish = (dx: number, vx: number) => {
    const { back, next, current } = latest.current
    const towardNext = dx > SWIPE || vx > FLICK
    const towardBack = dx < -SWIPE || vx < -FLICK
    const target = towardNext ? next : towardBack ? back : undefined
    if (!target) {
      // Not far enough, or nothing that way (a soft tap for trying): back it comes.
      if (towardNext || towardBack) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
      Animated.spring(x, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 3 }).start(() => setMoving(false))
      return
    }
    busy.current = true
    Haptics.selectionAsync()
    const forward = towardNext
    if (forward) {
      // The picture of this page takes its place, exactly where it is now, before it goes.
      place(card, { x: dx, y: 0, scale: 1, tilt: 0, squeeze: 1, shown: 1 })
    } else {
      // The tab button's front card, ready to come out of it; and this page's picture, ready to go.
      const spot = deckSpot()
      place(card, { x: spot.x, y: spot.y, scale: spot.scale, tilt: DECK_TILT, squeeze: spot.squeeze, shown: 1 })
      place(old, { x: dx, y: 0, scale: 1, tilt: 0, squeeze: 1, shown: 1 })
    }
    setOnTop(!forward)
    setLanded(false)
    setFlight({ from: current, to: target, forward })
  }

  // The cards are up: switch tabs, put the new page where it comes in from, and run it all.
  useLayoutEffect(() => {
    if (!flight) return
    const { width, height, onSwitch } = latest.current
    const spot = deckSpot()
    const dx = lastDx.current
    const timing = (value: Animated.Value, toValue: number, config: Partial<Animated.TimingAnimationConfig>) =>
      Animated.timing(value, { useNativeDriver: true, toValue, ...config })

    x.setValue(0)
    let run: (done: () => void) => void
    if (flight.forward) {
      // The next page, in from the right edge, full size.
      enterX.setValue(width)
      pageShown.setValue(1)
      onSwitch(flight.to)
      const slideIn = timing(enterX, 0, { duration: 240, easing: Easing.out(Easing.cubic) })
      // The page you left carries on a little and lifts, behind the page sliding in over it…
      const lift = { duration: 110, easing: Easing.out(Easing.quad) }
      const lifting = Animated.parallel([timing(card.x, dx + width * 0.12, lift), timing(card.scale, 1.2, lift)])
      // …then over the top, down and left into the tab button, shrinking, tilting and narrowing
      // to the button card's shape on the way, to land exactly on its front card…
      const fly = { duration: 240, easing: Easing.bezier(0.3, 0.1, 0.25, 1) }
      const flying = Animated.parallel([
        timing(card.x, spot.x, fly),
        timing(card.y, spot.y, { ...fly, easing: Easing.bezier(0.5, 0, 0.3, 1) }),
        timing(card.scale, spot.scale, { ...fly, easing: Easing.out(Easing.cubic) }),
        timing(card.tilt, DECK_TILT, fly),
        timing(card.squeeze, spot.squeeze, { duration: 140, delay: 100, easing: Easing.inOut(Easing.quad) })
      ])
      // …where it fades into the card the button now shows (the same picture, in the same place).
      const settling = timing(card.shown, 0, { duration: 90 })
      run = done => {
        let waiting = 2
        const one = () => {
          if (--waiting === 0) done()
        }
        slideIn.start(one)
        lifting.start(() => {
          setOnTop(true)
          flying.start(() => {
            setLanded(true)
            settling.start(one)
          })
        })
      }
    } else {
      // The tab's page waits, hidden, at full size, while its card grows out of the button over everything.
      enterX.setValue(0)
      pageShown.setValue(0)
      onSwitch(flight.to)
      const grow = { duration: 270, delay: 50, easing: Easing.out(Easing.cubic) }
      const growing = Animated.parallel([
        timing(card.x, 0, grow),
        timing(card.y, 0, grow),
        timing(card.scale, 1, grow),
        timing(card.tilt, 0, grow),
        // Back to the page's own shape early on, so it grows as a page.
        timing(card.squeeze, 1, { duration: 150, delay: 50, easing: Easing.out(Easing.quad) })
      ])
      // The page you left lifts a little, then shrinks away towards the top right and fades.
      const away = { duration: 190, easing: Easing.in(Easing.quad) }
      const leaving = Animated.sequence([
        timing(old.scale, 1.12, { duration: 80, easing: Easing.out(Easing.quad) }),
        Animated.parallel([
          timing(old.x, width * 0.3, away),
          timing(old.y, -height * 0.3, away),
          timing(old.scale, 0.45, away),
          timing(old.shown, 0, away)
        ])
      ])
      run = done => {
        let waiting = 2
        const one = () => {
          if (--waiting) return
          // The card is the page now, in place: show the live page under it, then let the card go.
          pageShown.setValue(1)
          done()
        }
        growing.start(one)
        leaving.start(one)
      }
    }

    run(() => {
      setFlight(null)
      setOnTop(false)
      setLanded(false)
      setMoving(false)
      busy.current = false
    })
    // Once per switch: the animated values never change, and the rest is read as it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight])

  const pan = useRef(
    PanResponder.create({
      // Every touch on the bar (without taking it): take the page's picture now, so it's ready if
      // this turns into a swipe, and find the tab button.
      onStartShouldSetPanResponderCapture: event => {
        const at = event.nativeEvent.timestamp
        if (!busy.current && at - lastTouch.current > 1000) {
          lastTouch.current = at
          latest.current.onTouch()
          latest.current.measureDeck().then(rect => {
            deck.current = rect
          })
        }
        return false
      },
      // Mostly sideways, so taps on the bar's buttons still work. A thumb swipes in an arc, so a
      // fair bit of up or down is fine. Not from the strip along the very bottom, where iOS switches apps.
      onMoveShouldSetPanResponderCapture: (_, g) =>
        !busy.current &&
        g.y0 < latest.current.height - latest.current.bottomInset &&
        Math.abs(g.dx) > 10 &&
        Math.abs(g.dx) >= Math.abs(g.dy) * 0.7,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        latest.current.onStart()
        lastDx.current = 0
        setMoving(true)
      },
      onPanResponderMove: (_, g) => {
        const { back, next } = latest.current
        // Nothing that way: it gives a little, but only a little.
        const end = (g.dx > 0 && !next) || (g.dx < 0 && !back)
        lastDx.current = end ? g.dx * 0.25 : g.dx
        x.setValue(lastDx.current)
      },
      onPanResponderRelease: (_, g) => finish(lastDx.current, g.vx),
      onPanResponderTerminate: () => finish(0, 0)
    })
  ).current

  // Built once: rebuilt on every render they'd be unhooked and hooked up again natively.
  const pageStyle = useMemo(() => ({
    opacity: pageShown,
    transform: [{ translateX: Animated.add(x, enterX) }]
  }), [x, enterX, pageShown])

  let under = null
  let over = null
  if (flight?.forward) {
    const leaving = <FlyingCard tab={flight.from} motion={card} />
    if (onTop) over = leaving
    else under = leaving
  } else if (flight) {
    under = <FlyingCard tab={flight.from} motion={old} />
    over = <FlyingCard tab={flight.to} motion={card} />
  }

  const deckState: DeckState = !flight ? 'live' : flight.forward ? (landed ? 'landed' : 'frozen') : 'lifted'

  return {
    handlers: pan.panHandlers as GestureResponderHandlers,
    pageStyle,
    /** The page has the corners of a card (your finger is on the bar, or a switch is under way). */
    moving,
    /** How the tab button should look right now. */
    deck: deckState,
    /** Cards in the air over everything, the bar included: into the tab button, or out of it. */
    over,
    /** Cards under the page coming in: the page you left lifting, or shrinking away. */
    under
  }
}

/**
 * A page's picture as a card in the air. It can narrow to the tab button card's shape while
 * keeping the picture's own proportions: the outside is squeezed and the picture inside is
 * stretched back by as much, so it's cropped (as the button's card is), not squashed.
 */
const FlyingCard = ({ tab, motion }: { tab: Tab; motion: CardMotion }) => {
  const style = useMemo(() => ({
    opacity: motion.shown,
    transform: [
      { translateX: motion.x },
      { translateY: motion.y },
      { rotate: motion.tilt.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] }) },
      { scale: motion.scale },
      { scaleY: motion.squeeze }
    ]
  }), [motion])
  const unsqueeze = useMemo(() => ({ transform: [{ scaleY: Animated.divide(1, motion.squeeze) }] }), [motion])
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.card, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, unsqueeze]}>
        <TabPicture tab={tab} letterSize={72} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: SWIPE_RADIUS, overflow: 'hidden', backgroundColor: '#24242c' }
})
