/** One piece of an article, in reading order. */
export type Block =
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'q'; text: string }
  | { t: 'li'; text: string; n: number }
  | { t: 'pre'; text: string }
  | { t: 'img'; src: string; w: number; h: number; caption?: string }

export interface Article {
  title: string
  byline: string
  site: string
  url: string
  blocks: Block[]
}

/** Reads what the reader script sent back; null if it found no article. */
export const parseArticle = (data: Record<string, unknown>): Article | null => {
  if (!data.ok || !Array.isArray(data.blocks) || !data.blocks.length) return null
  return {
    title: String(data.title ?? ''),
    byline: String(data.byline ?? ''),
    site: String(data.site ?? ''),
    url: String(data.url ?? ''),
    blocks: data.blocks as Block[]
  }
}

/**
 * JavaScript for the page: finds its article (the part with the most paragraphs in it, as
 * Safari's Reader does) and sends it back as plain pieces — headings, paragraphs, quotes,
 * lists, pictures — leaving out menus, adverts, share buttons and the like. The app shows
 * them itself, so nothing of the page (its scripts, its styles) comes along.
 */
export const readerScript = `(function () {
  var post = function (data) { window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: 'reader' }, data))); };
  try {
    var clean = function (s) { return (s || '').replace(/\\s+/g, ' ').trim(); };
    var NOISE = /(^|[-_ ])(share|social|comment|related|promo|advert|ad|ads|sponsor|newsletter|subscribe|footer|nav|menu|sidebar|breadcrumb|cookie|popup|modal|banner)([-_ ]|$)/i;
    var scores = new Map();
    var add = function (el, n) { if (el) scores.set(el, (scores.get(el) || 0) + n); };
    Array.prototype.forEach.call(document.querySelectorAll('p'), function (p) {
      var length = clean(p.textContent).length;
      if (length < 40) return;
      var points = 1 + Math.min(length / 100, 3) + (p.textContent.match(/,/g) || []).length * 0.1;
      add(p.parentElement, points);
      if (p.parentElement) add(p.parentElement.parentElement, points / 2);
    });
    var best = null, top = 0;
    scores.forEach(function (score, el) { if (score > top) { top = score; best = el; } });
    var article = document.querySelector('article');
    if (article && best && !article.contains(best) && clean(article.textContent).length > 800) best = article;
    if (!best || top < 6) return post({ ok: false });

    var blocks = [];
    var hidden = function (el) {
      if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
      var style = getComputedStyle(el);
      return style.display === 'none' || style.visibility === 'hidden';
    };
    var picture = function (img, caption) {
      var src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
      if (!/^https?:/i.test(src)) return;
      var w = img.naturalWidth || Number(img.getAttribute('width')) || 0;
      var h = img.naturalHeight || Number(img.getAttribute('height')) || 0;
      if (w && w < 120) return;
      blocks.push({ t: 'img', src: src, w: w, h: h, caption: caption || undefined });
    };
    var walk = function (node) {
      for (var el = node.firstElementChild; el && blocks.length < 800; el = el.nextElementSibling) {
        var tag = el.tagName;
        if (/^(SCRIPT|STYLE|NOSCRIPT|NAV|ASIDE|FOOTER|FORM|BUTTON|IFRAME|SVG|CANVAS|VIDEO|AUDIO|SELECT|INPUT|TEXTAREA)$/.test(tag)) continue;
        if (NOISE.test((el.className && el.className.baseVal === undefined ? el.className : '') + ' ' + (el.id || '')) || hidden(el)) continue;
        var text = clean(el.innerText);
        if (/^H[1-6]$/.test(tag)) { if (text) blocks.push({ t: 'h', text: text }); }
        else if (tag === 'P') {
          if (text) blocks.push({ t: 'p', text: text });
          Array.prototype.forEach.call(el.querySelectorAll('img'), function (img) { picture(img); });
        }
        else if (tag === 'BLOCKQUOTE') { if (text) blocks.push({ t: 'q', text: text }); }
        else if (tag === 'UL' || tag === 'OL') {
          var n = 0;
          Array.prototype.forEach.call(el.children, function (li) {
            var item = clean(li.innerText);
            if (li.tagName === 'LI' && item) blocks.push({ t: 'li', text: item, n: tag === 'OL' ? ++n : 0 });
          });
        }
        else if (tag === 'PRE') { if (text) blocks.push({ t: 'pre', text: el.innerText.trim() }); }
        else if (tag === 'IMG') picture(el);
        else if (tag === 'FIGURE' || tag === 'PICTURE') {
          var img = el.querySelector('img');
          var caption = el.querySelector('figcaption');
          if (img) picture(img, caption ? clean(caption.innerText) : '');
        }
        else walk(el);
      }
    };
    walk(best);

    var heading = document.querySelector('h1');
    var title = clean(heading && heading.innerText) || clean(document.title);
    if (blocks[0] && blocks[0].t === 'h' && blocks[0].text === title) blocks.shift();
    var author = document.querySelector('meta[name="author"]');
    var site = document.querySelector('meta[property="og:site_name"]');
    post({
      ok: blocks.filter(function (b) { return b.t === 'p'; }).length >= 2,
      title: title,
      byline: clean(author && author.content),
      site: clean(site && site.content) || location.hostname.replace(/^www\\./, ''),
      url: location.href,
      blocks: blocks
    });
  } catch (e) {
    post({ ok: false });
  }
})(); true;`
