import { BlurView } from 'expo-blur'
import { GlassView } from 'expo-glass-effect'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useRef, type RefObject } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View, type GestureResponderHandlers } from 'react-native'
import { css, DEFAULT_ACCENT, mix, type Rgb } from '../lib/color'
import type { Tab } from '../useTabs'
import { Glass, liquidGlass } from './Glass'
import type { DeckState } from './TabSwipe'
import type { ViewRef } from './Hero'
import { Icon } from './Icon'
import { TabPicture } from './TabPicture'

interface Props {
  tab: Tab
  /**
   * The tab button is a deck, like Arc's: its front card is the tab you were on last (the one
   * you've just left), and behind it another. Without them it shows this tab.
   */
  front?: Tab
  behind?: Tab
  /** What a tab switch is doing to the tab button (see TabSwipe). */
  deck: DeckState
  tabCount: number
  progress: number
  loading: boolean
  bottomInset: number
  /** Moves the bar down out of sight while you scroll down a page, and back. */
  hide: Animated.Value
  /** The front tab card, so the tab browser can grow out of it (and shrink back into it). */
  stackRef: RefObject<ViewRef | null>
  onTabs: () => void
  onNewTab: () => void
  /** Holding +: the tab closed last comes back. */
  onReopen: () => void
  onMenu: () => void
  /** Swiping along the bar changes tabs (see TabSwipe): its touch handlers. */
  swipeHandlers: GestureResponderHandlers
  /** Your finger is on the bar, swiping between tabs: the bar grows taller, with a dot for each tab. */
  swiping: boolean
  /** This tab's place among the tabs you swipe through (from 0). */
  position: number
}

/** How much taller the bar grows while you swipe (points). */
const GROW = 30

/** Arc's sizes, measured from its bar (points): the row of buttons, and the space above it. */
const ROW = 46
const TOP = 10

/** Arc tucks the buttons down into the home indicator's area a little, rather than above all of it. */
const bottomPad = (bottomInset: number) => Math.max(bottomInset - 12, 10)

/** The bar's whole height, so the page can leave room for it. */
export const barSpace = (bottomInset: number) => TOP + ROW + bottomPad(bottomInset)

/** How far the bar moves to be out of sight. */
export const barTravel = barSpace

/**
 * Arc's bar: a dark grey panel along the bottom with a fine light line on top, and on it the
 * tab pictures on the left, a wide + in the middle, and ⌃ for everything you can do with the page.
 */
export const BottomBar = ({
  tab, front, behind, deck, tabCount, progress, loading, bottomInset, hide, stackRef, onTabs, onNewTab, onReopen, onMenu, swipeHandlers,
  swiping, position
}: Props) => {
  // A private tab's bar is a plain deep violet whatever the site, so you can tell at a glance.
  const accent = tab.private ? PRIVATE : (tab.accent ?? DEFAULT_ACCENT)
  // Growing taller: the panel behind the buttons is GROW taller than the bar and rises into view
  // (moved, not resized, so nothing else on screen shifts), with the dots fading in on it.
  const grow = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(grow, { toValue: swiping ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: swiping ? 6 : 0 }).start()
  }, [swiping, grow])
  const rise = useRef(grow.interpolate({ inputRange: [0, 1], outputRange: [GROW, 0] })).current
  return (
  <Animated.View
    {...swipeHandlers}
    style={[styles.bar, { paddingBottom: bottomPad(bottomInset), transform: [{ translateY: hide }] }]}
  >
    {/*
      The panel: iOS 26 Liquid Glass tinted with the site's colour, with that colour deepening
      towards the bottom, like Arc. Without Liquid Glass: frosted charcoal warming into the colour.
    */}
    <Animated.View style={[styles.panel, { transform: [{ translateY: rise }] }]} pointerEvents="none">
      {liquidGlass ? (
        <>
          <GlassView
            style={StyleSheet.absoluteFill}
            glassEffectStyle="regular"
            colorScheme="dark"
            tintColor={css(mix(CHARCOAL, accent, 0.3), 0.45)}
          />
          <LinearGradient
            colors={[css(accent, 0), css(accent, 0.1), css(accent, 0.28)]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : (
        <>
          <BlurView tint="systemChromeMaterialDark" intensity={90} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={[css(CHARCOAL, 0.92), css(mix(CHARCOAL, accent, 0.18), 0.95), css(mix(CHARCOAL, accent, 0.42), 0.97)]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
    </Animated.View>
    <Place position={position} count={tabCount} shown={grow} rise={rise} />

    {/* The loading line along the top edge: the site's colour running into blue, glowing a little. */}
    <ProgressLine progress={progress} loading={loading} accent={accent} />
    <View style={styles.row}>
      <Pressable onPress={onTabs} accessibilityLabel={`${tabCount} ${tab.private ? 'private ' : ''}tabs`} hitSlop={10} style={styles.side}>
        <TabStack tab={front ?? tab} behind={behind} deck={deck} frontRef={stackRef} />
        {tab.private && (
          <View style={styles.badge} pointerEvents="none">
            <Icon sf="eye.slash.fill" fallback="eye-off" size={10} weight="bold" />
          </View>
        )}
      </Pressable>

      <Pressable onPress={onNewTab} onLongPress={onReopen} delayLongPress={400} accessibilityLabel={tab.private ? 'New private tab' : 'New tab'} accessibilityHint="Hold to reopen the tab you closed last">
        <Glass style={styles.plus} interactive>
          <Icon sf="plus" fallback="add" size={20} weight="semibold" />
        </Glass>
      </Pressable>

      <View style={[styles.side, styles.right]}>
        <Pressable onPress={onMenu} accessibilityLabel="Page actions" hitSlop={10}>
          <Glass style={styles.circle} interactive>
            <Icon sf="chevron.up" fallback="chevron-up" size={15} weight="bold" />
          </Glass>
        </Pressable>
      </View>
    </View>
  </Animated.View>
  )
}

/** More dots than this would be too small to tell apart: then it says "3 of 14". */
const MAX_DOTS = 12

/** Where you are in the row of tabs, in the room the bar grows while you swipe: a dot for each tab. */
const Place = ({ position, count, shown, rise }: {
  position: number; count: number; shown: Animated.Value; rise: Animated.AnimatedInterpolation<number>
}) => (
  <Animated.View style={[styles.place, { opacity: shown, transform: [{ translateY: rise }] }]} pointerEvents="none">
    {count > MAX_DOTS ? (
      <Text style={styles.placeText}>{position + 1} of {count}</Text>
    ) : (
      Array.from({ length: count }, (_, i) => <View key={i} style={[styles.dot, i === position && styles.dotOn]} />)
    )}
  </Animated.View>
)

const CHARCOAL: Rgb = [44, 44, 48]
const PRIVATE: Rgb = [88, 64, 170]
const WHITE: Rgb = [255, 255, 255]
const SKY: Rgb = [64, 156, 255]

/**
 * The loading line. It glides to each new amount rather than jumping, never goes backwards
 * while a page loads, and when the page is done it runs to the end before fading away.
 * It's stretched rather than resized, so it all runs natively.
 */
const ProgressLine = ({ progress, loading, accent }: { progress: number; loading: boolean; accent: Rgb }) => {
  const fill = useRef(new Animated.Value(0)).current
  const shown = useRef(new Animated.Value(0)).current
  const going = useRef(false)
  const furthest = useRef(0)

  useEffect(() => {
    if (loading) {
      if (!going.current) {
        // A new load: start from the left, showing.
        going.current = true
        furthest.current = 0
        fill.stopAnimation()
        shown.stopAnimation()
        fill.setValue(0)
        shown.setValue(1)
      }
      // A little way along straight away, so it's seen to start. A full amount while still
      // loading is the last page's, left over; the end is run to once loading stops.
      const to = Math.max(furthest.current, progress >= 1 ? 0 : progress, 0.08)
      if (to === furthest.current) return
      furthest.current = to
      Animated.timing(fill, { toValue: to, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    } else if (going.current) {
      going.current = false
      Animated.sequence([
        Animated.timing(fill, { toValue: 1, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(shown, { toValue: 0, duration: 300, delay: 60, useNativeDriver: true })
      ]).start(({ finished }) => {
        if (finished) fill.setValue(0)
      })
    }
  }, [loading, progress, fill, shown])

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.progress, { shadowColor: css(accent), opacity: shown, transform: [{ scaleX: fill }] }]}
    >
      <LinearGradient
        colors={[css(mix(accent, WHITE, 0.15)), css(mix(accent, SKY, 0.65))]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  )
}

/**
 * A tab's picture, tilted, with another open tab's picture behind it when there is one, like Arc.
 * When the front card changes, the stack shuffles: the card that was in front slides round to
 * the back, and the new front card settles in (unless it has just flown in and is already there).
 * While a tab comes out of the deck, its front card is gone.
 */
const TabStack = ({ tab, behind, deck, frontRef }: {
  tab: Tab; behind?: Tab; deck: DeckState; frontRef: RefObject<ViewRef | null>
}) => {
  /** 0 → 1 as the stack shuffles after its front card changes; 1 when it's settled. */
  const shuffle = useRef(new Animated.Value(1)).current
  const was = useRef({ front: tab.id, behindMoves: false, popsIn: false })
  if (was.current.front !== tab.id) {
    was.current = { front: tab.id, behindMoves: behind?.id === was.current.front, popsIn: deck !== 'landed' }
    shuffle.setValue(0)
  }
  useEffect(() => {
    Animated.spring(shuffle, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 5 }).start()
  }, [tab.id, shuffle])
  const motion = useRef({
    behindX: shuffle.interpolate({ inputRange: [0, 1], outputRange: [4, -5] }),
    behindY: shuffle.interpolate({ inputRange: [0, 1], outputRange: [-1, 3] }),
    behindTilt: shuffle.interpolate({ inputRange: [0, 1], outputRange: ['10deg', '-14deg'] }),
    frontScale: shuffle.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] })
  }).current
  const { behindMoves, popsIn } = was.current
  return (
    <View style={styles.stack}>
      {behind && (
        <Animated.View
          style={[styles.card, styles.behindBox, behindMoves
            ? { transform: [{ translateX: motion.behindX }, { translateY: motion.behindY }, { rotate: motion.behindTilt }] }
            : styles.behind]}
        >
          <TabPicture tab={behind} letterSize={13} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      <Animated.View
        ref={frontRef}
        collapsable={false}
        style={[
          styles.card,
          styles.frontBox,
          {
            opacity: deck === 'lifted' ? 0 : 1,
            transform: [{ translateX: 4 }, { translateY: -1 }, { rotate: '10deg' }, { scale: popsIn ? motion.frontScale : 1 }]
          }
        ]}
      >
        <TabPicture tab={tab} letterSize={13} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: TOP, paddingHorizontal: 22 },
  // GROW taller than the bar, reaching up above it, and moved down by GROW until you swipe.
  panel: {
    position: 'absolute', top: -GROW, left: 0, right: 0, bottom: 0,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)'
  },
  progress: {
    position: 'absolute', top: -1, left: 0, right: 0, height: 2, borderRadius: 1, transformOrigin: 'left',
    shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 }
  },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { width: 60 },
  right: { alignItems: 'flex-end' },
  plus: { width: 76, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 35, height: 35, borderRadius: 17.5, alignItems: 'center', justifyContent: 'center' },
  stack: { width: 46, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', width: 27, height: 33, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  behindBox: { overflow: 'hidden', backgroundColor: '#2c2c35' },
  behind: { transform: [{ translateX: -5 }, { translateY: 3 }, { rotate: '-14deg' }] },
  frontBox: { overflow: 'hidden' },
  place: {
    position: 'absolute', top: -GROW, left: 0, right: 0, height: GROW + 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotOn: { width: 18, backgroundColor: '#fff' },
  placeText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  badge: {
    position: 'absolute', right: 4, bottom: -2, width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#5840aa',
    borderWidth: 1.5, borderColor: '#1e1b2c'
  }
})
