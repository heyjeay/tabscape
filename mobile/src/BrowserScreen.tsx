import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { Animated, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { captureRef } from 'react-native-view-shot'
import { BAR_HEIGHT, BottomBar } from './components/BottomBar'
import { FindBar, findScript } from './components/FindBar'
import { Glass } from './components/Glass'
import { Icon } from './components/Icon'
import { PageActions } from './components/PageActions'
import { SearchSheet } from './components/SearchSheet'
import { SettingsSheet } from './components/SettingsSheet'
import { TabCarousel } from './components/TabCarousel'
import { TabWebView, type PageState, type TabWebViewHandle } from './components/TabWebView'
import { colors, log } from './config'
import {
  addSavedPage, clearPendingImport, deliveryScript, loadPendingImport, loadSavedPages, removeDeliveredPages
} from './lib/savedPages'
import { useTabs } from './useTabs'

/** How many times a start page that isn't ready yet is offered what's waiting for it. */
const DELIVERY_TRIES = 10
/** Sheets slide away before the next one can come up. */
const SHEET_GAP_MS = 380

/** The browser: the current tab's page edge to edge, Arc's floating bar over it, and the sheets it opens. */
export const BrowserScreen = () => {
  const insets = useSafeAreaInsets()
  const { tabs, current, currentId, select, openTab, updateTab, closeTab, closeAll } = useTabs()
  const web = useRef<TabWebViewHandle>(null)
  const page = useRef<ComponentRef<typeof View>>(null)

  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false, loading: false })
  const [progress, setProgress] = useState(0)
  const [showTabs, setShowTabs] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [searching, setSearching] = useState(false)
  const [finding, setFinding] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const deliveryTries = useRef(0)
  const currentIdRef = useRef(currentId)
  currentIdRef.current = currentId

  const barRoom = BAR_HEIGHT + Math.max(insets.bottom, 12)

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
    setShowTabs(false)
    if (current.url) openTab()
    else deliver()
  }

  const newTab = () => {
    snapshot()
    openTab()
    setSearching(true)
  }

  /** Close one sheet, then open another once it has gone. */
  const then = (close: () => void, open: () => void) => {
    close()
    setTimeout(open, SHEET_GAP_MS)
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={finding}>
      <View ref={page} style={[styles.page, { paddingTop: insets.top }]} collapsable={false}>
        <TabWebView
          key={current.id}
          ref={web}
          tab={current}
          bottomInset={finding ? 0 : barRoom}
          onState={onState}
          onProgress={setProgress}
          onStartPageLoaded={deliver}
          onMessage={onMessage}
          onNewWindow={url => openTab(url)}
        />
      </View>

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
          tabCount={tabs.length}
          progress={progress}
          loading={nav.loading}
          bottomInset={insets.bottom}
          onTabs={async () => {
            await snapshot()
            setShowTabs(true)
          }}
          onNewTab={newTab}
          onMenu={() => setShowActions(true)}
        />
      )}

      <SearchSheet
        visible={searching}
        initial={current.url ?? ''}
        onGo={url => web.current?.load(url)}
        onClose={() => setSearching(false)}
      />

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
        onEditAddress={() => then(() => setShowActions(false), () => setSearching(true))}
        onFind={() => {
          setShowActions(false)
          setFinding(true)
        }}
        onAddToTabscape={addToTabscape}
        onSettings={() => then(() => setShowActions(false), () => setShowSettings(true))}
      />

      <SettingsSheet visible={showSettings} onClose={() => setShowSettings(false)} onImportQueued={importQueued} />

      <TabCarousel
        visible={showTabs}
        tabs={tabs}
        currentId={currentId}
        onSelect={id => {
          select(id)
          setShowTabs(false)
        }}
        onClose={closeTab}
        onCloseAll={() => {
          closeAll()
          setShowTabs(false)
        }}
        onNewTab={() => {
          openTab()
          then(() => setShowTabs(false), () => setSearching(true))
        }}
        onSettings={() => then(() => setShowTabs(false), () => setShowSettings(true))}
        onDismiss={() => setShowTabs(false)}
      />
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
