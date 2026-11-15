import ExpoModulesCore
import ObjectiveC
import UIKit
import WebKit

/**
 * Native extras for Tabscape that Expo Go can't do (they're only in Tabscape's own builds):
 * - Swipes along the bottom edge go to the app first, so swiping the bar changes tabs instead of
 *   iOS switching apps. A second swipe straight after still switches apps, as iOS always allows.
 * - Ad and tracker blocking in its pages, with WebKit's own content blocker (as Safari's
 *   blockers use): well-known ad and tracking networks aren't loaded by other sites' pages.
 */
public class TabscapeNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TabscapeNative")

    OnCreate {
      DispatchQueue.main.async {
        EdgeSwipes.install()
        ContentBlocker.shared.start()
      }
    }

    /// Turns the blocker on or off for every page, open or to come (it applies as pages load).
    Function("setBlocking") { (on: Bool) in
      DispatchQueue.main.async {
        ContentBlocker.shared.setEnabled(on)
      }
    }

    /// How many ad and tracking networks are on the list.
    Function("blockedNetworkCount") { () -> Int in
      ContentBlocker.domains.count
    }
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
  }

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
