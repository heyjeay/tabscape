import Constants from 'expo-constants'
import * as DocumentPicker from 'expo-document-picker'
import { LinearGradient } from 'expo-linear-gradient'
import type { SFSymbol } from 'expo-symbols'
import type { Ionicons } from '@expo/vector-icons'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { ActionSheetIOS, Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { blockedNetworkCount, hasNativeExtras, setBlocking } from '../../modules/tabscape-native'
import { colors, links } from '../config'
import { ENGINES, engineOf, type EngineId } from '../lib/engines'
import { clearVisits, clearVisitsSince } from '../lib/history'
import { queueImport } from '../lib/savedPages'
import { clearRecentSearches } from '../lib/searches'
import { ARCHIVE_CHOICES, loadSettings, saveSettings, type BrowserSettings } from '../lib/settings'
import { Glass } from './Glass'
import type { HistoryKind } from './HistorySheet'
import { Icon } from './Icon'

interface Props {
  visible: boolean
  onClose: () => void
  /** The sheet has finished going away (so another can come up). */
  onClosed: () => void
  /** A backup was chosen and is waiting for a start page to take it in. */
  onImportQueued: () => void
  /** History or Archive, from the buttons at the top. */
  onOpenHistory: (kind: HistoryKind) => void
  /** Share the addresses of the open tabs. */
  onExportTabs: () => void
  /** Sites with their own text size (percent, by host), and putting one (or all, with null) back to normal. */
  textSizes: Record<string, number>
  onResetTextSize: (host: string | null) => void
  /** Ad and tracker blocking was switched on or off: the page showing loads again to match. */
  onBlockingChanged: () => void
}

type Fallback = keyof typeof Ionicons.glyphMap

/** A pick from a short list: iOS's own menu from the bottom (a plain alert elsewhere). */
const choose = (title: string, options: string[], pick: (index: number) => void, message?: string, destructive?: number) => {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, message, options: [...options, 'Cancel'], cancelButtonIndex: options.length, destructiveButtonIndex: destructive, userInterfaceStyle: 'dark' },
      index => {
        if (index < options.length) pick(index)
      }
    )
  } else {
    Alert.alert(title, message, [
      ...options.slice(0, 2).map((text, index) => ({ text, onPress: () => pick(index) })),
      { text: 'Cancel', style: 'cancel' as const }
    ])
  }
}

const HOUR = 3600_000

/** Clear Browsing Data's choices: how far back to forget. */
const CLEAR_RANGES: { label: string; since: () => number }[] = [
  { label: 'The last hour', since: () => Date.now() - HOUR },
  { label: 'Today', since: () => new Date().setHours(0, 0, 0, 0) },
  { label: 'Today and yesterday', since: () => new Date().setHours(0, 0, 0, 0) - 24 * HOUR },
  { label: 'All time', since: () => 0 }
]

const archiveLabel = (hours: number) => {
  const choice = ARCHIVE_CHOICES.find(c => c.hours === hours)
  if (!choice) return `After ${hours} hours`
  return choice.hours ? `After ${choice.label}` : choice.label
}

/**
 * The browser's settings, laid out like Arc's: History and Archive up top, then grouped rows,
 * each with a coloured icon. The start page has its own settings (backgrounds, fonts…), behind
 * its ⚙ as always.
 */
export const SettingsSheet = (props: Props) => {
  const { visible, onClose } = props
  const [settings, setSettings] = useState<BrowserSettings | null>(null)
  const [page, setPage] = useState<'main' | 'sites'>('main')

  useEffect(() => {
    if (visible) loadSettings().then(setSettings)
  }, [visible])

  const change = (next: Partial<BrowserSettings>) => {
    if (!settings) return
    const all = { ...settings, ...next }
    setSettings(all)
    saveSettings(all)
  }

  /** A backup exported from Tabscape on a computer (Customize → Sync & backup → Export). */
  const importLinks = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', 'text/plain'], copyToCacheDirectory: true })
      .catch(() => null)
    if (!picked || picked.canceled || !picked.assets?.[0]) return
    if (await queueImport(picked.assets[0].uri).catch(() => false)) {
      props.onImportQueued()
    } else {
      Alert.alert("That isn't a Tabscape backup", 'In Tabscape on your computer, open Customize → Sync & backup → Export, and pick the file it saves.')
    }
  }

  const engineIds = Object.keys(ENGINES) as EngineId[]
  const pickEngine = () =>
    choose('Search Engine', engineIds.map(id => ENGINES[id].name), index => change({ searchEngine: engineIds[index] }))

  const pickArchive = () =>
    choose(
      'Archive Inactive Tabs',
      ARCHIVE_CHOICES.map(c => archiveLabel(c.hours)),
      index => change({ archiveAfter: ARCHIVE_CHOICES[index].hours }),
      "Tabs you haven't opened in this long are tidied away into History → Archived."
    )

  const clearData = () =>
    choose(
      'Clear Browsing Data',
      CLEAR_RANGES.map(r => r.label),
      index => {
        const since = CLEAR_RANGES[index].since()
        clearVisitsSince('history', since)
        clearVisitsSince('closed', since)
        if (!since) {
          clearVisits('closed')
          clearRecentSearches()
        }
        Alert.alert('Cleared')
      },
      'Forgets the pages you visited and the tabs you closed in that time; All time also forgets your recent searches. Sites you are signed in to stay signed in.',
      CLEAR_RANGES.length - 1
    )

  const sites = Object.entries(props.textSizes).sort(([a], [b]) => a.localeCompare(b))
  const engine = engineOf(settings?.searchEngine)

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onShow={() => setPage('main')}
      onDismiss={props.onClosed}
    >
      <LinearGradient colors={['#1d1b2e', '#241c30']} style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.headerSide}>
            {page === 'sites' && (
              <Pressable onPress={() => setPage('main')} hitSlop={10} style={styles.back} accessibilityLabel="Back to Settings">
                <Icon sf="chevron.left" fallback="chevron-back" size={18} weight="semibold" />
                <Text style={styles.backText}>Settings</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.heading}>{page === 'sites' ? 'Site Settings' : 'Settings'}</Text>
          <View style={[styles.headerSide, styles.headerRight]}>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Done">
              <Glass style={styles.done} interactive>
                <Text style={styles.doneText}>Done</Text>
              </Glass>
            </Pressable>
          </View>
        </View>

        {page === 'sites' ? (
          <ScrollView contentContainerStyle={styles.list}>
            <Text style={styles.note}>
              Text sizes you&apos;ve picked for each site, with the A buttons in the ⌃ menu. Desktop Site is set for each tab there too.
            </Text>
            {sites.length ? (
              <>
                <Group>
                  {sites.map(([host, size]) => (
                    <Row
                      key={host}
                      sf="textformat.size"
                      fallback="text-outline"
                      color="#2f6bff"
                      title={host}
                      value={`${size}%`}
                      onPress={() => choose(host, ['Reset text size'], () => props.onResetTextSize(host))}
                    />
                  ))}
                </Group>
                <Group>
                  <Row
                    sf="arrow.counterclockwise"
                    fallback="refresh"
                    color="#ef3e4a"
                    title="Reset all sites"
                    onPress={() => choose('Reset all sites?', ['Reset all'], () => props.onResetTextSize(null), undefined, 0)}
                  />
                </Group>
              </>
            ) : (
              <Text style={styles.empty}>No sites have their own settings yet.</Text>
            )}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            <View style={styles.pills}>
              <TopPill sf="clock" fallback="time-outline" label="History" onPress={() => props.onOpenHistory('history')} />
              <TopPill sf="archivebox" fallback="archive-outline" label="Archive" onPress={() => props.onOpenHistory('archived')} />
            </View>

            <Group>
              <Row sf="globe" fallback="globe-outline" color="#000000" title="Site Settings" chevron onPress={() => setPage('sites')} />
            </Group>

            <Group>
              <Row
                sf="square.and.arrow.down"
                fallback="download-outline"
                gradient={['#8b6cff', '#ff5fa2']}
                title="Import from your computer"
                note="Your Tabscape links: on your computer, Customize → Sync & backup → Export, then pick that file here."
                chevron
                onPress={importLinks}
              />
            </Group>

            <Group>
              <Row sf="magnifyingglass" fallback="search" color="#2f6bff" title="Search Engine" value={engine.name} chevron onPress={pickEngine} />
              <Row
                sf="text.magnifyingglass"
                fallback="list-outline"
                color="#34c759"
                title="Search Suggestions"
                note={`From ${engine.name} as you type, so your typing goes to ${engine.name} before you search.`}
                toggle={settings?.suggestions ?? true}
                onToggle={suggestions => change({ suggestions })}
              />
            </Group>

            <Group>
              <Row
                sf="shield.lefthalf.filled"
                fallback="shield-half-outline"
                color="#30b0c7"
                title="Block Ads and Trackers"
                note={hasNativeExtras
                  ? `${blockedNetworkCount()} well-known ad and tracking networks aren't loaded by the sites you visit.`
                  : 'Works in the Tabscape app from TestFlight, not in Expo Go.'}
                toggle={settings?.blockTrackers ?? true}
                onToggle={blockTrackers => {
                  change({ blockTrackers })
                  setBlocking(blockTrackers)
                  props.onBlockingChanged()
                }}
              />
            </Group>

            <Group>
              <Row
                sf="keyboard"
                fallback="keypad-outline"
                color="#f5b400"
                title="Auto-Open Keyboard"
                toggle={settings?.autoKeyboard ?? true}
                onToggle={autoKeyboard => change({ autoKeyboard })}
              />
              <Row sf="archivebox.fill" fallback="archive" color="#b44cf0" title="Archive Inactive Tabs" value={archiveLabel(settings?.archiveAfter ?? 24)} onPress={pickArchive} />
              <Row sf="eraser.fill" fallback="trash" color="#ef3e4a" title="Clear Browsing Data…" onPress={clearData} />
              <Row sf="square.and.arrow.up" fallback="share-outline" color="#2f6bff" title="Export Data" note="Share your open tab addresses" onPress={props.onExportTabs} />
            </Group>

            <Group>
              <Row sf="bubble.left.and.bubble.right.fill" fallback="chatbubbles" color="#5865f2" title="Join the Discord" note="Help, ideas and what's coming" onPress={() => Linking.openURL(links.discord).catch(() => {})} />
              <Row sf="hand.raised.fill" fallback="hand-left" color="#8e8e93" title="Privacy Policy" onPress={() => Linking.openURL(links.privacy).catch(() => {})} />
              <Row sf="chevron.left.forwardslash.chevron.right" fallback="code-slash" color="#8e8e93" title="Source Code" note="Free and open source (GPL)" chevron onPress={() => Linking.openURL(links.source).catch(() => {})} />
            </Group>

            <Text style={styles.about}>Tabscape {Constants.expoConfig?.version ?? ''} · no accounts, no tracking</Text>
          </ScrollView>
        )}
      </LinearGradient>
    </Modal>
  )
}

/** Rows that belong together, on one glass card with lines between them. */
const Group = ({ children }: { children: ReactNode }) => {
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean)
  return (
    <Glass style={styles.group}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={styles.line} />}
          {row}
        </Fragment>
      ))}
    </Glass>
  )
}

const Row = ({ sf, fallback, color, gradient, title, note, value, chevron, toggle, onToggle, onPress }: {
  sf: SFSymbol
  fallback: Fallback
  color?: string
  gradient?: [string, string]
  title: string
  note?: string
  value?: string
  chevron?: boolean
  toggle?: boolean
  onToggle?: (on: boolean) => void
  onPress?: () => void
}) => {
  const body = (
    <View style={styles.row}>
      {gradient ? (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
          <Icon sf={sf} fallback={fallback} size={17} color="#fff" weight="semibold" />
        </LinearGradient>
      ) : (
        <View style={[styles.icon, { backgroundColor: color }, color === '#000000' && styles.iconEdge]}>
          <Icon sf={sf} fallback={fallback} size={17} color="#fff" weight="semibold" />
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {!!note && <Text style={styles.rowNote}>{note}</Text>}
      </View>
      {!!value && <Text style={styles.value} numberOfLines={1}>{value}</Text>}
      {onToggle && <Switch value={toggle} onValueChange={onToggle} />}
      {chevron && <Icon sf="chevron.right" fallback="chevron-forward" size={15} color={colors.secondary} weight="semibold" />}
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed} accessibilityLabel={title}>
      {body}
    </Pressable>
  )
}

const TopPill = ({ sf, fallback, label, onPress }: { sf: SFSymbol; fallback: Fallback; label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.pillWrap} accessibilityLabel={label}>
    <Glass style={styles.pill} interactive>
      <Icon sf={sf} fallback={fallback} size={20} />
      <Text style={styles.pillText}>{label}</Text>
    </Glass>
  </Pressable>
)

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  headerSide: { flex: 1 },
  headerRight: { alignItems: 'flex-end' },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { color: colors.text, fontSize: 17 },
  done: { height: 44, borderRadius: 22, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48, gap: 22 },
  pills: { flexDirection: 'row', gap: 10 },
  pillWrap: { flex: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 50, borderRadius: 25 },
  pillText: { color: colors.text, fontSize: 17, fontWeight: '500' },
  group: { borderRadius: 26 },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.14)', marginLeft: 62, marginRight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 58, paddingHorizontal: 16, paddingVertical: 11 },
  pressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  iconEdge: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 17 },
  rowNote: { color: colors.secondary, fontSize: 13, lineHeight: 17 },
  value: { color: colors.secondary, fontSize: 17, maxWidth: 140 },
  note: { color: colors.secondary, fontSize: 14, lineHeight: 19, paddingHorizontal: 6 },
  empty: { color: colors.secondary, fontSize: 15, textAlign: 'center', marginTop: 30 },
  about: { color: colors.dim, fontSize: 13, textAlign: 'center' }
})
