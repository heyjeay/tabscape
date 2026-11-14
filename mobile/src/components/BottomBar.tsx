import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import type { RefObject } from 'react'
import { Animated, Pressable, StyleSheet, View } from 'react-native'
import { css, DEFAULT_ACCENT, mix, type Rgb } from '../lib/color'
import type { Tab } from '../useTabs'
import { Glass } from './Glass'
import type { ViewRef } from './Hero'
import { Icon } from './Icon'
import { TabPicture } from './TabPicture'

interface Props {
  tab: Tab
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
  onMenu: () => void
}

/** The bar's height above the safe area, so the page can leave room for it. */
export const BAR_HEIGHT = 78
/** Space above the buttons, inside the bar's panel. */
const TOP = 12

/** How far the bar moves to be out of sight, including the safe area under it. */
export const barTravel = (bottomInset: number) => BAR_HEIGHT + TOP + Math.max(bottomInset, 12)

/**
 * Arc's bar: a dark grey panel along the bottom with a fine light line on top, and on it the
 * tab pictures on the left, a wide + in the middle, and ⌃ for everything you can do with the page.
 */
export const BottomBar = ({ tab, tabCount, progress, loading, bottomInset, hide, stackRef, onTabs, onNewTab, onMenu }: Props) => {
  const accent = tab.accent ?? DEFAULT_ACCENT
  return (
  <Animated.View
    style={[styles.bar, { paddingBottom: Math.max(bottomInset, 12), transform: [{ translateY: hide }] }]}
    pointerEvents="box-none"
  >
    {/* The panel: frosted charcoal at the top, warming into the site's own colour towards the bottom, like Arc. */}
    <View style={styles.panel} pointerEvents="none">
      <BlurView tint="systemChromeMaterialDark" intensity={90} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[css(CHARCOAL, 0.92), css(mix(CHARCOAL, accent, 0.18), 0.95), css(mix(CHARCOAL, accent, 0.42), 0.97)]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>

    {/* The loading line along the top edge: the site's colour running into blue, glowing a little. */}
    <View
      pointerEvents="none"
      style={[styles.progress, { width: `${Math.round(progress * 100)}%`, opacity: loading ? 1 : 0, shadowColor: css(accent) }]}
    >
      <LinearGradient
        colors={[css(mix(accent, WHITE, 0.15)), css(mix(accent, SKY, 0.65))]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
    <View style={styles.row}>
      <Pressable onPress={onTabs} accessibilityLabel={`${tabCount} tabs`} hitSlop={10} style={styles.side}>
        <TabStack tab={tab} count={tabCount} frontRef={stackRef} />
      </Pressable>

      <Pressable onPress={onNewTab} accessibilityLabel="New tab">
        <Glass style={styles.plus} interactive>
          <Icon sf="plus" fallback="add" size={26} weight="semibold" />
        </Glass>
      </Pressable>

      <View style={[styles.side, styles.right]}>
        <Pressable onPress={onMenu} accessibilityLabel="Page actions" hitSlop={10}>
          <Glass style={styles.circle} interactive>
            <Icon sf="chevron.up" fallback="chevron-up" size={22} weight="semibold" />
          </Glass>
        </Pressable>
      </View>
    </View>
  </Animated.View>
  )
}

const CHARCOAL: Rgb = [44, 44, 48]
const WHITE: Rgb = [255, 255, 255]
const SKY: Rgb = [64, 156, 255]

/** The current tab's picture, tilted, with another card behind it when there are more, like Arc. */
const TabStack = ({ tab, count, frontRef }: { tab: Tab; count: number; frontRef: RefObject<ViewRef | null> }) => (
  <View style={styles.stack}>
    {count > 1 && <View style={[styles.card, styles.behind]} />}
    <View ref={frontRef} collapsable={false} style={[styles.card, styles.front, styles.frontBox]}>
      <TabPicture tab={tab} letterSize={18} style={StyleSheet.absoluteFill} />
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
    position: 'absolute', top: -1, left: 0, height: 2, borderRadius: 1,
    shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 }
  },
  row: { height: BAR_HEIGHT - 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { width: 76 },
  right: { alignItems: 'flex-end' },
  plus: { width: 124, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  stack: { width: 64, height: 58, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', width: 40, height: 50, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  behind: { backgroundColor: '#2c2c35', transform: [{ translateX: -7 }, { translateY: 5 }, { rotate: '-14deg' }] },
  front: { transform: [{ translateX: 6 }, { translateY: -2 }, { rotate: '10deg' }] },
  frontBox: { overflow: 'hidden' }
})
