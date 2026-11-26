/**
 * Public runtime configuration. Only values prefixed with VITE_ are available in
 * the browser – never put secrets (service role key, processor token) here.
 */
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  siteUrl: (import.meta.env.VITE_SITE_URL ?? (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, ''),
  enableGoogleAuth: import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true',
}

/** Lists the configuration that is missing so the UI can say so explicitly. */
export function missingConfig(): string[] {
  const missing: string[] = []
  if (!/^https:\/\/.+/.test(env.supabaseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(env.supabaseUrl)) missing.push('VITE_SUPABASE_URL')
  if (env.supabaseAnonKey.length < 20) missing.push('VITE_SUPABASE_ANON_KEY')
  return missing
}

export const isSupabaseConfigured = missingConfig().length === 0
