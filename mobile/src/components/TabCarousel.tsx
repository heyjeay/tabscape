import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react'
import {
  Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions,
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
/** The Tabs / Private switch along the top. */
const SWITCH = 44

interface Props {
  tabs: Tab[]
  currentId: string
  /** Cards hidden while their pictures fly to or from them. */
  hiddenIds: string[]
  /** 0 → 1 as the tab browser comes in (and back as it leaves). */
  appear: Animated.Value
  /** The middle card has been laid out: where it is, for the picture flying into it. */
  onCurrentPlaced: (rect: Rect) => void
  /** Each card's page, so the screen can find where any of them is (null once the card's gone). */
  registerCard: (id: string, ref: RefObject<ViewRef | null> | null) => void
  onSelect: (id: string, rect: Rect | null) => void
  onClose: (id: string) => void
  /** Clear All Tabs, from past the last card. */
  onCloseAll: () => void
  /** Home: a start page. */
  onHome: () => void
  /** +: search, then a new tab with what's picked. */
  onNewTab: () => void
  onSettings: () => void
  /** Holding +: the tab closed last comes back. */
  onReopen: () => void
  /** Showing private tabs (and + opens one), or the others. */
  isPrivate: boolean
  onSwitch: (isPrivate: boolean) => void
}

/** How a card to the right of the middle one comes in, once the tab browser has opened. */
interface Entering {
  opacity: Animated.Value
  x: Animated.AnimatedInterpolation<number>
}

/** What the cards call back with. Made once, so the cards only redraw when they themselves change. */
interface Handlers {
  select: (id: string, rect: Rect | null) => void
  register: (id: string, ref: RefObject<ViewRef | null> | null) => void
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
  const cardWidth = Math.min(width * 0.7, 420)
  const cardHeight = Math.min(height * 0.65, height - insets.top - insets.bottom - 190 - SWITCH)
  // Not centred: Arc sets the middle card a little right of centre (its left edge about a fifth of
  // the way across), so the card before it peeks out on the left and the next one covers its right edge.
  const side = (width - cardWidth) / 2 + width * 0.06
  // The cards sit centred in the space between the switch and the buttons.
  const area = height - insets.top - SWITCH - (Math.max(insets.bottom, 12) + BUTTONS)
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
  /** The cards to the right of it as it opens (they slide in once the picture has landed). Fixed, so closing a card never changes which ones these are. */
  const toTheRight = useRef(new Set(tabs.slice(start + 1).map(t => t.id))).current
  const scrollX = useRef(new Animated.Value(start * cardWidth)).current
  /**
   * Where the row has been scrolled to. scrollX follows the scrolling natively, and its own idea
   * of where it is stays where it began; a card that redraws (as one closes) is drawn from that,
   * jumping back to where the row was when it opened. So it's brought up to date whenever the
   * row comes to rest, and before a card closes.
   */
  const scrolledTo = useRef(start * cardWidth)
  const settle = () => scrollX.setValue(scrolledTo.current)
  const scroller = useRef<ComponentRef<typeof Animated.ScrollView>>(null)
  /** The card in the middle right now. */
  const middle = useRef(start)
  /** Counts closes of cards behind the middle: then the view and the cards after it move back a place together, at once. */
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
    settle()
    if (shown.length === 1) {
      // The last card showing: close the ones still waiting too, then this one, and a fresh
      // start page takes their place.
      pending.current.forEach((timer, waiting) => {
        clearTimeout(timer)
        latest.current.onClose(waiting)
      })
      pending.current.clear()
      setGone([])
      latest.current.onClose(id)
      return
    }
    if (index === shown.length - 1 && index === middle.current) {
      // The last card, in the middle: nothing slides in from the right, so glide back to the
      // card before it first, then take it away (taking it first would snap the row short).
      middle.current = index - 1
      scroller.current?.scrollTo({ x: (index - 1) * cardWidth, animated: true })
      setTimeout(() => {
        scrolledTo.current = (index - 1) * cardWidth
        settle()
        setGone(all => [...all, id])
      }, 320)
      closeLater(id, 700)
      return
    }
    if (index < middle.current) {
      middle.current -= 1
      setJumpBack(n => n + 1)
    }
    setGone(all => [...all, id])
    closeLater(id, 450)
  }
  const closeRef = useRef(close)
  closeRef.current = close

  // A card behind the middle closed: move the view back a place in the same frame as the cards
  // after it, so the middle card stays put.
  useLayoutEffect(() => {
    if (!jumpBack) return
    scrolledTo.current = middle.current * cardWidth
    scroller.current?.scrollTo({ x: scrolledTo.current, animated: false })
    settle()
  }, [jumpBack])

  // Built once: a new one each render would be unhooked and hooked up again natively.
  const widthRef = useRef(cardWidth)
  widthRef.current = cardWidth
  /**
   * Past the last card, there's room for one more: swipe on to it and Clear All Tabs comes into
   * view, with a firm tap when it's there. Swipe back and it goes again.
   */
  const count = shown.length
  const countRef = useRef(count)
  countRef.current = count
  const [clearReady, setClearReady] = useState(false)
  const clearReadyRef = useRef(false)
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
    useNativeDriver: true,
    listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = event.nativeEvent.contentOffset.x
      scrolledTo.current = x
      middle.current = Math.min(Math.round(x / widthRef.current), Math.max(0, countRef.current - 1))
      const ready = countRef.current > 0 && x >= (countRef.current - 0.5) * widthRef.current
      if (ready !== clearReadyRef.current) {
        clearReadyRef.current = ready
        setClearReady(ready)
        if (ready) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
      }
    }
  }), [scrollX])
  // Built once, with where the row ends as a value of its own: rebuilding it as cards close would
  // redraw it from a stale scroll position.
  const rowEnd = useRef(new Animated.Value(count * cardWidth)).current
  useLayoutEffect(() => rowEnd.setValue(count * cardWidth), [rowEnd, count, cardWidth])
  const { clearReveal, clearScale } = useMemo(() => {
    const reveal = Animated.subtract(scrollX, rowEnd).interpolate({ inputRange: [-cardWidth, 0], outputRange: [0, 1], extrapolate: 'clamp' })
    return { clearReveal: reveal, clearScale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }
  }, [scrollX, rowEnd, cardWidth])

  // Opening, this tab's picture flies from the tab button into the middle card, drawn over
  // everything. The next card overlaps the middle one's right edge in front of it, so while the
  // picture is in the air (this tab's card is hidden), the cards to the right wait out of sight,
  // and slide in once it has landed: no card popping in front of it when the flight ends.
  const flyingIn = hiddenIds.includes(currentId)
  const entry = useRef(new Animated.Value(flyingIn ? 0 : 1)).current
  useEffect(() => {
    if (!flyingIn) Animated.timing(entry, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [flyingIn, entry])
  const entering = useMemo<Entering>(() => ({
    opacity: entry,
    x: entry.interpolate({ inputRange: [0, 1], outputRange: [cardWidth * 0.35, 0] })
  }), [entry, cardWidth])

  const handlers = useMemo<Handlers>(() => ({
    select: (id, rect) => latest.current.onSelect(id, rect),
    register: (id, ref) => latest.current.registerCard(id, ref),
    placed: rect => latest.current.onCurrentPlaced(rect),
    close: id => closeRef.current(id)
  }), [])

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
        style={{ position: 'absolute', top: insets.top + SWITCH, left: 0, right: 0, height: area, opacity: appear }}
        // Every card is laid out in the same spot and moved to its own place by animation, so
        // taking one away changes no layout (which would jump): the others glide into the gap.
        // Room to bring the last card to the middle, and one place more, for Clear All Tabs.
        contentContainerStyle={{ width: (count ? count * cardWidth : 0) + width, height: area }}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollEndDrag={settle}
        onMomentumScrollEnd={settle}
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
            entering={toTheRight.has(tab.id) ? entering : undefined}
            handlers={handlers}
          />
        ))}
      </Animated.ScrollView>

      {/* Clear All Tabs, past the last card: it grows into the middle as you swipe on to it. */}
      {count > 0 && (
        <Animated.View
          pointerEvents={clearReady ? 'box-none' : 'none'}
          style={[styles.clear, {
            top: insets.top + SWITCH + cardTop,
            left: side,
            width: cardWidth,
            height: cardHeight,
            opacity: clearReveal,
            transform: [{ scale: clearScale }]
          }]}
        >
          <Pressable
            onPress={props.onCloseAll}
            style={({ pressed }) => [styles.clearButton, pressed && styles.clearPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Clear all ${count} ${props.isPrivate ? 'private ' : ''}tabs`}
          >
            <View style={styles.clearCircle}>
              <Icon sf="trash.fill" fallback="trash" size={34} color="#fff" weight="semibold" />
            </View>
            <Text style={styles.clearTitle}>Clear All Tabs</Text>
            <Text style={styles.clearCount}>{count} {props.isPrivate ? 'private ' : ''}tab{count === 1 ? '' : 's'} · hold + to reopen</Text>
          </Pressable>
        </Animated.View>
      )}

      {!shown.length && (
        <Animated.View pointerEvents="none" style={[styles.empty, { top: insets.top + SWITCH, height: area, opacity: appear }]}>
          <Icon sf={props.isPrivate ? 'eye.slash' : 'square.on.square'} fallback={props.isPrivate ? 'eye-off-outline' : 'copy-outline'} size={44} color={colors.secondary} />
          <Text style={styles.emptyTitle}>{props.isPrivate ? 'Private tabs' : 'No tabs'}</Text>
          <Text style={styles.emptyText}>
            {props.isPrivate
              ? "Private tabs keep no history, no cookies and nothing a site saves, and they're gone when you close the app. Tap + to open one."
              : 'Tap + to open a tab.'}
          </Text>
        </Animated.View>
      )}

      {/* Tabs or private tabs, like Safari. Slides down rather than fading in: Liquid Glass doesn't render faded. */}
      <Animated.View
        style={[styles.switchWrap, {
          top: insets.top,
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] }) }]
        }]}
      >
        <Glass style={styles.switch}>
          {[false, true].map(mode => (
            <Pressable
              key={String(mode)}
              onPress={() => mode !== props.isPrivate && props.onSwitch(mode)}
              style={[styles.switchPart, mode === props.isPrivate && styles.switchOn]}
              accessibilityLabel={mode ? 'Private tabs' : 'Tabs'}
              accessibilityState={{ selected: mode === props.isPrivate }}
            >
              <Icon sf={mode ? 'eye.slash' : 'square.on.square'} fallback={mode ? 'eye-off-outline' : 'copy-outline'} size={15} color={mode === props.isPrivate ? colors.text : colors.secondary} />
              <Text style={[styles.switchText, mode === props.isPrivate && styles.switchTextOn]}>{mode ? 'Private' : 'Tabs'}</Text>
            </Pressable>
          ))}
        </Glass>
      </Animated.View>

      {/* Slides up rather than fading in: Liquid Glass doesn't render faded. */}
      <Animated.View
        style={[styles.bottom, {
          paddingBottom: Math.max(insets.bottom, 12),
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [140, 0] }) }]
        }]}
      >
        <RoundButton sf="house" fallback="home-outline" label="Home" onPress={props.onHome} />
        <Pressable
          onPress={props.onNewTab}
          onLongPress={props.onReopen}
          delayLongPress={400}
          accessibilityLabel={props.isPrivate ? 'New private tab' : 'New tab'}
          accessibilityHint="Hold to reopen the tab you closed last"
        >
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
const StackedCard = memo(function StackedCard({ tab, index, scrollX, left, top, width, height, hidden, current, jumpBack, entering, handlers }: {
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
  /** To the right of the middle card as the tab browser opens: waits, then slides in. */
  entering?: Entering
  handlers: Handlers
}) {
  const page = useRef<ViewRef>(null)
  const lift = useRef(new Animated.Value(0)).current
  /** Where along the row it is (points), following its place as cards before it close. */
  const place = useRef(new Animated.Value(index * width)).current
  const placedAt = useRef(index * width)
  const jumpsSeen = useRef(jumpBack)
  useLayoutEffect(() => {
    const to = index * width
    const jump = jumpBack !== jumpsSeen.current
    jumpsSeen.current = jumpBack
    if (to === placedAt.current) return
    placedAt.current = to
    // Moving back along with the view (a card behind the middle closed): at once, in step with it.
    if (jump) place.setValue(to)
    else Animated.spring(place, { toValue: to, useNativeDriver: true, speed: 15, bounciness: 3 }).start()
  }, [index, width, jumpBack])
  // Once (the ref object itself never changes), and let go of when the card goes.
  useEffect(() => {
    handlers.register(tab.id, page)
    return () => handlers.register(tab.id, null)
  }, [])
  // Measured from Arc: the next tab covers the middle card's right ~30%; the one before it tucks
  // in behind, its edge showing about a quarter of a card to the left, barely smaller; further
  // ones stack up there.
  // Built once: rebuilding them on every render makes the native animations stutter.
  const motion = useMemo(() => {
    // How far the view has gone past this card: below 0 it's off to the right, above 0 behind on the left.
    const past = Animated.subtract(scrollX, place)
    const input = [-width, 0, width, width * 4]
    const along = Animated.add(
      place,
      past.interpolate({ inputRange: input, outputRange: [-width * 0.29, 0, width * 0.73, width * 3.72], extrapolate: 'clamp' })
    )
    return {
      translateX: entering ? Animated.add(along, entering.x) : along,
      scale: past.interpolate({ inputRange: input, outputRange: [1, 1, 0.985, 0.95], extrapolate: 'clamp' }),
      titleOpacity: past.interpolate({ inputRange: [-width * 0.6, 0, width * 0.6], outputRange: [0, 1, 0], extrapolate: 'clamp' })
    }
  }, [width, scrollX, place, entering])

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
        opacity: entering?.opacity ?? 1,
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
  switchWrap: { position: 'absolute', left: 0, right: 0, height: SWITCH, alignItems: 'center', justifyContent: 'center' },
  switch: { flexDirection: 'row', height: 36, borderRadius: 18, padding: 3 },
  switchPart: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 15 },
  switchOn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  switchText: { color: colors.secondary, fontSize: 14, fontWeight: '600' },
  switchTextOn: { color: colors.text },
  empty: { position: 'absolute', left: 40, right: 40, alignItems: 'center', justifyContent: 'center', gap: 12 },
  clear: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  clearButton: { alignItems: 'center', gap: 10, padding: 24, borderRadius: 32 },
  clearPressed: { transform: [{ scale: 0.94 }] },
  clearCircle: {
    width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff453a',
    shadowColor: '#ff453a', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }
  },
  clearTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 6 },
  clearCount: { color: colors.secondary, fontSize: 14 },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  emptyText: { color: colors.secondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 30, marginBottom: 8, paddingHorizontal: 4 },
  title: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '500' },
  page: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' }
})
