/** A colour as red, green, blue (0–255). */
export type Rgb = [number, number, number]

/** Tabscape's own accent (the glow in the logo), for pages that don't say theirs. */
export const DEFAULT_ACCENT: Rgb = [139, 108, 255]

/** "#5200ff", "#52f", "rgb(82, 0, 255)", "rgba(…)" → [r, g, b]; null if unreadable or see-through. */
export const parseColor = (value: string | null | undefined): Rgb | null => {
  if (!value) return null
  const text = value.trim().toLowerCase()
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map(d => d + d).join('') : hex[1]
    return [0, 2, 4].map(i => parseInt(digits.slice(i, i + 2), 16)) as Rgb
  }
  const rgb = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/)
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4])
    if (alpha < 0.5) return null
    return [rgb[1], rgb[2], rgb[3]].map(n => Math.round(Number(n))) as Rgb
  }
  return null
}

/** Partway from a to b. */
export const mix = (a: Rgb, b: Rgb, amount: number): Rgb =>
  a.map((channel, i) => Math.round(channel + (b[i] - channel) * amount)) as Rgb

export const css = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r},${g},${b},${alpha})`

/** How light it is, 0 (black) to 1 (white). */
const lightness = ([r, g, b]: Rgb) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

/**
 * A page's accent, made usable for the bar: near-white and near-black accents (the commonest
 * "theme colours") say nothing about the site, so those fall back to Tabscape's own.
 */
export const usableAccent = (accent: Rgb | null): Rgb => {
  if (!accent) return DEFAULT_ACCENT
  const light = lightness(accent)
  return light > 0.92 || light < 0.1 ? DEFAULT_ACCENT : accent
}

/**
 * JavaScript run in each page once it has loaded: report its accent colour, the one it gives
 * the browser (<meta name="theme-color">, preferring a dark-mode one), or else its background;
 * and its background itself, to fill the strip under the clock with, as Safari does.
 */
export const accentScript = `(function () {
  try {
    var filled = function (el) {
      var c = el ? getComputedStyle(el).backgroundColor : '';
      var bare = (c || '').replace(/ /g, '');
      var seeThrough = !bare || bare === 'transparent' || (bare.indexOf('rgba(') === 0 && bare.slice(-3) === ',0)');
      return seeThrough ? null : c;
    };
    // A page with no background of its own is white, as browsers draw it.
    var background = filled(document.body) || filled(document.documentElement) || 'rgb(255, 255, 255)';
    var metas = Array.prototype.slice.call(document.querySelectorAll('meta[name="theme-color"]'));
    var dark = metas.filter(function (m) { return /dark/.test(m.getAttribute('media') || ''); })[0];
    var color = (dark || metas[0] || {}).content || background;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'accent', color: color || null, background: background }));
  } catch (e) {}
})(); true;`
