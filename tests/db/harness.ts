import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')

export type Actor =
  | { kind: 'anon' }
  | { kind: 'user'; id: string }
  | { kind: 'service' }
  | { kind: 'postgres' }

/** Boots PGlite, installs the Supabase stub and applies every migration in order. */
export async function createDatabase(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pg_trgm } })
  await db.exec(readFileSync(join(root, 'tests', 'db', 'supabase-stub.sql'), 'utf8'))
  const dir = join(root, 'supabase', 'migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), 'utf8'))
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`)
    }
  }
  return db
}

/** Runs `fn` with the Postgres role + JWT claims Supabase would set for the actor. */
export async function as<T>(db: PGlite, actor: Actor, fn: () => Promise<T>): Promise<T> {
  const claims =
    actor.kind === 'user'
      ? { sub: actor.id, role: 'authenticated' }
      : actor.kind === 'service'
        ? { role: 'service_role' }
        : actor.kind === 'anon'
          ? { role: 'anon' }
          : null
  const role =
    actor.kind === 'user' ? 'authenticated' : actor.kind === 'service' ? 'service_role' : actor.kind === 'anon' ? 'anon' : null
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : ''])
  if (role) await db.exec(`set role ${role}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claims', '', false)`)
  }
}

export async function createUser(db: PGlite, email: string, fullName = 'Test User'): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify({ full_name: fullName })],
  )
  return res.rows[0].id
}
