import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured, missingConfig } from './env'

/**
 * Browser Supabase client (anon key + the signed-in user's JWT). All access is
 * governed by Row Level Security – the service role key is never used here.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      global: { headers: { 'x-client-info': 'uptac-predictor-web' } },
    })
  : null

export class ConfigurationError extends Error {
  readonly missing: string[]
  constructor(missing: string[]) {
    super(`Supabase is not configured. Missing: ${missing.join(', ')}. Copy .env.example to .env.local and add your project values.`)
    this.name = 'ConfigurationError'
    this.missing = missing
  }
}

/** Returns the client or throws a ConfigurationError that the UI renders clearly. */
export function db(): SupabaseClient {
  if (!supabase) throw new ConfigurationError(missingConfig())
  return supabase
}

/** Normalises Supabase / PostgREST / network errors into readable messages. */
export function errorMessage(error: unknown): string {
  if (!error) return 'Unknown error'
  if (error instanceof ConfigurationError) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    const e = error as { message: string; details?: string; hint?: string; code?: string }
    if (e.code === '42501' || /row-level security|not authorized/i.test(e.message)) return 'You do not have permission to perform this action.'
    if (e.code === '23505') return `This record already exists.${e.details ? ` ${e.details}` : ''}`
    if (e.code === '23503') return 'This record is referenced by other data or refers to a missing record.'
    if (/Failed to fetch|NetworkError/i.test(e.message)) return 'Network error – check your internet connection and try again.'
    return e.message + (e.details ? ` (${e.details})` : '')
  }
  return String(error)
}
