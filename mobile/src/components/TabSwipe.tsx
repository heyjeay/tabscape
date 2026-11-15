import * as Haptics from 'expo-haptics'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, PanResponder, StyleSheet, type GestureResponderHandlers } from 'react-native'
import type { Tab } from '../useTabs'
import type { Rect } from './Hero'
import { TabPicture } from './TabPicture'

/** How far (points) or how fast a swipe has to go to change tabs. */
const SWIPE = 60
const FLICK = 0.5
/** The gap between pages side by side (points). */
const GAP = 14
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
  /** Swiping left goes on to the next tab along… */
  next?: Tab
  /** …and swiping right back to the tab before (the tab button's front card). */
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
  /** On to the next tab (swiped left), or back to the one before (swiped right). */
  forward: boolean
}

/**
 * How the tab button should look: as usual; kept as it was (the page you left is still flying
 * into it); just landed on (it shows the new cards, and the one that landed is already in place);
 * or with its front card gone (that tab is out of it, beside the page).
 */
export type DeckState = 'live' | 'frozen' | 'landed' | 'lifted'

type Node = Animated.AnimatedNode

/** The animated parts of a card. */
interface CardMotion {
  x: Node
  y: Node
  /** Its tilt, as a rotation ("10deg"). */
  rotate: Node
  scale: Node
  /** How far it's squeezed towards the button card's shape (1 is a page's own shape). */
  squeeze: Node
  shown: Node
}

const newValues = () => ({
  x: new Animated.Value(0),
  y: new Animated.Value(0),
  scale: new Animated.Value(1),
  tilt: new Animated.Value(0),
  squeeze: new Animated.Value(1),
  shown: new Animated.Value(1)
})
type CardValues = ReturnType<typeof newValues>

const place = (v: CardValues, to: Partial<Record<keyof CardValues, number>>) =>
  (Object.keys(to) as (keyof CardValues)[]).forEach(key => v[key].setValue(to[key]!))

/**
 * Swiping along the bar to change tabs, as Arc Search does it (measured frame by frame from
 * recordings of it). The tab button is a deck of the tabs before this one.
 *
 * Drag right and the page follows your finger while the tab before comes out of the tab button:
 * its card grows out of the button, straightening, into a full page beside this one, and
 * follows along with it. Let go far enough and it slides in to fill the screen while this page
 * goes off to the right; not far enough and it shrinks back down into the button.
 *
 * Drag left and the next tab comes in from the right, beside the page. Let go far enough and it
 * fills the screen while the page you left becomes a card that flies down into the tab button,
 * tilting and narrowing to the button card's shape, to land on its front; not far enough and it
 * slides back out.
 *
 * With nothing that way the page only gives a little.
 */
export const useTabSwipe = (options: Options) => {
  const { width, height } = options
  /** Where your finger has taken the page (points). */
  const x = useRef(new Animated.Value(0)).current
  /** The new page coming in, from where it was beside this one. */
  const enterX = useRef(new Animated.Value(0)).current
  /** The tab before, out of the tab button: 0 in it, 1 beside the page. */
  const emerge = useRef(new Animated.Value(0)).current
  /** Where the tab button's front card is (from the screen's middle). */
  const deckX = useRef(new Animated.Value(0)).current
  const deckY = useRef(new Animated.Value(0)).current
  /** Fixed parts of cards that don't move that way. */
  const zero = useRef(new Animated.Value(0)).current
  const one = useRef(new Animated.Value(1)).current
  /** The picture of the page you left, going. */
  const leaving = useRef(newValues()).current

  /** Your finger is on the bar, or a switch is under way: the page has the corners of a card. */
  const [moving, setMoving] = useState(false)
  /** The tab before is out of the tab button (beside the page, or on its way out or back). */
  const [backOut, setBackOut] = useState(false)
  const [flight, setFlight] = useState<Flight | null>(null)
  /** Going on: the page you left lifts behind the new one first, then comes over it to fly into the deck. */
  const [onTop, setOnTop] = useState(false)
  /** Going on: it has landed on the button, which can show its new cards while it fades into them. */
  const [landed, setLanded] = useState(false)
  /** Mid-switch: the next touch waits until the new page is in place. */
  const busy = useRef(false)
  const lastDx = useRef(0)
  const lastTouch = useRef(0)
  /** Whether the tab before should be out (the drag is going right). */
  const wantBack = useRef(false)
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

  /** The tab before comes out of the tab button, or goes back into it. */
  const bringBack = (out: boolean) => {
    if (wantBack.current === out) return
    wantBack.current = out
    if (out) {
      const spot = deckSpot()
      deckX.setValue(spot.x)
      deckY.setValue(spot.y)
      emerge.setValue(0)
      setBackOut(true)
      Animated.spring(emerge, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 3 }).start()
    } else {
      Animated.timing(emerge, { toValue: 0, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
        if (finished && !wantBack.current) setBackOut(false)
      })
    }
  }

  const finish = (dx: number, vx: number) => {
    const { back, next, current } = latest.current
    const towardNext = dx < -SWIPE || vx < -FLICK
    const towardBack = dx > SWIPE || vx > FLICK
    const target = towardNext ? next : towardBack ? back : undefined
    if (!target) {
      // Not far enough, or nothing that way (a soft tap for trying): back it all comes, and the
      // tab before goes back into the button.
      if (towardNext || towardBack) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
      bringBack(false)
      Animated.spring(x, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 3 }).start(() => {
        if (!wantBack.current) setMoving(false)
      })
      return
    }
    busy.current = true
    Haptics.selectionAsync()
    // The picture of this page takes its place, exactly where it is now, before it goes.
    place(leaving, { x: dx, y: 0, scale: 1, tilt: 0, squeeze: 1, shown: 1 })
    setOnTop(false)
    setLanded(false)
    // Going back, the tab before's live page takes over from its card as it slides in.
    if (!towardNext) {
      wantBack.current = false
      setBackOut(false)
    }
    setFlight({ from: current, to: target, forward: towardNext })
  }

  // The leaving picture is up: switch tabs, put the new page where it was beside this one, and run it all.
  useLayoutEffect(() => {
    if (!flight) return
    const { width, onSwitch } = latest.current
    const spot = deckSpot()
    const dx = lastDx.current
    const timing = (value: Animated.Value, toValue: number, config: Partial<Animated.TimingAnimationConfig>) =>
      Animated.timing(value, { useNativeDriver: true, toValue, ...config })
    const slide = { duration: 260, easing: Easing.out(Easing.cubic) }

    x.setValue(0)
    let run: (done: () => void) => void
    if (flight.forward) {
      // The next page, from beside this one on the right, slides in to fill the screen…
      enterX.setValue(dx + width + GAP)
      onSwitch(flight.to)
      const slideIn = timing(enterX, 0, slide)
      // …while the page you left shrinks a little into a card behind it…
      const lift = { duration: 100, easing: Easing.out(Easing.quad) }
      const lifting = Animated.parallel([timing(leaving.x, dx - width * 0.06, lift), timing(leaving.scale, 0.8, lift)])
      // …then comes over the top, down and left into the tab button, shrinking, tilting and
      // narrowing to the button card's shape, to land on its front card…
      const fly = { duration: 240, easing: Easing.bezier(0.3, 0.1, 0.25, 1) }
      const flying = Animated.parallel([
        timing(leaving.x, spot.x, fly),
        timing(leaving.y, spot.y, { ...fly, easing: Easing.bezier(0.5, 0, 0.3, 1) }),
        timing(leaving.scale, spot.scale, { ...fly, easing: Easing.out(Easing.cubic) }),
        timing(leaving.tilt, DECK_TILT, fly),
        timing(leaving.squeeze, spot.squeeze, { duration: 140, delay: 100, easing: Easing.inOut(Easing.quad) })
      ])
      // …where it fades into the card the button now shows (the same picture, in the same place).
      const settling = timing(leaving.shown, 0, { duration: 90 })
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
      // The tab before, out of the button beside this page, slides in to fill the screen (its
      // live page taking over from its card, in the same place)…
      enterX.setValue(dx - width - GAP)
      onSwitch(flight.to)
      // …while the page you left slides off to the right.
      const both = Animated.parallel([timing(enterX, 0, slide), timing(leaving.x, width + GAP, slide)])
      run = done => both.start(() => done())
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
        const end = (g.dx > 0 && !back) || (g.dx < 0 && !next)
        lastDx.current = end ? g.dx * 0.25 : g.dx
        x.setValue(lastDx.current)
        // Going right, the tab before comes out of the button; back the other way, it goes back in.
        if (back && g.dx > 4) bringBack(true)
        else if (g.dx < -4) bringBack(false)
      },
      onPanResponderRelease: (_, g) => finish(lastDx.current, g.vx),
      onPanResponderTerminate: () => finish(0, 0)
    })
  ).current

  // Built once per screen size: rebuilt on every render they'd be unhooked and hooked up again natively.
  const motion = useMemo(() => {
    const deckScale = DECK_WIDTH / width
    const away = Animated.subtract(1, emerge)
    const back: CardMotion = {
      // Between the tab button's front card (emerge 0) and beside the page on its left (1).
      x: Animated.add(Animated.multiply(emerge, Animated.add(x, -(width + GAP))), Animated.multiply(away, deckX)),
      y: Animated.multiply(away, deckY),
      rotate: emerge.interpolate({ inputRange: [0, 1], outputRange: [`${DECK_TILT}deg`, '0deg'] }),
      scale: emerge.interpolate({ inputRange: [0, 1], outputRange: [deckScale, 1] }),
      squeeze: emerge.interpolate({ inputRange: [0, 1], outputRange: [DECK_HEIGHT / (height * deckScale), 1] }),
      shown: one
    }
    const next: CardMotion = {
      // Beside the page on its right.
      x: Animated.add(x, width + GAP),
      y: zero,
      rotate: zero.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1deg'] }),
      scale: one,
      squeeze: one,
      shown: one
    }
    const going: CardMotion = {
      x: leaving.x,
      y: leaving.y,
      rotate: leaving.tilt.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] }),
      scale: leaving.scale,
      squeeze: leaving.squeeze,
      shown: leaving.shown
    }
    return { page: { transform: [{ translateX: Animated.add(x, enterX) }] }, back, next, going }
  }, [x, enterX, emerge, deckX, deckY, zero, one, leaving, width, height])

  let under = null
  let over = null
  if (flight?.forward) {
    const card = <FlyingCard tab={flight.from} motion={motion.going} />
    if (onTop) over = card
    else under = card
  } else if (flight) {
    under = <FlyingCard tab={flight.from} motion={motion.going} />
  }

  // Beside the page while you drag (over it, under the bar).
  const { back, next } = options
  const beside = !flight && moving ? (
    <>
      {backOut && back && <FlyingCard tab={back} motion={motion.back} />}
      {next && <FlyingCard tab={next} motion={motion.next} />}
    </>
  ) : null

  const deckState: DeckState = flight
    ? (flight.forward ? (landed ? 'landed' : 'frozen') : 'lifted')
    : backOut ? 'lifted' : 'live'

  return {
    handlers: pan.panHandlers as GestureResponderHandlers,
    pageStyle: motion.page,
    /** The page has the corners of a card (your finger is on the bar, or a switch is under way). */
    moving,
    /** How the tab button should look right now. */
    deck: deckState,
    /** Cards in the air over everything, the bar included: the page you left, flying into the tab button. */
    over,
    /** Cards under the page coming in: the page you left lifting, or going off to the right. */
    under,
    /** The tabs either side, beside the page while you drag (over it, under the bar). */
    beside
  }
}

/**
 * A page's picture as a card. It can narrow to the tab button card's shape while keeping the
 * picture's own proportions: the outside is squeezed and the picture inside is stretched back by
 * as much, so it's cropped (as the button's card is), not squashed.
 */
const FlyingCard = ({ tab, motion }: { tab: Tab; motion: CardMotion }) => {
  const style = useMemo(() => ({
    opacity: motion.shown,
    transform: [
      { translateX: motion.x },
      { translateY: motion.y },
      { rotate: motion.rotate },
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
