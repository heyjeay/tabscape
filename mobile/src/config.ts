/** Flip on to log what the browser is doing to the Expo console. */
export const debug = false

export const log = (...args: unknown[]) => {
  if (debug) console.log('[tabscape]', ...args)
}

/** The colours of the app around the pages: dark, like the start page and Arc. */
export const colors = {
  background: '#14141c',
  text: '#ffffff',
  secondary: 'rgba(255,255,255,0.6)',
  faint: 'rgba(255,255,255,0.12)',
  card: '#2a2a33'
}
