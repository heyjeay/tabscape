import { BlurView } from 'expo-blur'
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import type { ReactNode } from 'react'
import { Platform, StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native'

/**
 * Real iOS 26 Liquid Glass where the phone has it. Some early iOS 26 betas lack the API and
 * crash, hence the second check. Older iPhones and Android get frosted blur instead.
 * Glass doesn't render at low opacity, so never fade it (or anything around it) with opacity.
 */
export const liquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()

interface Props {
  style?: StyleProp<ViewStyle>
  children?: ReactNode
  /** Reacts to touch, like iOS 26's own buttons. */
  interactive?: boolean
  tint?: ColorValue
}

export const Glass = ({ style, children, interactive, tint }: Props) =>
  liquidGlass ? (
    <GlassView style={[styles.base, style]} glassEffectStyle="regular" isInteractive={interactive} tintColor={tint} colorScheme="dark">
      {children}
    </GlassView>
  ) : (
    <View style={[styles.base, styles.fallback, style]}>
      <BlurView tint="systemThinMaterialDark" intensity={80} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  )

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  fallback: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' }
})
