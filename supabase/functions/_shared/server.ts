// Server-side helpers for Supabase Edge Functions (Deno runtime only).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.2'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

export function env(name: string, required = true): string {
  const value = Deno.env.get(name) ?? ''
  if (required && !value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

/** Allowed browser origins (comma separated). Defaults to '*' for local development. */
function allowedOrigin(req: Request): string {
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim()).filter(Boolean)
  const origin = req.headers.get('origin') ?? ''
  if (configured.includes('*')) return '*'
  return configured.includes(origin) ? origin : configured[0] ?? ''
}

export function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-processor-token, x-monitor-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)
  return null
}

/** Client acting as the caller (anon key + caller JWT) – RLS applies. */
export function userClient(req: Request): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? `Bearer ${env('SUPABASE_ANON_KEY')}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Service-role client – bypasses RLS. Server-side only, never returned to callers. */
export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function currentUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  if (token === Deno.env.get('SUPABASE_ANON_KEY')) return null
  const { data, error } = await userClient(req).auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

export type AdminCheck = { ok: true; userId: string } | { ok: false; response: Response }

/** Verifies the caller is a signed-in admin (checked in the database, not the token). */
export async function requireAdmin(req: Request): Promise<AdminCheck> {
  const userId = await currentUserId(req)
  if (!userId) return { ok: false, response: json(req, { error: 'Sign in as an administrator.' }, 401) }
  const { data, error } = await userClient(req).rpc('is_admin')
  if (error) return { ok: false, response: json(req, { error: 'Could not verify permissions.' }, 500) }
  if (data !== true) return { ok: false, response: json(req, { error: 'Administrator access required.' }, 403) }
  return { ok: true, userId }
}

export function timingSafeEqual(a: string | null, b: string): boolean {
  if (!a || !b) return false
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}

/** Runs work after the response is sent (Supabase EdgeRuntime), or awaits it otherwise. */
export async function background(task: Promise<unknown>): Promise<void> {
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(task)
    return
  }
  await task
}

export async function logError(
  svc: SupabaseClient,
  source: 'import' | 'monitor' | 'predict' | 'processor',
  message: string,
  context: Record<string, unknown> = {},
  importJobId: string | null = null,
): Promise<void> {
  console.error(`[${source}] ${message}`, context)
  await svc.from('error_logs').insert({ source, level: 'error', message: message.slice(0, 2000), context, import_job_id: importJobId })
}

export async function notifyAdmins(
  svc: SupabaseClient,
  n: { kind: string; title: string; body?: string; link?: string; data?: Record<string, unknown> },
): Promise<{ email: 'sent' | 'not_configured' | 'failed' }> {
  await svc.from('admin_notifications').insert({ kind: n.kind, title: n.title, body: n.body ?? null, link: n.link ?? null, data: n.data ?? {} })
  // Optional e-mail delivery through Resend (https://resend.com). Missing config is reported, not faked.
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const to = (Deno.env.get('ADMIN_NOTIFICATION_EMAILS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const from = Deno.env.get('NOTIFY_FROM_EMAIL')
  if (!apiKey || to.length === 0 || !from) return { email: 'not_configured' }
  try {
    const site = Deno.env.get('SITE_URL') ?? ''
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: `[UPTAC Predictor] ${n.title}`,
        text: `${n.title}\n\n${n.body ?? ''}\n\n${n.link && site ? site + n.link : ''}`,
      }),
    })
    return { email: res.ok ? 'sent' : 'failed' }
  } catch {
    return { email: 'failed' }
  }
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes: Uint8Array<ArrayBuffer> =
    typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Fetches every row of a table in pages of 1000 (PostgREST row limit). */
export async function fetchAll<T>(svc: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc.from(table).select(columns).range(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}
