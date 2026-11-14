import * as Clipboard from 'expo-clipboard'
import type { SFSymbol } from 'expo-symbols'
import type { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { Linking, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../config'
import { hostOf } from '../lib/address'
import { Glass } from './Glass'
import { Icon } from './Icon'

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
}

type Fallback = keyof typeof Ionicons.glyphMap

/**
 * What ⌃ opens, laid out like Arc's: back, forward, the address, copy and reload in a capsule,
 * four things to do with the page, then settings.
 */
export const PageActions = (props: Props) => {
  const { visible, url, onClose } = props
  const insets = useSafeAreaInsets()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (visible) setCopied(false)
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
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
                if (url) Clipboard.setStringAsync(url)
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
            <Tile sf="square.grid.2x2" fallback="grid-outline" label="Add to Tabscape" onPress={props.onAddToTabscape} disabled={!url} />
            <Tile sf="square.and.arrow.up" fallback="share-outline" label="Share" onPress={() => url && Share.share({ url, message: url })} disabled={!url} />
            <Tile sf="safari" fallback="compass-outline" label="Safari" onPress={() => url && Linking.openURL(url)} disabled={!url} />
          </View>

          <Row sf="gearshape" fallback="settings-outline" label="Settings" onPress={props.onSettings} />
        </Glass>
      </View>
    </Modal>
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

const Row = ({ sf, fallback, label, onPress }: { sf: SFSymbol; fallback: Fallback; label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} accessibilityLabel={label}>
    <Glass style={styles.row} interactive>
      <Icon sf={sf} fallback={fallback} size={22} />
      <Text style={styles.rowText}>{label}</Text>
      <Icon sf="chevron.right" fallback="chevron-forward" size={16} color={colors.secondary} />
    </Glass>
  </Pressable>
)

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  wrap: { paddingHorizontal: 8 },
  panel: { borderRadius: 38, padding: 16, gap: 18 },
  capsule: { flexDirection: 'row', alignItems: 'center', height: 62, borderRadius: 31, paddingHorizontal: 8 },
  icon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  address: { flex: 1, alignItems: 'center' },
  addressText: { color: colors.text, fontSize: 18, fontWeight: '500' },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, alignItems: 'center', gap: 8 },
  tileBox: { alignSelf: 'stretch', aspectRatio: 1, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: colors.text, fontSize: 13, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 58, borderRadius: 20, paddingHorizontal: 18 },
  rowText: { flex: 1, color: colors.text, fontSize: 17 },
  disabled: { opacity: 0.4 }
})
