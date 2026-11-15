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
import { ARCHIVE_CHOICES, loadSettings, saveSettings, TINTS, type BrowserSettings, type TileSettings } from '../lib/settings'
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
  /** The start page's tiles changed (Start Page Icons): open start pages change with them. */
  onTilesChanged: (tiles: TileSettings) => void
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
  const [page, setPage] = useState<'main' | 'sites' | 'tiles'>('main')

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

  const changeTiles = (next: Partial<TileSettings>) => {
    if (!settings) return
    const tiles = { ...settings.tiles, ...next }
    change({ tiles })
    props.onTilesChanged(tiles)
  }

  const sites = Object.entries(props.textSizes).sort(([a], [b]) => a.localeCompare(b))
  const tiles = settings?.tiles
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
            {page !== 'main' && (
              <Pressable onPress={() => setPage('main')} hitSlop={10} style={styles.back} accessibilityLabel="Back to Settings">
                <Icon sf="chevron.left" fallback="chevron-back" size={18} weight="semibold" />
                <Text style={styles.backText}>Settings</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.heading}>{page === 'sites' ? 'Site Settings' : page === 'tiles' ? 'Start Page Icons' : 'Settings'}</Text>
          <View style={[styles.headerSide, styles.headerRight]}>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Done">
              <Glass style={styles.done} interactive>
                <Text style={styles.doneText}>Done</Text>
              </Glass>
            </Pressable>
          </View>
        </View>

        {page === 'tiles' ? (
          <ScrollView contentContainerStyle={styles.list}>
            <Text style={styles.note}>How the site tiles on your start page look, like the icons on your iPhone&apos;s home screen.</Text>

            <View style={styles.looks}>
              {LOOKS.map(look => (
                <Pressable
                  key={look.id}
                  style={styles.lookWrap}
                  onPress={() => changeTiles({ look: look.id })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tiles?.look === look.id }}
                  accessibilityLabel={`${look.label} look`}
                >
                  <SampleTile look={look.id} tint={tiles?.tint ?? 'accent'} shape={tiles?.shape ?? 'rounded'} />
                  <Text style={[styles.lookLabel, tiles?.look === look.id && styles.lookLabelOn]}>{look.label}</Text>
                  <View style={[styles.lookDot, tiles?.look === look.id && styles.lookDotOn]} />
                </Pressable>
              ))}
            </View>

            {tiles?.look === 'tinted' && (
              <Glass style={styles.swatchCard}>
                <Text style={styles.cardTitle}>Colour</Text>
                <View style={styles.swatches}>
                  {['accent', ...TINTS].map(tint => (
                    <Pressable
                      key={tint}
                      onPress={() => changeTiles({ tint })}
                      hitSlop={4}
                      accessibilityRole="button"
                      accessibilityState={{ selected: tiles.tint === tint }}
                      accessibilityLabel={tint === 'accent' ? "The start page's colour" : `Colour ${tint}`}
                      style={[styles.swatchRing, tiles.tint === tint && styles.swatchRingOn]}
                    >
                      {tint === 'accent' ? (
                        <LinearGradient colors={['#8b6cff', '#ff5fa2', '#ffb347']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.swatch} />
                      ) : (
                        <View style={[styles.swatch, { backgroundColor: tint }]} />
                      )}
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.rowNote}>The first takes your start page&apos;s own colours.</Text>
              </Glass>
            )}

            <Glass style={styles.swatchCard}>
              <Text style={styles.cardTitle}>Shape</Text>
              <Segmented
                options={[{ id: 'rounded', label: 'Rounded' }, { id: 'circle', label: 'Circle' }, { id: 'square', label: 'Square' }]}
                value={tiles?.shape ?? 'rounded'}
                onChange={shape => changeTiles({ shape })}
              />
              <Text style={[styles.cardTitle, styles.cardTitleNext]}>Size</Text>
              <Segmented
                options={[{ id: 'small', label: 'Small · 5' }, { id: 'medium', label: 'Medium · 4' }, { id: 'large', label: 'Large · 3' }]}
                value={tiles?.size ?? 'medium'}
                onChange={size => changeTiles({ size })}
              />
              <Text style={styles.rowNote}>How many tiles fit across.</Text>
            </Glass>

            <Group>
              <Row
                sf="textformat"
                fallback="text-outline"
                color="#5e5ce6"
                title="Show Names"
                note="The site's name under each tile."
                toggle={tiles?.names ?? true}
                onToggle={names => changeTiles({ names })}
              />
            </Group>
          </ScrollView>
        ) : page === 'sites' ? (
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
              <Row
                sf="square.grid.2x2.fill"
                fallback="grid"
                gradient={['#ff7a18', '#ff3d77']}
                title="Start Page Icons"
                value={LOOKS.find(l => l.id === tiles?.look)?.label}
                chevron
                onPress={() => setPage('tiles')}
              />
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

/** The four looks, as the iPhone's home screen has them. */
const LOOKS: { id: TileSettings['look']; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'dark', label: 'Dark' },
  { id: 'clear', label: 'Clear' },
  { id: 'tinted', label: 'Tinted' }
]

const RADIUS: Record<TileSettings['shape'], number> = { rounded: 0.24, circle: 0.5, square: 0.12 }
const SAMPLE = 62

/**
 * A made-up tile in one look, to choose by: a star, as a site's icon would be drawn. The start
 * page draws the real ones (app-touch.css) the same way: own colours, on dark, see-through, or
 * all in one colour.
 */
const SampleTile = ({ look, tint, shape }: { look: TileSettings['look']; tint: string; shape: TileSettings['shape'] }) => {
  const box = { width: SAMPLE, height: SAMPLE, borderRadius: SAMPLE * RADIUS[shape] }
  const colour = tint === 'accent' ? '#ff5fa2' : tint
  const star = (color: string) => <Icon sf="star.fill" fallback="star" size={28} color={color} />
  if (look === 'default') {
    return (
      <LinearGradient colors={['#ffb347', '#ff5f6d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[box, styles.sampleCenter, styles.sampleShadow]}>
        {star('#fff')}
      </LinearGradient>
    )
  }
  if (look === 'dark') {
    return <View style={[box, styles.sampleCenter, styles.sampleShadow, { backgroundColor: '#1c1c1f' }]}>{star('#ff8a5c')}</View>
  }
  if (look === 'clear') {
    return <View style={[box, styles.sampleCenter, styles.sampleClear]}>{star('rgba(255,255,255,0.92)')}</View>
  }
  return <View style={[box, styles.sampleCenter, styles.sampleShadow, { backgroundColor: '#141418' }]}>{star(colour)}</View>
}

/** A row of choices, one picked, like iOS's segmented control. */
const Segmented = <T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) => (
  <View style={styles.segments}>
    {options.map(option => (
      <Pressable
        key={option.id}
        onPress={() => onChange(option.id)}
        style={[styles.segment, value === option.id && styles.segmentOn]}
        accessibilityRole="button"
        accessibilityState={{ selected: value === option.id }}
      >
        <Text style={[styles.segmentText, value === option.id && styles.segmentTextOn]} numberOfLines={1}>{option.label}</Text>
      </Pressable>
    ))}
  </View>
)

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
  about: { color: colors.dim, fontSize: 13, textAlign: 'center' },
  looks: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  lookWrap: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  lookLabel: { color: colors.secondary, fontSize: 14, fontWeight: '500' },
  lookLabelOn: { color: colors.text, fontWeight: '700' },
  lookDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },
  lookDotOn: { borderWidth: 6, borderColor: '#0a84ff', backgroundColor: '#fff' },
  sampleCenter: { alignItems: 'center', justifyContent: 'center' },
  sampleShadow: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 5 } },
  sampleClear: { backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.45)' },
  swatchCard: { borderRadius: 26, padding: 16, gap: 10 },
  cardTitle: { color: colors.text, fontSize: 17 },
  cardTitleNext: { marginTop: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatchRing: { padding: 3, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  swatchRingOn: { borderColor: '#fff' },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  segments: { flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  segment: { flex: 1, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: 'rgba(255,255,255,0.2)' },
  segmentText: { color: colors.secondary, fontSize: 14, fontWeight: '500' },
  segmentTextOn: { color: colors.text, fontWeight: '700' }
})
