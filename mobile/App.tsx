import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { BrowserScreen } from './src/BrowserScreen'

/** Tabscape Browser: an Arc-style browser with the Tabscape start page behind every new tab. */
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <BrowserScreen />
    </SafeAreaProvider>
  )
}
