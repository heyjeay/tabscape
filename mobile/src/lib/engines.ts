/** The search engines you can pick, and where each takes a search and gives suggestions. */
export const ENGINES = {
  google: {
    name: 'Google',
    search: 'https://www.google.com/search?q=',
    suggest: 'https://suggestqueries.google.com/complete/search?client=firefox&q='
  },
  duckduckgo: {
    name: 'DuckDuckGo',
    search: 'https://duckduckgo.com/?q=',
    suggest: 'https://duckduckgo.com/ac/?type=list&q='
  },
  bing: {
    name: 'Bing',
    search: 'https://www.bing.com/search?q=',
    suggest: 'https://api.bing.com/osjson.aspx?query='
  },
  brave: {
    name: 'Brave Search',
    search: 'https://search.brave.com/search?q=',
    suggest: 'https://search.brave.com/api/suggest?q='
  },
  ecosia: {
    name: 'Ecosia',
    search: 'https://www.ecosia.org/search?q=',
    suggest: 'https://ac.ecosia.org/autocomplete?type=list&q='
  }
} as const

export type EngineId = keyof typeof ENGINES

export const engineOf = (id: string | undefined) => ENGINES[(id as EngineId) in ENGINES ? (id as EngineId) : 'google']
