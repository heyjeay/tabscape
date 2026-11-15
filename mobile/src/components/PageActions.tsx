import * as Clipboard from 'expo-clipboard'
import type { SFSymbol } from 'expo-symbols'
import type { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { Animated, Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../config'
import { hostOf } from '../lib/address'
import { Glass } from './Glass'
import { Icon } from './Icon'
import { useSlideUp } from './useSlideUp'

interface Props {
  visible: boolean
  url: string | null
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
  onClose: () => void
  onBack: () => void
  onForward: () => void
  onReloadOrStop: () => void
  onEditAddress: () => void
  onFind: () => void
  onAddToTabscape: () => void
  onSettings: () => void
  onReader: () => void
  onHistory: () => void
  /** The page's text size (percent); stepped up or down. */
  textSize: number
  onTextSize: (up: boolean) => void
  /** Whether the tab asks sites for their desktop version; switched. */
  desktop: boolean
  onDesktop: () => void
}

type Fallback = keyof typeof Ionicons.glyphMap

/**
 * What ⌃ opens, laid out like Arc's: back, forward, the address, copy and reload in a capsule,
 * four things to do with the page, its text size and desktop version, then history, Safari
 * and settings. It springs up over the page, which stays
 * in view above it; a tap on the page closes it.
 */
export const PageActions = (props: Props) => {
  const { visible, url, onClose } = props
  const insets = useSafeAreaInsets()
  const [copied, setCopied] = useState(false)
  const { mounted, offset } = useSlideUp(visible)

  useEffect(() => {
    if (visible) setCopied(false)
  }, [visible])

  if (!mounted) return null

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10), transform: [{ translateY: offset }] }]}>
        <Glass style={styles.panel}>
          <Glass style={styles.capsule}>
            <RoundIcon sf="chevron.left" fallback="chevron-back" label="Back" disabled={!props.canGoBack} onPress={props.onBack} />
            <RoundIcon sf="chevron.right" fallback="chevron-forward" label="Forward" disabled={!props.canGoForward} onPress={props.onForward} />
            <Pressable style={styles.address} onPress={props.onEditAddress} accessibilityLabel="Edit address">
              <Text style={styles.addressText} numberOfLines={1}>{url ? hostOf(url) : 'Tabscape'}</Text>
            </Pressable>
            <RoundIcon
              sf={copied ? 'checkmark' : 'link'}
              fallback={copied ? 'checkmark' : 'link'}
              label="Copy link"
              disabled={!url}
              onPress={() => {
                if (url) Clipboard.setStringAsync(url).catch(() => {})
                setCopied(true)
              }}
            />
            <RoundIcon
              sf={props.loading ? 'xmark' : 'arrow.clockwise'}
              fallback={props.loading ? 'close' : 'refresh'}
              label={props.loading ? 'Stop' : 'Reload'}
              onPress={props.onReloadOrStop}
            />
          </Glass>

          <View style={styles.tiles}>
            <Tile sf="doc.text.magnifyingglass" fallback="search" label="Find on Page" onPress={props.onFind} disabled={!url} />
            <Tile sf="doc.plaintext" fallback="reader-outline" label="Reader" onPress={props.onReader} disabled={!url} />
            <Tile sf="square.grid.2x2" fallback="grid-outline" label="Add to Tabscape" onPress={props.onAddToTabscape} disabled={!url} />
            <Tile sf="square.and.arrow.up" fallback="share-outline" label="Share" onPress={() => url && Share.share({ url, message: url }).catch(() => {})} disabled={!url} />
          </View>

          {/* The page's text size, like Safari's aA, and its desktop version. */}
          <View style={styles.controls}>
            <Glass style={styles.sizes}>
              <Pressable onPress={() => props.onTextSize(false)} disabled={!url || props.textSize <= 50} style={styles.sizeButton} accessibilityLabel="Smaller text" hitSlop={4}>
                <Text style={[styles.sizeA, { fontSize: 14 }, !url && { color: colors.dim }]}>A</Text>
              </Pressable>
              <Text style={[styles.sizeValue, !url && { color: colors.dim }]}>{props.textSize}%</Text>
              <Pressable onPress={() => props.onTextSize(true)} disabled={!url || props.textSize >= 200} style={styles.sizeButton} accessibilityLabel="Bigger text" hitSlop={4}>
                <Text style={[styles.sizeA, { fontSize: 21 }, !url && { color: colors.dim }]}>A</Text>
              </Pressable>
            </Glass>
            <Pressable onPress={props.onDesktop} disabled={!url} style={styles.desktopWrap} accessibilityLabel={props.desktop ? 'Request mobile site' : 'Request desktop site'}>
              <Glass style={styles.desktop} interactive={!!url} tint={props.desktop ? 'rgba(139,108,255,0.45)' : undefined}>
                <Icon sf={props.desktop ? 'iphone' : 'desktopcomputer'} fallback={props.desktop ? 'phone-portrait-outline' : 'desktop-outline'} size={20} color={url ? colors.text : colors.dim} />
                <Text style={[styles.desktopText, !url && { color: colors.dim }]} numberOfLines={1}>{props.desktop ? 'Mobile Site' : 'Desktop Site'}</Text>
              </Glass>
            </Pressable>
          </View>

          <View style={styles.rows}>
            <Pill sf="clock" fallback="time-outline" label="History" onPress={props.onHistory} />
            <Pill sf="safari" fallback="compass-outline" label="Safari" onPress={() => url && Linking.openURL(url).catch(() => {})} disabled={!url} />
            <Pill sf="gearshape" fallback="settings-outline" label="Settings" onPress={props.onSettings} />
          </View>
        </Glass>
      </Animated.View>
    </View>
  )
}

const RoundIcon = ({ sf, fallback, label, onPress, disabled }: {
  sf: SFSymbol; fallback: Fallback; label: string; onPress: () => void; disabled?: boolean
}) => (
  <Pressable onPress={onPress} disabled={disabled} style={[styles.icon, disabled && styles.disabled]} accessibilityLabel={label} hitSlop={4}>
    <Icon sf={sf} fallback={fallback} size={22} />
  </Pressable>
)

const Tile = ({ sf, fallback, label, onPress, disabled }: {
  sf: SFSymbol; fallback: Fallback; label: string; onPress: () => void; disabled?: boolean
}) => (
  // Dimmed by colour, not opacity: Liquid Glass doesn't render faded.
  <Pressable onPress={onPress} disabled={disabled} style={styles.tile} accessibilityLabel={label}>
    <Glass style={styles.tileBox} interactive={!disabled}>
      <Icon sf={sf} fallback={fallback} size={28} weight="regular" color={disabled ? colors.dim : colors.text} />
    </Glass>
    <Text style={[styles.tileLabel, disabled && { color: colors.dim }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
  </Pressable>
)

const Pill = ({ sf, fallback, label, onPress, disabled }: {
  sf: SFSymbol; fallback: Fallback; label: string; onPress: () => void; disabled?: boolean
}) => (
  <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} style={styles.pillWrap}>
    <Glass style={styles.pill} interactive={!disabled}>
      <Icon sf={sf} fallback={fallback} size={19} color={disabled ? colors.dim : colors.text} />
      <Text style={[styles.pillText, disabled && { color: colors.dim }]} numberOfLines={1}>{label}</Text>
    </Glass>
  </Pressable>
)

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 8 },
  panel: { borderRadius: 38, padding: 16, gap: 18 },
  capsule: { flexDirection: 'row', alignItems: 'center', height: 62, borderRadius: 31, paddingHorizontal: 8 },
  icon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  address: { flex: 1, alignItems: 'center' },
  addressText: { color: colors.text, fontSize: 18, fontWeight: '500' },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, alignItems: 'center', gap: 8 },
  tileBox: { alignSelf: 'stretch', aspectRatio: 1, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: colors.text, fontSize: 13, fontWeight: '500' },
  controls: { flexDirection: 'row', gap: 12 },
  sizes: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, borderRadius: 20, paddingHorizontal: 6 },
  sizeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  sizeA: { color: colors.text, fontWeight: '600' },
  sizeValue: { color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'] },
  desktopWrap: { flex: 1 },
  desktop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 20, paddingHorizontal: 12 },
  desktopText: { color: colors.text, fontSize: 15, fontWeight: '500' },
  rows: { flexDirection: 'row', gap: 10 },
  pillWrap: { flex: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 20 },
  pillText: { color: colors.text, fontSize: 15, fontWeight: '500' },
  disabled: { opacity: 0.4 }
})
