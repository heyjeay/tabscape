import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react'
import {
  Alert, Animated, PanResponder, Pressable, StyleSheet, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../config'
import type { Tab } from '../useTabs'
import { Glass } from './Glass'
import { measure, type Rect, type ViewRef } from './Hero'
import { Icon } from './Icon'
import { Favicon, TabPicture } from './TabPicture'

/** The row of buttons along the bottom, and the title above each card. */
const BUTTONS = 84
const TITLE = 38

interface Props {
  tabs: Tab[]
  currentId: string
  /** Cards hidden while their pictures fly to or from them. */
  hiddenIds: string[]
  /** 0 → 1 as the tab browser comes in (and back as it leaves). */
  appear: Animated.Value
  /** The middle card has been laid out: where it is, for the picture flying into it. */
  onCurrentPlaced: (rect: Rect) => void
  /** Each card's page, so the screen can find where any of them is. */
  registerCard: (id: string, ref: RefObject<ViewRef | null>) => void
  onSelect: (id: string, rect: Rect | null) => void
  onClose: (id: string) => void
  onCloseAll: () => void
  onNewTab: () => void
  onSettings: () => void
}

/**
 * The tab browser, like Arc's, as a layer over the page: one big card in the middle, the tabs
 * before it stacked behind it on the left, the next one beside it on the right. Swipe through
 * them, tap one to open it, swipe it up to close it.
 */
export const TabCarousel = (props: Props) => {
  const { tabs, currentId, hiddenIds, appear } = props
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // Arc's proportions: cards a little over half the screen wide and about two thirds as tall.
  const cardWidth = Math.min(width * 0.57, 400)
  const cardHeight = Math.min(height * 0.65, height - insets.top - insets.bottom - 190)
  const side = (width - cardWidth) / 2
  // The cards sit centred in the space above the buttons.
  const area = height - insets.top - (Math.max(insets.bottom, 12) + BUTTONS)
  const cardTop = Math.max(0, (area - (cardHeight + TITLE)) / 2)
  // Where it opens: on the current tab. Fixed once it's open; scrolling and closing move it from there.
  const start = useRef(Math.max(0, tabs.findIndex(t => t.id === currentId))).current
  const scrollX = useRef(new Animated.Value(start * cardWidth)).current
  const scroller = useRef<ComponentRef<typeof Animated.ScrollView>>(null)
  /** The card in the middle right now. */
  const middle = useRef(start)
  /** The last close at or after the middle, so the cards after it can slide back into the gap. */
  const [closedAt, setClosedAt] = useState<{ index: number; at: number } | null>(null)

  /**
   * Closing a card keeps you where you were: close the middle one and the next slides in;
   * close one before it and the cards after it shift back a place, so the view follows them.
   */
  const close = (id: string) => {
    const index = tabs.findIndex(t => t.id === id)
    props.onClose(id)
    if (index >= middle.current) setClosedAt({ index, at: Date.now() })
    if (index >= 0 && index < middle.current) {
      const stay = middle.current - 1
      middle.current = stay
      requestAnimationFrame(() => scroller.current?.scrollTo({ x: stay * cardWidth, animated: false }))
    }
  }

  const confirmCloseAll = () =>
    Alert.alert('Close all tabs?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Close all ${tabs.length} tabs`, style: 'destructive', onPress: props.onCloseAll }
    ])

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: appear }]}>
        <LinearGradient colors={['#1d1b2e', '#241c30', '#2a1a22']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth}
        decelerationRate="fast"
        contentOffset={{ x: start * cardWidth, y: 0 }}
        style={{ position: 'absolute', top: insets.top, left: 0, right: 0, height: area, opacity: appear }}
        contentContainerStyle={{ paddingHorizontal: side, paddingTop: cardTop }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
          listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            middle.current = Math.round(event.nativeEvent.contentOffset.x / cardWidth)
          }
        })}
      >
        {tabs.map((tab, index) => (
          <StackedCard
            key={tab.id}
            tab={tab}
            index={index}
            scrollX={scrollX}
            width={cardWidth}
            height={cardHeight}
            hidden={hiddenIds.includes(tab.id)}
            onPlaced={tab.id === currentId ? props.onCurrentPlaced : undefined}
            register={ref => props.registerCard(tab.id, ref)}
            closedAt={closedAt}
            onSelect={rect => props.onSelect(tab.id, rect)}
            onClose={() => close(tab.id)}
          />
        ))}
      </Animated.ScrollView>

      {/* Slides up rather than fading in: Liquid Glass doesn't render faded. */}
      <Animated.View
        style={[styles.bottom, {
          paddingBottom: Math.max(insets.bottom, 12),
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [140, 0] }) }]
        }]}
      >
        <RoundButton sf="trash" fallback="trash-outline" label="Close all tabs" onPress={confirmCloseAll} />
        <Pressable onPress={props.onNewTab} accessibilityLabel="New tab">
          <Glass style={styles.plus} interactive>
            <Icon sf="plus" fallback="add" size={28} weight="semibold" />
          </Glass>
        </Pressable>
        <RoundButton sf="gearshape" fallback="settings-outline" label="Settings" onPress={props.onSettings} />
      </Animated.View>
    </View>
  )
}

/**
 * One tab in the stack. How far it is from the middle (in cards) sets where it sits:
 * the ones before the middle slide in behind it, a little smaller, leaving their edges showing.
 */
const StackedCard = ({ tab, index, scrollX, width, height, hidden, onPlaced, register, closedAt, onSelect, onClose }: {
  tab: Tab
  index: number
  scrollX: Animated.Value
  width: number
  height: number
  hidden: boolean
  onPlaced?: (rect: Rect) => void
  register: (ref: RefObject<ViewRef | null>) => void
  closedAt: { index: number; at: number } | null
  onSelect: (rect: Rect | null) => void
  onClose: () => void
}) => {
  const page = useRef<ViewRef>(null)
  const lift = useRef(new Animated.Value(0)).current
  /** Slides a card back from where it was, when one before it closed. */
  const slide = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!closedAt || index < closedAt.index) return
    slide.setValue(width * 0.88)
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 4 }).start()
  }, [closedAt?.at])
  // Once: the ref object itself never changes.
  useEffect(() => {
    register(page)
  }, [])
  const at = (cards: number) => (index + cards) * width
  const input = [at(-1), at(0), at(1), at(4)]

  // As in Arc: the next tab overlaps the middle card's right edge a little; the one before it
  // tucks in behind with about a third of it showing, barely smaller; further ones stack up there.
  const translateX = scrollX.interpolate({
    inputRange: input,
    outputRange: [-width * 0.12, 0, width * 0.68, width * 3.5],
    extrapolate: 'clamp'
  })
  const scale = scrollX.interpolate({ inputRange: input, outputRange: [1, 1, 0.97, 0.9], extrapolate: 'clamp' })
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
      style={{ width, transform: [{ translateX: Animated.add(translateX, slide) }, { translateY: lift }, { scale }] }}
    >
      <View style={styles.cardTop}>
        <Favicon tab={tab} size={20} />
        <Animated.Text style={[styles.title, { opacity: titleOpacity }]} numberOfLines={1}>
          {tab.url ? tab.title || tab.url : 'Start page'}
        </Animated.Text>
      </View>
      <Pressable
        onPress={async () => onSelect(await measure(page))}
        accessibilityLabel={`Open ${tab.url ? tab.title || tab.url : 'start page'}`}
      >
        <View
          ref={page}
          collapsable={false}
          style={{ opacity: hidden ? 0 : 1 }}
          onLayout={() => {
            if (onPlaced) measure(page).then(rect => rect && onPlaced(rect))
          }}
        >
          <TabPicture tab={tab} letterSize={64} style={[styles.page, { height }]} />
        </View>
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
  bottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30, paddingTop: 10
  },
  plus: { width: 124, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 30, marginBottom: 8, paddingHorizontal: 4 },
  title: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '500' },
  page: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' }
})
