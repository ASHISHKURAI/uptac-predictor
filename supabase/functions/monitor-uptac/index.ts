// Supabase Edge Function: monitor-uptac
// Periodically checks the official UPTAC portal for new or changed documents.
//  * Polite: honours robots.txt, identifies itself, small request budget, no CAPTCHA/login bypass.
//  * Detects changes with URLs, HTTP metadata (ETag / Last-Modified / Content-Length) and SHA-256 checksums.
//  * Only records discoveries and notifies administrators – it never imports or publishes data.
//
// Invocation: admin (manual "Run check now") with their JWT, or pg_cron / any scheduler with the
// `x-monitor-secret` header equal to the MONITOR_SECRET Edge Function secret.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.2'
import { detectMetadata } from '../_shared/import/detect.ts'
import { json, logError, notifyAdmins, preflight, requireAdmin, serviceClient, sha256Hex, timingSafeEqual } from '../_shared/server.ts'

const USER_AGENT = `UPTACPredictorMonitor/1.0 (+${Deno.env.get('SITE_URL') ?? 'https://github.com/'}; official-document change detection)`
const FETCH_TIMEOUT_MS = 45_000
const MAX_DOC_BYTES = 25 * 1024 * 1024
const MAX_DOWNLOADS_PER_RUN = 10
const MAX_HEAD_CHECKS_PER_RUN = 40
const DOC_LINK_RE = /\.(pdf|xlsx?|csv)(\?|#|$)|drive\.google\.com\/file\/d\/|samarth-notification\.s3/i

interface MonitoredSource {
  id: string
  label: string
  url: string
  kind: 'html_page' | 'notice_list' | 'orcr_table' | 'seat_matrix_table'
  last_content_hash: string | null
  last_record_count: number | null
}

interface DocLink {
  url: string
  title: string
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early

  const secret = Deno.env.get('MONITOR_SECRET') ?? ''
  let triggeredBy: 'schedule' | 'manual' = 'manual'
  if (secret && timingSafeEqual(req.headers.get('x-monitor-secret'), secret)) {
    triggeredBy = 'schedule'
  } else {
    const admin = await requireAdmin(req)
    if (!admin.ok) return admin.response
  }

  const svc = serviceClient()
  const { data: run, error: runError } = await svc.from('monitor_runs').insert({ triggered_by: triggeredBy, status: 'running' }).select('id').single()
  if (runError || !run) return json(req, { error: runError?.message ?? 'Could not start monitor run' }, 500)

  const errors: string[] = []
  const details: Array<Record<string, unknown>> = []
  let pagesChecked = 0
  let changedPages = 0
  const newDocs: Array<{ title: string; url: string }> = []
  const changedDocs: Array<{ title: string; url: string }> = []
  const budget = { downloads: MAX_DOWNLOADS_PER_RUN, heads: MAX_HEAD_CHECKS_PER_RUN }
  const robotsCache = new Map<string, string[]>()

  const { data: sources, error: srcError } = await svc.from('monitored_sources').select('*').eq('enabled', true)
  if (srcError) errors.push(srcError.message)

  for (const source of (sources ?? []) as MonitoredSource[]) {
    const entry: Record<string, unknown> = { label: source.label, url: source.url }
    try {
      if (!(await allowedByRobots(source.url, robotsCache))) {
        throw new Error('Disallowed by robots.txt – skipped.')
      }
      const page = await fetchPage(source.url, source.kind)
      pagesChecked++
      entry.status = page.status
      if (page.status === 403 || page.status === 429) throw new Error(`Access refused (HTTP ${page.status}). The monitor does not bypass access restrictions.`)
      if (page.status >= 400) throw new Error(`HTTP ${page.status}`)
      if (page.captcha) throw new Error('CAPTCHA or login wall detected – skipped (never bypassed).')

      const changed = Boolean(source.last_content_hash && source.last_content_hash !== page.hash)
      entry.changed = changed
      entry.record_count = page.recordCount
      if (changed) {
        changedPages++
        const countNote =
          page.recordCount !== null && source.last_record_count !== null && page.recordCount !== source.last_record_count
            ? ` Record count changed from ${source.last_record_count} to ${page.recordCount}.`
            : ''
        await notifyAdmins(svc, {
          kind: 'changed_page',
          title: `Official page changed: ${source.label}`,
          body: `The content of ${source.url} changed since the last check.${countNote} Download the updated official data and import it for review.`,
          link: '/admin/monitoring',
          data: { url: source.url, previous_count: source.last_record_count, record_count: page.recordCount },
        })
      }

      if (page.text && (source.kind === 'html_page' || source.kind === 'notice_list')) {
        const links = extractDocumentLinks(page.text, source.url)
        entry.document_links = links.length
        for (const link of links) {
          const outcome = await trackDocument(svc, link, budget)
          if (outcome === 'new') newDocs.push(link)
          if (outcome === 'changed') changedDocs.push(link)
        }
      }

      await svc
        .from('monitored_sources')
        .update({
          last_checked_at: new Date().toISOString(),
          last_status: page.status,
          last_content_hash: page.hash,
          last_record_count: page.recordCount,
          last_error: null,
          ...(changed ? { last_changed_at: new Date().toISOString() } : {}),
        })
        .eq('id', source.id)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push(`${source.label}: ${message}`)
      entry.error = message
      await svc.from('monitored_sources').update({ last_checked_at: new Date().toISOString(), last_error: message.slice(0, 1000) }).eq('id', source.id)
      await logError(svc, 'monitor', `${source.label}: ${message}`, { url: source.url })
    }
    details.push(entry)
  }

  let email: string | undefined
  if (newDocs.length > 0) {
    const r = await notifyAdmins(svc, {
      kind: 'new_document',
      title: `${newDocs.length} new official document${newDocs.length > 1 ? 's' : ''} found on the UPTAC portal`,
      body: newDocs.slice(0, 10).map((d) => `• ${d.title} – ${d.url}`).join('\n'),
      link: '/admin/sources',
      data: { documents: newDocs.slice(0, 50) },
    })
    email = r.email
  }
  if (changedDocs.length > 0) {
    await notifyAdmins(svc, {
      kind: 'changed_document',
      title: `${changedDocs.length} official document${changedDocs.length > 1 ? 's' : ''} changed`,
      body: changedDocs.slice(0, 10).map((d) => `• ${d.title} – ${d.url}`).join('\n'),
      link: '/admin/sources',
      data: { documents: changedDocs.slice(0, 50) },
    })
  }

  const status = errors.length === 0 ? 'success' : pagesChecked > 0 ? 'partial' : 'failed'
  const summary = {
    run_id: run.id,
    status,
    pages_checked: pagesChecked,
    changed_pages: changedPages,
    new_documents: newDocs.length,
    changed_documents: changedDocs.length,
    errors,
  }
  await svc
    .from('monitor_runs')
    .update({
      status,
      pages_checked: pagesChecked,
      changed_pages: changedPages,
      new_documents: newDocs.length,
      changed_documents: changedDocs.length,
      error: errors.length ? errors.join('\n').slice(0, 4000) : null,
      details: { sources: details, email: email ?? 'not_needed' },
      finished_at: new Date().toISOString(),
    })
    .eq('id', run.id)

  return json(req, summary)
})

// ---------------------------------------------------------------------------

async function allowedByRobots(url: string, cache: Map<string, string[]>): Promise<boolean> {
  const u = new URL(url)
  if (!cache.has(u.origin)) {
    let disallow: string[] = []
    try {
      const res = await fetch(`${u.origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) })
      if (res.ok) disallow = parseRobots(await res.text())
    } catch {
      // unreachable robots.txt → treat as allowed (standard behaviour)
    }
    cache.set(u.origin, disallow)
  }
  const rules = cache.get(u.origin) ?? []
  return !rules.some((rule) => rule !== '' && u.pathname.startsWith(rule))
}

function parseRobots(text: string): string[] {
  const out: string[] = []
  let applies = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const [key, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    if (/^user-agent$/i.test(key)) applies = value === '*' || /uptacpredictor/i.test(value)
    else if (applies && /^disallow$/i.test(key)) out.push(value)
  }
  return out
}

/** Lines with per-request tokens are excluded from the content hash. */
const VOLATILE_LINE = /csrf|_csrf|nonce|gtag|googletagmanager|visitors\.samarth|data-timestamp|__RequestVerificationToken|<script/i

async function fetchPage(
  url: string,
  kind: MonitoredSource['kind'],
): Promise<{ status: number; hash: string; recordCount: number | null; text: string | null; captcha: boolean }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.body) return { status: res.status, hash: '', recordCount: null, text: null, captcha: false }

  // Stream line by line to keep memory low (the seat matrix page is ~26 MB).
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  const kept: string[] = []
  let carry = ''
  let rows = 0
  let showing: number | null = null
  let size = 0
  const keepFullText = kind === 'html_page' || kind === 'notice_list'
  const fullText: string[] = []
  let captcha = false
  const hashParts: string[] = []
  let hashBuffer = ''

  const consume = (line: string) => {
    if (/captcha|g-recaptcha|hcaptcha/i.test(line)) captcha = true
    const m = line.match(/Showing\s+[\d,]+\s*-\s*[\d,]+\s+of\s+([\d,]+)\s+records/i)
    if (m) showing = Number(m[1].replace(/,/g, ''))
    rows += (line.match(/<tr[\s>]/gi) ?? []).length
    if (VOLATILE_LINE.test(line)) return
    const normalized = line.trim()
    if (!normalized) return
    hashBuffer += normalized + '\n'
    if (hashBuffer.length > 1_000_000) {
      hashParts.push(hashBuffer)
      hashBuffer = ''
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (keepFullText && size < 5_000_000) fullText.push(value)
    const chunk = carry + value
    const lines = chunk.split('\n')
    carry = lines.pop() ?? ''
    for (const line of lines) consume(line)
    // Hash large pages incrementally: digest of chunk digests.
    if (hashParts.length > 0) {
      for (const part of hashParts.splice(0)) kept.push(await sha256Hex(part))
    }
  }
  consume(carry)
  kept.push(await sha256Hex(hashBuffer))
  const hash = kept.length === 1 ? kept[0] : await sha256Hex(kept.join(''))

  const recordCount = kind === 'orcr_table' ? showing : kind === 'seat_matrix_table' ? Math.max(0, rows - 1) : null
  return { status: res.status, hash, recordCount, text: keepFullText ? fullText.join('') : null, captcha }
}

function extractDocumentLinks(html: string, baseUrl: string): DocLink[] {
  const out = new Map<string, DocLink>()
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[1].trim())
    if (!DOC_LINK_RE.test(href) || href.includes('${')) continue
    let abs: string
    try {
      abs = new URL(href, baseUrl).toString()
    } catch {
      continue
    }
    if (!/^https?:/i.test(abs)) continue
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    const context = surroundingText(html, m.index)
    const title = (text && !/^(view|download|view notice|view document|click here)$/i.test(text) ? text : context || fileNameOf(abs)).slice(0, 280)
    if (!out.has(abs)) out.set(abs, { url: abs, title: title || fileNameOf(abs) })
  }
  return [...out.values()]
}

/** Text of the table row / list item around a link (notice titles sit beside "View Document"). */
function surroundingText(html: string, index: number): string {
  const start = Math.max(html.lastIndexOf('<tr', index), html.lastIndexOf('<li', index))
  if (start < 0 || index - start > 4000) return ''
  const end = html.indexOf('</tr>', index)
  const segment = html.slice(start, end > 0 && end - index < 4000 ? end : index)
  return decodeEntities(segment.replace(/<[^>]+>/g, ' '))
    .replace(/\b(view|download)( notice| document)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280)
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function fileNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url)
  } catch {
    return url
  }
}

function guessDocumentType(text: string): string {
  if (/seat\s*matrix/i.test(text)) return 'seat_matrix'
  if (/opening|closing|or[\s-]*cr|cut[\s-]*off/i.test(text)) return 'opening_closing_rank'
  if (/brochure|prospectus|bulletin/i.test(text)) return 'brochure'
  if (/fee/i.test(text)) return 'fee_structure'
  return 'notice'
}

async function headMetadata(url: string): Promise<{ etag: string | null; lastModified: string | null; length: number | null; type: string | null; ok: boolean }> {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(20_000) })
    return {
      ok: res.ok,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      length: res.headers.get('content-length') ? Number(res.headers.get('content-length')) : null,
      type: res.headers.get('content-type'),
    }
  } catch {
    return { ok: false, etag: null, lastModified: null, length: null, type: null }
  }
}

async function checksum(url: string): Promise<{ sha: string; size: number } | null> {
  if (/drive\.google\.com/i.test(url)) return null // viewer page, not the file itself
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(60_000) })
  if (!res.ok) return null
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > MAX_DOC_BYTES) return null
  return { sha: await sha256Hex(buf), size: buf.byteLength }
}

async function trackDocument(
  svc: SupabaseClient,
  link: DocLink,
  budget: { downloads: number; heads: number },
): Promise<'new' | 'changed' | 'unchanged'> {
  const { data: existing } = await svc
    .from('data_sources')
    .select('id, etag, last_modified, file_size, checksum_sha256, created_at')
    .eq('url', link.url)
    .order('created_at', { ascending: false })
    .limit(1)
  const latest = existing?.[0] as
    | { id: string; etag: string | null; last_modified: string | null; file_size: number | null; checksum_sha256: string | null }
    | undefined
  const meta = detectMetadata(link.title, link.url)

  if (!latest) {
    let head = { ok: false, etag: null as string | null, lastModified: null as string | null, length: null as number | null, type: null as string | null }
    if (budget.heads > 0) {
      budget.heads--
      head = await headMetadata(link.url)
    }
    let sum: { sha: string; size: number } | null = null
    if (budget.downloads > 0 && (head.length === null || head.length <= MAX_DOC_BYTES)) {
      budget.downloads--
      sum = await checksum(link.url).catch(() => null)
    }
    await svc.from('data_sources').insert({
      title: link.title,
      source_type: 'uptac_official',
      document_type: guessDocumentType(`${link.title} ${link.url}`),
      url: link.url,
      academic_year: meta.academicYear,
      checksum_sha256: sum?.sha ?? null,
      file_size: sum?.size ?? head.length,
      mime_type: head.type,
      etag: head.etag,
      last_modified: head.lastModified,
      discovered_via: 'monitor',
      status: 'discovered',
      last_checked_at: new Date().toISOString(),
      notes: sum ? null : 'Checksum not computed (download budget, size limit or Google Drive viewer link).',
    })
    return 'new'
  }

  if (budget.heads <= 0) return 'unchanged'
  budget.heads--
  const head = await headMetadata(link.url)
  await svc.from('data_sources').update({ last_checked_at: new Date().toISOString() }).eq('id', latest.id)
  if (!head.ok) return 'unchanged'
  const metaChanged =
    (head.etag && latest.etag && head.etag !== latest.etag) ||
    (head.lastModified && latest.last_modified && head.lastModified !== latest.last_modified) ||
    (head.length !== null && latest.file_size !== null && head.length !== latest.file_size)
  if (!metaChanged || budget.downloads <= 0) return 'unchanged'
  budget.downloads--
  const sum = await checksum(link.url).catch(() => null)
  if (!sum || sum.sha === latest.checksum_sha256) return 'unchanged'
  await svc.from('data_sources').insert({
    title: `${link.title} (updated)`,
    source_type: 'uptac_official',
    document_type: guessDocumentType(`${link.title} ${link.url}`),
    url: link.url,
    academic_year: meta.academicYear,
    checksum_sha256: sum.sha,
    file_size: sum.size,
    mime_type: head.type,
    etag: head.etag,
    last_modified: head.lastModified,
    discovered_via: 'monitor',
    status: 'discovered',
    last_checked_at: new Date().toISOString(),
    notes: `New version of a previously recorded document (previous source ${latest.id}).`,
  })
  return 'changed'
}
