import { forwardRef, useImperativeHandle, useRef, useState, type ForwardRefExoticComponent, type RefAttributes } from 'react'
import { Linking } from 'react-native'
import { WebView as LibraryWebView, type WebViewMessageEvent, type WebViewNavigation, type WebViewProps } from 'react-native-webview'
import { log } from '../config'
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
  onState: (state: PageState) => void
  onProgress: (progress: number) => void
  /** A start page finished loading (it may have pages to take in). */
  onStartPageLoaded: () => void
  onMessage: (data: { type: string; [key: string]: unknown }) => void
  /** A link meant for a new window (target="_blank"). */
  onNewWindow: (url: string) => void
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
  { tab, onState, onProgress, onStartPageLoaded, onMessage, onNewWindow },
  ref
) {
  const web = useRef<WebViewInstance>(null)
  const [source, setSource] = useState(() => (tab.url ? { uri: tab.url } : startPageSource))

  useImperativeHandle(ref, () => ({
    load: url => setSource(url ? { uri: url } : { ...startPageSource }),
    goBack: () => web.current?.goBack(),
    goForward: () => web.current?.goForward(),
    reload: () => web.current?.reload(),
    stopLoading: () => web.current?.stopLoading(),
    inject: script => web.current?.injectJavaScript(script)
  }))

  const report = (nav: WebViewNavigation) => {
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
      allowsBackForwardNavigationGestures
      allowsInlineMediaPlayback
      decelerationRate="normal"
      onNavigationStateChange={report}
      onLoadProgress={event => onProgress(event.nativeEvent.progress)}
      onLoadEnd={event => {
        if (isStartPageUrl(event.nativeEvent.url)) onStartPageLoaded()
      }}
      onMessage={message}
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
