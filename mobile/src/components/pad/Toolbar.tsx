import type { ComponentRef, RefObject } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../config'
import { hostOf } from '../../lib/address'
import { Icon } from '../Icon'

interface Props {
  url: string | null
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
  /** How far the page has loaded, 0 to 1. */
  progress: number
  isPrivate: boolean
  /** The sidebar is hidden: a button to bring it back. */
  sidebarHidden: boolean
  onSidebar: () => void
  onBack: () => void
  onForward: () => void
  onReloadOrStop: () => void
  /** The address: the command bar, to search or go somewhere else. */
  onAddress: () => void
  onShare: () => void
  onMenu: () => void
  /** The share and ⋯ buttons, for the popovers to point at. */
  shareRef: RefObject<ComponentRef<typeof View> | null>
  menuRef: RefObject<ComponentRef<typeof View> | null>
}

/** The toolbar's height (points). */
export const TOOLBAR = 46

/**
 * The iPad's toolbar, along the top of the page: back, forward and reload on the left, the
 * address in the middle (a tap opens the command bar), share and ⋯ on the right. A thin line
 * along its foot shows the page loading.
 */
export const Toolbar = (props: Props) => {
  const { url } = props
  const secure = !!url && url.startsWith('https:')
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {props.sidebarHidden && (
          <Button sf="sidebar.left" fallback="browsers-outline" label="Show sidebar" onPress={props.onSidebar} />
        )}
        <Button sf="chevron.left" fallback="chevron-back" label="Back" onPress={props.onBack} disabled={!props.canGoBack} />
        <Button sf="chevron.right" fallback="chevron-forward" label="Forward" onPress={props.onForward} disabled={!props.canGoForward} />
        <Button
          sf={props.loading ? 'xmark' : 'arrow.clockwise'}
          fallback={props.loading ? 'close' : 'refresh'}
          label={props.loading ? 'Stop' : 'Reload'}
          onPress={props.onReloadOrStop}
          disabled={!url}
        />
      </View>

      <Pressable
        onPress={props.onAddress}
        accessibilityRole="button"
        accessibilityLabel={url ? `Address: ${hostOf(url)}` : 'Search or enter address'}
        style={({ pressed }) => [styles.address, pressed && styles.pressed]}
      >
        {props.isPrivate && <Icon sf="eyeglasses" fallback="glasses-outline" size={15} color={colors.secondary} />}
        {url ? (
          <>
            {secure && <Icon sf="lock.fill" fallback="lock-closed" size={11} color={colors.secondary} />}
            <Text style={styles.host} numberOfLines={1}>{hostOf(url)}</Text>
          </>
        ) : (
          <>
            <Icon sf="magnifyingglass" fallback="search" size={14} color={colors.secondary} />
            <Text style={styles.placeholder} numberOfLines={1}>Search or enter address</Text>
          </>
        )}
      </Pressable>

      <View style={[styles.side, styles.right]}>
        <View ref={props.shareRef} collapsable={false}>
          <Button sf="square.and.arrow.up" fallback="share-outline" label="Share" onPress={props.onShare} disabled={!url} />
        </View>
        <View ref={props.menuRef} collapsable={false}>
          <Button sf="ellipsis.circle" fallback="ellipsis-horizontal-circle" label="More" onPress={props.onMenu} />
        </View>
      </View>

      {props.loading && (
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.progress, { width: `${Math.max(0.05, props.progress) * 100}%` }]} />
        </View>
      )}
    </View>
  )
}

const Button = ({ sf, fallback, label, onPress, disabled }: {
  sf: Parameters<typeof Icon>[0]['sf']
  fallback: Parameters<typeof Icon>[0]['fallback']
  label: string
  onPress: () => void
  disabled?: boolean
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={4}
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    style={({ pressed }) => [styles.button, pressed && styles.pressed]}
  >
    <Icon sf={sf} fallback={fallback} size={18} color={disabled ? colors.dim : colors.text} />
  </Pressable>
)

const styles = StyleSheet.create({
  bar: {
    height: TOOLBAR, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)'
  },
  // Both sides the same width, so the address sits in the middle.
  side: { width: 170, flexDirection: 'row', alignItems: 'center', gap: 2 },
  right: { justifyContent: 'flex-end' },
  button: { width: 38, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  address: {
    flex: 1, height: 32, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 14, maxWidth: 560, alignSelf: 'center', marginHorizontal: 'auto'
  },
  host: { color: colors.text, fontSize: 14, fontWeight: '500', flexShrink: 1 },
  placeholder: { color: colors.secondary, fontSize: 14, flexShrink: 1 },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
  progress: { height: 2, backgroundColor: '#8a7dff', borderRadius: 1 }
})
