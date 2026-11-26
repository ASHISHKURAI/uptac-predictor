// Supabase Edge Function: process-import
// Coordinates document imports. Nothing is ever published from here – rows are
// staged in import_staging_records for administrator review.
//
//   Admin  → { job_id }                 start processing a newly uploaded job
//   Admin  → { job_id, retry: true }    retry a failed job (duplicate-safe)
//   Python processor → { job_id, stage: 'extracted', extracted_path } | { job_id, stage: 'failed', error }
//                      (authenticated with the X-Processor-Token header)
//
// CSV / XLSX / XLS files are parsed here with SheetJS. PDFs are sent to the
// Python processing service (processor/) which extracts tables with PyMuPDF.
// @deno-types="https://cdn.sheetjs.com/xlsx-0.20.3/package/types/index.d.ts"
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.2'
import { normalizeTables, type RawTable } from '../_shared/import/normalize.ts'
import {
  UUID_RE,
  background,
  fetchAll,
  json,
  logError,
  notifyAdmins,
  preflight,
  requireAdmin,
  serviceClient,
  timingSafeEqual,
} from '../_shared/server.ts'

const BUCKET = 'official-documents'
const INSERT_BATCH = 500

interface ImportJobRow {
  id: string
  data_source_id: string
  file_name: string
  storage_path: string
  mime_type: string | null
  document_type: 'opening_closing_rank' | 'seat_matrix'
  academic_year: number
  round_number: number | null
  rank_type: 'CRL' | 'CATEGORY'
  default_quota: 'STATE' | 'HOME_STATE' | 'ALL_INDIA' | 'OTHER'
  status: string
  attempts: number
  max_attempts: number
  stats: Record<string, unknown>
}

interface Body {
  job_id?: string
  retry?: boolean
  stage?: 'extracted' | 'failed'
  extracted_path?: string
  error?: string
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Request body must be JSON.' }, 400)
  }
  if (!body.job_id || !UUID_RE.test(body.job_id)) return json(req, { error: 'A valid job_id is required.' }, 400)

  const fromProcessor = body.stage === 'extracted' || body.stage === 'failed'
  if (fromProcessor) {
    const token = Deno.env.get('PROCESSOR_TOKEN') ?? ''
    if (!token || !timingSafeEqual(req.headers.get('x-processor-token'), token)) {
      return json(req, { error: 'Invalid processor token.' }, 401)
    }
  } else {
    const admin = await requireAdmin(req)
    if (!admin.ok) return admin.response
  }

  const svc = serviceClient()
  const { data: jobData, error: jobError } = await svc.from('import_jobs').select('*').eq('id', body.job_id).maybeSingle()
  if (jobError) return json(req, { error: jobError.message }, 500)
  if (!jobData) return json(req, { error: 'Import job not found.' }, 404)
  const job = jobData as ImportJobRow

  // ---- Callbacks from the Python processor --------------------------------
  if (fromProcessor) {
    if (job.status !== 'queued' && job.status !== 'processing') {
      return json(req, { error: `Job is ${job.status}; callback ignored.` }, 409)
    }
    if (body.stage === 'failed') {
      await failJob(svc, job, `PDF processing failed: ${body.error ?? 'unknown error'}`)
      return json(req, { ok: true, status: 'failed' })
    }
    const path = body.extracted_path ?? ''
    if (path !== `extracted/${job.id}.json`) return json(req, { error: 'Unexpected extracted_path.' }, 400)
    await svc.from('import_jobs').update({ status: 'processing' }).eq('id', job.id)
    await background(processExtracted(svc, job, path))
    return json(req, { ok: true, status: 'processing' }, 202)
  }

  // ---- Admin requests --------------------------------------------------------
  if (body.retry) {
    if (job.status !== 'failed') return json(req, { error: 'Only failed jobs can be retried.' }, 409)
    if (job.attempts >= job.max_attempts) return json(req, { error: `Maximum attempts (${job.max_attempts}) reached. Upload the document again.` }, 409)
  } else if (job.status !== 'uploaded') {
    return json(req, { error: `This job is already ${job.status}.` }, 409)
  }

  // Retry-safe: remove any staging rows from previous attempts.
  const { error: cleanupError } = await svc.from('import_staging_records').delete().eq('import_job_id', job.id)
  if (cleanupError) return json(req, { error: cleanupError.message }, 500)

  const kind = fileKind(job.file_name, job.mime_type)
  if (kind === 'unsupported') {
    await failJob(svc, job, 'Unsupported file type. Upload a PDF, CSV, XLSX or XLS document.')
    return json(req, { error: 'Unsupported file type.' }, 400)
  }

  if (kind === 'pdf') {
    const processorUrl = (Deno.env.get('PROCESSOR_URL') ?? '').replace(/\/$/, '')
    const token = Deno.env.get('PROCESSOR_TOKEN') ?? ''
    await svc
      .from('import_jobs')
      .update({ status: 'queued', processor: 'python_pdf', attempts: job.attempts + 1, started_at: new Date().toISOString(), error_message: null, finished_at: null })
      .eq('id', job.id)
    if (!processorUrl || !token) {
      const msg =
        'PDF processing service is not configured. Deploy the Python processor (processor/) and set the PROCESSOR_URL and ' +
        'PROCESSOR_TOKEN Edge Function secrets (see docs/DEPLOYMENT.md), or upload the CSV/XLSX version of this document.'
      await failJob(svc, job, msg)
      return json(req, { error: msg }, 503)
    }
    try {
      const res = await fetch(`${processorUrl}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Processor-Token': token },
        body: JSON.stringify({ job_id: job.id, bucket: BUCKET, storage_path: job.storage_path, file_name: job.file_name, mime_type: job.mime_type }),
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) throw new Error(`processor responded ${res.status}: ${(await res.text()).slice(0, 300)}`)
    } catch (e) {
      const msg = `Could not reach the PDF processing service: ${e instanceof Error ? e.message : String(e)}`
      await failJob(svc, job, msg)
      return json(req, { error: msg }, 502)
    }
    return json(req, { ok: true, status: 'queued' }, 202)
  }

  await svc
    .from('import_jobs')
    .update({ status: 'processing', processor: 'edge_tabular', attempts: job.attempts + 1, started_at: new Date().toISOString(), error_message: null, finished_at: null })
    .eq('id', job.id)
  await background(processTabular(svc, job))
  return json(req, { ok: true, status: 'processing' }, 202)
})

function fileKind(fileName: string, mime: string | null): 'pdf' | 'csv' | 'excel' | 'unsupported' {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (ext === 'csv' || mime === 'text/csv') return 'csv'
  if (ext === 'xlsx' || ext === 'xls') return 'excel'
  return 'unsupported'
}

async function download(svc: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data, error } = await svc.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error(`Could not download ${path} from private storage: ${error?.message ?? 'no data'}`)
  return new Uint8Array(await data.arrayBuffer())
}

async function processTabular(svc: SupabaseClient, job: ImportJobRow): Promise<void> {
  try {
    const bytes = await download(svc, job.storage_path)
    const kind = fileKind(job.file_name, job.mime_type)
    let workbook: XLSX.WorkBook
    if (kind === 'csv') {
      // Decode ourselves and keep every value as raw text (preserves codes like "043").
      let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
      workbook = XLSX.read(text, { type: 'string', raw: true, dense: true })
    } else {
      workbook = XLSX.read(bytes, { type: 'array', dense: true, cellDates: false })
    }
    const tables: RawTable[] = workbook.SheetNames.map((name) => ({
      name: workbook.SheetNames.length > 1 ? name : null,
      page: null,
      rows: XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false }),
    }))
    await normalizeAndStage(svc, job, tables, { extractor: kind === 'csv' ? 'sheetjs-csv' : 'sheetjs-excel', pages: null })
  } catch (e) {
    await failJob(svc, job, e instanceof Error ? e.message : String(e))
  }
}

async function processExtracted(svc: SupabaseClient, job: ImportJobRow, path: string): Promise<void> {
  try {
    const bytes = await download(svc, path)
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
      tables: RawTable[]
      meta?: { extractor?: string; pages?: number | null; warnings?: string[] }
    }
    if (!Array.isArray(payload.tables)) throw new Error('Extracted payload has no tables array.')
    await normalizeAndStage(svc, job, payload.tables, {
      extractor: payload.meta?.extractor ?? 'python',
      pages: payload.meta?.pages ?? null,
      warnings: payload.meta?.warnings ?? [],
    })
  } catch (e) {
    await failJob(svc, job, e instanceof Error ? e.message : String(e))
  }
}

async function normalizeAndStage(
  svc: SupabaseClient,
  job: ImportJobRow,
  tables: RawTable[],
  meta: { extractor: string; pages: number | null; warnings?: string[] },
): Promise<void> {
  const [colleges, branches] = await Promise.all([
    fetchAll<{ code: string; name: string; aliases: string[] }>(svc, 'colleges', 'code,name,aliases'),
    fetchAll<{ code: string; name: string; aliases: string[] }>(svc, 'branches', 'code,name,aliases'),
  ])

  const result = normalizeTables(tables, {
    documentType: job.document_type,
    academicYear: job.academic_year,
    defaultRound: job.round_number,
    rankType: job.rank_type,
    defaultQuota: job.default_quota,
    colleges,
    branches,
  })

  const warnings = [...(meta.warnings ?? []), ...result.warnings]
  if (result.records.length === 0) {
    const reason =
      result.header.length === 0
        ? 'No table with an institute column and rank/seat columns was found in the document.'
        : `No importable B.Tech rows were found (skipped non-B.Tech: ${result.stats.skipped_non_btech}, ` +
          `non-JEE: ${result.stats.skipped_non_jee}, no allotment: ${result.stats.no_allotment}).`
    await failJob(svc, job, [reason, ...warnings].join(' '))
    return
  }

  await svc.from('import_staging_records').delete().eq('import_job_id', job.id)
  for (let i = 0; i < result.records.length; i += INSERT_BATCH) {
    const batch = result.records.slice(i, i + INSERT_BATCH).map((r) => ({ ...r, import_job_id: job.id, status: 'pending' }))
    const { error } = await svc.from('import_staging_records').insert(batch)
    if (error) throw new Error(`Saving extracted rows failed: ${error.message}`)
  }

  const { error: dupError } = await svc.rpc('refresh_staging_duplicates', { p_job_id: job.id })
  if (dupError) throw new Error(`Duplicate detection failed: ${dupError.message}`)

  const { data: fresh } = await svc.from('import_jobs').select('stats').eq('id', job.id).maybeSingle()
  const stats = {
    ...(fresh?.stats as Record<string, unknown> | undefined),
    ...result.stats,
    new_colleges: result.newColleges,
    unresolved_colleges: result.unresolvedColleges,
    unresolved_branches: result.unresolvedBranches,
    warnings,
    header: result.header,
    detected_document_type: result.detectedDocumentType,
    extractor: meta.extractor,
    pages: meta.pages,
  }
  await svc
    .from('import_jobs')
    .update({ status: 'in_review', stats, finished_at: new Date().toISOString(), error_message: null })
    .eq('id', job.id)
    .eq('status', 'processing') // an admin may have cancelled the job meanwhile

  await notifyAdmins(svc, {
    kind: 'import_ready',
    title: `Import ready for review: ${job.file_name}`,
    body:
      `${result.stats.staged_records} rows extracted (${result.stats.records_with_errors} need attention). ` +
      'Review and approve rows before publishing – nothing has been published.',
    link: `/admin/imports/${job.id}`,
    data: { job_id: job.id },
  })
}

async function failJob(svc: SupabaseClient, job: ImportJobRow, message: string): Promise<void> {
  await svc
    .from('import_jobs')
    .update({ status: 'failed', error_message: message.slice(0, 4000), finished_at: new Date().toISOString() })
    .eq('id', job.id)
    .neq('status', 'cancelled')
  await logError(svc, 'import', message, { file_name: job.file_name, storage_path: job.storage_path }, job.id)
  await notifyAdmins(svc, {
    kind: 'import_failed',
    title: `Import failed: ${job.file_name}`,
    body: message.slice(0, 500),
    link: `/admin/imports/${job.id}`,
    data: { job_id: job.id },
  })
}
