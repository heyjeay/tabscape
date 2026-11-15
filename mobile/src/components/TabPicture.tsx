import { useState } from 'react'
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { hostOf } from '../lib/address'
import { iconSiteOf, useIcon } from '../lib/icons'
import type { Tab } from '../useTabs'

/** Tabscape-style gradients (start, end), for a tab with no picture yet; each site always gets the same. */
const PAIRS: [string, string][] = [
  ['#fc4a1a', '#f7b733'], ['#0072ff', '#00c6ff'], ['#11998e', '#38ef7d'],
  ['#dd2476', '#ff512f'], ['#8e2de2', '#c471f5'], ['#4e54c8', '#8f94fb']
]

export const tabColors = (tab: Tab) => {
  const host = hostOf(tab.url) || 'tabscape'
  const sum = [...host].reduce((total, c) => total + c.charCodeAt(0), 0)
  return PAIRS[sum % PAIRS.length]
}

export const tabLetter = (tab: Tab) => (tab.url ? (hostOf(tab.url)[0] ?? '•').toUpperCase() : '✦')

/** The picture of a tab: its snapshot if there is one, otherwise its colours and first letter. */
export const TabPicture = ({ tab, letterSize = 40, style }: { tab: Tab; letterSize?: number; style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.picture, style]}>
    {tab.thumbnail ? (
      <Image source={{ uri: tab.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
    ) : (
      <LinearGradient colors={tabColors(tab)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[styles.letter, { fontSize: letterSize }]}>{tabLetter(tab)}</Text>
      </LinearGradient>
    )}
  </View>
)

/**
 * The site's own icon (fetched once and kept on the phone: see lib/icons), or its colour and
 * letter until it's there, or when it hasn't one. The start page gets the ✦.
 */
export const Favicon = ({ tab, size = 22 }: { tab: Tab; size?: number }) => {
  const [failed, setFailed] = useState(false)
  const icon = useIcon(iconSiteOf(tab.url))
  const box = { width: size, height: size, borderRadius: size * 0.27 }
  // A drawn (SVG) icon is for the start page, which can show it; here, the letter.
  if (!icon || failed || /\.svg$/i.test(icon)) {
    return (
      <LinearGradient colors={tabColors(tab)} style={[box, styles.center]}>
        <Text style={[styles.letter, { fontSize: size * 0.55 }]}>{tabLetter(tab)}</Text>
      </LinearGradient>
    )
  }
  return <Image source={{ uri: icon }} style={[box, styles.icon]} onError={() => setFailed(true)} />
}

const styles = StyleSheet.create({
  picture: { overflow: 'hidden', backgroundColor: '#24242c' },
  center: { alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontWeight: '800' },
  icon: { backgroundColor: '#fff' }
})
