import { BlurView } from 'expo-blur'
import { GlassView } from 'expo-glass-effect'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useRef, type RefObject } from 'react'
import { Animated, Easing, PanResponder, Pressable, StyleSheet, View } from 'react-native'
import { css, DEFAULT_ACCENT, mix, type Rgb } from '../lib/color'
import type { Tab } from '../useTabs'
import { Glass, liquidGlass } from './Glass'
import type { ViewRef } from './Hero'
import { Icon } from './Icon'
import { TabPicture } from './TabPicture'

interface Props {
  tab: Tab
  /** Another open tab, for the card behind (the one before this tab, or after it). */
  behind?: Tab
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
  /** A swipe along the bar: to the next tab (swiped left) or the one before (swiped right). */
  onSwipe: (next: boolean) => void
}

/** How far (points) or how fast a swipe along the bar has to go to change tabs. */
const SWIPE = 50
const FLICK = 0.5

/**
 * Swiping along the bar moves to the next or previous tab, like Arc and Safari. The buttons
 * follow your finger a little, then spring back; past the last tab they only stretch.
 */
const useSwipe = (onSwipe: Props['onSwipe']) => {
  const slide = useRef(new Animated.Value(0)).current
  const latest = useRef(onSwipe)
  latest.current = onSwipe
  const swipe = useRef(
    PanResponder.create({
      // Sideways only, so taps on the buttons still work.
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => slide.setValue(g.dx * 0.35),
      onPanResponderRelease: (_, g) => {
        const far = Math.abs(g.dx) > SWIPE || Math.abs(g.vx) > FLICK
        if (far) latest.current(g.dx < 0)
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start()
      },
      onPanResponderTerminate: () => Animated.spring(slide, { toValue: 0, useNativeDriver: true }).start()
    })
  ).current
  return { slide, handlers: swipe.panHandlers }
}

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
  tab, behind, tabCount, progress, loading, bottomInset, hide, stackRef, onTabs, onNewTab, onReopen, onMenu, onSwipe
}: Props) => {
  // A private tab's bar is a plain deep violet whatever the site, so you can tell at a glance.
  const accent = tab.private ? PRIVATE : (tab.accent ?? DEFAULT_ACCENT)
  const { slide, handlers } = useSwipe(onSwipe)
  return (
  <Animated.View
    {...handlers}
    style={[styles.bar, { paddingBottom: bottomPad(bottomInset), transform: [{ translateY: hide }] }]}
  >
    {/*
      The panel: iOS 26 Liquid Glass tinted with the site's colour, with that colour deepening
      towards the bottom, like Arc. Without Liquid Glass: frosted charcoal warming into the colour.
    */}
    <View style={styles.panel} pointerEvents="none">
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
    </View>

    {/* The loading line along the top edge: the site's colour running into blue, glowing a little. */}
    <ProgressLine progress={progress} loading={loading} accent={accent} />
    <Animated.View style={[styles.row, { transform: [{ translateX: slide }] }]}>
      <Pressable onPress={onTabs} accessibilityLabel={`${tabCount} ${tab.private ? 'private ' : ''}tabs`} hitSlop={10} style={styles.side}>
        <TabStack tab={tab} behind={behind} frontRef={stackRef} />
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
    </Animated.View>
  </Animated.View>
  )
}

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

/** The current tab's picture, tilted, with another open tab's picture behind it when there is one, like Arc. */
const TabStack = ({ tab, behind, frontRef }: { tab: Tab; behind?: Tab; frontRef: RefObject<ViewRef | null> }) => (
  <View style={styles.stack}>
    {behind && (
      <View style={[styles.card, styles.behind]}>
        <TabPicture tab={behind} letterSize={13} style={StyleSheet.absoluteFill} />
      </View>
    )}
    <View ref={frontRef} collapsable={false} style={[styles.card, styles.front, styles.frontBox]}>
      <TabPicture tab={tab} letterSize={13} style={StyleSheet.absoluteFill} />
    </View>
  </View>
)

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: TOP, paddingHorizontal: 22 },
  panel: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
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
  behind: { overflow: 'hidden', backgroundColor: '#2c2c35', transform: [{ translateX: -5 }, { translateY: 3 }, { rotate: '-14deg' }] },
  front: { transform: [{ translateX: 4 }, { translateY: -1 }, { rotate: '10deg' }] },
  frontBox: { overflow: 'hidden' },
  badge: {
    position: 'absolute', right: 4, bottom: -2, width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#5840aa',
    borderWidth: 1.5, borderColor: '#1e1b2c'
  }
})
