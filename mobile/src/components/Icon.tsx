import { Ionicons } from '@expo/vector-icons'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { colors } from '../config'

interface Props {
  /** Apple's SF Symbol, as on iOS itself. */
  sf: SFSymbol
  /** The look-alike for Android, where SF Symbols don't exist. */
  fallback: keyof typeof Ionicons.glyphMap
  size?: number
  color?: string
  weight?: 'regular' | 'medium' | 'semibold' | 'bold'
}

/** An icon: SF Symbols on iOS, so it matches the system; Ionicons elsewhere. */
export const Icon = ({ sf, fallback, size = 22, color = colors.text, weight = 'medium' }: Props) => (
  <SymbolView
    name={sf}
    size={size}
    tintColor={color}
    weight={weight}
    fallback={<Ionicons name={fallback} size={size} color={color} />}
  />
)
