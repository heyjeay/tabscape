import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../config'
import { hostOf } from '../lib/address'
import { clearVisits, loadVisits, onHistoryChange, removeVisit, type Visit } from '../lib/history'
import { Glass } from './Glass'
import { Icon } from './Icon'
import { Favicon } from './TabPicture'

export type HistoryKind = 'history' | 'closed' | 'archived'
type Kind = HistoryKind

const KINDS: { kind: Kind; label: string; empty: string }[] = [
  { kind: 'history', label: 'History', empty: 'Pages you visit show up here. Private tabs never do.' },
  { kind: 'closed', label: 'Closed', empty: 'Tabs you close show up here. Hold + to bring back the last one.' },
  { kind: 'archived', label: 'Archived', empty: "Tabs you haven't opened in a while are tidied away here. Choose how long in Settings." }
]

interface Props {
  visible: boolean
  /** The list it opens on. */
  startOn?: Kind
  onClose: () => void
  /** A history entry: opened in the tab showing. */
  onOpen: (url: string) => void
  /** A closed or archived tab: opened again as a tab of its own. */
  onReopen: (visit: Visit) => void
}

const DAY = 24 * 3600_000

/** "Today", "Yesterday", "Monday", or "3 March". */
const dayName = (at: number) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = today.getTime()
  if (at >= start) return 'Today'
  if (at >= start - DAY) return 'Yesterday'
  const date = new Date(at)
  if (at >= start - 6 * DAY) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

const timeOf = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * Where you've been: your history by day, the tabs you've closed, and the tabs tidied away for
 * not being opened in a while. Search any of them; tap one to go back to it.
 */
export const HistorySheet = ({ visible, startOn = 'history', onClose, onOpen, onReopen }: Props) => {
  const [kind, setKind] = useState<Kind>('history')
  const [query, setQuery] = useState('')
  const [visits, setVisits] = useState<Visit[]>([])

  useEffect(() => {
    if (!visible) return
    let live = true
    const read = () => loadVisits(kind).then(found => live && setVisits(found))
    read()
    const stop = onHistoryChange(read)
    return () => {
      live = false
      stop()
    }
  }, [visible, kind])

  const sections = useMemo(() => {
    const words = query.trim().toLowerCase()
    const shown = words
      ? visits.filter(v => v.title.toLowerCase().includes(words) || v.url.toLowerCase().includes(words))
      : visits
    const byDay: { title: string; data: Visit[] }[] = []
    for (const visit of shown) {
      const title = dayName(visit.at)
      const last = byDay[byDay.length - 1]
      if (last?.title === title) last.data.push(visit)
      else byDay.push({ title, data: [visit] })
    }
    return byDay
  }, [visits, query])

  const about = KINDS.find(k => k.kind === kind)!

  const clear = () =>
    Alert.alert(`Clear ${about.label.toLowerCase()}?`, "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clearVisits(kind) }
    ])

  const pick = (visit: Visit) => {
    if (kind === 'history') onOpen(visit.url)
    else {
      removeVisit(kind, visit)
      onReopen(visit)
    }
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onShow={() => {
      setQuery('')
      setKind(startOn)
    }}>
      <LinearGradient colors={['#1d1b2e', '#241c30']} style={styles.sheet}>
        <View style={styles.header}>
          <Pressable onPress={clear} hitSlop={10} disabled={!visits.length}>
            <Text style={[styles.action, !visits.length && { color: colors.dim }]}>Clear</Text>
          </Pressable>
          <Text style={styles.heading}>{about.label}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={[styles.action, styles.done]}>Done</Text>
          </Pressable>
        </View>

        <View style={styles.segments}>
          {KINDS.map(k => (
            <Pressable key={k.kind} style={[styles.segment, k.kind === kind && styles.segmentOn]} onPress={() => setKind(k.kind)}>
              <Text style={[styles.segmentText, k.kind === kind && styles.segmentTextOn]}>{k.label}</Text>
            </Pressable>
          ))}
        </View>

        <Glass style={styles.field}>
          <Icon sf="magnifyingglass" fallback="search" size={17} color={colors.secondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${about.label.toLowerCase()}`}
            placeholderTextColor={colors.secondary}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardAppearance="dark"
            clearButtonMode="while-editing"
          />
        </Glass>

        <SectionList
          sections={sections}
          keyExtractor={(visit, i) => `${visit.at}-${i}`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          initialNumToRender={25}
          renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
          ListEmptyComponent={<Text style={styles.empty}>{query ? 'Nothing matches.' : about.empty}</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => pick(item)} onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
              removeVisit(kind, item)
            }} style={styles.row}>
              <Favicon tab={{ id: '', url: item.url, title: item.title }} size={28} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title || hostOf(item.url) || item.url}</Text>
                <Text style={styles.rowNote} numberOfLines={1}>{hostOf(item.url)} · {timeOf(item.at)}</Text>
              </View>
              {kind !== 'history' && <Icon sf="plus.square.on.square" fallback="add-circle-outline" size={18} color={colors.secondary} />}
            </Pressable>
          )}
        />
      </LinearGradient>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 20, paddingBottom: 12 },
  heading: { color: colors.text, fontSize: 17, fontWeight: '700' },
  action: { color: colors.text, fontSize: 17, minWidth: 56 },
  done: { fontWeight: '600', textAlign: 'right' },
  segments: { flexDirection: 'row', marginHorizontal: 16, padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  segment: { flex: 1, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: 'rgba(255,255,255,0.2)' },
  segmentText: { color: colors.secondary, fontSize: 14, fontWeight: '600' },
  segmentTextOn: { color: colors.text },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderRadius: 22, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 16 },
  input: { flex: 1, color: colors.text, fontSize: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  day: { color: colors.secondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginTop: 20, marginBottom: 6, marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 6 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 16 },
  rowNote: { color: colors.secondary, fontSize: 13 },
  empty: { color: colors.secondary, fontSize: 15, textAlign: 'center', marginTop: 60, paddingHorizontal: 30, lineHeight: 21 }
})
