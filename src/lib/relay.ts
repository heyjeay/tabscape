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
  rev: number
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
    return value && typeof value.secret === 'string' && value.secret.length >= 32 ? { secret: value.secret, rev: Number(value.rev) || 0 } : null
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
  savePairing({ secret: toBase64Url(nacl.randomBytes(32)), rev: 0 })
}

/** Joins the group a QR code showed (on the phone). False if the secret isn't one. */
export const joinPairing = (secret: string) => {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(secret)) return false
  savePairing({ secret, rev: 0 })
  return true
}

/** This device stops syncing (the others in the group carry on). */
export const leavePairing = () => savePairing(null)

/** Another tab paired, left, or saw a new revision: storage changed under this one. */
export const isPairingKey = (key: string | null) => key === KEY

const url = (group: string) => `${RELAY_URL}/v1/g/${group}`

export class RelayUnreachable extends Error {}

/**
 * The group's copy, if there's a newer one than this device last saw (or `always`): the start
 * page as it was pushed, or null if there's nothing newer (or no group yet).
 */
export const readRemote = async (always = false): Promise<Snapshot | null> => {
  const pairing = readPairing()
  if (!pairing) return null
  const { group, key } = keysFor(pairing.secret)
  let response: Response
  try {
    response = await fetch(always ? url(group) : `${url(group)}?since=${pairing.rev}`, { cache: 'no-store' })
  } catch (e) {
    throw new RelayUnreachable(String(e))
  }
  if (response.status === 204 || response.status === 404) return null
  if (!response.ok) throw new RelayUnreachable(`relay answered ${response.status}`)
  const body = (await response.json()) as { rev: number; data: string }
  const snapshot = open(body.data, key) as Snapshot | null
  // Can't be opened (not this group's key, or damaged): an error, never "nothing there", so
  // nothing is ever sent over a copy this device couldn't read.
  if (!snapshot || !Array.isArray(snapshot.sections)) throw new RelayUnreachable("the group's copy couldn't be opened")
  // Remember the revision now: what it holds is either taken in, or older than ours and about to be replaced.
  savePairing({ ...pairing, rev: body.rev })
  log('relay: read revision', body.rev)
  return snapshot
}

/**
 * Sends this device's copy. If another device wrote first, nothing is sent and its copy comes
 * back, for the caller to compare (take it if newer, or push again).
 */
export const pushRemote = async (snapshot: Snapshot): Promise<{ newer: Snapshot | null }> => {
  const pairing = readPairing()
  if (!pairing) return { newer: null }
  const { group, token, key } = keysFor(pairing.secret)
  let response: Response
  try {
    response = await fetch(url(group), {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ rev: pairing.rev, data: seal(snapshot, key) })
    })
  } catch (e) {
    throw new RelayUnreachable(String(e))
  }
  const body = (await response.json().catch(() => ({}))) as { rev?: number; data?: string }
  if (response.ok && typeof body.rev === 'number') {
    savePairing({ ...pairing, rev: body.rev })
    log('relay: pushed revision', body.rev)
    return { newer: null }
  }
  if (response.status === 409 && typeof body.rev === 'number' && body.data) {
    const newer = open(body.data, key) as Snapshot | null
    if (!newer || !Array.isArray(newer.sections)) throw new RelayUnreachable("the group's copy couldn't be opened")
    savePairing({ ...pairing, rev: body.rev })
    return { newer }
  }
  throw new RelayUnreachable(`relay answered ${response.status}`)
}
