import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../config'
import { hostOf } from '../lib/address'
import type { Tab } from '../useTabs'
import { Glass } from './Glass'
import { TabPicture } from './TabPicture'

interface Props {
  tab: Tab
  tabCount: number
  progress: number
  loading: boolean
  onTabs: () => void
  onAddress: () => void
  onNewTab: () => void
}

/** The bar along the bottom: tilted tab pictures, the site you're on, and +. */
export const BottomBar = ({ tab, tabCount, progress, loading, onTabs, onAddress, onNewTab }: Props) => (
  <View style={styles.bar}>
    <View style={[styles.progress, { width: `${Math.round(progress * 100)}%`, opacity: loading ? 1 : 0 }]} />
    <View style={styles.row}>
      <Pressable onPress={onTabs} accessibilityLabel={`${tabCount} tabs`} hitSlop={8}>
        <TabStack tab={tab} count={tabCount} />
      </Pressable>

      <Pressable onPress={onAddress} style={styles.pillWrap} accessibilityLabel={tab.url ? `${hostOf(tab.url)}, page actions` : 'Search or enter address'}>
        <Glass style={styles.pill}>
          <View style={styles.pillInner}>
            {!tab.url && <Ionicons name="search" size={16} color={colors.secondary} />}
            <Text numberOfLines={1} style={[styles.pillText, !tab.url && styles.placeholder]}>
              {tab.url ? hostOf(tab.url) : 'Search or enter address'}
            </Text>
          </View>
        </Glass>
      </Pressable>

      <Pressable onPress={onNewTab} accessibilityLabel="New tab" hitSlop={8}>
        <Glass style={styles.circle}>
          <Ionicons name="add" size={26} color={colors.text} />
        </Glass>
      </Pressable>
    </View>
  </View>
)

/** The current tab's picture, tilted, with another card behind it when there are more, like Arc. */
const TabStack = ({ tab, count }: { tab: Tab; count: number }) => (
  <View style={styles.stack}>
    {count > 1 && <View style={[styles.card, styles.behind]} />}
    <TabPicture tab={tab} letterSize={16} style={[styles.card, styles.front]} />
  </View>
)

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.background, paddingHorizontal: 14, paddingTop: 6 },
  progress: { position: 'absolute', top: 0, left: 0, height: 2, backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pillWrap: { flex: 1 },
  pill: { height: 48, borderRadius: 24, justifyContent: 'center', paddingHorizontal: 18 },
  pillInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pillText: { color: colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  placeholder: { color: colors.secondary, fontWeight: '400' },
  circle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  stack: { width: 56, height: 52, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', width: 34, height: 42, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  behind: { backgroundColor: colors.card, transform: [{ rotate: '-14deg' }, { translateX: -6 }, { translateY: 4 }] },
  front: { transform: [{ rotate: '9deg' }, { translateX: 5 }, { translateY: -2 }] }
})
