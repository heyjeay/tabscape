import { Directory, File, Paths } from 'expo-file-system'
import { log } from '../config'

/**
 * Tab pictures (for the tab button and the tab browser), kept in the app's own documents so they
 * last between launches. They used to stay in iOS's temporary folder, which it may empty at any
 * time, so they were dropped at each launch and every tab showed its letter until it was opened.
 * Private tabs' pictures stay temporary: nothing of them is kept.
 */
const folder = new Directory(Paths.document, 'tab-pictures')

/** Moves a just-taken picture (a temporary file) in with the others; the address to use for it. */
export const keepPicture = async (uri: string, tabId: string): Promise<string> => {
  try {
    folder.create({ idempotent: true, intermediates: true })
    // A new name each time: the screen keeps pictures by address, so an old one would stay showing.
    const kept = new File(folder, `${tabId.replace(/[^a-z0-9-]/gi, '_')}-${Date.now().toString(36)}.jpg`)
    await new File(uri).move(kept)
    return kept.uri
  } catch (e) {
    log("couldn't keep a tab picture", e)
    return uri
  }
}

/**
 * A kept picture from last launch, at its address now (iOS can move the app's folders between
 * launches and updates, so it's found by name), or undefined if it isn't there.
 */
export const pictureFromLastLaunch = (uri?: string) => {
  const name = uri?.split('/').pop()
  if (!name || !uri?.includes('/tab-pictures/')) return undefined
  try {
    const file = new File(folder, name)
    return file.exists ? file.uri : undefined
  } catch {
    return undefined
  }
}

/** Deletes kept pictures no tab uses any more (left from tabs closed while the app was away). */
export const tidyPictures = (inUse: (string | undefined)[]) => {
  try {
    if (!folder.exists) return
    const keep = new Set(inUse.map(uri => uri?.split('/').pop()).filter(Boolean))
    for (const item of folder.list()) {
      if (item instanceof File && !keep.has(item.uri.split('/').pop())) item.delete()
    }
  } catch (e) {
    log("couldn't tidy the tab pictures", e)
  }
}
