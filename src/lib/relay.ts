import nacl from 'tweetnacl'
import { log, RELAY_URL } from '@/config'
import type { Snapshot } from './sync'

/**
 * Sync between a computer and a phone, through Tabscape's relay (relay/ in this repo, a
 * Cloudflare Worker). Pairing makes a secret, shared by QR code (a tabscape://pair link the
 * phone's camera opens in the app). From it each device works out, on its own:
 * - the group's address at the relay,
 * - a write token, so only the group can change it,
 * - the encryption key: the start page is sealed (XSalsa20-Poly1305, tweetnacl) before it
 *   leaves the device, so the relay only ever holds what it can't read.
 * The relay keeps the latest copy and its revision; a write says which revision it replaces, so
 * two devices can't overwrite each other unawares. Newest edit wins, as with Chrome's own sync.
 *
 * tweetnacl rather than the browser's crypto.subtle: the iPhone app's start page is a local
 * page, where WebKit may not offer crypto.subtle.
 */

/** This device's pairing: the secret, and the relay revision it last saw. Kept on this device only. */
const KEY = 'startpage_relay'

interface Pairing {
  secret: string
  /** The links' revision this device last saw. */
  rev: number
  /** The icons' revision this device last saw. */
  iconsRev: number
}

const utf8 = (text: string) => new TextEncoder().encode(text)

export const toBase64Url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const fromBase64Url = (text: string) => {
  const plain = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = plain + '='.repeat((4 - (plain.length % 4)) % 4)
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

/** A value only the secret's holders can work out, for one purpose (SHA-512 of a label and the secret). */
const derive = (secret: Uint8Array, purpose: string) => {
  const label = utf8(`tabscape/${purpose}/`)
  const input = new Uint8Array(label.length + secret.length)
  input.set(label)
  input.set(secret, label.length)
  return nacl.hash(input)
}

/** What a secret gives: where the group is, how to write to it, and how to seal and open its copy. */
export const keysFor = (secretText: string) => {
  const secret = fromBase64Url(secretText)
  return {
    group: hex(derive(secret, 'group').slice(0, 16)),
    token: toBase64Url(derive(secret, 'write').slice(0, 32)),
    iconsGroup: hex(derive(secret, 'icons-group').slice(0, 16)),
    iconsToken: toBase64Url(derive(secret, 'icons-write').slice(0, 32)),
    key: derive(secret, 'key').slice(0, nacl.secretbox.keyLength)
  }
}

export const seal = (value: unknown, key: Uint8Array) => {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  return `${toBase64Url(nonce)}.${toBase64Url(nacl.secretbox(utf8(JSON.stringify(value)), nonce, key))}`
}

export const open = (sealed: string, key: Uint8Array): unknown => {
  const [nonce, box] = sealed.split('.')
  if (!nonce || !box) return null
  const plain = nacl.secretbox.open(fromBase64Url(box), fromBase64Url(nonce), key)
  return plain ? JSON.parse(new TextDecoder().decode(plain)) : null
}

const readPairing = (): Pairing | null => {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Pairing> | null
    return value && typeof value.secret === 'string' && value.secret.length >= 32
      ? { secret: value.secret, rev: Number(value.rev) || 0, iconsRev: Number(value.iconsRev) || 0 }
      : null
  } catch {
    return null
  }
}

const savePairing = (pairing: Pairing | null) => {
  try {
    if (pairing) localStorage.setItem(KEY, JSON.stringify(pairing))
    else localStorage.removeItem(KEY)
  } catch (e) {
    console.warn("[tabscape] Couldn't save the phone pairing", e)
  }
}

export const isPaired = () => !!readPairing()

/** The link a phone opens to join: its camera reads it from the QR code and hands it to the app. */
export const pairingLink = () => {
  const pairing = readPairing()
  return pairing ? `tabscape://pair?k=${pairing.secret}` : null
}

/** Starts a new group on this device (the computer showing the QR code). */
export const startPairing = () => {
  savePairing({ secret: toBase64Url(nacl.randomBytes(32)), rev: 0, iconsRev: 0 })
}

/** Joins the group a QR code showed (on the phone). False if the secret isn't one. */
export const joinPairing = (secret: string) => {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(secret)) return false
  savePairing({ secret, rev: 0, iconsRev: 0 })
  return true
}

/** This device stops syncing (the others in the group carry on). */
export const leavePairing = () => savePairing(null)

/** Another tab paired, left, or saw a new revision: storage changed under this one. */
export const isPairingKey = (key: string | null) => key === KEY

const url = (group: string) => `${RELAY_URL}/v1/g/${group}`

export class RelayUnreachable extends Error {}

/**
 * The group's two copies at the relay: its links (pages, settings), which every device sends and
 * takes; and its icons, which a computer sends from Chrome's own icon store for the phone, kept
 * apart so they don't go with every edit. Each has its own address and write token.
 */
type Doc = 'links' | 'icons'

const docOf = (pairing: Pairing, doc: Doc) => {
  const keys = keysFor(pairing.secret)
  return doc === 'links'
    ? { group: keys.group, token: keys.token, key: keys.key, rev: pairing.rev, field: 'rev' as const }
    : { group: keys.iconsGroup, token: keys.iconsToken, key: keys.key, rev: pairing.iconsRev, field: 'iconsRev' as const }
}

/**
 * Notes a revision seen, on the pairing as it is now (another request may have noted one of the
 * other copy's meanwhile); not if the pairing was left, or replaced, since this one began.
 */
const noteRevision = (secret: string, field: 'rev' | 'iconsRev', rev: number) => {
  const now = readPairing()
  if (now && now.secret === secret) savePairing({ ...now, [field]: rev })
}

/** A copy, if there's a newer one than this device last saw (or `always`); null if there's nothing newer (or nothing yet). */
const readDoc = async (doc: Doc, always: boolean, valid: (value: unknown) => boolean): Promise<unknown> => {
  const pairing = readPairing()
  if (!pairing) return null
  const d = docOf(pairing, doc)
  let response: Response
  try {
    response = await fetch(always ? url(d.group) : `${url(d.group)}?since=${d.rev}`, { cache: 'no-store' })
  } catch (e) {
    throw new RelayUnreachable(String(e))
  }
  if (response.status === 204 || response.status === 404) return null
  if (!response.ok) throw new RelayUnreachable(`relay answered ${response.status}`)
  const body = (await response.json()) as { rev: number; data: string }
  const value = open(body.data, d.key)
  // Can't be opened (not this group's key, or damaged): an error, never "nothing there", so
  // nothing is ever sent over a copy this device couldn't read.
  if (!value || !valid(value)) throw new RelayUnreachable(`the group's ${doc} couldn't be opened`)
  // Remember the revision now: what it holds is either taken in, or older than ours and about to be replaced.
  noteRevision(pairing.secret, d.field, body.rev)
  log('relay: read', doc, 'revision', body.rev)
  return value
}

/**
 * Sends this device's copy. If another device wrote first, nothing is sent and its copy comes
 * back, for the caller to compare (take it if newer, or send again).
 */
const pushDoc = async (doc: Doc, value: unknown, valid: (value: unknown) => boolean): Promise<{ newer: unknown }> => {
  const pairing = readPairing()
  if (!pairing) return { newer: null }
  const d = docOf(pairing, doc)
  let response: Response
  try {
    response = await fetch(url(d.group), {
      method: 'PUT',
      headers: { authorization: `Bearer ${d.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ rev: d.rev, data: seal(value, d.key) })
    })
  } catch (e) {
    throw new RelayUnreachable(String(e))
  }
  const body = (await response.json().catch(() => ({}))) as { rev?: number; data?: string }
  if (response.ok && typeof body.rev === 'number') {
    noteRevision(pairing.secret, d.field, body.rev)
    log('relay: pushed', doc, 'revision', body.rev)
    return { newer: null }
  }
  if (response.status === 409 && typeof body.rev === 'number' && body.data) {
    const newer = open(body.data, d.key)
    if (!newer || !valid(newer)) throw new RelayUnreachable(`the group's ${doc} couldn't be opened`)
    noteRevision(pairing.secret, d.field, body.rev)
    return { newer }
  }
  throw new RelayUnreachable(`relay answered ${response.status}`)
}

const isSnapshot = (value: unknown) => Array.isArray((value as Snapshot | null)?.sections)

/**
 * The group's copy of the links, if there's a newer one than this device last saw (or `always`):
 * the start page as it was pushed, or null if there's nothing newer (or no group yet).
 */
export const readRemote = async (always = false) => (await readDoc('links', always, isSnapshot)) as Snapshot | null

/** Sends this device's links. If another device wrote first, nothing is sent and its copy comes back. */
export const pushRemote = async (snapshot: Snapshot) => (await pushDoc('links', snapshot, isSnapshot)) as { newer: Snapshot | null }

/**
 * A computer's site icons, for the phone: by site (see lib/iconSite), each a PNG (base64) from
 * Chrome's own icon store; and the images given to links by hand, by link.
 */
export interface SharedIcons {
  v: 1
  sites: Record<string, string>
  own: Record<string, string>
}

const isSharedIcons = (value: unknown) => {
  const v = value as SharedIcons | null
  return !!v && typeof v.sites === 'object' && v.sites !== null && typeof v.own === 'object' && v.own !== null
}

/** The computer's icons, if they've changed since this device last took them (or `always`). */
export const readIcons = async (always = false) => (await readDoc('icons', always, isSharedIcons)) as SharedIcons | null

/** Sends this computer's icons, in place of what's there (a computer's icons are the newest it knows). */
export const pushIcons = async (icons: SharedIcons) => {
  const { newer } = await pushDoc('icons', icons, isSharedIcons)
  // Another computer sent its own first: ours go over them (now on top of the revision it made).
  if (newer) await pushDoc('icons', icons, isSharedIcons)
}
