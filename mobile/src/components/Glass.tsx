import { BlurView } from 'expo-blur'
import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

/** Frosted dark glass behind controls, like Arc's bars and sheets. Rounded with overflow, which BlurView needs. */
export const Glass = ({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) => (
  <View style={[styles.glass, style]}>
    <BlurView tint="systemThinMaterialDark" intensity={80} style={StyleSheet.absoluteFill} />
    {children}
  </View>
)

const styles = StyleSheet.create({
  glass: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)'
  }
})
