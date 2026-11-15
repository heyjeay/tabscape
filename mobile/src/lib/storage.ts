import AsyncStorage from '@react-native-async-storage/async-storage'
import { log } from '../config'

/** JSON kept on the device: tabs, recent searches, pages waiting for the start page. */
export const load = async <T,>(key: string, fallback: T): Promise<T> => {
  try {
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch (e) {
    log("couldn't read", key, e)
    return fallback
  }
}

export const save = async (key: string, value: unknown) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    log("couldn't save", key, e)
  }
}

export const keys = {
  tabs: 'tabscape.tabs',
  recentSearches: 'tabscape.recentSearches',
  savedPages: 'tabscape.saved',
  history: 'tabscape.history',
  closedTabs: 'tabscape.closedTabs',
  archivedTabs: 'tabscape.archivedTabs',
  sites: 'tabscape.sites'
}
