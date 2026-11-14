import { LinearGradient } from 'expo-linear-gradient'
import type { RefObject } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
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
  /** The front tab card, so the tab browser can grow out of it. */
  stackRef: RefObject<ViewRef | null>
  onTabs: () => void
  onNewTab: () => void
  onMenu: () => void
}

/** The bar's height above the safe area, so the page can leave room for it. */
export const BAR_HEIGHT = 78

/**
 * Arc's bar, floating over the page in Liquid Glass: the tab pictures on the left,
 * a wide + in the middle, and ⌃ for everything you can do with the page.
 */
export const BottomBar = ({ tab, tabCount, progress, loading, bottomInset, stackRef, onTabs, onNewTab, onMenu }: Props) => (
  <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, 12) }]} pointerEvents="box-none">
    {/* A soft dark fade behind the controls, so they read over any page. */}
    <LinearGradient
      colors={['transparent', 'rgba(10,10,16,0.55)']}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    <View style={[styles.progress, { width: `${Math.round(progress * 100)}%`, opacity: loading ? 1 : 0 }]} />
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
  </View>
)

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
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 14, paddingHorizontal: 22 },
  progress: { position: 'absolute', top: 0, left: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
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
