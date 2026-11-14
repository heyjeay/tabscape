import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

/** How far to pull (points) before the page refreshes. */
export const PULL_TO_REFRESH = 95

const SIZE = 30
const STROKE = 3
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

interface Props {
  /** How far the page is pulled down past its top (points). */
  pull: Animated.Value
  /** Spins while the page reloads. */
  refreshing: boolean
  top: number
}

/**
 * Arc's pull-to-refresh: a grey ring that draws itself round as you pull down, following
 * your finger, complete when the pull is far enough; then it spins while the page reloads.
 */
export const PullRefresh = ({ pull, refreshing, top }: Props) => {
  const spin = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!refreshing) return
    spin.setValue(0)
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [refreshing, spin])

  // While refreshing the ring stays full and in place; otherwise it follows the pull.
  const drawn = refreshing ? 0.75 : pull.interpolate({ inputRange: [0, PULL_TO_REFRESH], outputRange: [0, 1], extrapolate: 'clamp' })
  const dashOffset = typeof drawn === 'number'
    ? CIRCUMFERENCE * (1 - drawn)
    : drawn.interpolate({ inputRange: [0, 1], outputRange: [CIRCUMFERENCE, 0] })

  // Two layers: the outer follows the pull (set from scrolling), the inner spins (run natively).
  // One value can't drive both kinds, so they never share a view.
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          top,
          opacity: refreshing ? 1 : pull.interpolate({ inputRange: [8, 40], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [
            { translateY: refreshing ? 24 : pull.interpolate({ inputRange: [0, PULL_TO_REFRESH * 2], outputRange: [0, 60], extrapolate: 'clamp' }) }
          ]
        }
      ]}
    >
      <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
        <Svg width={SIZE} height={SIZE}>
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            // Starts drawing from the top, going clockwise, as in Arc.
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', left: 0, right: 0, alignItems: 'center' }
})
