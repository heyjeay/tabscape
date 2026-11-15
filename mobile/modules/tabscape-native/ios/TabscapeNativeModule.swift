import ExpoModulesCore
import ObjectiveC
import UIKit
import WebKit

/**
 * Native extras for Tabscape that Expo Go can't do (they're only in Tabscape's own builds):
 * - Pages kept loaded for other tabs, out of sight, are marked hidden, so WebKit slows their
 *   timers and stops their animations, as Safari does for tabs in the background.
 * - Swipes along the bottom edge go to the app first, so swiping the bar changes tabs instead of
 *   iOS switching apps. A second swipe straight after still switches apps, as iOS always allows.
 * - Ad and tracker blocking in its pages, with WebKit's own content blocker (as Safari's
 *   blockers use): well-known ad and tracking networks aren't loaded by other sites' pages.
 * - Links to websites stay in the browser, even for sites whose app is installed.
 */
public class TabscapeNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TabscapeNative")

    OnCreate {
      DispatchQueue.main.async {
        EdgeSwipes.install()
        ContentBlocker.shared.start()
        AppLinks.install()
      }
    }

    /// Turns the blocker on or off for every page, open or to come (it applies as pages load).
    Function("setBlocking") { (on: Bool) in
      DispatchQueue.main.async {
        ContentBlocker.shared.setEnabled(on)
      }
    }

    /// Which tabs' pages may keep running (the one showing, and the ones a swipe lands on); the rest are hidden from WebKit.
    Function("setVisiblePages") { (ids: [String]) in
      DispatchQueue.main.async {
        PageVisibility.shared.show(Set(ids))
      }
    }

    /// How many ad and tracking networks are on the list.
    Function("blockedNetworkCount") { () -> Int in
      ContentBlocker.domains.count
    }
  }
}

/**
 * Websites open in the browser, not in their apps. In an app's web view, iOS sends a tap on a link
 * to a site whose app is installed (a universal link: youtube.com, reddit.com…) to that app. A
 * browser asks WebKit to allow the page without trying the app instead, as Chrome and Firefox do
 * on iPhone: WebKit's "allow, without trying app links" (allow + 2). react-native-webview decides
 * each navigation in RNCWebViewImpl; when it allows a website, that's what WebKit is told.
 * (Other apps' own addresses, like youtube://, are asked about in the app: lib/handOff.)
 */
enum AppLinks {
  private static var installed = false

  static func install() {
    guard !installed, let page = NSClassFromString("RNCWebViewImpl") else { return }
    let selector = NSSelectorFromString("webView:decidePolicyForNavigationAction:decisionHandler:")
    guard let method = class_getInstanceMethod(page, selector) else { return }
    installed = true
    typealias Decide = @convention(block) (WKNavigationActionPolicy) -> Void
    typealias Original = @convention(c) (AnyObject, Selector, WKWebView, WKNavigationAction, Decide) -> Void
    let original = unsafeBitCast(method_getImplementation(method), to: Original.self)
    let withoutApps = WKNavigationActionPolicy(rawValue: WKNavigationActionPolicy.allow.rawValue + 2) ?? .allow
    let replacement: @convention(block) (AnyObject, WKWebView, WKNavigationAction, @escaping Decide) -> Void = { this, webView, action, decide in
      let scheme = action.request.url?.scheme?.lowercased()
      let website = scheme == "http" || scheme == "https"
      let decideHere: Decide = { policy in
        decide(policy == .allow && website ? withoutApps : policy)
      }
      original(this, selector, webView, action, decideHere)
    }
    method_setImplementation(method, imp_implementationWithBlock(replacement))
  }
}

/// The bottom edge's swipes go to the app first: iOS asks each screen which edges to defer, and every screen here says the bottom.
enum EdgeSwipes {
  private static var installed = false

  static func install() {
    guard !installed else { return }
    installed = true
    let selector = #selector(getter: UIViewController.preferredScreenEdgesDeferringSystemGestures)
    guard let method = class_getInstanceMethod(UIViewController.self, selector) else { return }
    let bottom: @convention(block) (UIViewController) -> UIRectEdge = { _ in .bottom }
    method_setImplementation(method, imp_implementationWithBlock(bottom))
    // Screens already up ask again.
    for scene in UIApplication.shared.connectedScenes {
      guard let windowScene = scene as? UIWindowScene else { continue }
      for window in windowScene.windows {
        var controller = window.rootViewController
        while let current = controller {
          current.setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
          controller = current.presentedViewController
        }
      }
    }
  }
}

/// WebKit's content blocker, given to every page as it's put on screen (before it loads anything).
final class ContentBlocker {
  static let shared = ContentBlocker()

  /**
   * Well-known ad and tracking networks. Blocked only when another site's page loads them, so
   * their own sites still work. Kept to networks whose blocking doesn't break pages (no sign-in
   * or video services, for example).
   */
  static let domains: [String] = [
    // Advertising
    "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
    "amazon-adsystem.com", "adnxs.com", "criteo.com", "criteo.net", "taboola.com", "outbrain.com",
    "rubiconproject.com", "pubmatic.com", "openx.net", "casalemedia.com", "indexww.com", "adsrvr.org",
    "advertising.com", "yieldmo.com", "sharethrough.com", "3lift.com", "triplelift.com", "media.net",
    "adform.net", "smartadserver.com", "teads.tv", "moatads.com", "doubleverify.com",
    "adsafeprotected.com", "serving-sys.com", "contextweb.com", "bidswitch.net", "sovrn.com",
    "lijit.com", "gumgum.com", "zemanta.com", "revcontent.com", "mgid.com", "popads.net",
    "propellerads.com", "adcolony.com", "inmobi.com", "smaato.net", "ads.yahoo.com", "ads-twitter.com",
    "ads.linkedin.com", "adroll.com", "33across.com", "districtm.io", "emxdgt.com", "onetag-sys.com",
    "seedtag.com", "adition.com", "yieldlab.net", "adhigh.net", "amxrtb.com", "adtelligent.com",
    // Tracking and analytics
    "google-analytics.com", "googletagmanager.com", "googletagservices.com", "scorecardresearch.com",
    "quantserve.com", "quantcount.com", "hotjar.com", "hotjar.io", "mixpanel.com", "api.segment.io",
    "cdn.segment.com", "api.amplitude.com", "cdn.amplitude.com", "fullstory.com", "mouseflow.com",
    "crazyegg.com", "clarity.ms", "nr-data.net", "chartbeat.com", "chartbeat.net", "cdn.parsely.com",
    "heapanalytics.com", "kissmetrics.io", "bluekai.com", "krxd.net", "exelator.com", "demdex.net",
    "omtrdc.net", "everesttech.net", "rlcdn.com", "agkn.com", "crwdcntrl.net", "tapad.com", "liadm.com",
    "id5-sync.com", "imrworldwide.com", "mc.yandex.ru", "bat.bing.com", "snap.licdn.com",
    "analytics.twitter.com", "ct.pinterest.com", "analytics.tiktok.com", "tr.snapchat.com",
    "sc-static.net", "quantcast.com", "addthis.com", "sharethis.com", "zqtk.net", "permutive.com",
    "permutive.app", "adsymptotic.com", "eyeota.net", "mookie1.com", "adsco.re"
  ]

  private var list: WKContentRuleList?
  private var enabled = true
  private var started = false
  /// Every page there has been (let go of as they close), and which of them are blocking now.
  private let pages = NSHashTable<WKWebView>.weakObjects()
  private let blocking = NSHashTable<WKWebView>.weakObjects()

  /// Names the compiled list after what's on it, so a changed list is compiled afresh (and the same one only once, ever).
  private var identifier: String {
    var hash: UInt64 = 5381
    for byte in Self.domains.joined(separator: ",").utf8 {
      hash = (hash &* 33) &+ UInt64(byte)
    }
    return "tabscape-blocklist-\(String(hash, radix: 36))"
  }

  func start() {
    guard !started else { return }
    started = true
    watchPages()
    guard let store = WKContentRuleListStore.default() else { return }
    store.lookUpContentRuleList(forIdentifier: identifier) { [weak self] found, _ in
      DispatchQueue.main.async {
        if let found {
          self?.use(found)
        } else {
          self?.compile()
        }
      }
    }
  }

  func setEnabled(_ on: Bool) {
    enabled = on
    pages.allObjects.forEach { apply(to: $0) }
  }

  /// WebKit's rules: block requests to any of the networks (or their subdomains) from other sites' pages.
  private func compile() {
    let rules: [[String: Any]] = Self.domains.map { domain in
      let escaped = domain.replacingOccurrences(of: ".", with: "\\.")
      return [
        "trigger": ["url-filter": "^[^:]+://+([^:/]+\\.)?\(escaped)[:/]", "load-type": ["third-party"]],
        "action": ["type": "block"]
      ]
    }
    guard
      let data = try? JSONSerialization.data(withJSONObject: rules),
      let json = String(data: data, encoding: .utf8),
      let store = WKContentRuleListStore.default()
    else { return }
    store.compileContentRuleList(forIdentifier: identifier, encodedContentRuleList: json) { [weak self] compiled, error in
      DispatchQueue.main.async {
        if let compiled {
          self?.use(compiled)
        } else {
          NSLog("[tabscape] the content blocker didn't compile: %@", String(describing: error))
        }
      }
    }
  }

  private func use(_ compiled: WKContentRuleList) {
    list = compiled
    pages.allObjects.forEach { apply(to: $0) }
  }

  fileprivate func track(_ page: WKWebView) {
    if !pages.contains(page) {
      pages.add(page)
    }
    apply(to: page)
    PageVisibility.shared.apply(to: page)
  }

  /// Every page there is.
  var allPages: [WKWebView] { pages.allObjects }

  private func apply(to page: WKWebView) {
    guard let list else { return }
    let controller = page.configuration.userContentController
    if enabled && !blocking.contains(page) {
      controller.add(list)
      blocking.add(page)
    } else if !enabled && blocking.contains(page) {
      controller.remove(list)
      blocking.remove(page)
    }
  }

  /// Every web page, as it goes on screen (before its first load), gets the blocker.
  private func watchPages() {
    let selector = #selector(UIView.didMoveToWindow)
    guard let method = class_getInstanceMethod(WKWebView.self, selector) else { return }
    typealias Original = @convention(c) (AnyObject, Selector) -> Void
    let original = unsafeBitCast(method_getImplementation(method), to: Original.self)
    let replacement: @convention(block) (WKWebView) -> Void = { page in
      original(page, selector)
      ContentBlocker.shared.track(page)
    }
    let implementation = imp_implementationWithBlock(replacement)
    // Only WKWebView's own: if it doesn't have one, it gets one (calling UIView's), and UIView is left alone.
    if !class_addMethod(WKWebView.self, selector, implementation, method_getTypeEncoding(method)) {
      method_setImplementation(method, implementation)
    }
  }
}

/**
 * Which pages WebKit should treat as on screen. The app keeps several tabs' pages loaded, out
 * of sight behind the one showing, so going back to them is instant; but WebKit can't tell
 * they're out of sight, so their animations and timers would carry on at full speed, costing
 * battery. Marked hidden, they're slowed down as background tabs are in Safari. Each page is
 * found by the tab it belongs to: the view around it says which (testID "tabscape-page:<id>").
 */
final class PageVisibility {
  static let shared = PageVisibility()
  private static let prefix = "tabscape-page:"
  /** The tabs whose pages may run; nil until the app first says (then all may). */
  private var visible: Set<String>?

  func show(_ ids: Set<String>) {
    visible = ids
    ContentBlocker.shared.allPages.forEach { apply(to: $0) }
  }

  func apply(to page: WKWebView) {
    guard let visible, let id = tabId(of: page) else { return }
    let hide = !visible.contains(id)
    if page.isHidden != hide {
      page.isHidden = hide
    }
  }

  private func tabId(of page: UIView) -> String? {
    var view = page.superview
    while let current = view {
      if let label = current.accessibilityIdentifier, label.hasPrefix(Self.prefix) {
        return String(label.dropFirst(Self.prefix.count))
      }
      view = current.superview
    }
    return nil
  }
}
