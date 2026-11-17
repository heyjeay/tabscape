import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../config'
import { hostOf } from '../../lib/address'
import type { Tab } from '../../useTabs'
import { Icon } from '../Icon'
import { Favicon } from '../TabPicture'

interface Props {
  /** The tabs of the space showing (private or not). */
  tabs: Tab[]
  currentId: string
  /** Private tabs showing, rather than the others. */
  isPrivate: boolean
  topInset: number
  bottomInset: number
  onSelect: (id: string) => void
  onClose: (id: string) => void
  /** Closes every tab in this space. */
  onClear: () => void
  onNewTab: () => void
  /** Holding New Tab or +: the tab closed last comes back. */
  onReopen: () => void
  onHome: () => void
  onSettings: () => void
  onHistory: () => void
  /** Over to the other space (tabs or private tabs). */
  onSpace: (isPrivate: boolean) => void
  onHide: () => void
}

/** The sidebar's width (points). */
export const SIDEBAR = 284

/**
 * The iPad's tab sidebar: your tabs down the left, like a desktop browser's. The space (tabs or
 * private tabs) at the top, New Tab and the tabs under it, and along the bottom Settings, History,
 * Home, a dot for each space, and +.
 */
export const Sidebar = (props: Props) => {
  const { tabs, currentId, isPrivate } = props
  return (
    <View style={[styles.side, { paddingTop: props.topInset + 6, paddingBottom: Math.max(props.bottomInset, 10) }]}>
      <View style={styles.top}>
        <Pressable onPress={props.onHide} hitSlop={8} accessibilityLabel="Hide sidebar" style={({ pressed }) => [styles.small, pressed && styles.pressed]}>
          <Icon sf="sidebar.left" fallback="browsers-outline" size={20} color={colors.secondary} />
        </Pressable>
      </View>

      <View style={styles.space}>
        <Icon sf={isPrivate ? 'eyeglasses' : 'square.on.square'} fallback={isPrivate ? 'glasses-outline' : 'copy-outline'} size={16} color={colors.secondary} />
        <Text style={styles.spaceName}>{isPrivate ? 'Private' : 'Tabs'}</Text>
        <Text style={styles.spaceCount}>{tabs.length}</Text>
        {tabs.length > 1 && (
          <Pressable onPress={props.onClear} hitSlop={8} accessibilityLabel={`Clear all ${isPrivate ? 'private ' : ''}tabs`}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        onPress={props.onNewTab}
        onLongPress={props.onReopen}
        delayLongPress={400}
        accessibilityLabel={isPrivate ? 'New private tab' : 'New tab'}
        accessibilityHint="Hold to reopen the tab you closed last"
        style={({ pressed }) => [styles.newTab, pressed && styles.pressed]}
      >
        <Icon sf="plus" fallback="add" size={17} color={colors.secondary} />
        <Text style={styles.newTabText}>New Tab</Text>
      </Pressable>

      <ScrollView style={styles.list} contentContainerStyle={styles.listInside} showsVerticalScrollIndicator={false}>
        {tabs.map(tab => {
          const on = tab.id === currentId
          return (
            <Pressable
              key={tab.id}
              onPress={() => props.onSelect(tab.id)}
              accessibilityLabel={tab.url ? tab.title || tab.url : 'Start page'}
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && !on && styles.pressed]}
            >
              <Favicon tab={tab} size={18} />
              <Text style={[styles.rowTitle, on && styles.rowTitleOn]} numberOfLines={1}>
                {tab.url ? tab.title || hostOf(tab.url) : 'Start page'}
              </Text>
              {on && (
                <Pressable onPress={() => props.onClose(tab.id)} hitSlop={10} accessibilityLabel="Close tab" style={styles.close}>
                  <Icon sf="xmark" fallback="close" size={13} weight="semibold" color={colors.secondary} />
                </Pressable>
              )}
            </Pressable>
          )
        })}
      </ScrollView>

      <View style={styles.bottom}>
        <Button sf="gearshape" fallback="settings-outline" label="Settings" onPress={props.onSettings} />
        <Button sf="clock" fallback="time-outline" label="History" onPress={props.onHistory} />
        <Button sf="house" fallback="home-outline" label="Home" onPress={props.onHome} />
        <View style={styles.dots}>
          {[false, true].map(space => (
            <Pressable
              key={String(space)}
              onPress={() => props.onSpace(space)}
              hitSlop={8}
              accessibilityLabel={space ? 'Private tabs' : 'Tabs'}
              accessibilityState={{ selected: space === isPrivate }}
            >
              <View style={[styles.dot, space === isPrivate && styles.dotOn]} />
            </Pressable>
          ))}
        </View>
        <Button sf="plus" fallback="add" label={isPrivate ? 'New private tab' : 'New tab'} onPress={props.onNewTab} onLongPress={props.onReopen} />
      </View>
    </View>
  )
}

const Button = ({ sf, fallback, label, onPress, onLongPress }: {
  sf: Parameters<typeof Icon>[0]['sf']
  fallback: Parameters<typeof Icon>[0]['fallback']
  label: string
  onPress: () => void
  onLongPress?: () => void
}) => (
  <Pressable
    onPress={onPress}
    onLongPress={onLongPress}
    delayLongPress={400}
    hitSlop={6}
    accessibilityLabel={label}
    style={({ pressed }) => [styles.small, pressed && styles.pressed]}
  >
    <Icon sf={sf} fallback={fallback} size={19} color={colors.secondary} />
  </Pressable>
)

const styles = StyleSheet.create({
  side: { width: SIDEBAR, paddingHorizontal: 12 },
  top: { flexDirection: 'row', alignItems: 'center', height: 40 },
  small: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  space: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8 },
  spaceName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  spaceCount: { flex: 1, color: colors.secondary, fontSize: 13 },
  clear: { color: colors.secondary, fontSize: 13, fontWeight: '500' },
  newTab: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 42, borderRadius: 12, paddingHorizontal: 12,
    marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.05)'
  },
  newTabText: { color: colors.secondary, fontSize: 15 },
  list: { flex: 1 },
  listInside: { gap: 2, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 42, borderRadius: 12, paddingHorizontal: 12 },
  rowOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
  rowTitle: { flex: 1, color: 'rgba(255,255,255,0.78)', fontSize: 15 },
  rowTitleOn: { color: colors.text, fontWeight: '500' },
  close: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotOn: { backgroundColor: colors.text }
})
