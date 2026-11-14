import { LinearGradient } from 'expo-linear-gradient'
import { useRef } from 'react'
import { Alert, Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../config'
import type { Tab } from '../useTabs'
import { Glass } from './Glass'
import { Icon } from './Icon'
import { Favicon, TabPicture } from './TabPicture'

interface Props {
  visible: boolean
  tabs: Tab[]
  currentId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseAll: () => void
  onNewTab: () => void
  onSettings: () => void
  onDismiss: () => void
}

/**
 * The tab browser, like Arc's: one big card in the middle, the tabs before it stacked
 * behind it on the left, the next one beside it on the right. Swipe through them, tap one
 * to open it, swipe it up to close it.
 */
export const TabCarousel = ({ visible, tabs, currentId, onSelect, onClose, onCloseAll, onNewTab, onSettings, onDismiss }: Props) => {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const cardWidth = Math.min(width * 0.62, 420)
  const cardHeight = Math.min(height - insets.top - insets.bottom - 230, cardWidth * 2.1)
  const side = (width - cardWidth) / 2
  const start = Math.max(0, tabs.findIndex(t => t.id === currentId))
  const scrollX = useRef(new Animated.Value(start * cardWidth)).current

  const confirmCloseAll = () =>
    Alert.alert('Close all tabs?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Close all ${tabs.length} tabs`, style: 'destructive', onPress: onCloseAll }
    ])

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onDismiss}>
      <LinearGradient colors={['#1d1b2e', '#241c30', '#2a1a22']} style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth}
          decelerationRate="fast"
          contentOffset={{ x: start * cardWidth, y: 0 }}
          contentContainerStyle={{ paddingHorizontal: side, alignItems: 'center' }}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        >
          {tabs.map((tab, index) => (
            <StackedCard
              key={tab.id}
              tab={tab}
              index={index}
              scrollX={scrollX}
              width={cardWidth}
              height={cardHeight}
              onSelect={() => onSelect(tab.id)}
              onClose={() => onClose(tab.id)}
            />
          ))}
        </Animated.ScrollView>

        <View style={styles.bottom}>
          <RoundButton sf="trash" fallback="trash-outline" label="Close all tabs" onPress={confirmCloseAll} />
          <Pressable onPress={onNewTab} accessibilityLabel="New tab">
            <Glass style={styles.plus} interactive>
              <Icon sf="plus" fallback="add" size={28} weight="semibold" />
            </Glass>
          </Pressable>
          <RoundButton sf="gearshape" fallback="settings-outline" label="Settings" onPress={onSettings} />
        </View>
      </LinearGradient>
    </Modal>
  )
}

/**
 * One tab in the stack. How far it is from the middle (in cards) sets where it sits:
 * the ones before the middle slide in behind it, a little smaller, leaving their edges showing.
 */
const StackedCard = ({ tab, index, scrollX, width, height, onSelect, onClose }: {
  tab: Tab
  index: number
  scrollX: Animated.Value
  width: number
  height: number
  onSelect: () => void
  onClose: () => void
}) => {
  const lift = useRef(new Animated.Value(0)).current
  const at = (cards: number) => (index + cards) * width
  const input = [at(-1), at(0), at(1), at(4)]

  // Before the middle: pulled right behind the middle card, a sliver showing per card.
  const translateX = scrollX.interpolate({ inputRange: input, outputRange: [14, 0, width * 0.86, width * 3.6], extrapolate: 'clamp' })
  const scale = scrollX.interpolate({ inputRange: input, outputRange: [1, 1, 0.94, 0.85], extrapolate: 'clamp' })
  const titleOpacity = scrollX.interpolate({ inputRange: [at(-0.6), at(0), at(0.6)], outputRange: [0, 1, 0], extrapolate: 'clamp' })

  const swipe = useRef(
    PanResponder.create({
      // Only an upward swipe; sideways is for moving between tabs.
      onMoveShouldSetPanResponder: (_, g) => g.dy < -12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => lift.setValue(Math.min(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -140) {
          Animated.timing(lift, { toValue: -1000, duration: 200, useNativeDriver: true }).start(onClose)
        } else {
          Animated.spring(lift, { toValue: 0, useNativeDriver: true }).start()
        }
      }
    })
  ).current

  return (
    <Animated.View
      {...swipe.panHandlers}
      style={{ width, transform: [{ translateX }, { translateY: lift }, { scale }] }}
    >
      <View style={styles.cardTop}>
        <Favicon tab={tab} size={30} />
        <Animated.Text style={[styles.title, { opacity: titleOpacity }]} numberOfLines={1}>
          {tab.url ? tab.title || tab.url : 'Start page'}
        </Animated.Text>
      </View>
      <Pressable onPress={onSelect} accessibilityLabel={`Open ${tab.url ? tab.title || tab.url : 'start page'}`}>
        <TabPicture tab={tab} letterSize={64} style={[styles.page, { height }]} />
      </Pressable>
    </Animated.View>
  )
}

const RoundButton = ({ sf, fallback, label, onPress }: {
  sf: Parameters<typeof Icon>[0]['sf']; fallback: Parameters<typeof Icon>[0]['fallback']; label: string; onPress: () => void
}) => (
  <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={8}>
    <Glass style={styles.round} interactive>
      <Icon sf={sf} fallback={fallback} size={22} />
    </Glass>
  </Pressable>
)

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'space-between' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30, paddingTop: 10 },
  plus: { width: 124, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, marginBottom: 10, paddingHorizontal: 2 },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '500' },
  page: { borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }
})
