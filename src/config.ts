/** Flip on to log store loads, saves and cross-tab syncs to the console. */
export const debug = false

/** Tabscape's store pages, once each is approved. An empty one shows as "coming soon" on the website. */
export const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/tabscape/lcfglngeemnollbmimbfjmlifgbhiclk'
export const FIREFOX_STORE_URL = 'https://addons.mozilla.org/firefox/addon/tabscape-new-tab/'

/** The website shows how many people use Tabscape only from this many, across both stores. */
export const STATS_MIN_USERS = 100
/** ...and the star rating only once it rests on at least this many ratings. */
export const STATS_MIN_RATINGS = 3

/** The source, where people contribute through pull requests. */
export const GITHUB_URL = 'https://github.com/heyjeay/tabscape'

/** The launch video on YouTube (its id), shown on the website and the Chrome listing. */
export const VIDEO_ID = 'fi1AhXUkaxw'

/** Where people get help and suggest features. */
export const DISCORD_URL = 'https://discord.gg/T5bF56tvyj'

export const log = (...args: unknown[]) => {
  if (debug) console.log('[tabscape]', ...args)
}
