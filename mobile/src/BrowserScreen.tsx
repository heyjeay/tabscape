import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { Animated, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { captureRef } from 'react-native-view-shot'
import { BottomBar } from './components/BottomBar'
import { FindBar, findScript } from './components/FindBar'
import { Glass } from './components/Glass'
import { PageActions } from './components/PageActions'
import { SearchSheet } from './components/SearchSheet'
import { TabCarousel } from './components/TabCarousel'
import { TabWebView, type PageState, type TabWebViewHandle } from './components/TabWebView'
import { colors, log } from './config'
import { addSavedPage, deliveryScript, loadSavedPages, removeDeliveredPages } from './lib/savedPages'
import { useTabs } from './useTabs'

/** How many times a start page that isn't ready yet is offered the saved pages. */
const DELIVERY_TRIES = 10

/** The browser: the current tab's page, with a slim bar along the bottom, and the sheets it opens. */
export const BrowserScreen = () => {
  const insets = useSafeAreaInsets()
  const { tabs, current, currentId, select, openTab, updateTab, closeTab, closeAll } = useTabs()
  const web = useRef<TabWebViewHandle>(null)
  const page = useRef<ComponentRef<typeof View>>(null)

  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false, loading: false })
  const [progress, setProgress] = useState(0)
  const [showTabs, setShowTabs] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [searching, setSearching] = useState(false)
  const [finding, setFinding] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const deliveryTries = useRef(0)
  const currentIdRef = useRef(currentId)
  currentIdRef.current = currentId

  // A short message over the bar, like "Added to Tabscape", that fades after a moment.
  const noticeFade = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!notice) return
    Animated.timing(noticeFade, { toValue: 1, duration: 150, useNativeDriver: true }).start()
    const timer = setTimeout(() => {
      Animated.timing(noticeFade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setNotice(null))
    }, 2200)
    return () => clearTimeout(timer)
  }, [notice, noticeFade])

  /** A small picture of the page as it is now, for the tab button and the carousel. */
  const snapshot = async (id = currentId) => {
    try {
      const uri = await captureRef(page, { format: 'jpg', quality: 0.7, result: 'tmpfile', width: 320 })
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

  /** A start page is up: offer it any pages saved with "Add to Tabscape". */
  const deliverSavedPages = async () => {
    const pages = await loadSavedPages()
    if (pages.length) web.current?.inject(deliveryScript(pages))
  }

  const onMessage = async (data: { type: string; [key: string]: unknown }) => {
    if (data.type === 'find') setNotFound(!data.found)
    if (data.type === 'saved') {
      const taken = Number(data.taken)
      if (taken >= 0) {
        await removeDeliveredPages(Number(data.offered))
        deliveryTries.current = 0
        log('start page took', taken, 'saved pages')
      } else if (++deliveryTries.current < DELIVERY_TRIES) {
        // The start page is still starting up: try again shortly.
        setTimeout(deliverSavedPages, 500)
      }
    }
  }

  const addToTabscape = async () => {
    if (!current.url) return
    await addSavedPage({ url: current.url, title: current.title || current.url })
    setShowActions(false)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setNotice('Added to Tabscape')
  }

  const newTab = () => {
    snapshot()
    openTab()
    setSearching(true)
  }

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View ref={page} style={styles.page} collapsable={false}>
        <TabWebView
          key={current.id}
          ref={web}
          tab={current}
          onState={onState}
          onProgress={setProgress}
          onStartPageLoaded={deliverSavedPages}
          onMessage={onMessage}
          onNewWindow={url => openTab(url)}
        />
        {notice && (
          <Animated.View style={[styles.notice, { opacity: noticeFade }]} pointerEvents="none">
            <Glass style={styles.noticePill}>
              <Text style={styles.noticeText}>✓  {notice}</Text>
            </Glass>
          </Animated.View>
        )}
      </View>

      {finding ? (
        <View style={{ paddingBottom: insets.bottom }}>
          <FindBar
            notFound={notFound}
            onFind={(query, backwards) => web.current?.inject(findScript(query, backwards))}
            onTyping={() => setNotFound(false)}
            onDone={() => setFinding(false)}
          />
        </View>
      ) : (
        <View style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
          <BottomBar
            tab={current}
            tabCount={tabs.length}
            progress={progress}
            loading={nav.loading}
            onTabs={async () => {
              await snapshot()
              setShowTabs(true)
            }}
            onAddress={() => (current.url ? setShowActions(true) : setSearching(true))}
            onNewTab={newTab}
          />
        </View>
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
        onEditAddress={() => {
          setShowActions(false)
          setTimeout(() => setSearching(true), 350)
        }}
        onFind={() => {
          setShowActions(false)
          setFinding(true)
        }}
        onAddToTabscape={addToTabscape}
      />

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
          setShowTabs(false)
          setTimeout(() => setSearching(true), 350)
        }}
        onDismiss={() => setShowTabs(false)}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, backgroundColor: colors.background },
  notice: { position: 'absolute', bottom: 14, left: 0, right: 0, alignItems: 'center' },
  noticePill: { borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11 },
  noticeText: { color: colors.text, fontSize: 15, fontWeight: '600' }
})
