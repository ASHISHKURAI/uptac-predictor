import { useCallback, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Download, ExternalLink, FileUp, RotateCw, UploadCloud, X } from 'lucide-react'
import { detectMetadata } from '@shared/import/index.ts'
import {
  ALLOWED_EXTENSIONS,
  EdgeFunctionError,
  MAX_UPLOAD_BYTES,
  attachFileToSource,
  cancelImportJob,
  createImportJob,
  deleteDataSource,
  fileExtension,
  findActiveJobByChecksum,
  listImportJobs,
  mimeFor,
  removeDocument,
  saveDataSource,
  signedDocumentUrl,
  startImport,
  uploadDocument,
  type DataSourceInput,
} from '@/lib/api/admin'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/supabase'
import { cn, formatBytes, formatDate, formatNumber, sha256Hex, timeAgo } from '@/lib/utils'
import type { ImportJob, ImportStatus, Quota, RankType } from '@/lib/types'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Select } from '@/components/ui/Form'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination, Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import { QueryError } from '@/components/common/ConfigNotice'
import { ACTIVE_IMPORT_STATUSES, ImportStatusBadge } from '@/components/admin/Badges'
import { useAdminMutation } from '@/components/admin/Misc'
import { useSourceOptions } from '@/components/admin/Pickers'
import { QUOTA_OPTIONS, RANK_TYPE_OPTIONS, SelectField, TextField, yearOptions } from '@/components/admin/Fields'

const PAGE_SIZE = 20
const KEY = ['admin', 'imports']

export function ImportsAdminPage() {
  return (
    <div>
      <AdminPageHeader
        title="Document imports"
        description="Upload official UPTAC opening & closing rank documents or seat matrices (PDF, CSV, XLSX, XLS). Extracted rows are staged for your review – nothing is published automatically."
      />
      <UploadPanel />
      <ImportHistory />
    </div>
  )
}

interface UploadMeta {
  document_type: 'opening_closing_rank' | 'seat_matrix'
  academic_year: string
  round_number: string
  rank_type: RankType
  default_quota: Quota
  title: string
  url: string
  existing_source_id: string
}

const defaultMeta = (): UploadMeta => ({
  document_type: 'opening_closing_rank',
  academic_year: String(new Date().getFullYear()),
  round_number: '',
  rank_type: 'CRL',
  default_quota: 'STATE',
  title: '',
  url: '',
  existing_source_id: '',
})

function UploadPanel() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [meta, setMeta] = useState<UploadMeta>(defaultMeta)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [duplicate, setDuplicate] = useState<{ id: string; file_name: string; status: ImportStatus } | null>(null)
  const [step, setStep] = useState<string | null>(null)
  const sources = useSourceOptions()

  const pick = useCallback((f: File | null) => {
    setDuplicate(null)
    if (!f) return
    const ext = fileExtension(f.name)
    if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
      setFileError('Unsupported file type. Upload a PDF, CSV, XLSX or XLS file.')
      setFile(null)
      return
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setFileError(`File is ${formatBytes(f.size)}; the maximum is ${formatBytes(MAX_UPLOAD_BYTES)}.`)
      setFile(null)
      return
    }
    if (f.size === 0) {
      setFileError('The file is empty.')
      setFile(null)
      return
    }
    setFileError(null)
    setFile(f)
    const d = detectMetadata(f.name)
    setMeta((m) => ({
      ...m,
      document_type: d.documentType === 'seat_matrix' ? 'seat_matrix' : d.documentType === 'opening_closing_rank' ? 'opening_closing_rank' : m.document_type,
      academic_year: d.academicYear ? String(d.academicYear) : m.academic_year,
      round_number: d.roundNumber ? String(d.roundNumber) : m.round_number,
      title: m.title || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(),
    }))
  }, [])

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    pick(e.dataTransfer.files?.[0] ?? null)
  }

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a file first.')
      const year = Number(meta.academic_year)
      setStep('Computing checksum…')
      const checksum = await sha256Hex(file)
      const existing = await findActiveJobByChecksum(checksum)
      if (existing) {
        setDuplicate(existing)
        throw new Error('This exact file is already being imported. Open the existing import instead.')
      }
      setStep('Uploading to private storage…')
      const path = await uploadDocument(file, year)
      let createdSourceId: string | null = null
      let job: ImportJob
      try {
        setStep('Registering source document…')
        let sourceId = meta.existing_source_id
        const fileFields = { storage_path: path, checksum_sha256: checksum, file_size: file.size, mime_type: mimeFor(file) }
        if (sourceId) {
          await attachFileToSource(sourceId, fileFields)
        } else {
          const input: DataSourceInput = {
            title: meta.title.trim(),
            source_type: 'uptac_official',
            document_type: meta.document_type,
            url: meta.url.trim() || null,
            academic_year: year,
            status: 'active',
            notes: null,
            discovered_via: 'upload',
            created_by: user?.id ?? null,
            ...fileFields,
          }
          const src = await saveDataSource(input)
          sourceId = src.id
          createdSourceId = src.id
        }
        setStep('Creating import job…')
        job = await createImportJob({
          data_source_id: sourceId,
          file_name: file.name,
          storage_path: path,
          file_checksum: checksum,
          mime_type: mimeFor(file),
          file_size: file.size,
          document_type: meta.document_type,
          academic_year: year,
          round_number: meta.round_number ? Number(meta.round_number) : null,
          rank_type: meta.rank_type,
          default_quota: meta.default_quota,
          created_by: user?.id ?? null,
          detected: { from_file_name: detectMetadata(file.name) },
        })
      } catch (error) {
        await removeDocument(path).catch(() => undefined)
        if (createdSourceId) await deleteDataSource(createdSourceId).catch(() => undefined)
        throw error
      }
      setStep('Starting extraction…')
      let startError: string | null = null
      try {
        await startImport(job.id)
      } catch (error) {
        startError = error instanceof EdgeFunctionError ? error.message : errorMessage(error)
      }
      return { job, startError }
    },
    onSuccess: async ({ job, startError }) => {
      await qc.invalidateQueries({ queryKey: KEY })
      if (startError) toast.error('Uploaded, but processing could not start', startError)
      else toast.success('Upload complete', 'Extraction has started – you can review the rows when it finishes.')
      setFile(null)
      setMeta(defaultMeta())
      navigate(`/admin/imports/${job.id}`)
    },
    onError: (error) => toast.error('Upload failed', errorMessage(error)),
    onSettled: () => setStep(null),
  })

  const submit = () => {
    const e: Record<string, string> = {}
    if (!file) e.file = 'Choose a document to upload.'
    const year = Number(meta.academic_year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) e.academic_year = 'Select the academic year.'
    if (meta.round_number && !/^\d{1,2}$/.test(meta.round_number)) e.round_number = 'Round must be a number.'
    if (!meta.existing_source_id && meta.title.trim().length < 3) e.title = 'Give the source document a descriptive title.'
    if (meta.url && !/^https?:\/\/\S+$/i.test(meta.url.trim())) e.url = 'Must be an http(s) URL.'
    setErrors(e)
    if (Object.keys(e).length === 0) upload.mutate()
  }

  return (
    <Card className="mb-8">
      <CardHeader title="Upload official document" description="Files are stored in a private bucket with their SHA-256 checksum. The original is preserved for audit." icon={<FileUp className="h-4 w-4" />} />
      <CardBody className="space-y-5">
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose a file or drop it here"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
            dragging ? 'border-royal-500 bg-royal-50' : 'border-navy-200 bg-navy-50/40 hover:border-royal-300 hover:bg-royal-50/50',
            (fileError || errors.file) && 'border-red-300',
          )}
        >
          <UploadCloud className="h-10 w-10 text-royal-600" aria-hidden />
          {file ? (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="font-semibold text-navy-900">{file.name}</span>
              <span className="text-navy-500">· {formatBytes(file.size)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setFile(null)
                  setDuplicate(null)
                }}
                className="rounded-full p-1 text-navy-400 hover:bg-white hover:text-navy-700"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm font-semibold text-navy-900">Drop a file here or click to browse</p>
              <p className="mt-1 text-xs text-navy-500">PDF, CSV, XLSX or XLS · up to {formatBytes(MAX_UPLOAD_BYTES)}</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              pick(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
        </div>
        {(fileError || errors.file) && <p className="text-sm font-medium text-red-600">{fileError ?? errors.file}</p>}
        {duplicate && (
          <Alert tone="warning" title="Already imported">
            This exact file (same SHA-256 checksum) is already in import “{duplicate.file_name}” with status <strong>{duplicate.status}</strong>.{' '}
            <Link to={`/admin/imports/${duplicate.id}`} className="font-semibold underline">
              Open that import
            </Link>
            . Cancel it first if you need to re-import the file.
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label="Document type"
            required
            value={meta.document_type}
            onChange={(e) => setMeta({ ...meta, document_type: e.target.value as UploadMeta['document_type'] })}
            options={[
              { value: 'opening_closing_rank', label: 'Opening & closing ranks (OR-CR)' },
              { value: 'seat_matrix', label: 'Seat matrix' },
            ]}
          />
          <SelectField label="Academic year" required value={meta.academic_year} onChange={(e) => setMeta({ ...meta, academic_year: e.target.value })} options={yearOptions()} error={errors.academic_year} />
          {meta.document_type === 'opening_closing_rank' && (
            <TextField
              label="Counselling round"
              value={meta.round_number}
              onChange={(e) => setMeta({ ...meta, round_number: e.target.value })}
              error={errors.round_number}
              inputMode="numeric"
              placeholder="From the document"
              hint="Required only if the document has no Round column."
            />
          )}
          {meta.document_type === 'opening_closing_rank' && (
            <SelectField
              label="Rank type"
              value={meta.rank_type}
              onChange={(e) => setMeta({ ...meta, rank_type: e.target.value as RankType })}
              options={RANK_TYPE_OPTIONS}
              hint="UPTAC JEE Main OR-CR ranks are CRL ranks for all categories in the current portal – verify against the document."
            />
          )}
          <SelectField
            label="Default quota"
            value={meta.default_quota}
            onChange={(e) => setMeta({ ...meta, default_quota: e.target.value as Quota })}
            options={QUOTA_OPTIONS}
            hint="Used when the document has no quota column."
          />
          <SelectField
            label="Link to existing data source"
            value={meta.existing_source_id}
            onChange={(e) => setMeta({ ...meta, existing_source_id: e.target.value })}
            options={(sources.data ?? []).map((s) => ({ value: s.id, label: `${s.academic_year ? `${s.academic_year} · ` : ''}${s.title}${s.status === 'discovered' ? ' (new)' : ''}` }))}
            placeholder="Create a new source record"
            hint="e.g. a document discovered by the UPTAC monitor"
          />
          {!meta.existing_source_id && (
            <>
              <TextField label="Source title" required className="lg:col-span-2" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} error={errors.title} placeholder="UPTAC 2026 B.Tech OR-CR – Round 1" />
              <TextField label="Official source URL" value={meta.url} onChange={(e) => setMeta({ ...meta, url: e.target.value })} error={errors.url} placeholder="https://uptac.samarth.edu.in/…" />
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-100 pt-4">
          <p className="text-xs text-navy-500">{step ?? 'Extraction runs in the background. Large PDFs are processed by the Python document service.'}</p>
          <Button onClick={submit} loading={upload.isPending} leftIcon={<FileUp className="h-4 w-4" />} disabled={!file}>
            Upload & extract
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

function ImportHistory() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<ImportStatus | ''>('')
  const [cancelling, setCancelling] = useState<ImportJob | null>(null)
  const toast = useToast()
  const query = useQuery({
    queryKey: [...KEY, page, status],
    queryFn: () => listImportJobs(page, PAGE_SIZE, status),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => ((q.state.data?.rows ?? []).some((j) => ACTIVE_IMPORT_STATUSES.includes(j.status)) ? 4000 : false),
  })

  const retry = useAdminMutation((job: ImportJob) => startImport(job.id, job.status === 'failed'), {
    success: 'Processing restarted',
    invalidate: [KEY],
  })
  const cancel = useAdminMutation((id: string) => cancelImportJob(id), {
    success: 'Import cancelled',
    invalidate: [KEY, ['admin', 'stats']],
    onSuccess: () => setCancelling(null),
  })

  const download = async (job: ImportJob) => {
    try {
      window.open(await signedDocumentUrl(job.storage_path), '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error('Could not create download link', errorMessage(error))
    }
  }

  const rows = query.data?.rows ?? []
  return (
    <section aria-labelledby="history-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 id="history-title" className="text-lg font-bold text-navy-950">
          Import history
        </h2>
        <Select value={status} onChange={(e) => {
            setStatus(e.target.value as ImportStatus | '')
            setPage(1)
          }} aria-label="Filter by status" className="w-48">
          <option value="">All statuses</option>
          {(['uploaded', 'queued', 'processing', 'in_review', 'publishing', 'published', 'failed', 'cancelled'] as ImportStatus[]).map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </Select>
      </div>
      {query.error ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<FileUp className="h-6 w-6" />} title="No imports yet" description="Upload an official UPTAC document above to start." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>Document</Th>
                  <Th>Type · Year</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Rows</Th>
                  <Th className="text-right">Attempts</Th>
                  <Th>Created</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((j) => (
                  <Tr key={j.id}>
                    <Td className="max-w-xs whitespace-normal">
                      <Link to={`/admin/imports/${j.id}`} className="font-semibold text-royal-700 hover:underline">
                        {j.file_name}
                      </Link>
                      <span className="block text-xs text-navy-500">
                        {formatBytes(j.file_size)} · {j.processor === 'python_pdf' ? 'PDF processor' : j.processor === 'edge_tabular' ? 'Spreadsheet parser' : 'Not processed yet'}
                      </span>
                      {j.status === 'failed' && j.error_message && <span className="mt-1 block text-xs text-red-700">{j.error_message}</span>}
                    </Td>
                    <Td className="text-xs">
                      {j.document_type === 'seat_matrix' ? 'Seat matrix' : 'OR-CR'} · {j.academic_year}
                      {j.round_number ? ` · R${j.round_number}` : ''}
                    </Td>
                    <Td>
                      <ImportStatusBadge status={j.status} />
                    </Td>
                    <Td className="text-right text-xs tabular">
                      {j.stats?.staged_records !== undefined ? formatNumber(j.stats.staged_records) : '—'}
                      {j.stats?.published_cutoffs !== undefined && <span className="block text-emerald-700">{formatNumber(j.stats.published_cutoffs + (j.stats.published_seat_rows ?? 0))} published</span>}
                    </Td>
                    <Td className="text-right tabular">
                      {j.attempts}/{j.max_attempts}
                    </Td>
                    <Td className="text-xs" title={formatDate(j.created_at, true)}>
                      {timeAgo(j.created_at)}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link to={`/admin/imports/${j.id}`} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-navy-700 hover:bg-navy-50" aria-label="Open import">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                        {(j.status === 'failed' || j.status === 'uploaded') && j.attempts < j.max_attempts && (
                          <Button variant="ghost" size="icon" aria-label="Retry processing" onClick={() => retry.mutate(j)} disabled={retry.isPending}>
                            <RotateCw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" aria-label="Download original" onClick={() => void download(j)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        {['uploaded', 'queued', 'processing', 'in_review'].includes(j.status) && (
                          <Button variant="ghost" size="icon" aria-label="Cancel import" onClick={() => setCancelling(j)}>
                            <Ban className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination className="mt-4" page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPage={setPage} />
        </>
      )}
      <ConfirmDialog
        open={Boolean(cancelling)}
        title="Cancel this import?"
        tone="danger"
        confirmLabel="Cancel import"
        loading={cancel.isPending}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
        description="Staged rows will not be published. The original document stays in storage for audit, and the same file can be imported again later."
      />
    </section>
  )
}
