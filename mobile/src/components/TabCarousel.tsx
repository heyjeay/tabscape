import { LinearGradient } from 'expo-linear-gradient'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react'
import {
  Alert, Animated, Easing, PanResponder, Pressable, StyleSheet, View, useWindowDimensions,
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

/** What the cards call back with. Made once, so the cards only redraw when they themselves change. */
interface Handlers {
  select: (id: string, rect: Rect | null) => void
  register: (id: string, ref: RefObject<ViewRef | null>) => void
  placed: (rect: Rect) => void
  close: (id: string) => void
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

  /**
   * Cards swiped away. They leave the row at once; the tab itself closes a moment later, once
   * the others have moved up. Closing it can bring another tab's live page up behind all this,
   * which is too much work to do in the middle of the animation.
   */
  const [gone, setGone] = useState<string[]>([])
  const shown = useMemo(() => tabs.filter(t => !gone.includes(t.id)), [tabs, gone])

  // Where it opens: on the current tab. Fixed once it's open; scrolling and closing move it from there.
  const start = useRef(Math.max(0, tabs.findIndex(t => t.id === currentId))).current
  const scrollX = useRef(new Animated.Value(start * cardWidth)).current
  const scroller = useRef<ComponentRef<typeof Animated.ScrollView>>(null)
  /** The card in the middle right now. */
  const middle = useRef(start)
  /** When a card behind the middle last closed: the view and the cards after it move back a place together, at once. */
  const [jumpBack, setJumpBack] = useState(0)

  // The latest props, for handlers that never change.
  const latest = useRef(props)
  latest.current = props

  // Tabs waiting to close. If the tab browser goes first, they close then.
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const waiting = pending.current
    return () => {
      waiting.forEach((timer, id) => {
        clearTimeout(timer)
        latest.current.onClose(id)
      })
      waiting.clear()
    }
  }, [])
  const closeLater = (id: string, after: number) => {
    pending.current.set(id, setTimeout(() => {
      pending.current.delete(id)
      latest.current.onClose(id)
      setGone(all => all.filter(g => g !== id))
    }, after))
  }

  /**
   * Closing a card keeps you where you were: close the middle one and the next slides in;
   * close one before it and the view moves back with the cards after it.
   */
  const close = (id: string) => {
    const index = shown.findIndex(t => t.id === id)
    if (index < 0) return
    if (shown.length === 1) {
      // The only tab: nothing moves; it closes now and a fresh start page takes its place.
      latest.current.onClose(id)
      return
    }
    if (index === shown.length - 1 && index === middle.current) {
      // The last card, in the middle: nothing slides in from the right, so glide back to the
      // card before it first, then take it away (taking it first would snap the row short).
      middle.current = index - 1
      scroller.current?.scrollTo({ x: (index - 1) * cardWidth, animated: true })
      setTimeout(() => setGone(all => [...all, id]), 320)
      closeLater(id, 700)
      return
    }
    if (index < middle.current) {
      middle.current -= 1
      setJumpBack(Date.now())
    }
    setGone(all => [...all, id])
    closeLater(id, 450)
  }
  const closeRef = useRef(close)
  closeRef.current = close

  // A card behind the middle closed: move the view back a place in the same frame as the cards
  // after it, so the middle card stays put.
  useLayoutEffect(() => {
    if (jumpBack) scroller.current?.scrollTo({ x: middle.current * cardWidth, animated: false })
  }, [jumpBack])

  const handlers = useMemo<Handlers>(() => ({
    select: (id, rect) => latest.current.onSelect(id, rect),
    register: (id, ref) => latest.current.registerCard(id, ref),
    placed: rect => latest.current.onCurrentPlaced(rect),
    close: id => closeRef.current(id)
  }), [])

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
        // Every card is laid out in the same spot and moved to its own place by animation, so
        // taking one away changes no layout (which would jump): the others glide into the gap.
        contentContainerStyle={{ width: shown.length * cardWidth + side * 2, height: area }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
          listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            middle.current = Math.round(event.nativeEvent.contentOffset.x / cardWidth)
          }
        })}
      >
        {shown.map((tab, index) => (
          <StackedCard
            key={tab.id}
            tab={tab}
            index={index}
            scrollX={scrollX}
            left={side}
            top={cardTop}
            width={cardWidth}
            height={cardHeight}
            hidden={hiddenIds.includes(tab.id)}
            current={tab.id === currentId}
            jumpBack={jumpBack}
            handlers={handlers}
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
 * One tab in the stack. How far the view has gone past it sets where it sits: the ones before
 * the middle slide in behind it, a little smaller, leaving their edges showing. Its place in the
 * row is an animated value too, so when a card before it closes it glides along into the gap.
 */
const StackedCard = memo(function StackedCard({ tab, index, scrollX, left, top, width, height, hidden, current, jumpBack, handlers }: {
  tab: Tab
  index: number
  scrollX: Animated.Value
  left: number
  top: number
  width: number
  height: number
  hidden: boolean
  current: boolean
  jumpBack: number
  handlers: Handlers
}) {
  const page = useRef<ViewRef>(null)
  const lift = useRef(new Animated.Value(0)).current
  /** Where along the row it is (points), following its place as cards before it close. */
  const place = useRef(new Animated.Value(index * width)).current
  const placedAt = useRef(index * width)
  useLayoutEffect(() => {
    const to = index * width
    if (to === placedAt.current) return
    placedAt.current = to
    // Moving back along with the view (a card behind the middle closed): at once, in step with it.
    if (Date.now() - jumpBack < 100) place.setValue(to)
    else Animated.spring(place, { toValue: to, useNativeDriver: true, speed: 15, bounciness: 3 }).start()
  }, [index, width])
  // Once: the ref object itself never changes.
  useEffect(() => {
    handlers.register(tab.id, page)
  }, [])
  // As in Arc: the next tab overlaps the middle card's right edge a little; the one before it
  // tucks in behind with about a third of it showing, barely smaller; further ones stack up there.
  // Built once: rebuilding them on every render makes the native animations stutter.
  const motion = useMemo(() => {
    // How far the view has gone past this card: below 0 it's off to the right, above 0 behind on the left.
    const past = Animated.subtract(scrollX, place)
    const input = [-width, 0, width, width * 4]
    return {
      translateX: Animated.add(
        place,
        past.interpolate({ inputRange: input, outputRange: [-width * 0.12, 0, width * 0.68, width * 3.5], extrapolate: 'clamp' })
      ),
      scale: past.interpolate({ inputRange: input, outputRange: [1, 1, 0.97, 0.9], extrapolate: 'clamp' }),
      titleOpacity: past.interpolate({ inputRange: [-width * 0.6, 0, width * 0.6], outputRange: [0, 1, 0], extrapolate: 'clamp' })
    }
  }, [width, scrollX, place])

  const swipe = useRef(
    PanResponder.create({
      // Only an upward swipe; sideways is for moving between tabs. Once it's going, it keeps
      // the touch, so the list can't take over halfway and leave the card hanging.
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy < -12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => lift.setValue(Math.min(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -140 || g.vy < -1.2) {
          // Off the top, as fast as it was thrown, then gone.
          const speed = Math.max(1.5, -g.vy)
          Animated.timing(lift, { toValue: -1000, duration: Math.min(260, 900 / speed), easing: Easing.in(Easing.quad), useNativeDriver: true })
            .start(() => handlers.close(tab.id))
        } else {
          Animated.spring(lift, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start()
        }
      },
      // If the system takes the touch anyway, put the card back.
      onPanResponderTerminate: () => Animated.spring(lift, { toValue: 0, useNativeDriver: true }).start()
    })
  ).current

  return (
    <Animated.View
      {...swipe.panHandlers}
      style={{
        position: 'absolute', left, top, width,
        transform: [{ translateX: motion.translateX }, { translateY: lift }, { scale: motion.scale }]
      }}
    >
      <View style={styles.cardTop}>
        <Favicon tab={tab} size={20} />
        <Animated.Text style={[styles.title, { opacity: motion.titleOpacity }]} numberOfLines={1}>
          {tab.url ? tab.title || tab.url : 'Start page'}
        </Animated.Text>
      </View>
      <Pressable
        onPress={async () => handlers.select(tab.id, await measure(page))}
        accessibilityLabel={`Open ${tab.url ? tab.title || tab.url : 'start page'}`}
      >
        <View
          ref={page}
          collapsable={false}
          style={{ opacity: hidden ? 0 : 1 }}
          onLayout={() => {
            if (current) measure(page).then(rect => rect && handlers.placed(rect))
          }}
        >
          <TabPicture tab={tab} letterSize={64} style={[styles.page, { height }]} />
        </View>
      </Pressable>
    </Animated.View>
  )
})

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
