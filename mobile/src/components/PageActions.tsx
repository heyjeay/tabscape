import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { useEffect, useState } from 'react'
import { Linking, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../config'
import { hostOf } from '../lib/address'
import { Glass } from './Glass'

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
}

/**
 * What tapping the site's name opens, like Arc: back, forward, the address, copy and reload
 * along the top, then the things you can do with the page.
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
      <Glass style={[styles.panel, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.handle} />

        <View style={styles.addressRow}>
          <Icon icon="chevron-back" name="Back" disabled={!props.canGoBack} onPress={props.onBack} />
          <Icon icon="chevron-forward" name="Forward" disabled={!props.canGoForward} onPress={props.onForward} />
          <Pressable style={styles.address} onPress={props.onEditAddress} accessibilityLabel="Edit address">
            <Text style={styles.addressText} numberOfLines={1}>{hostOf(url)}</Text>
          </Pressable>
          <Icon
            icon={copied ? 'checkmark' : 'link'}
            name="Copy link"
            onPress={() => {
              if (url) Clipboard.setStringAsync(url)
              setCopied(true)
            }}
          />
          <Icon icon={props.loading ? 'close' : 'refresh'} name={props.loading ? 'Stop' : 'Reload'} onPress={props.onReloadOrStop} />
        </View>

        <View style={styles.tiles}>
          <Tile icon="document-text-outline" label="Find on Page" onPress={props.onFind} />
          <Tile icon="grid-outline" label="Add to Tabscape" onPress={props.onAddToTabscape} disabled={!url} />
          <Tile icon="share-outline" label="Share" onPress={() => url && Share.share({ url, message: url })} disabled={!url} />
          <Tile icon="compass-outline" label="Open in Safari" onPress={() => url && Linking.openURL(url)} disabled={!url} />
        </View>
      </Glass>
    </Modal>
  )
}

type IconName = keyof typeof Ionicons.glyphMap

const Icon = ({ icon, name, onPress, disabled }: { icon: IconName; name: string; onPress: () => void; disabled?: boolean }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[styles.icon, disabled && styles.disabled]} accessibilityLabel={name} hitSlop={4}>
    <Ionicons name={icon} size={22} color={colors.text} />
  </Pressable>
)

const Tile = ({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[styles.tile, disabled && styles.disabled]} accessibilityLabel={label}>
    <View style={styles.tileBox}>
      <Ionicons name={icon} size={26} color={colors.text} />
    </View>
    <Text style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
  </Pressable>
)

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  panel: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 10, gap: 18 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  addressRow: { flexDirection: 'row', alignItems: 'center', height: 58, borderRadius: 29, backgroundColor: colors.faint, paddingHorizontal: 6 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  address: { flex: 1, alignItems: 'center' },
  addressText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, alignItems: 'center', gap: 8 },
  tileBox: { alignSelf: 'stretch', height: 74, borderRadius: 20, backgroundColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: colors.text, fontSize: 12 },
  disabled: { opacity: 0.35 }
})
