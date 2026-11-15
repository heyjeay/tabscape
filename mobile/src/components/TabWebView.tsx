import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ForwardRefExoticComponent, type RefAttributes } from 'react'
import { Linking, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { WebView as LibraryWebView, type WebViewMessageEvent, type WebViewNavigation, type WebViewProps } from 'react-native-webview'
import { log } from '../config'
import { accentScript } from '../lib/color'
import { textSizesAtStart } from '../lib/sites'
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
  /** Each site's own text size (percent, by host), set as its pages start. */
  textSizes: Record<string, number>
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

/**
 * Run in each page before it loads: say when a finger comes off the page while it's pulled
 * down past its top, so a full pull refreshes on letting go. Only at the top of the page, so taps further down send nothing.
 */
const releaseScript = `(function () {
  var done = function () {
    if (window.scrollY <= 0) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'released' }));
  };
  window.addEventListener('touchend', done, { capture: true, passive: true });
  window.addEventListener('touchcancel', done, { capture: true, passive: true });
})();`

/**
 * Also run in each web page before it loads: holding a finger on a link asks the app for its
 * menu (new tab, background, copy, share) instead of iOS's, and the tap that would follow is
 * dropped. Not on the start page, which has its own long presses.
 */
const linkPressScript = `(function () {
  if (location.protocol === 'file:') return;
  var post = function (data) { window.ReactNativeWebView.postMessage(JSON.stringify(data)); };
  var timer = null, x = 0, y = 0, held = false;
  var addStyle = function () {
    var style = document.createElement('style');
    style.textContent = 'a[href]{-webkit-touch-callout:none;-webkit-user-select:none}';
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addStyle); else addStyle();
  var stop = function () { clearTimeout(timer); timer = null; };
  document.addEventListener('touchstart', function (e) {
    held = false;
    stop();
    if (e.touches.length !== 1 || !e.target.closest) return;
    var link = e.target.closest('a[href]');
    if (!link || !/^https?:/i.test(link.href)) return;
    x = e.touches[0].clientX;
    y = e.touches[0].clientY;
    timer = setTimeout(function () {
      held = true;
      var img = link.querySelector('img');
      var image = img && (img.currentSrc || img.src);
      post({
        type: 'linkPress',
        url: link.href,
        text: (link.innerText || link.title || (img && img.alt) || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
        image: image && /^https?:/i.test(image) ? image : null
      });
    }, 500);
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', function (e) {
    var t = e.touches[0];
    if (t && (Math.abs(t.clientX - x) > 10 || Math.abs(t.clientY - y) > 10)) stop();
  }, { capture: true, passive: true });
  document.addEventListener('touchend', stop, { capture: true, passive: true });
  document.addEventListener('touchcancel', stop, { capture: true, passive: true });
  document.addEventListener('click', function (e) {
    if (!held) return;
    held = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
})();`

/** Schemes the page itself handles; anything else (tel:, mailto:, app links) goes to iOS. */
const WEB = /^(https?|file|about|data|blob):/i

/**
 * The live page for the tab that's showing. It's keyed by tab, so switching tabs swaps it;
 * what it loads only changes when asked (load), never because the address it reports changed.
 */
export const TabWebView = forwardRef<TabWebViewHandle, Props>(function TabWebView(
  { tab, bottomInset, onState, onProgress, onStartPageLoaded, onMessage, onNewWindow, onScroll, textSizes },
  ref
) {
  const web = useRef<WebViewInstance>(null)
  const [source, setSource] = useState<{ uri: string } | typeof startPageSource>(() => (tab.url ? { uri: tab.url } : startPageSource))
  /**
   * A private tab's pages are kept apart: nothing they set (cookies, storage) is kept, and it's
   * all gone when the tab is left. Its start page isn't, or it couldn't show your links; once a
   * site is opened from it, the tab switches over to the sealed-off kind.
   */
  const [sealed, setSealed] = useState(!!tab.private && !!tab.url)
  /** Desktop mode, as it was when the page was loaded; a change loads the page again in the other mode. */
  const [desktop, setDesktop] = useState(!!tab.desktop)
  /** The address showing now, as the page last reported it. */
  const showing = useRef<string | null>(tab.url)
  /** Start page loads that have failed since you last loaded something, so putting it back can't go round forever. */
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
    setSealed(false)
    setSource({ ...startPageSource, html: `${startPageSource.html}<!-- ${handed.current} -->` })
  }

  /** Opens a web address; in a private tab, in the sealed-off kind of page. */
  const open = (url: string) => {
    if (tab.private) setSealed(true)
    setSource({ uri: url })
  }

  // Desktop mode switched: the page showing loads again, asking for the other version.
  if (desktop !== !!tab.desktop) {
    setDesktop(!!tab.desktop)
    if (showing.current && !isStartPageUrl(showing.current)) setSource({ uri: showing.current })
  }

  useImperativeHandle(ref, () => ({
    load: url => {
      failures.current = 0
      if (url) open(url)
      else showStartPage()
    },
    goBack: () => web.current?.goBack(),
    goForward: () => web.current?.goForward(),
    reload: () => {
      failures.current = 0
      if (isStartPageUrl(showing.current)) showStartPage()
      else web.current?.reload()
    },
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

  const atStart = useMemo(() => `${releaseScript}${linkPressScript}${textSizesAtStart(textSizes)} true;`, [textSizes])

  return (
    <WebView
      // A new page for each kind (private or not, desktop or not): those are set as it's made.
      key={`${sealed ? 'sealed' : 'open'}-${desktop ? 'desktop' : 'mobile'}`}
      ref={web}
      source={source}
      incognito={sealed}
      contentMode={desktop ? 'desktop' : 'recommended'}
      // Web pages get the app's own link menu (see linkPressScript); the start page keeps iOS's.
      allowsLinkPreview={!tab.url}
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
      injectedJavaScriptBeforeContentLoaded={atStart}
      onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
        onScroll(contentOffset.y, contentSize.height, layoutMeasurement.height)
      }}
      onOpenWindow={event => onNewWindow(event.nativeEvent.targetUrl)}
      onShouldStartLoadWithRequest={request => {
        // A private tab leaving its start page for a site: open it in a sealed-off page.
        if (tab.private && !sealed && request.isTopFrame !== false && /^https?:/i.test(request.url)) {
          open(request.url)
          return false
        }
        if (WEB.test(request.url)) return true
        log('handing to iOS:', request.url)
        Linking.openURL(request.url).catch(() => {})
        return false
      }}
    />
  )
})
