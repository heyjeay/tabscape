import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { hostOf } from '../lib/address'
import type { Tab } from '../useTabs'

/** Tabscape-style gradient colours (start, end), for a tab with no picture yet; each site always gets the same. */
const PAIRS: [string, string][] = [
  ['#fc4a1a', '#f7b733'], ['#0072ff', '#00c6ff'], ['#11998e', '#38ef7d'],
  ['#dd2476', '#ff512f'], ['#8e2de2', '#c471f5'], ['#4e54c8', '#8f94fb']
]

export const tabColor = (tab: Tab) => {
  const host = hostOf(tab.url) || 'tabscape'
  const sum = [...host].reduce((total, c) => total + c.charCodeAt(0), 0)
  return PAIRS[sum % PAIRS.length]
}

export const tabLetter = (tab: Tab) => (tab.url ? (hostOf(tab.url)[0] ?? '•').toUpperCase() : '✦')

/** The picture of a tab: its snapshot if there is one, otherwise its colour and first letter. */
export const TabPicture = ({ tab, letterSize = 40, style }: { tab: Tab; letterSize?: number; style?: StyleProp<ViewStyle> }) => {
  const [from, to] = tabColor(tab)
  return (
    <View style={[styles.picture, { backgroundColor: from }, style]}>
      {tab.thumbnail ? (
        <Image source={{ uri: tab.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: to, opacity: 0.55, transform: [{ skewY: '-20deg' }, { translateY: 40 }] }]} />
          <Text style={[styles.letter, { fontSize: letterSize }]}>{tabLetter(tab)}</Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  picture: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontWeight: '800' }
})
