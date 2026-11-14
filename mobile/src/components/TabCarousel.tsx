import { Ionicons } from '@expo/vector-icons'
import { useRef, useState } from 'react'
import {
  Alert, Animated, FlatList, Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../config'
import type { Tab } from '../useTabs'
import { Glass } from './Glass'
import { TabPicture, tabColor, tabLetter } from './TabPicture'

interface Props {
  visible: boolean
  tabs: Tab[]
  currentId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseAll: () => void
  onNewTab: () => void
  onDismiss: () => void
}

const GAP = 18

/**
 * All open tabs as big cards you swipe through, like Arc: tap one to open it,
 * swipe it up (or tap ×) to close it.
 */
export const TabCarousel = ({ visible, tabs, currentId, onSelect, onClose, onCloseAll, onNewTab, onDismiss }: Props) => {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const cardWidth = Math.min(width * 0.72, 440)
  const cardHeight = height - insets.top - insets.bottom - 190
  const side = (width - cardWidth) / 2
  const startIndex = Math.max(0, tabs.findIndex(t => t.id === currentId))

  const confirmCloseAll = () =>
    Alert.alert('Close all tabs?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Close all ${tabs.length} tabs`, style: 'destructive', onPress: onCloseAll }
    ])

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onDismiss}>
      <View style={[styles.screen, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 10 }]}>
        <FlatList
          data={tabs}
          keyExtractor={tab => tab.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + GAP}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: side, gap: GAP }}
          initialScrollIndex={startIndex}
          getItemLayout={(_, index) => ({ length: cardWidth + GAP, offset: (cardWidth + GAP) * index, index })}
          renderItem={({ item }) => (
            <CarouselCard
              tab={item}
              width={cardWidth}
              height={cardHeight}
              onSelect={() => onSelect(item.id)}
              onClose={() => onClose(item.id)}
            />
          )}
        />

        <View style={styles.bottom}>
          <RoundButton icon="trash-outline" label="Close all tabs" onPress={confirmCloseAll} />
          <Pressable onPress={onNewTab} accessibilityLabel="New tab">
            <Glass style={styles.plus}>
              <Ionicons name="add" size={30} color={colors.text} />
            </Glass>
          </Pressable>
          <RoundButton icon="chevron-down" label="Back to the page" onPress={onDismiss} />
        </View>
      </View>
    </Modal>
  )
}

/** A tab in the carousel: its site and title above, the page below. Swipe it up to close it. */
const CarouselCard = ({ tab, width, height, onSelect, onClose }: {
  tab: Tab; width: number; height: number; onSelect: () => void; onClose: () => void
}) => {
  const lift = useRef(new Animated.Value(0)).current
  const [from] = tabColor(tab)

  const swipe = useRef(
    PanResponder.create({
      // Only an upward swipe; sideways is for scrolling between tabs.
      onMoveShouldSetPanResponder: (_, g) => g.dy < -12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => lift.setValue(Math.min(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -150) {
          Animated.timing(lift, { toValue: -900, duration: 180, useNativeDriver: true }).start(onClose)
        } else {
          Animated.spring(lift, { toValue: 0, useNativeDriver: true }).start()
        }
      }
    })
  ).current

  return (
    <Animated.View
      {...swipe.panHandlers}
      style={{ width, gap: 10, transform: [{ translateY: lift }], opacity: lift.interpolate({ inputRange: [-400, 0], outputRange: [0, 1], extrapolate: 'clamp' }) }}
    >
      <View style={styles.cardTop}>
        <View style={[styles.badge, { backgroundColor: from }]}>
          <Text style={styles.badgeText}>{tabLetter(tab)}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>{tab.url ? tab.title || tab.url : 'Start page'}</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={`Close ${tab.title || 'tab'}`}>
          <Glass style={styles.close}>
            <Ionicons name="close" size={14} color={colors.text} />
          </Glass>
        </Pressable>
      </View>
      <Pressable onPress={onSelect} accessibilityLabel={`Open ${tab.title || 'tab'}`}>
        <TabPicture tab={tab} letterSize={64} style={[styles.page, { height }]} />
      </Pressable>
    </Animated.View>
  )
}

const RoundButton = ({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6}>
    <Glass style={styles.round}>
      <Ionicons name={icon} size={20} color={colors.text} />
    </Glass>
  </Pressable>
)

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1a1626' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26, paddingTop: 14 },
  plus: { width: 100, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  round: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  title: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  page: { borderRadius: 26, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }
})
