import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../config'

interface Props {
  notFound: boolean
  onFind: (query: string, backwards: boolean) => void
  onTyping: () => void
  onDone: () => void
}

/** Find on Page: type a word, then step through the matches with the arrows. */
export const FindBar = ({ notFound, onFind, onTyping, onDone }: Props) => {
  const [query, setQuery] = useState('')
  return (
    <View style={styles.bar}>
      <View style={styles.field}>
        <TextInput
          value={query}
          onChangeText={text => {
            setQuery(text)
            onTyping()
          }}
          onSubmitEditing={() => query && onFind(query, false)}
          placeholder="Find on page"
          placeholderTextColor={colors.secondary}
          style={styles.input}
          autoFocus
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardAppearance="dark"
          blurOnSubmit={false}
        />
        {notFound && <Text style={styles.notFound}>Not found</Text>}
      </View>
      <Pressable onPress={() => query && onFind(query, true)} disabled={!query} hitSlop={6} accessibilityLabel="Previous match">
        <Ionicons name="chevron-up" size={22} color={query ? colors.text : colors.faint} />
      </Pressable>
      <Pressable onPress={() => query && onFind(query, false)} disabled={!query} hitSlop={6} accessibilityLabel="Next match">
        <Ionicons name="chevron-down" size={22} color={query ? colors.text : colors.faint} />
      </Pressable>
      <Pressable onPress={onDone} hitSlop={6}>
        <Text style={styles.done}>Done</Text>
      </Pressable>
    </View>
  )
}

/** JavaScript for the page: its own find, which highlights the next match; it reports whether there was one. */
export const findScript = (query: string, backwards: boolean) => `(function () {
  var found = window.find(${JSON.stringify(query)}, false, ${backwards}, true);
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'find', found: !!found }));
})(); true;`

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.background },
  field: { flex: 1, height: 42, borderRadius: 21, backgroundColor: colors.faint, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  input: { flex: 1, color: colors.text, fontSize: 16 },
  notFound: { color: colors.secondary, fontSize: 12 },
  done: { color: colors.text, fontSize: 16, fontWeight: '600' }
})
