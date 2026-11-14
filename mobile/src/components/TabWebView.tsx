import { forwardRef, useImperativeHandle, useRef, useState, type ForwardRefExoticComponent, type RefAttributes } from 'react'
import { Linking, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { WebView as LibraryWebView, type WebViewMessageEvent, type WebViewNavigation, type WebViewProps } from 'react-native-webview'
import { log } from '../config'
import { accentScript } from '../lib/color'
import { isStartPageUrl, startPageSource } from '../lib/startPage'
import type { Tab } from '../useTabs'

/** What the page tells the screen around it. */
export interface PageState {
  url: string | null
  title: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
}

/** What the screen can ask of the page. */
export interface TabWebViewHandle {
  load: (url: string | null) => void
  goBack: () => void
  goForward: () => void
  reload: () => void
  stopLoading: () => void
  inject: (script: string) => void
}

interface Props {
  tab: Tab
  /**
   * Extra room at the bottom for the floating bar, beyond the safe area iOS already keeps
   * clear, so the end of a page can scroll above it.
   */
  bottomInset: number
  onState: (state: PageState) => void
  onProgress: (progress: number) => void
  /** A start page finished loading (it may have pages to take in). */
  onStartPageLoaded: () => void
  onMessage: (data: { type: string; [key: string]: unknown }) => void
  /** A link meant for a new window (target="_blank"). */
  onNewWindow: (url: string) => void
  /** Where the page is scrolled to, and how tall it and the window are. */
  onScroll: (y: number, contentHeight: number, viewHeight: number) => void
}

/** The page methods used here. */
interface WebViewInstance {
  goBack: () => void
  goForward: () => void
  reload: () => void
  stopLoading: () => void
  injectJavaScript: (script: string) => void
}

/**
 * react-native-webview 14 declares its component as taking `WebViewProps & undefined`, which
 * TypeScript reads as no props at all; this restates it with the props it really takes.
 */
const WebView = LibraryWebView as unknown as ForwardRefExoticComponent<WebViewProps & RefAttributes<WebViewInstance>>

/** Schemes the page itself handles; anything else (tel:, mailto:, app links) goes to iOS. */
const WEB = /^(https?|file|about|data|blob):/i

/**
 * The live page for the tab that's showing. It's keyed by tab, so switching tabs swaps it;
 * what it loads only changes when asked (load), never because the address it reports changed.
 */
export const TabWebView = forwardRef<TabWebViewHandle, Props>(function TabWebView(
  { tab, bottomInset, onState, onProgress, onStartPageLoaded, onMessage, onNewWindow, onScroll },
  ref
) {
  const web = useRef<WebViewInstance>(null)
  const [source, setSource] = useState(() => (tab.url ? { uri: tab.url } : startPageSource))
  /** The address showing now, as the page last reported it. */
  const showing = useRef<string | null>(tab.url)
  /** Start page loads that have failed in a row, so putting it back can't go round forever. */
  const failures = useRef(0)
  const handed = useRef(0)

  /**
   * The start page has no address of its own: it's handed over as a page, with the documents
   * folder as its address. Reloading it would load that folder ("Cannot open file", -3001), so
   * it's handed over again instead. The web view only reloads a source that differs from the
   * last one, so each hand-over is marked as a new one.
   */
  const showStartPage = () => {
    handed.current += 1
    setSource({ ...startPageSource, html: `${startPageSource.html}<!-- ${handed.current} -->` })
  }

  useImperativeHandle(ref, () => ({
    load: url => (url ? setSource({ uri: url }) : showStartPage()),
    goBack: () => web.current?.goBack(),
    goForward: () => web.current?.goForward(),
    reload: () => (isStartPageUrl(showing.current) ? showStartPage() : web.current?.reload()),
    stopLoading: () => web.current?.stopLoading(),
    inject: script => web.current?.injectJavaScript(script)
  }))

  const report = (nav: WebViewNavigation) => {
    showing.current = nav.url
    onState({
      url: isStartPageUrl(nav.url) ? null : nav.url,
      title: nav.title ?? '',
      canGoBack: nav.canGoBack,
      canGoForward: nav.canGoForward,
      loading: nav.loading
    })
  }

  const message = (event: WebViewMessageEvent) => {
    try {
      onMessage(JSON.parse(event.nativeEvent.data))
    } catch {
      // Not one of ours.
    }
  }

  return (
    <WebView
      ref={web}
      source={source}
      originWhitelist={['*']}
      allowingReadAccessToURL={startPageSource.baseUrl}
      style={{ flex: 1, backgroundColor: 'transparent' }}
      contentInset={{ bottom: bottomInset }}
      // The page fills the screen, under the clock and the home indicator; iOS keeps its
      // content clear of them and scrolls it underneath, as Safari does.
      contentInsetAdjustmentBehavior="automatic"
      allowsBackForwardNavigationGestures
      allowsInlineMediaPlayback
      decelerationRate="normal"
      onNavigationStateChange={report}
      onLoadProgress={event => onProgress(event.nativeEvent.progress)}
      onLoad={() => {
        failures.current = 0
      }}
      onLoadEnd={event => {
        if (isStartPageUrl(event.nativeEvent.url)) onStartPageLoaded()
      }}
      // Going back to a start page iOS no longer keeps in memory makes it load the folder;
      // put the page back quietly (twice at most) instead of showing the error.
      onError={event => {
        const { url, code } = event.nativeEvent
        log('load failed:', code, url)
        if ((url?.startsWith('file:') || code === -3001) && failures.current < 2) {
          failures.current += 1
          showStartPage()
        }
      }}
      onMessage={message}
      // Each page reports its accent colour once it has loaded (onMessage must be set for it to run).
      injectedJavaScript={accentScript}
      onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
        onScroll(contentOffset.y, contentSize.height, layoutMeasurement.height)
      }}
      onOpenWindow={event => onNewWindow(event.nativeEvent.targetUrl)}
      onShouldStartLoadWithRequest={request => {
        if (WEB.test(request.url)) return true
        log('handing to iOS:', request.url)
        Linking.openURL(request.url).catch(() => {})
        return false
      }}
    />
  )
})
