import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { SymbolView } from 'expo-symbols'
import { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { colors } from '../config'
import { TINTS, type TileSettings } from '../lib/settings'
import { Glass } from './Glass'
import { Icon } from './Icon'

/**
 * Start Page Icons, as iOS's own Customise card: a glass card over the start page, so the real
 * tiles change behind it as you pick. The four looks (Default, Dark, Clear, Tinted) as sample
 * tiles; for Tinted, its colours. Top left shows or hides the names under the tiles; top right
 * steps through the sizes (5, 4, 3 across), as iOS's small and large icons button does; the pill
 * at the bottom picks the shape. Tap anywhere else to close it.
 */

interface Props {
  visible: boolean
  tiles: TileSettings
  onChange: (tiles: TileSettings) => void
  onClose: () => void
  /** Room under the card for the bar. */
  bottom: number
  /** At most this wide, in the middle (the iPad's); otherwise the width of the screen. */
  maxWidth?: number
}

const LOOKS: { id: TileSettings['look']; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'dark', label: 'Dark' },
  { id: 'clear', label: 'Clear' },
  { id: 'tinted', label: 'Tinted' }
]
const SHAPES: { id: TileSettings['shape']; label: string }[] = [
  { id: 'rounded', label: 'Rounded' },
  { id: 'circle', label: 'Circle' },
  { id: 'square', label: 'Square' }
]
const SIZES: TileSettings['size'][] = ['small', 'medium', 'large']
const SIZE_NAMES = { small: 'Small, 5 across', medium: 'Medium, 4 across', large: 'Large, 3 across' }
const SIZE_SYMBOL = { small: 'square.grid.4x3.fill', medium: 'square.grid.3x3.fill', large: 'square.grid.2x2.fill' } as const
const RADIUS: Record<TileSettings['shape'], number> = { rounded: 0.24, circle: 0.5, square: 0.12 }
const SAMPLE = 66
/** The start page's own colours, for Tinted's first choice (what it looks like here). */
const ACCENT = '#ff5fa2'

/** A colour mixed toward another (hex), 0 to 1. */
const mix = (hex: string, toward: string, amount: number) => {
  const parse = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const [a, b] = [parse(hex), parse(toward)]
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * amount)).join(', ')})`
}

/** A made-up tile in one look: Apple's cloud and sun, drawn the way the start page draws that look. */
const SampleTile = ({ look, tint, shape }: { look: TileSettings['look']; tint: string; shape: TileSettings['shape'] }) => {
  const box = { width: SAMPLE, height: SAMPLE, borderRadius: SAMPLE * RADIUS[shape] }
  const colour = tint === 'accent' ? ACCENT : tint
  const glyph = (cloud: string, sun: string) => (
    <SymbolView name="cloud.sun.fill" type="palette" colors={[cloud, sun]} size={36} fallback={<Icon sf="cloud.sun.fill" fallback="partly-sunny" size={36} color={cloud} />} />
  )
  if (look === 'default') {
    return (
      <LinearGradient colors={['#5aaefc', '#2f74f0']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[box, styles.center, styles.shadow]}>
        {glyph('#ffffff', '#ffc531')}
      </LinearGradient>
    )
  }
  if (look === 'dark') return <View style={[box, styles.center, styles.shadow, styles.dark]}>{glyph('#e9e9ec', '#ffc531')}</View>
  if (look === 'clear') return <View style={[box, styles.center, styles.clear]}>{glyph('rgba(255,255,255,0.82)', 'rgba(255,255,255,0.95)')}</View>
  return (
    <View style={[box, styles.center, styles.shadow, { backgroundColor: mix(colour, '#000000', 0.72) }]}>
      {glyph(mix(colour, '#ffffff', 0.45), mix(colour, '#ffffff', 0.7))}
    </View>
  )
}

export const CustomiseIcons = ({ visible, tiles, onChange, onClose, bottom, maxWidth }: Props) => {
  const { width: screen } = useWindowDimensions()
  const edge = maxWidth && screen > maxWidth + 20 ? (screen - maxWidth) / 2 : 10
  // Kept on screen while it slides away. It slides rather than fades: Liquid Glass doesn't render at low opacity.
  const [shown, setShown] = useState(visible)
  const slide = useRef(new Animated.Value(0)).current
  // Asked for: on screen at once (set while rendering, so it doesn't take another round to appear).
  if (visible && !shown) setShown(true)

  useEffect(() => {
    if (visible) {
      Animated.spring(slide, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 220, mass: 0.9 }).start()
    } else {
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => finished && setShown(false))
    }
  }, [visible, slide])

  if (!shown) return null

  const change = (next: Partial<TileSettings>) => {
    Haptics.selectionAsync().catch(() => {})
    onChange({ ...tiles, ...next })
  }
  const nextSize = SIZES[(SIZES.indexOf(tiles.size) + 1) % SIZES.length]

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Anywhere else closes it; the start page stays in full view, so the tiles can be seen changing. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close Customise" />
      <Animated.View
        pointerEvents="box-none"
        style={[styles.place, { left: edge, right: edge, bottom: bottom + 10, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) }] }]}
      >
        <Glass style={styles.card}>
          <View style={styles.header}>
            <Pressable
              onPress={() => change({ names: !tiles.names })}
              hitSlop={10}
              style={[styles.corner, tiles.names && styles.cornerOn]}
              accessibilityRole="switch"
              accessibilityState={{ checked: tiles.names }}
              accessibilityLabel="Names under the icons"
            >
              <Icon sf={tiles.names ? 'text.below.photo.fill' : 'photo.fill'} fallback={tiles.names ? 'text' : 'image'} size={20} />
            </Pressable>
            <Text style={styles.title}>Customise</Text>
            <Pressable
              onPress={() => change({ size: nextSize })}
              hitSlop={10}
              style={styles.corner}
              accessibilityRole="button"
              accessibilityLabel={`Icon size: ${SIZE_NAMES[tiles.size]}`}
              accessibilityHint={`Changes to ${SIZE_NAMES[nextSize]}`}
            >
              <Icon sf={SIZE_SYMBOL[tiles.size]} fallback="grid" size={20} />
            </Pressable>
          </View>

          <View style={styles.looks}>
            {LOOKS.map(look => {
              const on = tiles.look === look.id
              return (
                <Pressable
                  key={look.id}
                  onPress={() => change({ look: look.id })}
                  style={styles.look}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${look.label} look`}
                >
                  <SampleTile look={look.id} tint={tiles.tint} shape={tiles.shape} />
                  <View style={[styles.label, on && styles.chosen]}>
                    <Text style={[styles.labelText, on && styles.labelTextOn]}>{look.label}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>

          {tiles.look === 'tinted' && (
            <View style={styles.swatches}>
              {['accent', ...TINTS].map(tint => (
                <Pressable
                  key={tint}
                  onPress={() => change({ tint })}
                  hitSlop={4}
                  style={[styles.ring, tiles.tint === tint && styles.ringOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tiles.tint === tint }}
                  accessibilityLabel={tint === 'accent' ? "The start page's colours" : `Colour ${tint}`}
                >
                  {tint === 'accent' ? (
                    <LinearGradient colors={['#8b6cff', '#ff5fa2', '#ffb347']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.swatch} />
                  ) : (
                    <View style={[styles.swatch, { backgroundColor: tint }]} />
                  )}
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.shapes}>
            {SHAPES.map(shape => {
              const on = tiles.shape === shape.id
              return (
                <Pressable
                  key={shape.id}
                  onPress={() => change({ shape: shape.id })}
                  style={[styles.shape, on && styles.chosen]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${shape.label} icons`}
                >
                  <Text style={[styles.shapeText, on && styles.labelTextOn]}>{shape.label}</Text>
                </Pressable>
              )
            })}
          </View>
        </Glass>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: 10, right: 10 },
  card: { borderRadius: 44, paddingTop: 16, paddingBottom: 14, paddingHorizontal: 14, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  corner: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cornerOn: { backgroundColor: 'rgba(255,255,255,0.16)' },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  looks: { flexDirection: 'row', justifyContent: 'space-around' },
  look: { alignItems: 'center', gap: 10 },
  center: { alignItems: 'center', justifyContent: 'center' },
  shadow: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 5 } },
  dark: { backgroundColor: '#151517', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  clear: { backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.5)' },
  label: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  chosen: { backgroundColor: 'rgba(255,255,255,0.16)' },
  labelText: { color: colors.secondary, fontSize: 15, fontWeight: '600' },
  labelTextOn: { color: colors.text },
  swatches: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6 },
  ring: { padding: 3, borderRadius: 19, borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: '#fff' },
  swatch: { width: 26, height: 26, borderRadius: 13 },
  shapes: { flexDirection: 'row', alignSelf: 'center', gap: 4, padding: 4, borderRadius: 24 },
  shape: { paddingHorizontal: 18, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  shapeText: { color: colors.secondary, fontSize: 16, fontWeight: '600' }
})
