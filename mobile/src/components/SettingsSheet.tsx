import Constants from 'expo-constants'
import * as DocumentPicker from 'expo-document-picker'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { colors } from '../config'
import { queueImport } from '../lib/savedPages'
import { clearRecentSearches } from '../lib/searches'
import { loadSettings, saveSettings, type BrowserSettings } from '../lib/settings'
import { Glass } from './Glass'
import { Icon } from './Icon'

interface Props {
  visible: boolean
  onClose: () => void
  /** A backup was chosen and is waiting for a start page to take it in. */
  onImportQueued: () => void
}

/** The browser's settings. The start page has its own (backgrounds, fonts…), behind its ⚙ as always. */
export const SettingsSheet = ({ visible, onClose, onImportQueued }: Props) => {
  const [settings, setSettings] = useState<BrowserSettings | null>(null)

  useEffect(() => {
    if (visible) loadSettings().then(setSettings)
  }, [visible])

  const change = (next: BrowserSettings) => {
    setSettings(next)
    saveSettings(next)
  }

  /** A backup exported from Tabscape on a computer (Customize → Sync & backup → Export). */
  const importLinks = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', 'text/plain'], copyToCacheDirectory: true })
      .catch(() => null)
    if (!picked || picked.canceled || !picked.assets?.[0]) return
    if (await queueImport(picked.assets[0].uri).catch(() => false)) {
      onImportQueued()
    } else {
      Alert.alert("That isn't a Tabscape backup", 'In Tabscape on your computer, open Customize → Sync & backup → Export, and pick the file it saves.')
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={['#1d1b2e', '#241c30']} style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.heading}>Settings</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.section}>Your links</Text>
          <Pressable onPress={importLinks}>
            <Glass style={styles.row} interactive>
              <Icon sf="square.and.arrow.down" fallback="download-outline" />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Import from your computer</Text>
                <Text style={styles.rowNote}>Pick a backup exported from Tabscape on your computer: Customize → Sync & backup → Export.</Text>
              </View>
              <Icon sf="chevron.right" fallback="chevron-forward" size={16} color={colors.secondary} />
            </Glass>
          </Pressable>

          <Text style={styles.section}>Search</Text>
          <Glass style={styles.row}>
            <Icon sf="text.magnifyingglass" fallback="search" />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Search suggestions</Text>
              <Text style={styles.rowNote}>Suggestions from Google as you type. Your typing goes to Google before you search.</Text>
            </View>
            <Switch
              value={settings?.suggestions ?? true}
              onValueChange={suggestions => {
                if (settings) change({ ...settings, suggestions })
              }}
            />
          </Glass>
          <Pressable
            onPress={() => {
              clearRecentSearches()
              Alert.alert('Recent searches cleared')
            }}
          >
            <Glass style={styles.row} interactive>
              <Icon sf="clock.arrow.circlepath" fallback="time-outline" />
              <Text style={[styles.rowTitle, styles.rowBody]}>Clear recent searches</Text>
            </Glass>
          </Pressable>

          <Text style={styles.about}>Tabscape {Constants.expoConfig?.version ?? ''} · no accounts, no tracking</Text>
        </ScrollView>
      </LinearGradient>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8 },
  heading: { color: colors.text, fontSize: 28, fontWeight: '700' },
  done: { color: colors.text, fontSize: 17, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  section: { color: colors.secondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginTop: 18, marginLeft: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 12 },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 17 },
  rowNote: { color: colors.secondary, fontSize: 13 },
  about: { color: colors.dim, fontSize: 13, textAlign: 'center', marginTop: 28 }
})
