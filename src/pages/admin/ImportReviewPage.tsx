import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, Download, ExternalLink, FileSearch, LoaderCircle, Play, RotateCw, Send, ShieldCheck } from 'lucide-react'
import { getImportJob, publishImportJob, signedDocumentUrl, stagingCounts, startImport, unresolvedCounts } from '@/lib/api/admin'
import { errorMessage } from '@/lib/supabase'
import { formatBytes, formatDate, formatNumber } from '@/lib/utils'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, EmptyState, PageLoader } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { QueryError } from '@/components/common/ConfigNotice'
import { ACTIVE_IMPORT_STATUSES, ImportStatusBadge } from '@/components/admin/Badges'
import { StatTile, useAdminMutation } from '@/components/admin/Misc'
import { NewInstitutesPanel, UnresolvedBranchesPanel, UnresolvedCollegesPanel } from '@/components/admin/ImportPanels'
import { StagingTable } from '@/components/admin/StagingTable'

export function ImportReviewPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const [confirmPublish, setConfirmPublish] = useState(false)

  const job = useQuery({
    queryKey: ['admin', 'import', id],
    queryFn: () => getImportJob(id),
    refetchInterval: (q) => (q.state.data && ACTIVE_IMPORT_STATUSES.includes(q.state.data.status) ? 3000 : false),
  })
  const j = job.data
  const reviewable = Boolean(j && ['in_review', 'published'].includes(j.status))
  const counts = useQuery({
    queryKey: ['admin', 'import', id, 'counts'],
    queryFn: () => stagingCounts(id),
    enabled: reviewable,
  })
  const unresolved = useQuery({
    queryKey: ['admin', 'import', id, 'unresolved'],
    queryFn: () => unresolvedCounts(id),
    enabled: reviewable,
  })

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'import', id] })
    void qc.invalidateQueries({ queryKey: ['admin', 'staging', id] })
  }

  const start = useAdminMutation((retry: boolean) => startImport(id, retry), {
    success: 'Processing started',
    invalidate: [['admin', 'import', id], ['admin', 'imports']],
  })
  const publish = useAdminMutation(() => publishImportJob(id), {
    success: (r) => `Published ${formatNumber(r.cutoff_records)} cutoff record(s) and ${formatNumber(r.seat_matrix_rows)} seat-matrix row(s) as verified data`,
    invalidate: [['admin', 'import', id], ['admin', 'staging', id], ['admin', 'imports'], ['admin', 'stats'], ['public-stats'], ['cutoff-years'], ['cutoff-overview']],
    onSuccess: () => setConfirmPublish(false),
  })

  const download = async () => {
    if (!j) return
    try {
      window.open(await signedDocumentUrl(j.storage_path), '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error('Could not create download link', errorMessage(error))
    }
  }

  if (job.isLoading) return <PageLoader label="Loading import…" />
  if (job.error) return <QueryError error={job.error} onRetry={() => void job.refetch()} />
  if (!j)
    return (
      <EmptyState
        icon={<FileSearch className="h-6 w-6" />}
        title="Import not found"
        description="It may have been deleted, or you may not have access."
        action={
          <Link to="/admin/imports" className="font-semibold text-royal-600">
            Back to imports
          </Link>
        }
      />
    )

  const stats = j.stats ?? {}
  const c = counts.data
  const editable = j.status === 'in_review'
  const canPublish = editable && (c?.approved ?? 0) > 0

  return (
    <div className="space-y-6 pb-24">
      <div>
        <Link to="/admin/imports" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-royal-600 hover:text-royal-700">
          <ArrowLeft className="h-4 w-4" /> All imports
        </Link>
        <AdminPageHeader
          title={j.file_name}
          description={j.data_sources?.title ?? undefined}
          actions={
            <>
              <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={() => void download()}>
                Original file
              </Button>
              {j.data_sources?.url && (
                <a href={j.data_sources.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-royal-600 hover:bg-royal-50">
                  Official source <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ImportStatusBadge status={j.status} />
          <Badge tone="outline">{j.document_type === 'seat_matrix' ? 'Seat matrix' : 'OR-CR'}</Badge>
          <Badge tone="outline">Year {j.academic_year}</Badge>
          {j.round_number && <Badge tone="outline">Default round {j.round_number}</Badge>}
          {j.document_type === 'opening_closing_rank' && <Badge tone="outline">{j.rank_type} ranks</Badge>}
          <Badge tone="outline">Default quota {j.default_quota}</Badge>
          <span className="text-xs text-navy-500">
            {formatBytes(j.file_size)} · uploaded {formatDate(j.created_at, true)} · attempt {j.attempts}/{j.max_attempts} · SHA-256 {j.file_checksum.slice(0, 12)}…
          </span>
        </div>
      </div>

      {j.status === 'uploaded' && (
        <Alert
          tone="warning"
          title="Processing has not started"
          action={
            <Button size="sm" onClick={() => start.mutate(false)} loading={start.isPending} leftIcon={<Play className="h-4 w-4" />}>
              Start processing
            </Button>
          }
        >
          The file is stored but the <code className="font-mono text-xs">process-import</code> Edge Function has not picked it up. If starting fails, deploy the function (see
          docs/DEPLOYMENT.md).
        </Alert>
      )}
      {(j.status === 'queued' || j.status === 'processing') && (
        <Card>
          <CardBody className="flex items-center gap-4">
            <LoaderCircle className="h-8 w-8 shrink-0 animate-spin text-royal-600" aria-hidden />
            <div>
              <p className="font-semibold text-navy-900">{j.status === 'queued' ? 'Queued for the PDF processing service…' : 'Extracting and normalising tables…'}</p>
              <p className="text-sm text-navy-500">This page refreshes automatically. Large PDFs can take a few minutes.</p>
            </div>
          </CardBody>
        </Card>
      )}
      {j.status === 'publishing' && (
        <Alert tone="info" title="Publishing…">
          Approved rows are being written to the verified tables.
        </Alert>
      )}
      {j.status === 'failed' && (
        <Alert
          tone="error"
          title="Import failed"
          action={
            j.attempts < j.max_attempts ? (
              <Button size="sm" variant="danger" onClick={() => start.mutate(true)} loading={start.isPending} leftIcon={<RotateCw className="h-4 w-4" />}>
                Retry processing
              </Button>
            ) : (
              <span className="text-sm">Maximum attempts reached – fix the file and upload it again.</span>
            )
          }
        >
          <p className="whitespace-pre-wrap">{j.error_message ?? 'No error message was recorded. Check the error logs.'}</p>
        </Alert>
      )}
      {j.status === 'cancelled' && <Alert tone="info" title="Import cancelled">Nothing from this file was published.</Alert>}
      {j.status === 'published' && (
        <Alert tone="success" title="Published">
          {formatNumber(stats.published_cutoffs ?? 0)} cutoff record(s) and {formatNumber(stats.published_seat_rows ?? 0)} seat-matrix row(s) were published on{' '}
          {formatDate(j.published_at, true)} as verified official data.
        </Alert>
      )}

      {reviewable && (
        <>
          <Alert tone="info" title="Nothing is published automatically">
            Review the extracted rows against the original document. Only rows you <strong>approve</strong> are published, and only when you press <strong>Publish</strong>.
            Identical rows that are already published are skipped automatically.
          </Alert>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <StatTile label="Data rows read" value={stats.data_rows} />
            <StatTile label="Staged" value={c?.total} loading={counts.isLoading} />
            <StatTile label="Pending" value={c?.pending} loading={counts.isLoading} />
            <StatTile label="Approved" value={c?.approved} loading={counts.isLoading} />
            <StatTile label="With errors" value={c?.errors} loading={counts.isLoading} tone={(c?.errors ?? 0) > 0 ? 'attention' : 'default'} />
            <StatTile label="Duplicates in file" value={c?.in_file} loading={counts.isLoading} tone={(c?.in_file ?? 0) > 0 ? 'attention' : 'default'} />
            <StatTile label="Conflicts" value={c?.existing_conflict} loading={counts.isLoading} hint="Differ from published" />
            <StatTile label="Skipped" value={c?.skipped} loading={counts.isLoading} hint="Identical to published" />
          </div>

          <Card>
            <CardHeader title="Extraction summary" icon={<FileSearch className="h-4 w-4" />} />
            <CardBody className="grid gap-4 text-sm md:grid-cols-2">
              <dl className="space-y-1.5">
                <SummaryRow label="Tables / sheets read" value={stats.tables} />
                <SummaryRow label="Non-B.Tech rows skipped" value={stats.skipped_non_btech} />
                <SummaryRow label="Non-JEE rows skipped" value={stats.skipped_non_jee} />
                <SummaryRow label="Rows without allotment (–)" value={stats.no_allotment} />
                <SummaryRow label="Zero-seat cells ignored" value={stats.zero_seat_cells} />
                <SummaryRow label="Rows with warnings" value={stats.records_with_warnings} />
                <SummaryRow
                  label="Detected document type"
                  value={stats.detected_document_type ? (stats.detected_document_type === 'seat_matrix' ? 'Seat matrix' : 'OR-CR') : '—'}
                />
              </dl>
              <div>
                {stats.header && stats.header.length > 0 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-wider text-navy-500">Detected header</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {stats.header.filter(Boolean).map((h, i) => (
                        <Badge key={`${h}-${i}`} tone="outline">
                          {h}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
                {(stats.warnings ?? []).length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {(stats.warnings ?? []).map((w) => (
                      <li key={w}>
                        <Alert tone="warning">{w}</Alert>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>

          {(stats.new_colleges ?? []).length > 0 && <NewInstitutesPanel jobId={id} proposals={stats.new_colleges ?? []} disabled={!editable} />}
          <UnresolvedCollegesPanel jobId={id} items={stats.unresolved_colleges ?? []} remainingRows={unresolved.data?.colleges ?? 0} disabled={!editable} />
          <UnresolvedBranchesPanel jobId={id} items={stats.unresolved_branches ?? []} remainingRows={unresolved.data?.branches ?? 0} disabled={!editable} />

          <section aria-labelledby="staged-title">
            <h2 id="staged-title" className="mb-3 text-lg font-bold text-navy-950">
              Staged rows
            </h2>
            <StagingTable jobId={id} editable={editable} onChanged={refreshAll} />
          </section>
        </>
      )}

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-navy-100 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(11_23_57/0.2)] backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm text-navy-700">
              <ShieldCheck className="h-5 w-5 text-royal-600" aria-hidden />
              <span>
                <strong className="tabular">{formatNumber(c?.approved ?? 0)}</strong> approved row(s) ready to publish
                {(c?.approvable ?? 0) > 0 && <span className="text-navy-500"> · {formatNumber(c?.approvable ?? 0)} valid pending</span>}
              </span>
            </p>
            <Button onClick={() => setConfirmPublish(true)} disabled={!canPublish} leftIcon={<Send className="h-4 w-4" />}>
              Publish approved rows
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmPublish}
        title="Publish approved rows?"
        confirmLabel="Publish as verified data"
        loading={publish.isPending}
        onClose={() => setConfirmPublish(false)}
        onConfirm={() => publish.mutate(undefined)}
        description={
          <div className="space-y-2">
            <p>
              <strong>{formatNumber(c?.approved ?? 0)}</strong> approved row(s) will become <strong>public, verified</strong> {j.document_type === 'seat_matrix' ? 'seat-matrix' : 'cutoff'} data
              used by the student predictor, each linked to this source document.
            </p>
            {(c?.existing_conflict ?? 0) > 0 && (
              <p className="text-amber-800">
                {formatNumber(c?.existing_conflict ?? 0)} row(s) conflict with existing published records – approved ones will <strong>overwrite</strong> them.
              </p>
            )}
            <p className="text-navy-500">Pending and rejected rows are not published. This action is recorded in the activity log.</p>
          </div>
        }
      />
      {j.status === 'published' && (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <CircleCheck className="h-4 w-4" aria-hidden /> Import complete.
        </p>
      )}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: number | string | undefined | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-navy-100/70 pb-1.5">
      <dt className="text-navy-500">{label}</dt>
      <dd className="font-semibold text-navy-900 tabular">{typeof value === 'number' ? formatNumber(value) : (value ?? '—')}</dd>
    </div>
  )
}
