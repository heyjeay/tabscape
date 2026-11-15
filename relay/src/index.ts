import { DurableObject } from 'cloudflare:workers'

/**
 * Tabscape's sync relay: passes a person's start page between their computer and phone.
 *
 * Each paired group (one computer's Tabscape and the phones that scanned its code) is one
 * Durable Object holding one thing: the latest copy of their start page, encrypted on their
 * devices with a key that never comes here, so the relay can't read it. It keeps a revision
 * number so two devices can't overwrite each other unawares (a write must say which revision it
 * replaces), and a hash of the group's write token, so only the group can change or remove it.
 * A group nobody writes to for 180 days is deleted.
 *
 *   GET    /v1/g/:id[?since=rev]  → 200 { rev, data } · 204 nothing newer · 404 no such group
 *   PUT    /v1/g/:id  { rev, data }, Authorization: Bearer <token>
 *                                 → 200 { rev } · 409 { rev, data } (someone wrote first) · 403
 *   DELETE /v1/g/:id, Authorization: Bearer <token> → 204 · 403
 */

export interface Env {
  GROUPS: DurableObjectNamespace<Group>
}

/** The most one start page may take (encrypted, base64): far more than any person's links need. */
const MAX_DATA = 512 * 1024
/** Unused for this long, a group is deleted. */
const KEEP_FOR = 180 * 24 * 3600_000

type WriteResult = { ok: true; rev: number } | { ok: false; status: 403 } | { ok: false; status: 409; rev: number; data: string }

interface Row extends Record<string, SqlStorageValue> {
  rev: number
  data: string
  writer: string
}

export class Group extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => this.setUp())
  }

  /** The one table (again, after the group's been deleted). */
  private setUp() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS snapshot (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        rev INTEGER NOT NULL,
        data TEXT NOT NULL,
        writer TEXT NOT NULL,
        updated INTEGER NOT NULL
      )
    `)
  }

  private row(): Row | undefined {
    return this.ctx.storage.sql.exec<Row>('SELECT rev, data, writer FROM snapshot WHERE id = 1').toArray()[0]
  }

  read(): { rev: number; data: string } | null {
    const row = this.row()
    return row ? { rev: row.rev, data: row.data } : null
  }

  /** Replaces revision `expected` (0 for a new group) with `data`. `writer` is the hash of the group's token. */
  async write(writer: string, expected: number, data: string): Promise<WriteResult> {
    const row = this.row()
    if (row && row.writer !== writer) return { ok: false, status: 403 }
    const current = row?.rev ?? 0
    if (current !== expected) return { ok: false, status: 409, rev: current, data: row?.data ?? '' }
    const rev = current + 1
    this.ctx.storage.sql.exec(
      `INSERT INTO snapshot (id, rev, data, writer, updated) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET rev = excluded.rev, data = excluded.data, updated = excluded.updated`,
      rev, data, writer, Date.now()
    )
    await this.ctx.storage.setAlarm(Date.now() + KEEP_FOR)
    return { ok: true, rev }
  }

  async remove(writer: string): Promise<boolean> {
    const row = this.row()
    if (row && row.writer !== writer) return false
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    this.setUp()
    return true
  }

  /** Nobody has written for KEEP_FOR: the group is forgotten. */
  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
    this.setUp()
  }
}

const CORS = {
  // Extensions (chrome-extension://, moz-extension://) and the iPhone app's start page (a local
  // page, origin "null") call this. Nothing rides on cookies: writes need the group's token.
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400'
}

const reply = (body: unknown, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, ...(body === null ? {} : { 'content-type': 'application/json' }), 'cache-control': 'no-store' }
  })

/** The group's write token, hashed: the relay never keeps the token itself. */
const writerOf = async (request: Request) => {
  const token = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(request.headers.get('authorization') ?? '')?.[1]
  if (!token) return null
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    const id = /^\/v1\/g\/([a-f0-9]{32,64})$/.exec(new URL(request.url).pathname)?.[1]
    if (!id) return reply({ error: 'not found' }, 404)
    const group = env.GROUPS.getByName(id)

    if (request.method === 'GET') {
      const snapshot = await group.read()
      if (!snapshot) return reply({ error: 'no such group' }, 404)
      const since = new URL(request.url).searchParams.get('since')
      if (since !== null && Number(since) === snapshot.rev) return reply(null, 204)
      return reply(snapshot)
    }

    const writer = await writerOf(request)
    if (!writer) return reply({ error: 'unauthorized' }, 401)

    if (request.method === 'PUT') {
      const length = Number(request.headers.get('content-length') ?? 0)
      if (length > MAX_DATA + 1024) return reply({ error: 'too large' }, 413)
      let body: { rev?: unknown; data?: unknown }
      try {
        body = await request.json()
      } catch {
        return reply({ error: 'bad request' }, 400)
      }
      if (typeof body.rev !== 'number' || !Number.isInteger(body.rev) || body.rev < 0) return reply({ error: 'bad rev' }, 400)
      if (typeof body.data !== 'string' || !body.data || body.data.length > MAX_DATA) return reply({ error: 'bad data' }, 400)
      const result = await group.write(writer, body.rev, body.data)
      if (result.ok) return reply({ rev: result.rev })
      if (result.status === 409) return reply({ rev: result.rev, data: result.data }, 409)
      return reply({ error: 'forbidden' }, 403)
    }

    if (request.method === 'DELETE') {
      return (await group.remove(writer)) ? reply(null, 204) : reply({ error: 'forbidden' }, 403)
    }

    return reply({ error: 'method not allowed' }, 405)
  }
} satisfies ExportedHandler<Env>
