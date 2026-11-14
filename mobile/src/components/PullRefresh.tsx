import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet } from 'react-native'
import Svg, { Path } from 'react-native-svg'

/** How far to pull (points) before the page refreshes. */
export const PULL_TO_REFRESH = 95

const SIZE = 30
const STROKE = 3
const RADIUS = (SIZE - STROKE) / 2
const CENTRE = SIZE / 2

/** Where the ring starts drawing: 1 o'clock, a twelfth of the way round from the top. */
const START = 1 / 12

/** A point on the ring, `turn` of the way round clockwise from 12 o'clock (0 to 1). */
const pointAt = (turn: number) => {
  const angle = turn * 2 * Math.PI - Math.PI / 2
  return `${CENTRE + RADIUS * Math.cos(angle)} ${CENTRE + RADIUS * Math.sin(angle)}`
}

/**
 * The ring drawn clockwise from 1 o'clock, `amount` of the way round, like a clock hand
 * sweeping from 1 through 2, 3… and back up to 12 and 1. Drawn as an explicit arc, so it
 * always starts at the top right.
 */
const arc = (amount: number) => {
  if (amount <= 0.001) return ''
  if (amount >= 0.999) {
    // A full circle: two half arcs, since one arc can't end where it starts.
    return `M ${pointAt(START)} A ${RADIUS} ${RADIUS} 0 1 1 ${pointAt(START + 0.5)} A ${RADIUS} ${RADIUS} 0 1 1 ${pointAt(START)}`
  }
  return `M ${pointAt(START)} A ${RADIUS} ${RADIUS} 0 ${amount > 0.5 ? 1 : 0} 1 ${pointAt(START + amount)}`
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
  /** How far round the ring is drawn, 0 to 1, following the pull. */
  const [amount, setAmount] = useState(0)

  useEffect(() => {
    const id = pull.addListener(({ value }) => setAmount(Math.min(1, Math.max(0, value / PULL_TO_REFRESH))))
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
    return () => loop.stop()
  }, [refreshing, spin])

  const drawn = refreshing ? 0.75 : amount
  // Faint and greyish at first, white once it's pulled all the way.
  const brightness = refreshing ? 1 : 0.18 + 0.82 * amount

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
        style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }, { scale: grow }] }}
      >
        <Svg width={SIZE} height={SIZE}>
          <Path
            d={arc(drawn)}
            stroke="#ffffff"
            strokeOpacity={brightness}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', left: 0, right: 0, alignItems: 'center' }
})
