import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react'
import { Animated, KeyboardAvoidingView, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { captureRef } from 'react-native-view-shot'
import { BottomBar, barSpace, barTravel } from './components/BottomBar'
import { FindBar, findScript } from './components/FindBar'
import { Glass } from './components/Glass'
import { measure, useHero, type Rect, type ViewRef } from './components/Hero'
import { Icon } from './components/Icon'
import { PageActions } from './components/PageActions'
import { PULL_TO_REFRESH, PullRefresh } from './components/PullRefresh'
import { SearchOverlay } from './components/SearchOverlay'
import { SettingsSheet } from './components/SettingsSheet'
import { TabCarousel } from './components/TabCarousel'
import { TopEdge } from './components/TopEdge'
import { TabWebView, type PageState, type TabWebViewHandle } from './components/TabWebView'
import { colors, log } from './config'
import { parseColor, usableAccent } from './lib/color'
import {
  addSavedPage, clearPendingImport, deliveryScript, loadPendingImport, loadSavedPages, removeDeliveredPages
} from './lib/savedPages'
import { useTabs } from './useTabs'

/** Pull-to-refresh steps: past each distance (points), a tap, getting stronger. */
const PULL_LEVELS: [number, Haptics.ImpactFeedbackStyle][] = [
  [14, Haptics.ImpactFeedbackStyle.Light],
  [26, Haptics.ImpactFeedbackStyle.Light],
  [38, Haptics.ImpactFeedbackStyle.Medium],
  [50, Haptics.ImpactFeedbackStyle.Medium],
  [62, Haptics.ImpactFeedbackStyle.Heavy],
  [74, Haptics.ImpactFeedbackStyle.Heavy],
  [85, Haptics.ImpactFeedbackStyle.Rigid]
]

/** How many times a start page that isn't ready yet is offered what's waiting for it. */
const DELIVERY_TRIES = 10

/**
 * The browser: the current tab's page edge to edge, Arc's floating bar over it, and the layers
 * it opens over the page (tab browser, ⌃ sheet, search), which animate the way Arc's do.
 */
export const BrowserScreen = () => {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const { tabs, current, currentId, select, openTab, updateTab, closeTab, closeAll } = useTabs()
  const web = useRef<TabWebViewHandle>(null)
  const page = useRef<ComponentRef<typeof View>>(null)
  const stack = useRef<ComponentRef<typeof View>>(null)
  const hero = useHero()
  /** A second flight, for the old tab's card shrinking back into the tab button. */
  const shrink = useHero()
  const cards = useRef(new Map<string, RefObject<ViewRef | null>>()).current

  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false, loading: false })
  const [progress, setProgress] = useState(0)
  const [tabsOpen, setTabsOpen] = useState(false)
  const [hiddenCards, setHiddenCards] = useState<string[]>([])
  const [showActions, setShowActions] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchFrom, setSearchFrom] = useState('')
  const [finding, setFinding] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const deliveryTries = useRef(0)
  const currentIdRef = useRef(currentId)
  currentIdRef.current = currentId
  const tabsAppear = useRef(new Animated.Value(0)).current
  const growing = useRef(false)

  const barRoom = barSpace(insets.bottom)

  // The bar slides away while you scroll down a page, and comes back when you scroll up,
  // reach the top, or reach the end (like Safari and Arc).
  const barHide = useRef(new Animated.Value(0)).current
  const barHidden = useRef(false)
  const lastY = useRef(0)
  const showBar = (show: boolean) => {
    if (barHidden.current === !show) return
    barHidden.current = !show
    Animated.spring(barHide, { toValue: show ? 0 : barTravel(insets.bottom), useNativeDriver: true, speed: 18, bounciness: 2 }).start()
  }
  // Pull down at the top to refresh, like Arc: a ring draws itself round as you pull, and you
  // feel it in steps that get stronger the further you go. At the full pull it hits hard and
  // pulses, and the page reloads once you let go (not while you're still holding it).
  const pull = useRef(new Animated.Value(0)).current
  const pullLevel = useRef(0)
  const [refreshing, setRefreshing] = useState(false)
  const [pullPulse, setPullPulse] = useState(0)
  const reloadSeen = useRef(false)
  /** Pulled all the way: the page reloads when you let go. */
  const armed = useRef(false)
  const refresh = () => {
    if (!armed.current) return
    armed.current = false
    reloadSeen.current = false
    setRefreshing(true)
    web.current?.reload()
  }
  const feelPull = (y: number) => {
    const distance = Math.max(0, -(y + insets.top))
    pull.setValue(distance)
    if (distance <= 2) {
      pullLevel.current = 0
      // Back at the top after a full pull, and the page never said you let go: reload now.
      refresh()
      return
    }
    if (refreshing || armed.current) return
    const level = distance >= PULL_TO_REFRESH ? PULL_LEVELS.length + 1 : PULL_LEVELS.filter(([at]) => distance >= at).length
    if (level <= pullLevel.current) return
    pullLevel.current = level
    if (level > PULL_LEVELS.length) {
      // Full pull: a hard triple hit and one pulse; the reload waits for you to let go.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 70)
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid), 150)
      armed.current = true
      setPullPulse(Date.now())
    } else {
      Haptics.impactAsync(PULL_LEVELS[level - 1][1])
    }
  }
  // The ring stops once the reload has finished (or after a while, if it never reports).
  useEffect(() => {
    if (!refreshing) return
    const giveUp = setTimeout(() => setRefreshing(false), 10_000)
    return () => clearTimeout(giveUp)
  }, [refreshing])

  const onScroll = (y: number, contentHeight: number, viewHeight: number) => {
    feelPull(y)
    const moved = y - lastY.current
    lastY.current = y
    if (y <= 40 || y + viewHeight >= contentHeight - 40) return showBar(true)
    if (moved > 6) showBar(false)
    else if (moved < -6) showBar(true)
  }
  // A different tab starts with the bar showing.
  useEffect(() => {
    lastY.current = 0
    showBar(true)
  }, [currentId])  // showBar only reads refs

  // A short message over the bar, like "Added to Tabscape". It slides rather than fades:
  // Liquid Glass doesn't render at low opacity.
  const noticeSlide = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!notice) return
    Animated.spring(noticeSlide, { toValue: 1, useNativeDriver: true }).start()
    const timer = setTimeout(() => {
      Animated.timing(noticeSlide, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setNotice(null))
    }, 2200)
    return () => clearTimeout(timer)
  }, [notice, noticeSlide])

  /** A small picture of the page as it is now, for the tab button and the tab browser. */
  const snapshot = async (id = currentId) => {
    try {
      const uri = await captureRef(page, { format: 'jpg', quality: 0.7, result: 'tmpfile', width: 360 })
      updateTab(id, { thumbnail: uri })
    } catch (e) {
      log("couldn't take a picture of the tab", e)
    }
  }

  const onState = (state: PageState) => {
    setNav({ canGoBack: state.canGoBack, canGoForward: state.canGoForward, loading: state.loading })
    if (refreshing) {
      if (state.loading) reloadSeen.current = true
      else if (reloadSeen.current) setRefreshing(false)
    }
    updateTab(currentId, { url: state.url, title: state.url ? state.title : 'Start page' })
    // Once it's drawn; tied to this tab, in case another is showing by then.
    const id = currentId
    if (!state.loading) setTimeout(() => id === currentIdRef.current && snapshot(id), 400)
  }

  /** A start page is up: offer it anything waiting (saved pages, a backup to import). */
  const deliver = async () => {
    const [pages, backup] = await Promise.all([loadSavedPages(), loadPendingImport()])
    if (pages.length || backup) web.current?.inject(deliveryScript(pages, backup))
  }

  const onMessage = async (data: { type: string; [key: string]: unknown }) => {
    if (data.type === 'find') setNotFound(!data.found)
    // Your finger came off the page while it was pulled down past its top.
    if (data.type === 'released') refresh()
    if (data.type === 'accent') updateTab(currentId, { accent: usableAccent(parseColor(String(data.color ?? ''))) })
    if (data.type === 'delivered') {
      const taken = Number(data.taken)
      if (taken < 0) {
        // The start page is still starting up: try again shortly.
        if (++deliveryTries.current < DELIVERY_TRIES) setTimeout(deliver, 500)
        return
      }
      deliveryTries.current = 0
      await removeDeliveredPages(Number(data.offered))
      if (data.imported !== null) {
        await clearPendingImport()
        setNotice(data.imported ? 'Your links are here' : "That backup couldn't be read")
      }
      log('start page took', taken, 'saved pages; import:', data.imported)
    }
  }

  const addToTabscape = async () => {
    if (!current.url) return
    await addSavedPage({ url: current.url, title: current.title || current.url })
    setShowActions(false)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setNotice('Added to Tabscape')
  }

  /** A backup is waiting: take it to a start page (this tab if it is one, a new one if not). */
  const importQueued = () => {
    setShowSettings(false)
    if (current.url) openTab()
    else deliver()
  }

  const search = (from: string) => {
    setSearchFrom(from)
    setSearching(true)
  }

  /** + : a new tab on the start page, with search up over it. */
  const newTab = () => {
    showBar(true)
    snapshot()
    openTab()
    search('')
  }

  // ---- The tab browser and its transitions ----

  /** Opens the tab browser: this tab's picture grows out of the tab button into the middle card. */
  const openTabs = async () => {
    showBar(true)
    await snapshot()
    tabsAppear.setValue(0)
    setHiddenCards([currentId])
    growing.current = true
    setTabsOpen(true)
  }

  /** The middle card is in place: fly the picture from the tab button to it. */
  const growIntoCard = async (card: Rect) => {
    if (!growing.current) return
    growing.current = false
    const from = (await measure(stack)) ?? { x: 24, y: height - barRoom, width: 40, height: 50 }
    Animated.timing(tabsAppear, { toValue: 1, duration: 260, useNativeDriver: true }).start()
    await hero.fly(current, from, card, { radius: 22 })
    setHiddenCards([])
  }

  /** Closes the tab browser without a flight (for +, settings, close all). */
  const fadeOutTabs = () => {
    Animated.timing(tabsAppear, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setTabsOpen(false))
  }

  /**
   * Picks a tab: its card grows to fill the screen while the tab browser fades away under it,
   * and, if it's a different tab, the old one's card shrinks back into the tab button, like Arc.
   */
  const openFromCard = async (id: string, card: Rect | null) => {
    const tab = tabs.find(t => t.id === id)
    const old = current
    const [full, oldCard, button] = await Promise.all([
      measure(page),
      old.id !== id ? measure(cards.get(old.id) ?? { current: null }) : Promise.resolve(null),
      measure(stack)
    ])
    select(id)
    if (!tab || !card) return fadeOutTabs()
    setHiddenCards(oldCard ? [id, old.id] : [id])
    hero.fly(tab, card, full ?? { x: 0, y: 0, width, height }, { radius: 48, fadeAtEnd: true })
    if (oldCard && button) shrink.fly(old, oldCard, button, { radius: 9 })
    Animated.timing(tabsAppear, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => {
      setTabsOpen(false)
      setHiddenCards([])
    })
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={finding}>
      <View ref={page} style={styles.page} collapsable={false}>
        <TabWebView
          key={current.id}
          ref={web}
          tab={current}
          bottomInset={finding ? 0 : barRoom - insets.bottom}
          onState={onState}
          onProgress={setProgress}
          onStartPageLoaded={deliver}
          onMessage={onMessage}
          onNewWindow={url => openTab(url)}
          onScroll={onScroll}
        />
      </View>
      <TopEdge height={insets.top + 18} />
      <PullRefresh pull={pull} pulse={pullPulse} refreshing={refreshing} top={insets.top + 6} />

      {notice && (
        <Animated.View
          pointerEvents="none"
          style={[styles.notice, {
            bottom: barRoom + 8,
            transform: [{ translateY: noticeSlide.interpolate({ inputRange: [0, 1], outputRange: [140, 0] }) }]
          }]}
        >
          <Glass style={styles.noticePill}>
            <Icon sf="checkmark.circle.fill" fallback="checkmark-circle" size={20} />
            <Text style={styles.noticeText}>{notice}</Text>
          </Glass>
        </Animated.View>
      )}

      {finding ? (
        <View style={{ paddingBottom: insets.bottom, backgroundColor: colors.background }}>
          <FindBar
            notFound={notFound}
            onFind={(query, backwards) => web.current?.inject(findScript(query, backwards))}
            onTyping={() => setNotFound(false)}
            onDone={() => setFinding(false)}
          />
        </View>
      ) : (
        <BottomBar
          tab={current}
          behind={tabs[tabs.indexOf(current) - 1] ?? tabs[tabs.indexOf(current) + 1]}
          tabCount={tabs.length}
          progress={progress}
          loading={nav.loading}
          bottomInset={insets.bottom}
          hide={barHide}
          stackRef={stack}
          onTabs={openTabs}
          onNewTab={newTab}
          onMenu={() => {
            showBar(true)
            setShowActions(true)
          }}
        />
      )}

      <PageActions
        visible={showActions}
        url={current.url}
        canGoBack={nav.canGoBack}
        canGoForward={nav.canGoForward}
        loading={nav.loading}
        onClose={() => setShowActions(false)}
        onBack={() => web.current?.goBack()}
        onForward={() => web.current?.goForward()}
        onReloadOrStop={() => (nav.loading ? web.current?.stopLoading() : web.current?.reload())}
        onEditAddress={() => {
          setShowActions(false)
          search(current.url ?? '')
        }}
        onFind={() => {
          setShowActions(false)
          setFinding(true)
        }}
        onAddToTabscape={addToTabscape}
        onSettings={() => {
          setShowActions(false)
          setShowSettings(true)
        }}
      />

      {tabsOpen && (
        <TabCarousel
          tabs={tabs}
          currentId={currentId}
          hiddenIds={hiddenCards}
          appear={tabsAppear}
          onCurrentPlaced={growIntoCard}
          registerCard={(id, ref) => cards.set(id, ref)}
          onSelect={openFromCard}
          onClose={closeTab}
          onCloseAll={() => {
            closeAll()
            fadeOutTabs()
          }}
          onNewTab={() => {
            openTab()
            fadeOutTabs()
            search('')
          }}
          onSettings={() => {
            fadeOutTabs()
            setShowSettings(true)
          }}
        />
      )}

      <SearchOverlay
        visible={searching}
        initial={searchFrom}
        onGo={url => web.current?.load(url)}
        onClose={() => setSearching(false)}
      />

      {/* The flying tab pictures, above everything else. */}
      {shrink.element}
      {hero.element}

      <SettingsSheet visible={showSettings} onClose={() => setShowSettings(false)} onImportQueued={importQueued} />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, backgroundColor: colors.background },
  notice: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  noticePill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 13 },
  noticeText: { color: colors.text, fontSize: 16, fontWeight: '600' }
})
