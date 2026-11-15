import { useEffect, useState } from 'react'
import { FlatList, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../config'
import type { Article, Block } from '../lib/reader'
import { changeSettings, loadSettings } from '../lib/settings'
import { Glass } from './Glass'
import { Icon } from './Icon'

interface Props {
  article: Article | null
  onClose: () => void
}

/** Reader text sizes (points). */
const SIZES = [15, 17, 19, 21, 24, 28]

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' })

/**
 * Reader: the page's article on its own, in clean, even text you can make bigger or smaller,
 * in a book typeface or the system one. It slides up over the page; swipe it down to go back.
 */
export const ReaderView = ({ article, onClose }: Props) => {
  const [size, setSize] = useState(19)
  const [serif, setSerif] = useState(true)

  useEffect(() => {
    if (!article) return
    loadSettings().then(s => {
      setSize(s.readerSize)
      setSerif(s.readerSerif)
    })
  }, [article])

  const resize = (up: boolean) => {
    const at = SIZES.findIndex(s => s >= size)
    const next = SIZES[Math.max(0, Math.min(SIZES.length - 1, (at < 0 ? SIZES.length - 1 : at) + (up ? 1 : -1)))]
    setSize(next)
    changeSettings({ readerSize: next })
  }

  const font = serif ? SERIF : undefined
  const body = { fontSize: size, lineHeight: Math.round(size * 1.6), fontFamily: font }

  return (
    <Modal visible={!!article} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.toolbar}>
          <Glass style={styles.tools}>
            <Pressable onPress={() => resize(false)} hitSlop={6} style={styles.tool} accessibilityLabel="Smaller text">
              <Text style={[styles.toolA, { fontSize: 14 }]}>A</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable onPress={() => resize(true)} hitSlop={6} style={styles.tool} accessibilityLabel="Bigger text">
              <Text style={[styles.toolA, { fontSize: 21 }]}>A</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              onPress={() => {
                setSerif(!serif)
                changeSettings({ readerSerif: !serif })
              }}
              hitSlop={6}
              style={styles.tool}
              accessibilityLabel={serif ? 'System typeface' : 'Book typeface'}
            >
              <Text style={[styles.toolA, { fontSize: 17, fontFamily: serif ? undefined : SERIF }]}>Aa</Text>
            </Pressable>
          </Glass>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close reader">
            <Glass style={styles.close} interactive>
              <Icon sf="xmark" fallback="close" size={16} weight="bold" />
            </Glass>
          </Pressable>
        </View>

        {article && (
          <FlatList
            data={article.blocks}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.content}
            initialNumToRender={20}
            ListHeaderComponent={
              <View style={styles.header}>
                <Text style={styles.site}>{article.site}</Text>
                <Text style={[styles.title, { fontFamily: font, fontSize: Math.round(size * 1.55), lineHeight: Math.round(size * 1.95) }]}>
                  {article.title}
                </Text>
                {!!article.byline && <Text style={styles.byline}>{article.byline}</Text>}
              </View>
            }
            renderItem={({ item }) => <Piece block={item} body={body} />}
          />
        )}
      </View>
    </Modal>
  )
}

const Piece = ({ block, body }: { block: Block; body: { fontSize: number; lineHeight: number; fontFamily?: string } }) => {
  switch (block.t) {
    case 'h':
      return <Text selectable style={[styles.text, styles.heading, { fontFamily: body.fontFamily, fontSize: body.fontSize * 1.2, lineHeight: body.lineHeight * 1.15 }]}>{block.text}</Text>
    case 'q':
      return (
        <View style={styles.quote}>
          <Text selectable style={[styles.text, body, styles.quoteText]}>{block.text}</Text>
        </View>
      )
    case 'li':
      return (
        <View style={styles.item}>
          <Text style={[styles.text, body, styles.bullet]}>{block.n ? `${block.n}.` : '•'}</Text>
          <Text selectable style={[styles.text, body, styles.itemText]}>{block.text}</Text>
        </View>
      )
    case 'pre':
      return <Text selectable style={[styles.text, styles.pre, { fontSize: body.fontSize * 0.8 }]}>{block.text}</Text>
    case 'img':
      return (
        <View style={styles.figure}>
          <Image source={{ uri: block.src }} style={[styles.image, { aspectRatio: block.w && block.h ? block.w / block.h : 16 / 10 }]} resizeMode="cover" />
          {!!block.caption && <Text style={styles.caption}>{block.caption}</Text>}
        </View>
      )
    default:
      return <Text selectable style={[styles.text, body, styles.paragraph]}>{block.text}</Text>
  }
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#17161f' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  tools: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 20, paddingHorizontal: 6 },
  tool: { minWidth: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  toolA: { color: colors.text, fontWeight: '600' },
  divider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: colors.dim },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 24, paddingBottom: 60 },
  header: { paddingTop: 18, paddingBottom: 14, gap: 10 },
  site: { color: colors.secondary, fontSize: 14, fontWeight: '600' },
  title: { color: colors.text, fontWeight: '700' },
  byline: { color: colors.secondary, fontSize: 15 },
  text: { color: 'rgba(255,255,255,0.88)' },
  paragraph: { marginBottom: 18 },
  heading: { color: colors.text, fontWeight: '700', marginTop: 10, marginBottom: 12 },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.dim, paddingLeft: 16, marginBottom: 18 },
  quoteText: { fontStyle: 'italic', color: colors.secondary },
  item: { flexDirection: 'row', gap: 10, marginBottom: 10, paddingLeft: 4 },
  bullet: { color: colors.secondary, minWidth: 18 },
  itemText: { flex: 1 },
  pre: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), backgroundColor: 'rgba(255,255,255,0.06)', padding: 14, borderRadius: 12, marginBottom: 18 },
  figure: { marginBottom: 20, gap: 8 },
  image: { width: '100%', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)' },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 19 }
})
