import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react'
import {
  ActionSheetIOS, Alert, Animated, AppState, KeyboardAvoidingView, Platform, Share, StyleSheet, Text, View, useWindowDimensions
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { captureRef } from 'react-native-view-shot'
import { BottomBar, barSpace, barTravel } from './components/BottomBar'
import { FindBar, findScript } from './components/FindBar'
import { Glass } from './components/Glass'
import { measure, useHero, type Rect, type ViewRef } from './components/Hero'
import { HistorySheet, type HistoryKind } from './components/HistorySheet'
import { Icon } from './components/Icon'
import { PageActions } from './components/PageActions'
import { PULL_TO_REFRESH, PullRefresh } from './components/PullRefresh'
import { ReaderView } from './components/ReaderView'
import { SearchOverlay } from './components/SearchOverlay'
import { SettingsSheet } from './components/SettingsSheet'
import { TabCarousel } from './components/TabCarousel'
import { TopEdge } from './components/TopEdge'
import { TabPicture } from './components/TabPicture'
import { SWIPE_RADIUS, useTabSwipe } from './components/TabSwipe'
import { TabWebView, type PageState, type TabWebViewHandle } from './components/TabWebView'
import { colors, log } from './config'
import { hostOf } from './lib/address'
import { parseColor, usableAccent } from './lib/color'
import { recordVisit } from './lib/history'
import { iconFor, iconKey, loadSavedIcons, onIcon } from './lib/icons'
import { parseArticle, readerScript, type Article } from './lib/reader'
import {
  addSavedPage, clearPendingImport, deliveryScript, loadPendingImport, loadSavedPages, removeDeliveredPages
} from './lib/savedPages'
import { hasNativeExtras, setBlocking } from '../modules/tabscape-native'
import { loadSettings } from './lib/settings'
import { stepSize, textSizeScript, useTextSizes } from './lib/sites'
import { useTabs, type Tab } from './useTabs'

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
 * How many tabs keep their page live: the one showing, the ones either side of it (loaded ahead,
 * so a swipe lands on a page that's already there), and the last ones you were on. Going back to
 * any of them is instant, where you left it. Each live page costs memory, so older tabs go back
 * to being an address and a picture until you open them; if iOS needs the memory back sooner,
 * the page loads again when you come to it (see TabWebView's onContentProcessDidTerminate).
 */
const LIVE_TABS = 6

/** Run in a page that's no longer showing, so it doesn't keep playing behind the others. */
const pauseScript = `document.querySelectorAll('video, audio').forEach(function (m) { try { m.pause(); } catch (e) {} }); true;`

const NO_PAGE: PageState = { url: null, title: '', canGoBack: false, canGoForward: false, loading: false }

/**
 * The browser: the current tab's page edge to edge, Arc's floating bar over it, and the layers
 * it opens over the page (tab browser, ⌃ sheet, search), which animate the way Arc's do.
 */
export const BrowserScreen = () => {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const { restored, tabs, current, currentId, select, openTab, updateTab, closeTab, closeAll, reopenClosed, archiveOld } = useTabs()
  const { sizeFor, setSize, sizesFor, saved: savedTextSizes, resetSize } = useTextSizes()
  const isPrivate = !!current.private
  /** The tabs of the same kind as the one showing (private or not): what the bar swipes through. */
  const group = tabs.filter(t => !!t.private === isPrivate)
  const textSize = sizeFor(current.url, isPrivate)
  /** Each live tab's page. */
  const webs = useRef(new Map<string, TabWebViewHandle>()).current
  /** The page showing. */
  const web = { get current() { return webs.get(currentIdRef.current) ?? null } }
  const page = useRef<ComponentRef<typeof View>>(null)
  const stack = useRef<ComponentRef<typeof View>>(null)
  const hero = useHero()
  /** A second flight, for the old tab's card shrinking back into the tab button. */
  const shrink = useHero()
  const cards = useRef(new Map<string, RefObject<ViewRef | null>>()).current

  /** What each live page last said about itself (back, forward, loading); the one showing drives the bar. */
  const [pageStates, setPageStates] = useState<Record<string, PageState>>({})
  const [progress, setProgress] = useState(0)
  const [tabsOpen, setTabsOpen] = useState(false)
  const [hiddenCards, setHiddenCards] = useState<string[]>([])
  const [showActions, setShowActions] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchFrom, setSearchFrom] = useState('')
  const [finding, setFinding] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [notice, setNotice] = useState<{ text: string; info?: boolean } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  /** Which list History opens on. */
  const [historyOn, setHistoryOn] = useState<HistoryKind>('history')
  /** Asked for from Settings: shown once Settings has gone (two sheets can't be up at once). */
  const historyAfterSettings = useRef<HistoryKind | null>(null)
  const [article, setArticle] = useState<Article | null>(null)
  /** The tab browser is showing private tabs. */
  const [browsingPrivate, setBrowsingPrivate] = useState(false)
  const deliveryTries = useRef(0)
  const currentIdRef = useRef(currentId)
  currentIdRef.current = currentId
  const nav = pageStates[currentId] ?? NO_PAGE

  // The tabs you've been on, most recent first.
  const recent = useRef<string[]>([])
  const exists = (id: string) => tabs.some(t => t.id === id)
  if (recent.current[0] !== currentId || recent.current.some(id => !exists(id))) {
    recent.current = [currentId, ...recent.current.filter(id => id !== currentId && exists(id))].slice(0, LIVE_TABS)
  }
  // The tabs with live pages: this one, its neighbours in the swipe row, then the recent ones.
  const groupAt = group.indexOf(current)
  const neighbours = [group[groupAt - 1], group[groupAt + 1]].filter(Boolean).map(t => t.id)
  // The tab button is a deck, like Arc's, of the tabs before this one: the one just before it in
  // front, the one before that behind. Swiping left takes the front card back out (so you can walk
  // back along all your tabs), and swiping right puts this page onto it.
  const deckFor = () => ({ front: group[groupAt - 1], behind: group[groupAt - 2] })
  const liveIds = { current: [...new Set([currentId, ...neighbours, ...recent.current])].slice(0, LIVE_TABS) }
  const live = tabs.filter(t => liveIds.current.includes(t.id))

  // A page you've left stops playing.
  const shownBefore = useRef(currentId)
  useEffect(() => {
    if (shownBefore.current !== currentId) webs.get(shownBefore.current)?.inject(pauseScript)
    shownBefore.current = currentId
  }, [currentId, webs])
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
  const lastPull = useRef(0)
  const feelPull = (y: number) => {
    const distance = Math.max(0, -(y + insets.top))
    // Most scrolling is nowhere near the top: only tell the ring when the pull changes.
    if (distance !== lastPull.current) {
      lastPull.current = distance
      pull.setValue(distance)
    }
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
      setPullPulse(n => n + 1)
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

  /** A live page (showing or not) says where it is and whether it's loading. */
  const onState = (id: string, state: PageState) => {
    // Kept for the live pages only, so closed tabs don't pile up here.
    setPageStates(all => {
      const next: Record<string, PageState> = { [id]: state }
      for (const other of liveIds.current) if (other !== id && all[other]) next[other] = all[other]
      return next
    })
    updateTab(id, { url: state.url, title: state.url ? state.title : 'Start page' })
    if (!state.loading) uncover(id)
    // The rest is for the page showing (one loading ahead, out of sight, isn't a visit yet).
    if (id !== currentIdRef.current) return
    // Into history once it's loaded; never from a private tab.
    if (!state.loading && state.url && !tabs.find(t => t.id === id)?.private) recordVisit(state.url, state.title)
    if (refreshing) {
      if (state.loading) reloadSeen.current = true
      else if (reloadSeen.current) setRefreshing(false)
    }
    // A picture once it's drawn. A page reports several times as it finishes, so only the last
    // of those takes one; tied to this tab, in case another is showing by then.
    clearTimeout(pictureTimer.current)
    if (!state.loading) pictureTimer.current = setTimeout(() => id === currentIdRef.current && snapshot(id), 400)
  }
  const pictureTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(pictureTimer.current), [])

  /** A start page is up: offer it anything waiting (saved pages, a backup to import). */
  const deliver = async (id: string) => {
    const [pages, backup] = await Promise.all([loadSavedPages(), loadPendingImport()])
    if (pages.length || backup) webs.get(id)?.inject(deliveryScript(pages, backup))
  }

  const onMessage = async (id: string, data: { type: string; [key: string]: unknown }) => {
    if (data.type === 'accent') {
      // The start page draws its own background (its wallpaper), so it keeps the app's.
      const onStartPage = !tabs.find(t => t.id === id)?.url
      updateTab(id, {
        accent: usableAccent(parseColor(String(data.color ?? ''))),
        background: onStartPage ? undefined : (parseColor(String(data.background ?? '')) ?? undefined)
      })
    }
    if (data.type === 'delivered') return delivered(id, data)
    // A start page asks for site icons it hasn't got: each is handed over as it's found (once, ever).
    if (data.type === 'icons' && Array.isArray(data.hosts)) {
      for (const host of data.hosts.filter((h): h is string => typeof h === 'string').slice(0, 300)) {
        iconFor(host).then(uri => {
          webs.get(id)?.inject(`window.tabscapeIcons && window.tabscapeIcons(${JSON.stringify({ [host]: uri })}); true;`)
        })
      }
      log('start page asked for', data.hosts.length, 'icons;', Object.keys(icons).length, 'saved, e.g.', iconKey(String(data.hosts[0] ?? '')))
      return
    }
    // The rest is about what you're doing, on the page showing.
    if (id !== currentIdRef.current) return
    if (data.type === 'find') setNotFound(!data.found)
    // Your finger came off the page while it was pulled down past its top.
    if (data.type === 'released') refresh()
    if (data.type === 'linkPress') linkMenu(String(data.url), String(data.text ?? ''), typeof data.image === 'string' ? data.image : null)
    if (data.type === 'reader') {
      const found = parseArticle(data)
      if (found) setArticle(found)
      else setNotice({ text: 'No article to read on this page', info: true })
    }
  }

  /** A start page says what it took in. */
  const delivered = async (id: string, data: { [key: string]: unknown }) => {
    {
      const taken = Number(data.taken)
      if (taken < 0) {
        // The start page is still starting up: try again shortly.
        if (++deliveryTries.current < DELIVERY_TRIES) setTimeout(() => deliver(id), 500)
        return
      }
      deliveryTries.current = 0
      await removeDeliveredPages(Number(data.offered))
      if (data.imported !== null) {
        await clearPendingImport()
        setNotice(data.imported ? { text: 'Your links are here' } : { text: "That backup couldn't be read", info: true })
      }
      log('start page took', taken, 'saved pages; import:', data.imported)
    }
  }

  const addToTabscape = async () => {
    if (!current.url) return
    await addSavedPage({ url: current.url, title: current.title || current.url })
    setShowActions(false)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setNotice({ text: 'Added to Tabscape' })
  }

  /** Holding a link: what to do with it, in iOS's own menu. */
  const linkMenu = (url: string, text: string, image: string | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    type Choice = [string, () => void]
    const choices: Choice[] = [
      ['Open in New Tab', () => {
        snapshot()
        openTab(url, { private: isPrivate, title: text })
      }],
      ['Open in Background', () => {
        openTab(url, { private: isPrivate, background: true, title: text })
        setNotice({ text: 'Opened in the background' })
      }]
    ]
    if (!isPrivate) {
      choices.push(['Open in Private Tab', () => {
        snapshot()
        openTab(url, { private: true, title: text })
      }])
    }
    if (image) {
      choices.push(['Open Image in New Tab', () => {
        snapshot()
        openTab(image, { private: isPrivate })
      }])
    }
    choices.push(
      ['Copy Link', () => {
        Clipboard.setStringAsync(url).then(() => setNotice({ text: 'Link copied' })).catch(() => {})
      }],
      ['Share…', () => {
        Share.share({ url, message: url }).catch(() => {})
      }]
    )
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: text || undefined,
          message: url,
          options: [...choices.map(([label]) => label), 'Cancel'],
          cancelButtonIndex: choices.length,
          userInterfaceStyle: 'dark'
        },
        index => choices[index]?.[1]()
      )
    } else {
      Alert.alert(text || url, url, [
        ...choices.slice(0, 2).map(([label, act]) => ({ text: label, onPress: act })),
        { text: 'Cancel', style: 'cancel' as const }
      ])
    }
  }

  // A tab without a live page loads again when you go to it; until it's drawn, its picture
  // stands in, so a swipe lands on the page you saw rather than on an empty one.
  const [cover, setCover] = useState<Tab | null>(null)
  const coverRef = useRef(cover)
  coverRef.current = cover
  const coverFade = useRef(new Animated.Value(1)).current
  const uncover = (id: string) => {
    if (coverRef.current?.id !== id) return
    coverRef.current = null
    Animated.timing(coverFade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setCover(null))
  }

  /** Swiping along the bar: the page follows your finger, and tabs fly into and out of the tab button, like Arc (see TabSwipe). */
  const swipe = useTabSwipe({
    width,
    height,
    // In Tabscape's own build, iOS hands swipes along the very bottom to the app first (see
    // modules/tabscape-native), so they can change tabs too; in Expo Go that strip is left to iOS.
    bottomInset: hasNativeExtras ? 0 : insets.bottom,
    current,
    measureDeck: () => measure(stack),
    next: group[groupAt + 1],
    // Back to the tab before this one: the tab button's front card, so the card that comes out of it is the one you saw there.
    back: deckFor().front,
    // A fresh picture of the page for the card that flies into the tab button, taken as soon as a
    // finger is on the bar so it's ready in time.
    onTouch: () => snapshot(),
    onStart: () => showBar(true),
    onSwitch: tab => {
      if (!liveIds.current.includes(tab.id) && tab.url && tab.thumbnail) {
        coverFade.setValue(1)
        setCover(tab)
        setTimeout(() => uncover(tab.id), 2500)
      }
      select(tab.id)
    }
  })
  // While a card is in the air, the tab button keeps the cards it had when you let go, until it lands.
  const shownDeck = useRef(deckFor())
  if (swipe.deck === 'live' || swipe.deck === 'landed') shownDeck.current = deckFor()
  const deck = shownDeck.current

  /** Holding +: the tab you closed last comes back. */
  const reopen = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    await snapshot()
    const tab = await reopenClosed()
    setNotice(tab ? { text: `Reopened ${tab.title || hostOf(tab.url)}` } : { text: 'No closed tabs to reopen', info: true })
  }

  /** aA: the page's text size, a step bigger or smaller, remembered for the site. */
  const changeTextSize = (up: boolean) => {
    const next = stepSize(textSize, up)
    setSize(current.url, next, isPrivate)
    web.current?.inject(textSizeScript(next))
  }

  // Tabs not opened in a while are tidied away (as the app opens, and each time it comes back).
  // Site icons kept on the phone (lib/icons), for start pages to have as they load.
  const [icons, setIcons] = useState<Record<string, string>>({})
  useEffect(() => {
    let live = true
    loadSavedIcons().then(found => live && setIcons(found))
    // Icons found in a burst (a start page asking for all of them at once) are passed on together.
    let found: Record<string, string> = {}
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = onIcon((key, uri) => {
      if (!uri) return
      found[key] = uri
      clearTimeout(timer)
      timer = setTimeout(() => {
        const batch = found
        found = {}
        if (live) setIcons(all => ({ ...all, ...batch }))
      }, 800)
    })
    return () => {
      live = false
      clearTimeout(timer)
      stop()
    }
  }, [])

  // Ad and tracker blocking, as last set (it's on unless switched off in Settings).
  useEffect(() => {
    loadSettings().then(settings => setBlocking(settings.blockTrackers))
  }, [])

  const tidyRef = useRef(async () => {})
  tidyRef.current = async () => {
    const { archiveAfter } = await loadSettings()
    const count = archiveOld(archiveAfter)
    if (count) setNotice({ text: `Archived ${count} old tab${count === 1 ? '' : 's'}`, info: true })
  }
  useEffect(() => {
    if (!restored) return
    tidyRef.current()
    const watching = AppState.addEventListener('change', state => {
      if (state === 'active') tidyRef.current()
    })
    return () => watching.remove()
  }, [restored])

  /** A backup is waiting: take it to a start page (this tab if it is one, a new one if not). */
  const importQueued = () => {
    setShowSettings(false)
    if (current.url) openTab()
    else deliver(currentId)
  }

  const search = (from: string) => {
    setSearchFrom(from)
    setSearching(true)
  }

  /** A new tab has opened: search comes up over it, unless Auto-Open Keyboard is off. */
  const searchIfWanted = () => {
    loadSettings().then(settings => {
      if (settings.autoKeyboard) search('')
    })
  }

  /** + : a new tab on the start page, with search up over it. */
  const newTab = () => {
    showBar(true)
    snapshot()
    openTab(null, { private: isPrivate })
    searchIfWanted()
  }

  /** Export Data: the open tabs' addresses (not private ones), one a line, to share. */
  const exportTabs = () => {
    const urls = tabs.filter(t => t.url && !t.private).map(t => t.url)
    if (!urls.length) return Alert.alert('No tabs to export', 'Only start pages are open.')
    Share.share({ message: urls.join('\n') }).catch(() => {})
  }

  // ---- The tab browser and its transitions ----

  /** Opens the tab browser: this tab's picture grows out of the tab button into the middle card. */
  const openTabs = async () => {
    showBar(true)
    await snapshot()
    picking.current = false
    setBrowsingPrivate(isPrivate)
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
    // Unless a card was picked mid-flight: that keeps its own cards hidden.
    if (!picking.current) setHiddenCards([])
  }

  /** Closes the tab browser without a flight (for +, settings, close all). */
  const fadeOutTabs = () => {
    Animated.timing(tabsAppear, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setTabsOpen(false))
  }

  /**
   * Picks a tab: its card grows to fill the screen while the tab browser fades away under it,
   * and, if it's a different tab, the old one's card shrinks back into the tab button, like Arc.
   */
  const picking = useRef(false)
  const openFromCard = async (id: string, card: Rect | null) => {
    picking.current = true
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
      picking.current = false
      setTabsOpen(false)
      setHiddenCards([])
    })
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={finding}>
      <View style={styles.page}>
        {/* Switching tabs: the page you left, shrinking into a card (or away) under the page coming in. */}
        {swipe.under}
        <Animated.View
          ref={page}
          collapsable={false}
          style={[styles.live, swipe.pageStyle, swipe.moving && styles.card]}
        >
          {/* Not until last launch's tabs are back, so a throwaway start page isn't loaded first.
              The live pages are all here; only the one showing is drawn. */}
          {restored && live.map(tab => (
            <View
              key={tab.id}
              // Always a real view of its own (never folded into its parent), so showing and
              // hiding it never moves the page inside, which would load it again.
              collapsable={false}
              style={[StyleSheet.absoluteFill, tab.id === currentId ? styles.shown : styles.hidden]}
              pointerEvents={tab.id === currentId ? 'auto' : 'none'}
              accessibilityElementsHidden={tab.id !== currentId}
              importantForAccessibility={tab.id === currentId ? 'auto' : 'no-hide-descendants'}
            >
              <TabWebView
                ref={handle => {
                  if (handle) webs.set(tab.id, handle)
                  else webs.delete(tab.id)
                }}
                tab={tab}
                showing={tab.id === currentId}
                bottomInset={finding ? 0 : barRoom - insets.bottom}
                onState={state => onState(tab.id, state)}
                onProgress={value => tab.id === currentIdRef.current && setProgress(value)}
                onStartPageLoaded={() => deliver(tab.id)}
                onMessage={data => onMessage(tab.id, data)}
                onNewWindow={url => openTab(url, { private: !!tab.private })}
                onScroll={(y, contentHeight, viewHeight) => tab.id === currentIdRef.current && onScroll(y, contentHeight, viewHeight)}
                textSizes={sizesFor(!!tab.private)}
                icons={icons}
              />
            </View>
          ))}
          {cover && cover.id === currentId && (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: coverFade }]}>
              <TabPicture tab={cover} letterSize={72} style={StyleSheet.absoluteFill} />
            </Animated.View>
          )}
        </Animated.View>
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
            <Icon
              sf={notice.info ? 'info.circle.fill' : 'checkmark.circle.fill'}
              fallback={notice.info ? 'information-circle' : 'checkmark-circle'}
              size={20}
            />
            <Text style={styles.noticeText} numberOfLines={1}>{notice.text}</Text>
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
          front={deck.front}
          behind={deck.behind}
          deck={swipe.deck}
          tabCount={group.length}
          progress={progress}
          loading={nav.loading}
          bottomInset={insets.bottom}
          hide={barHide}
          stackRef={stack}
          onTabs={openTabs}
          onNewTab={newTab}
          onReopen={reopen}
          swipeHandlers={swipe.handlers}
          swiping={swipe.moving}
          position={groupAt}
          onMenu={() => {
            showBar(true)
            setShowActions(true)
          }}
        />
      )}

      {/* Going on a tab: the page you left, flying down into the tab button over the bar. */}
      {swipe.over}

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
        onReader={() => {
          setShowActions(false)
          web.current?.inject(readerScript)
        }}
        onHistory={() => {
          setShowActions(false)
          setHistoryOn('history')
          setShowHistory(true)
        }}
        textSize={textSize}
        onTextSize={changeTextSize}
        desktop={!!current.desktop}
        onDesktop={() => {
          setShowActions(false)
          updateTab(currentId, { desktop: !current.desktop })
          setNotice({ text: current.desktop ? 'Showing the mobile site' : 'Showing the desktop site' })
        }}
      />

      {tabsOpen && (
        <TabCarousel
          // Switching between tabs and private tabs starts the row afresh.
          key={browsingPrivate ? 'private' : 'tabs'}
          tabs={tabs.filter(t => !!t.private === browsingPrivate)}
          isPrivate={browsingPrivate}
          onSwitch={setBrowsingPrivate}
          onReopen={() => {
            fadeOutTabs()
            reopen()
          }}
          currentId={currentId}
          hiddenIds={hiddenCards}
          appear={tabsAppear}
          onCurrentPlaced={growIntoCard}
          registerCard={(id, ref) => (ref ? cards.set(id, ref) : cards.delete(id))}
          onSelect={openFromCard}
          onClose={closeTab}
          onCloseAll={() => {
            closeAll(browsingPrivate)
            fadeOutTabs()
          }}
          onNewTab={() => {
            openTab(null, { private: browsingPrivate })
            fadeOutTabs()
            searchIfWanted()
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
        isPrivate={isPrivate}
      />

      <HistorySheet
        visible={showHistory}
        startOn={historyOn}
        onClose={() => setShowHistory(false)}
        onOpen={url => web.current?.load(url)}
        onReopen={visit => {
          snapshot()
          openTab(visit.url, { title: visit.title })
        }}
      />
      <ReaderView article={article} onClose={() => setArticle(null)} />

      {/* The flying tab pictures, above everything else. */}
      {shrink.element}
      {hero.element}

      <SettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onClosed={() => {
          const kind = historyAfterSettings.current
          historyAfterSettings.current = null
          if (kind) {
            setHistoryOn(kind)
            setShowHistory(true)
          }
        }}
        onImportQueued={importQueued}
        onOpenHistory={kind => {
          historyAfterSettings.current = kind
          setShowSettings(false)
        }}
        onExportTabs={exportTabs}
        onBlockingChanged={() => web.current?.reload()}
        textSizes={savedTextSizes}
        onResetTextSize={host => {
          resetSize(host)
          // The page showing goes back to its normal size straight away, if it's one of them.
          if (!host || hostOf(current.url) === host) web.current?.inject(textSizeScript(100))
        }}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, backgroundColor: '#0c0c12' },
  live: { flex: 1, backgroundColor: colors.background },
  // Not display: 'none' (the new React Native architecture takes such views away, page and all)
  // and no zIndex (changing it reorders the views): only seen or not, and touches pass through.
  hidden: { opacity: 0 },
  shown: { opacity: 1 },
  card: { borderRadius: SWIPE_RADIUS, overflow: 'hidden' },
  notice: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  noticePill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 13 },
  noticeText: { color: colors.text, fontSize: 16, fontWeight: '600' }
})
