import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../config'
import { hostOf, isSearch, toUrl } from '../lib/address'
import { findInHistory, type Visit } from '../lib/history'
import { addRecentSearch, clearRecentSearches, fetchSuggestions, loadRecentSearches } from '../lib/searches'
import { engineOf } from '../lib/engines'
import { loadSettings } from '../lib/settings'
import { Glass } from './Glass'
import { Icon } from './Icon'

interface Props {
  visible: boolean
  initial: string
  onGo: (url: string) => void
  onClose: () => void
  /** In a private tab, searches aren't remembered. */
  isPrivate?: boolean
  /** The keyboard comes up at once (Auto-Open Keyboard); otherwise a tap on the field brings it. */
  keyboard?: boolean
}

/** A row under the field: a page from your history, a suggestion, or a recent search. */
type Row = { kind: 'page'; visit: Visit } | { kind: 'suggestion' | 'recent'; text: string }

/**
 * How tall the keyboard was last time (0 until it's first been up). The panel springs straight to
 * there as search opens, as quick as the ⌃ menu, rather than waiting for the keyboard, which only
 * starts once the field has focus and then comes up at its own pace.
 */
let keyboardHeight = 0

/** History matches shown above the suggestions. */
const PAGES = 2

/** Rows of suggestions shown at once, so the panel stays above the keyboard. */
const MAX_ROWS = 5

/**
 * Search, as in Arc: the page dims, and a glass panel with the field rises with the keyboard
 * and rides on top of it. Suggestions appear under the field as you type; your recent searches
 * when it's empty. A tap on the dimmed page closes it.
 */
export const SearchOverlay = ({ visible, initial, onGo, onClose, isPrivate, keyboard = true }: Props) => {
  const insets = useSafeAreaInsets()
  const [mounted, setMounted] = useState(visible)
  const [text, setText] = useState(initial)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [pages, setPages] = useState<Visit[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [suggest, setSuggest] = useState(true)
  const [engine, setEngine] = useState(engineOf('google'))

  // The page dims (a plain dark layer, so it can fade); the panel moves, never fades.
  const dim = useRef(new Animated.Value(0)).current
  const lift = useRef(new Animated.Value(insets.bottom)).current
  const drop = useRef(new Animated.Value(400)).current
  // Built once: rebuilt on every keystroke, it would be unhooked and hooked up again natively.
  const rise = useMemo(() => Animated.add(Animated.multiply(lift, -1), drop), [lift, drop])

  useEffect(() => {
    if (visible) {
      setMounted(true)
      setText(initial)
      setSuggestions([])
      setPages([])
      loadRecentSearches().then(setRecent)
      loadSettings().then(settings => {
        setSuggest(settings.suggestions)
        setEngine(engineOf(settings.searchEngine))
      })
      Animated.timing(dim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
      // The same spring as the ⌃ menu (useSlideUp); with the keyboard on its way, straight up to where it'll be.
      Animated.spring(drop, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 3 }).start()
      if (keyboard && keyboardHeight) {
        liftTo.current = keyboardHeight
        Animated.spring(lift, { toValue: keyboardHeight, useNativeDriver: true, speed: 22, bounciness: 0 }).start()
      }
    } else if (mounted) {
      Keyboard.dismiss()
      Animated.timing(dim, { toValue: 0, duration: 180, useNativeDriver: true }).start()
      Animated.timing(drop, { toValue: 400, duration: 180, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false)
      })
    }
  }, [visible])

  // Rides on the keyboard: up with it, down with it, at its speed (unless it's already where the keyboard's going).
  const liftTo = useRef(insets.bottom)
  useEffect(() => {
    const follow = (to: number, duration: number) => {
      if (Math.abs(to - liftTo.current) < 2) return
      liftTo.current = to
      Animated.timing(lift, { toValue: to, duration: duration || 250, easing: Easing.bezier(0.17, 0.59, 0.4, 0.77), useNativeDriver: true }).start()
    }
    const shown = Keyboard.addListener('keyboardWillShow', e => {
      keyboardHeight = e.endCoordinates.height
      follow(e.endCoordinates.height, e.duration)
    })
    const hidden = Keyboard.addListener('keyboardWillHide', e => follow(insets.bottom, e.duration))
    return () => {
      shown.remove()
      hidden.remove()
    }
  }, [insets.bottom, lift])

  // Pages from your history that match, straight away (they're on the device).
  useEffect(() => {
    if (!visible) return
    let live = true
    findInHistory(text, PAGES).then(found => live && setPages(found))
    return () => {
      live = false
    }
  }, [text, visible])

  // Asks for suggestions once typing pauses, and drops answers to anything already typed over.
  useEffect(() => {
    if (!visible || !suggest) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetchSuggestions(text, controller.signal, engine.suggest).then(found => {
        if (!controller.signal.aborted) setSuggestions(found)
      })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text, visible, suggest, engine])

  if (!mounted) return null

  const open = (typed: string) => {
    const url = toUrl(typed, engine.search)
    if (!url) return
    if (isSearch(typed) && !isPrivate) addRecentSearch(typed.trim())
    onGo(url)
    onClose()
  }

  const showingRecent = !text
  const rows: Row[] = showingRecent
    ? recent.slice(0, MAX_ROWS).map(text => ({ kind: 'recent', text }))
    : [
        ...pages.map(visit => ({ kind: 'page' as const, visit })),
        ...suggestions.map(text => ({ kind: 'suggestion' as const, text }))
      ].slice(0, MAX_ROWS)

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'box-none' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity: dim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close search" />
      </Animated.View>

      <Animated.View
        style={[styles.wrap, { transform: [{ translateY: rise }] }]}
      >
        <Glass style={styles.panel}>
          <Glass style={styles.field}>
            <Icon sf="magnifyingglass" fallback="search" size={19} color={colors.secondary} />
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => open(text)}
              placeholder="Search..."
              placeholderTextColor={colors.secondary}
              style={styles.input}
              autoFocus={keyboard}
              selectTextOnFocus
              keyboardType="web-search"
              returnKeyType="go"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardAppearance="dark"
            />
            {!!text && (
              <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel="Clear">
                <Icon sf="xmark.circle.fill" fallback="close-circle" size={19} color={colors.secondary} />
              </Pressable>
            )}
          </Glass>

          {showingRecent && rows.length > 0 && (
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
            keyExtractor={item => (item.kind === 'page' ? `page:${item.visit.url}` : `${item.kind}:${item.text}`)}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={false}
            renderItem={({ item }) =>
              item.kind === 'page' ? (
                <Pressable style={styles.row} onPress={() => {
                  onGo(item.visit.url)
                  onClose()
                }}>
                  <Icon sf="clock" fallback="time-outline" size={18} color={colors.secondary} />
                  <View style={styles.rowPage}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.visit.title || hostOf(item.visit.url)}</Text>
                    <Text style={styles.rowNote} numberOfLines={1}>{hostOf(item.visit.url)}</Text>
                  </View>
                </Pressable>
              ) : (
                <View style={styles.row}>
                  <Pressable style={styles.rowMain} onPress={() => open(item.text)}>
                    <Icon
                      sf={item.kind === 'recent' ? 'clock.arrow.circlepath' : 'magnifyingglass'}
                      fallback={item.kind === 'recent' ? 'time-outline' : 'search'}
                      size={18}
                      color={colors.secondary}
                    />
                    <Text style={styles.rowText} numberOfLines={1}>{item.text}</Text>
                  </Pressable>
                  {/* Puts it in the field to keep typing, like Safari. */}
                  <Pressable onPress={() => setText(item.text)} hitSlop={10} accessibilityLabel={`Edit ${item.text}`}>
                    <Icon sf="arrow.up.left" fallback="arrow-up-outline" size={16} color={colors.secondary} />
                  </Pressable>
                </View>
              )
            }
          />
        </Glass>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(8,8,14,0.55)' },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 8, paddingHorizontal: 8 },
  panel: { borderRadius: 30, padding: 10, gap: 4 },
  field: { height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  input: { flex: 1, color: colors.text, fontSize: 18 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 10 },
  headingText: { color: colors.secondary, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowText: { flex: 1, color: colors.text, fontSize: 17 },
  rowPage: { flex: 1, gap: 1 },
  rowTitle: { color: colors.text, fontSize: 17 },
  rowNote: { color: colors.secondary, fontSize: 13 }
})
