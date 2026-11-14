import MaskedViewLibrary from '@react-native-masked-view/masked-view'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import type { ComponentType, ReactElement } from 'react'
import { StyleSheet, View, type ViewProps } from 'react-native'

/** masked-view 0.3's types aren't accepted as a JSX component any more; see BottomBar. */
const MaskedView = MaskedViewLibrary as unknown as ComponentType<ViewProps & { maskElement: ReactElement }>

/**
 * The top edge, as in Safari on iOS 26: the page runs up under the clock and battery, and
 * softens there (a blur that fades out downwards, and a little darkening) so they stay readable.
 */
export const TopEdge = ({ height }: { height: number }) => (
  <View style={[styles.edge, { height }]} pointerEvents="none">
    <MaskedView
      style={StyleSheet.absoluteFill}
      maskElement={<LinearGradient colors={['#000', 'transparent']} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />}
    >
      <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
    </MaskedView>
    <LinearGradient
      colors={['rgba(14,14,20,0.6)', 'rgba(14,14,20,0)']}
      style={StyleSheet.absoluteFill}
    />
  </View>
)

const styles = StyleSheet.create({
  edge: { position: 'absolute', top: 0, left: 0, right: 0 }
})
