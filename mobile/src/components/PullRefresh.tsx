import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { css, mix, type Rgb } from '../lib/color'

/** How far to pull (points) before the page refreshes. */
export const PULL_TO_REFRESH = 95

const SIZE = 32
const STROKE = 4.5
const RADIUS = (SIZE - STROKE) / 2
const CENTRE = SIZE / 2

/** Where the ring starts drawing: 1 o'clock, a twelfth of the way round from the top. */
const START = 1 / 12

/** The ring is drawn in this many short pieces, so its colour can run from grey to white along it. */
const PIECES = 48

const GREY: Rgb = [118, 118, 128]
const WHITE: Rgb = [255, 255, 255]

/** A point on the ring, `turn` of the way round clockwise from 12 o'clock. */
const pointAt = (turn: number) => {
  const angle = turn * 2 * Math.PI - Math.PI / 2
  return `${(CENTRE + RADIUS * Math.cos(angle)).toFixed(2)} ${(CENTRE + RADIUS * Math.sin(angle)).toFixed(2)}`
}

/**
 * The ring drawn clockwise from 1 o'clock, `amount` of the way round (0 to 1), as short arcs
 * that go from grey at the start to white at a full turn: a short pull is grey, and it whitens
 * as you pull further, like a clock hand sweeping from 1 through 2, 3… and round to 1 again.
 */
const pieces = (amount: number) => {
  const drawn: { d: string; color: string }[] = []
  for (let i = 0; i < PIECES && i / PIECES < amount; i++) {
    const from = i / PIECES
    const to = Math.min((i + 1) / PIECES, amount)
    drawn.push({
      d: `M ${pointAt(START + from)} A ${RADIUS} ${RADIUS} 0 0 1 ${pointAt(START + to)}`,
      color: css(mix(GREY, WHITE, (from + to) / 2))
    })
  }
  return drawn
}

interface Props {
  /** How far the page is pulled down past its top (points). */
  pull: Animated.Value
  /** Changes each time a pull reaches full, for one pulse. */
  pulse: number
  /** Spins while the page reloads. */
  refreshing: boolean
  top: number
}

/**
 * Arc's pull-to-refresh: a ring that draws itself clockwise from 1 o'clock as you pull down,
 * faint grey at first and brightening to white, complete (with one pulse) when the pull is
 * far enough; then it spins while the page reloads.
 */
export const PullRefresh = ({ pull, pulse, refreshing, top }: Props) => {
  const spin = useRef(new Animated.Value(0)).current
  const grow = useRef(new Animated.Value(1)).current
  /** How far round the ring is drawn, 0 to 1, following the pull (in hundredths, so it only redraws when it shows). */
  const [amount, setAmount] = useState(0)

  useEffect(() => {
    const id = pull.addListener(({ value }) => setAmount(Math.round(Math.min(1, Math.max(0, value / PULL_TO_REFRESH)) * 100) / 100))
    return () => pull.removeListener(id)
  }, [pull])

  // Reaching the full pull: one beat, out and back.
  useEffect(() => {
    if (!pulse) return
    grow.setValue(1)
    Animated.sequence([
      Animated.timing(grow, { toValue: 1.4, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(grow, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 })
    ]).start()
  }, [pulse, grow])

  useEffect(() => {
    if (!refreshing) return
    spin.setValue(0)
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    // Turned back upright, so the next pull starts at 1 o'clock again, not wherever the spin stopped.
    return () => {
      loop.stop()
      spin.setValue(0)
    }
  }, [refreshing, spin])

  const drawn = refreshing ? 0.75 : amount
  const arcs = useMemo(() => pieces(drawn), [drawn])
  // See-through at first, solid once it's pulled all the way. Set on the view, not each piece,
  // so where the pieces overlap doesn't show.
  const brightness = refreshing ? 1 : 0.35 + 0.65 * amount

  // Two layers: the outer follows the pull (set from scrolling), the inner spins and pulses
  // (run natively). One value can't drive both kinds, so they never share a view.
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          top,
          opacity: refreshing ? 1 : pull.interpolate({ inputRange: [2, 12], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [
            { translateY: refreshing ? 24 : pull.interpolate({ inputRange: [0, PULL_TO_REFRESH * 2], outputRange: [0, 60], extrapolate: 'clamp' }) }
          ]
        }
      ]}
    >
      <Animated.View
        style={{
          opacity: brightness,
          transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }, { scale: grow }]
        }}
      >
        <Svg width={SIZE} height={SIZE}>
          {arcs.map((piece, i) => (
            <Path key={i} d={piece.d} stroke={piece.color} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
          ))}
        </Svg>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', left: 0, right: 0, alignItems: 'center' }
})
