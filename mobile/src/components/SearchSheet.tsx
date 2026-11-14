import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { FlatList, Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../config'
import { isSearch, toUrl } from '../lib/address'
import { addRecentSearch, clearRecentSearches, fetchSuggestions, loadRecentSearches } from '../lib/searches'

interface Props {
  visible: boolean
  initial: string
  onGo: (url: string) => void
  onClose: () => void
}

/**
 * The search screen: a big field with the keyboard already up, suggestions as you type,
 * and your recent searches when it's empty. Opens on + and when you tap the address.
 */
export const SearchSheet = ({ visible, initial, onGo, onClose }: Props) => {
  const [text, setText] = useState(initial)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    if (!visible) return
    setText(initial)
    loadRecentSearches().then(setRecent)
  }, [visible, initial])

  // Asks for suggestions once typing pauses, and drops answers to anything already typed over.
  useEffect(() => {
    if (!visible) return
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
  }, [text, visible])

  const open = (input: string) => {
    const url = toUrl(input)
    if (!url) return
    if (isSearch(input)) addRecentSearch(input.trim())
    Keyboard.dismiss()
    onGo(url)
    onClose()
  }

  const rows = text ? suggestions : recent.slice(0, 8)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.top}>
          <View style={styles.field}>
            <Ionicons name="search" size={18} color={colors.secondary} />
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => open(text)}
              placeholder="Search or enter address"
              placeholderTextColor={colors.secondary}
              style={styles.input}
              autoFocus
              selectTextOnFocus
              keyboardType="web-search"
              returnKeyType="go"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardAppearance="dark"
              clearButtonMode="while-editing"
            />
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>

        {!text && recent.length > 0 && (
          <View style={styles.heading}>
            <Text style={styles.headingText}>Recent</Text>
            <Pressable
              onPress={() => {
                clearRecentSearches()
                setRecent([])
              }}
              hitSlop={10}
            >
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          </View>
        )}

        <FlatList
          data={rows}
          keyExtractor={item => item}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable style={styles.rowMain} onPress={() => open(item)}>
                <Ionicons name={text ? 'search' : 'time-outline'} size={18} color={colors.secondary} />
                <Text style={styles.rowText} numberOfLines={1}>{item}</Text>
              </Pressable>
              {/* Puts it in the field to keep typing, like Safari and Arc. */}
              <Pressable onPress={() => setText(item)} hitSlop={10} accessibilityLabel={`Edit ${item}`}>
                <Ionicons name="arrow-up-outline" size={18} color={colors.secondary} style={styles.fill} />
              </Pressable>
            </View>
          )}
        />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 18 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  field: { flex: 1, height: 52, borderRadius: 26, backgroundColor: colors.faint, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  input: { flex: 1, color: colors.text, fontSize: 18 },
  cancel: { color: colors.text, fontSize: 16 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingTop: 22, paddingBottom: 4 },
  headingText: { color: colors.secondary, fontSize: 13, fontWeight: '600' },
  clear: { color: colors.secondary, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6, gap: 12 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowText: { color: colors.text, fontSize: 16, flex: 1 },
  fill: { transform: [{ rotate: '-45deg' }] }
})
