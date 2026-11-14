import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useState } from 'react'
import { FlatList, Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../config'
import { isSearch, toUrl } from '../lib/address'
import { addRecentSearch, clearRecentSearches, fetchSuggestions, loadRecentSearches } from '../lib/searches'
import { loadSettings } from '../lib/settings'
import { Glass } from './Glass'
import { Icon } from './Icon'

interface Props {
  visible: boolean
  initial: string
  onGo: (url: string) => void
  onClose: () => void
}

/**
 * The search screen, like Arc's: a purple glow, a glass field with the keyboard already up,
 * suggestions as you type, and your recent searches when it's empty. Swipe down to close.
 */
export const SearchSheet = ({ visible, initial, onGo, onClose }: Props) => {
  const [text, setText] = useState(initial)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [suggest, setSuggest] = useState(true)

  useEffect(() => {
    if (!visible) return
    setText(initial)
    setSuggestions([])
    loadRecentSearches().then(setRecent)
    loadSettings().then(settings => setSuggest(settings.suggestions))
  }, [visible, initial])

  // Asks for suggestions once typing pauses, and drops answers to anything already typed over.
  useEffect(() => {
    if (!visible || !suggest) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetchSuggestions(text, controller.signal).then(found => {
        if (!controller.signal.aborted) setSuggestions(found)
      })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text, visible, suggest])

  const open = (input: string) => {
    const url = toUrl(input)
    if (!url) return
    if (isSearch(input)) addRecentSearch(input.trim())
    Keyboard.dismiss()
    onGo(url)
    onClose()
  }

  const showingRecent = !text
  const rows = showingRecent ? recent.slice(0, 8) : suggestions

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={['#2a1b6e', '#3b1f55', '#2a1726']} locations={[0, 0.55, 1]} style={styles.sheet}>
        <View style={styles.grabber} />

        <Glass style={styles.field}>
          <Icon sf="magnifyingglass" fallback="search" size={20} color={colors.secondary} />
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => open(text)}
            placeholder="Search..."
            placeholderTextColor={colors.secondary}
            style={styles.input}
            autoFocus
            selectTextOnFocus
            keyboardType="web-search"
            returnKeyType="go"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardAppearance="dark"
          />
          {!!text && (
            <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel="Clear">
              <Icon sf="xmark.circle.fill" fallback="close-circle" size={20} color={colors.secondary} />
            </Pressable>
          )}
        </Glass>

        {showingRecent && recent.length > 0 && (
          <View style={styles.heading}>
            <Text style={styles.headingText}>Recent</Text>
            <Pressable
              onPress={() => {
                clearRecentSearches()
                setRecent([])
              }}
              hitSlop={10}
            >
              <Text style={styles.headingText}>Clear</Text>
            </Pressable>
          </View>
        )}

        <FlatList
          data={rows}
          keyExtractor={item => item}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable style={styles.rowMain} onPress={() => open(item)}>
                <Icon
                  sf={showingRecent ? 'clock.arrow.circlepath' : 'magnifyingglass'}
                  fallback={showingRecent ? 'time-outline' : 'search'}
                  size={20}
                  color={colors.secondary}
                />
                <Text style={styles.rowText} numberOfLines={2}>{item}</Text>
              </Pressable>
              {/* Puts it in the field to keep typing, like Safari. */}
              <Pressable onPress={() => setText(item)} hitSlop={10} accessibilityLabel={`Edit ${item}`}>
                <Icon sf="arrow.up.left" fallback="arrow-up-outline" size={18} color={colors.secondary} />
              </Pressable>
            </View>
          )}
        />
      </LinearGradient>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: 18 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', marginTop: 8, marginBottom: 20 },
  field: { height: 60, borderRadius: 30, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22 },
  input: { flex: 1, color: colors.text, fontSize: 20 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 24, paddingBottom: 2 },
  headingText: { color: colors.secondary, fontSize: 14, fontWeight: '600' },
  list: { paddingTop: 8, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 },
  rowText: { flex: 1, color: colors.text, fontSize: 19, fontWeight: '500' }
})
