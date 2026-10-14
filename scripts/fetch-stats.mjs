// Collects Tabscape's public store numbers into a small JSON file for the website.
// Runs once a day from .github/workflows/pages.yml; usage: node scripts/fetch-stats.mjs <out.json>
//
// Firefox has a proper API. Chrome doesn't, so its numbers are read off the public listing
// page; if Google changes that page, they come back null and the website simply hides them.
// This script never fails the deploy: a missing number is better than a missing website.
import { writeFileSync } from 'node:fs'

/** Set DEBUG_STATS=1 to log what was fetched and parsed. */
const debug = process.env.DEBUG_STATS === '1'
const log = (...args) => { if (debug) console.log('[stats]', ...args) }

// The overrides are for testing the parsing against listings that already have numbers.
const CHROME_ID = process.env.STATS_CHROME_ID ?? 'lcfglngeemnollbmimbfjmlifgbhiclk'
const FIREFOX_SLUG = process.env.STATS_FIREFOX_SLUG ?? 'tabscape-new-tab'
const out = process.argv[2] ?? 'stats.json'

const empty = () => ({ users: null, plus: false, rating: null, ratings: null })

/** "3.7K" → 3700, "1,234" → 1234 */
const parseCount = text => {
  const m = /^([\d.,]+)\s*([KM]?)$/i.exec(text.trim())
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  return Math.round(n * ({ K: 1e3, M: 1e6 }[m[2].toUpperCase()] ?? 1))
}

const chrome = async () => {
  const res = await fetch(`https://chromewebstore.google.com/detail/${CHROME_ID}?hl=en`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (tabscape stats)', 'Accept-Language': 'en' }
  })
  if (!res.ok) throw new Error(`Chrome Web Store answered ${res.status}`)
  const html = await res.text()
  // Only read the listing's header: from its title to the first section heading. Further
  // down ("Related", "You might also like") are other extensions' ratings and user counts,
  // which would otherwise be mistaken for ours.
  const start = html.indexOf('<h1')
  if (start < 0) throw new Error('listing title not found; the page layout may have changed')
  const end = html.indexOf('<h2', start)
  const page = html.slice(start, end > start ? end : start + 12000)
  const stats = empty()
  // e.g. ">21,000,000 users<" or ">1,000+ users<". Shown only once there are some.
  const users = />([\d,]+)(\+?) users</.exec(page)
  if (users) {
    stats.users = parseCount(users[1])
    stats.plus = users[2] === '+'
  }
  // e.g. aria-label="Average rating 4.5 out of 5 stars." and "3.7K ratings"
  const rating = /Average rating ([\d.]+) out of 5/.exec(page)
  if (rating) stats.rating = Number(rating[1])
  const ratings = />([\d.,]+\s*[KM]?) ratings?</i.exec(page)
  if (ratings) stats.ratings = parseCount(ratings[1])
  log('chrome', stats)
  return stats
}

const firefox = async () => {
  const res = await fetch(`https://addons.mozilla.org/api/v5/addons/addon/${FIREFOX_SLUG}/`)
  // Until the add-on is public, Mozilla's API answers 401: nothing to show yet.
  if (!res.ok) {
    log('firefox not public yet:', res.status)
    return empty()
  }
  const data = await res.json()
  const stats = {
    users: Number(data.average_daily_users) || 0,
    plus: false,
    rating: data.ratings?.count ? Math.round(data.ratings.average * 10) / 10 : null,
    ratings: data.ratings?.count ?? null
  }
  log('firefox', stats)
  return stats
}

const settle = async (name, fn) => {
  try {
    return await fn()
  } catch (e) {
    console.warn(`[stats] ${name} failed, leaving it out:`, e.message)
    return empty()
  }
}

const stats = {
  updated: new Date().toISOString(),
  chrome: await settle('chrome', chrome),
  firefox: await settle('firefox', firefox)
}
writeFileSync(out, JSON.stringify(stats, null, 2))
console.log(`[stats] wrote ${out}: chrome ${stats.chrome.users ?? '-'} users, firefox ${stats.firefox.users ?? '-'} users`)
