import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ExternalLink, Pencil, Plus, Radar, Trash2 } from 'lucide-react'
import {
  deleteMonitoredSource,
  listMonitoredSources,
  listMonitorRuns,
  runMonitor,
  saveMonitoredSource,
  type MonitoredSourceInput,
  type MonitorResult,
} from '@/lib/api/admin'
import { formatDate, formatNumber, timeAgo } from '@/lib/utils'
import type { MonitoredSource } from '@/lib/types'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Form'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Pagination, Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'
import { QueryError } from '@/components/common/ConfigNotice'
import { JsonView, useAdminMutation } from '@/components/admin/Misc'
import { SelectField, TextField } from '@/components/admin/Fields'

const KIND_OPTIONS: Array<{ value: MonitoredSource['kind']; label: string }> = [
  { value: 'html_page', label: 'HTML page (links & content changes)' },
  { value: 'notice_list', label: 'Notice list (new documents)' },
  { value: 'orcr_table', label: 'OR-CR table (record count & content)' },
  { value: 'seat_matrix_table', label: 'Seat-matrix table (content)' },
]

const RUN_TONE = { running: 'royal', success: 'green', partial: 'amber', failed: 'red' } as const

export function MonitoringAdminPage() {
  const [editing, setEditing] = useState<MonitoredSource | 'new' | null>(null)
  const [deleting, setDeleting] = useState<MonitoredSource | null>(null)
  const [runsPage, setRunsPage] = useState(1)
  const [lastResult, setLastResult] = useState<MonitorResult | null>(null)

  const sources = useQuery({ queryKey: ['admin', 'monitored-sources'], queryFn: listMonitoredSources })
  const runs = useQuery({
    queryKey: ['admin', 'monitor-runs', runsPage],
    queryFn: () => listMonitorRuns(runsPage, 15),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => ((q.state.data?.rows ?? []).some((r) => r.status === 'running') ? 5000 : false),
  })

  const run = useAdminMutation(() => runMonitor(), {
    success: (r) => `Check finished: ${r.pages_checked} page(s), ${r.new_documents} new document(s), ${r.changed_pages} changed page(s)`,
    invalidate: [['admin', 'monitored-sources'], ['admin', 'monitor-runs'], ['admin', 'stats'], ['admin', 'sources'], ['admin', 'unread-notifications']],
    onSuccess: (r) => setLastResult(r),
  })
  const toggle = useAdminMutation((s: MonitoredSource) => saveMonitoredSource({ enabled: !s.enabled }, s.id), {
    success: (_r, s) => `${s.label} ${s.enabled ? 'disabled' : 'enabled'}`,
    invalidate: [['admin', 'monitored-sources']],
  })
  const remove = useAdminMutation((s: MonitoredSource) => deleteMonitoredSource(s.id), {
    success: 'Monitored page removed',
    invalidate: [['admin', 'monitored-sources']],
    onSuccess: () => setDeleting(null),
  })

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="UPTAC monitoring"
        description="Periodically checks official UPTAC pages for new or changed documents using URLs, HTTP metadata and SHA-256 checksums, and notifies administrators."
        actions={
          <>
            <Button variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              Add page
            </Button>
            <Button size="sm" leftIcon={<Radar className="h-4 w-4" />} onClick={() => run.mutate(undefined)} loading={run.isPending}>
              {run.isPending ? 'Checking official pages…' : 'Run check now'}
            </Button>
          </>
        }
      />

      <Alert tone="info" title="How monitoring works">
        The legacy NIC portal <code className="font-mono text-xs">uptac.admissions.nic.in</code> no longer resolves (November 2026); UPTAC counselling now runs on{' '}
        <a href="https://uptac.samarth.edu.in/" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
          uptac.samarth.edu.in
        </a>
        . The monitor only reads public pages, never bypasses CAPTCHA or access restrictions, and never publishes data – new documents are added to Data sources for
        review. Schedule it with pg_cron as described in <code className="font-mono text-xs">docs/DEPLOYMENT.md</code>.
      </Alert>

      {run.isPending && (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-navy-700">
            <Radar className="h-5 w-5 animate-pulse text-royal-600" aria-hidden />
            Checking official pages – large pages such as the seat matrix can take up to a minute…
          </CardBody>
        </Card>
      )}
      {lastResult && !run.isPending && (
        <Alert tone={lastResult.status === 'success' ? 'success' : lastResult.status === 'failed' ? 'error' : 'warning'} title={`Last manual check: ${lastResult.status}`}>
          {formatNumber(lastResult.pages_checked)} page(s) checked · {formatNumber(lastResult.changed_pages)} changed · {formatNumber(lastResult.new_documents)} new document(s) ·{' '}
          {formatNumber(lastResult.changed_documents)} changed document(s)
          {lastResult.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {lastResult.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <Card>
        <CardHeader title="Monitored pages" icon={<Radar className="h-4 w-4" />} />
        <CardBody className="p-0 sm:p-0">
          {sources.error ? (
            <div className="p-5">
              <QueryError error={sources.error} onRetry={() => void sources.refetch()} />
            </div>
          ) : sources.isLoading ? (
            <Skeleton className="m-5 h-48 rounded-2xl" />
          ) : (sources.data ?? []).length === 0 ? (
            <div className="p-5">
              <EmptyState title="No monitored pages" description="Add the official UPTAC pages to watch." />
            </div>
          ) : (
            <TableWrap className="rounded-none border-0">
              <Table>
                <THead>
                  <tr>
                    <Th>Page</Th>
                    <Th>Kind</Th>
                    <Th>Enabled</Th>
                    <Th>Last checked</Th>
                    <Th>HTTP</Th>
                    <Th className="text-right">Records</Th>
                    <Th>Last change</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </THead>
                <tbody>
                  {(sources.data ?? []).map((s) => (
                    <Tr key={s.id}>
                      <Td className="max-w-sm whitespace-normal">
                        <p className="font-medium">{s.label}</p>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-royal-600 hover:underline">
                          {s.url} <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                        {s.last_error && <p className="mt-1 text-xs text-red-700">{s.last_error}</p>}
                      </Td>
                      <Td className="text-xs">{KIND_OPTIONS.find((k) => k.value === s.kind)?.label.split(' (')[0]}</Td>
                      <Td>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                          <input type="checkbox" className="h-4 w-4 accent-royal-600" checked={s.enabled} disabled={toggle.isPending} onChange={() => toggle.mutate(s)} />
                          {s.enabled ? 'On' : 'Off'}
                        </label>
                      </Td>
                      <Td className="text-xs" title={formatDate(s.last_checked_at, true)}>
                        {s.last_checked_at ? timeAgo(s.last_checked_at) : 'Never'}
                      </Td>
                      <Td>{s.last_status ? <Badge tone={s.last_status < 400 ? 'green' : 'red'}>{s.last_status}</Badge> : '—'}</Td>
                      <Td className="text-right tabular">{formatNumber(s.last_record_count)}</Td>
                      <Td className="text-xs" title={formatDate(s.last_changed_at, true)}>
                        {s.last_changed_at ? timeAgo(s.last_changed_at) : '—'}
                      </Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" aria-label={`Edit ${s.label}`} onClick={() => setEditing(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label={`Delete ${s.label}`} onClick={() => setDeleting(s)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>

      <section aria-labelledby="runs-title">
        <h2 id="runs-title" className="mb-3 text-lg font-bold text-navy-950">
          Run history
        </h2>
        {runs.error ? (
          <QueryError error={runs.error} onRetry={() => void runs.refetch()} />
        ) : runs.isLoading ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : (runs.data?.rows ?? []).length === 0 ? (
          <EmptyState title="No runs yet" description="Run a check now or schedule the monitor with pg_cron." />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <Th>Started</Th>
                    <Th>Trigger</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Pages</Th>
                    <Th className="text-right">Changed</Th>
                    <Th className="text-right">New docs</Th>
                    <Th className="text-right">Changed docs</Th>
                    <Th>Details</Th>
                  </tr>
                </THead>
                <tbody>
                  {(runs.data?.rows ?? []).map((r) => (
                    <Tr key={r.id}>
                      <Td className="whitespace-nowrap text-xs">
                        {formatDate(r.started_at, true)}
                        {r.finished_at && <span className="block text-navy-500">{Math.max(0, Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000))} s</span>}
                      </Td>
                      <Td className="text-xs capitalize">{r.triggered_by}</Td>
                      <Td>
                        <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge>
                      </Td>
                      <Td className="text-right tabular">{r.pages_checked}</Td>
                      <Td className="text-right tabular">{r.changed_pages}</Td>
                      <Td className="text-right tabular">{r.new_documents}</Td>
                      <Td className="text-right tabular">{r.changed_documents}</Td>
                      <Td className="max-w-md whitespace-normal">
                        {r.error && <p className="mb-1 text-xs text-red-700">{r.error}</p>}
                        <JsonView value={r.details} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination className="mt-4" page={runsPage} pageSize={15} total={runs.data?.total ?? 0} onPage={setRunsPage} />
          </>
        )}
      </section>

      {editing && <MonitoredSourceModal source={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Stop monitoring this page?"
        tone="danger"
        confirmLabel="Remove"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        description={deleting?.url}
      />
    </div>
  )
}

function MonitoredSourceModal({ source, onClose }: { source: MonitoredSource | null; onClose: () => void }) {
  const [f, setF] = useState<MonitoredSourceInput>({
    label: source?.label ?? '',
    url: source?.url ?? '',
    kind: source?.kind ?? 'html_page',
    enabled: source?.enabled ?? true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useAdminMutation((input: MonitoredSourceInput) => saveMonitoredSource(input, source?.id), {
    success: 'Monitored page saved',
    invalidate: [['admin', 'monitored-sources']],
    onSuccess: onClose,
  })
  const submit = () => {
    const e: Record<string, string> = {}
    if (f.label.trim().length < 3) e.label = 'Enter a label.'
    if (!/^https?:\/\/\S+$/i.test(f.url.trim())) e.url = 'Enter a full http(s) URL.'
    setErrors(e)
    if (Object.keys(e).length === 0) save.mutate({ ...f, label: f.label.trim(), url: f.url.trim() })
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={source ? 'Edit monitored page' : 'Add monitored page'}
      description="Only official, publicly accessible UPTAC / AKTU pages."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Label" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} error={errors.label} />
        <TextField label="URL" required value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} error={errors.url} placeholder="https://uptac.samarth.edu.in/…" />
        <SelectField label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as MonitoredSource['kind'] })} options={KIND_OPTIONS} />
        <Checkbox label="Enabled" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
      </div>
    </Modal>
  )
}
