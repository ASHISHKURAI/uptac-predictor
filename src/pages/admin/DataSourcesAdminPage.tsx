import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Archive, CircleCheck, Database, Download, ExternalLink, EyeOff, FileUp, Pencil, Plus, Search } from 'lucide-react'
import { listDataSources, saveDataSource, setDataSourceStatus, signedDocumentUrl, type DataSourceInput } from '@/lib/api/admin'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/supabase'
import { formatBytes, formatDate, timeAgo } from '@/lib/utils'
import type { DataSource, DocumentType } from '@/lib/types'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Input, Select } from '@/components/ui/Form'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { Pagination, Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import { QueryError } from '@/components/common/ConfigNotice'
import { useAdminMutation } from '@/components/admin/Misc'
import { DOCUMENT_TYPE_OPTIONS, SOURCE_TYPE_OPTIONS, SelectField, TextareaField, TextField, yearOptions } from '@/components/admin/Fields'

const PAGE_SIZE = 25
const KEY = ['admin', 'sources']

const STATUS: Record<DataSource['status'], { label: string; tone: BadgeTone }> = {
  discovered: { label: 'New – needs review', tone: 'amber' },
  active: { label: 'Active', tone: 'green' },
  imported: { label: 'Imported', tone: 'royal' },
  ignored: { label: 'Ignored', tone: 'outline' },
  archived: { label: 'Archived', tone: 'neutral' },
}

export function DataSourcesAdminPage() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<DataSource['status'] | ''>('')
  const [docType, setDocType] = useState<DocumentType | ''>('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<DataSource | 'new' | null>(null)
  const [importing, setImporting] = useState<DataSource | null>(null)

  const query = useQuery({
    queryKey: [...KEY, search, status, docType, page],
    queryFn: () => listDataSources({ search, status, documentType: docType, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const changeStatus = useAdminMutation((v: { id: string; status: DataSource['status'] }) => setDataSourceStatus(v.id, v.status), {
    success: (_r, v) => `Source marked ${v.status}`,
    invalidate: [KEY, ['admin', 'stats'], ['admin', 'source-options']],
  })

  const download = async (s: DataSource) => {
    if (!s.storage_path) return
    try {
      window.open(await signedDocumentUrl(s.storage_path), '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error('Could not create download link', errorMessage(error))
    }
  }

  const rows = query.data?.rows ?? []
  const resetPage = () => setPage(1)

  return (
    <div>
      <AdminPageHeader
        title="Data sources"
        description="Every published record points to one of these official documents or pages. New documents discovered by the UPTAC monitor appear here for review."
        actions={
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Add source
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Input
            leftIcon={<Search className="h-4 w-4" />}
            placeholder="Search title, URL or notes"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetPage()
            }}
            aria-label="Search sources"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as DataSource['status'] | '')
            resetPage()
          }}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        <Select
          value={docType}
          onChange={(e) => {
            setDocType(e.target.value as DocumentType | '')
            resetPage()
          }}
          aria-label="Document type"
        >
          <option value="">All document types</option>
          {DOCUMENT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      {query.error ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Database className="h-6 w-6" />}
          title="No data sources"
          description="Sources are created when you upload an official document, when the UPTAC monitor discovers a new document, or manually."
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>Title</Th>
                  <Th>Type</Th>
                  <Th>Year</Th>
                  <Th>Status</Th>
                  <Th>File</Th>
                  <Th>Discovered</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((s) => (
                  <Tr key={s.id} className={s.status === 'discovered' ? 'bg-amber-50/50' : undefined}>
                    <Td className="max-w-md whitespace-normal">
                      <p className="font-medium text-navy-900">{s.title}</p>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 break-all text-xs text-royal-600 hover:underline">
                          {s.url} <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      )}
                      {s.notes && <p className="mt-1 text-xs text-navy-500">{s.notes}</p>}
                    </Td>
                    <Td className="text-xs">
                      {DOCUMENT_TYPE_OPTIONS.find((o) => o.value === s.document_type)?.label ?? s.document_type}
                      <span className="block text-navy-500">{SOURCE_TYPE_OPTIONS.find((o) => o.value === s.source_type)?.label}</span>
                    </Td>
                    <Td>{s.academic_year ?? '—'}</Td>
                    <Td>
                      <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                    </Td>
                    <Td className="text-xs">
                      {s.storage_path ? (
                        <>
                          {formatBytes(s.file_size)}
                          {s.checksum_sha256 && <span className="block font-mono text-navy-500" title={s.checksum_sha256}>{s.checksum_sha256.slice(0, 10)}…</span>}
                        </>
                      ) : (
                        <span className="text-navy-400">No stored file</span>
                      )}
                    </Td>
                    <Td className="text-xs" title={formatDate(s.created_at, true)}>
                      {s.discovered_via} · {timeAgo(s.created_at)}
                      {s.last_checked_at && <span className="block text-navy-500">Checked {timeAgo(s.last_checked_at)}</span>}
                    </Td>
                    <Td className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {s.status === 'discovered' && s.url && (
                          <Button size="sm" variant="outline" leftIcon={<FileUp className="h-4 w-4" />} onClick={() => setImporting(s)}>
                            Import
                          </Button>
                        )}
                        {s.storage_path && (
                          <Button variant="ghost" size="icon" aria-label="Download stored file" onClick={() => void download(s)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        {s.status !== 'active' && s.status !== 'imported' && (
                          <Button variant="ghost" size="icon" aria-label="Mark active" disabled={changeStatus.isPending} onClick={() => changeStatus.mutate({ id: s.id, status: 'active' })}>
                            <CircleCheck className="h-4 w-4 text-emerald-600" />
                          </Button>
                        )}
                        {s.status !== 'ignored' && (
                          <Button variant="ghost" size="icon" aria-label="Ignore source" disabled={changeStatus.isPending} onClick={() => changeStatus.mutate({ id: s.id, status: 'ignored' })}>
                            <EyeOff className="h-4 w-4" />
                          </Button>
                        )}
                        {s.status !== 'archived' && (
                          <Button variant="ghost" size="icon" aria-label="Archive source" disabled={changeStatus.isPending} onClick={() => changeStatus.mutate({ id: s.id, status: 'archived' })}>
                            <Archive className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" aria-label="Edit source" onClick={() => setEditing(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
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

      {editing && <SourceModal source={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {importing && (
        <Modal
          open
          onClose={() => setImporting(null)}
          title="Import this document"
          description={importing.title}
          footer={
            <>
              <a href={importing.url ?? '#'} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-navy-200 px-5 text-sm font-semibold text-navy-800 hover:bg-royal-50">
                Open official document <ExternalLink className="h-4 w-4" />
              </a>
              <ButtonLink to="/admin/imports" leftIcon={<FileUp className="h-4 w-4" />}>
                Go to upload
              </ButtonLink>
            </>
          }
        >
          <ol className="list-decimal space-y-2 pl-5 text-sm text-navy-700">
            <li>Open the official document in a new tab and download it to your computer (the browser cannot fetch files from other websites directly).</li>
            <li>
              On the <strong>Document imports</strong> page, upload the file and choose <em>“Link to existing data source”</em> → <strong>{importing.title}</strong>.
            </li>
            <li>Review the extracted rows and publish the approved ones.</li>
          </ol>
          <Alert tone="info" className="mt-4">
            If the official page is an HTML table (e.g. OR-CR details on uptac.samarth.edu.in), export it with the fetch scripts in <code className="font-mono text-xs">processor/scripts</code> and upload the resulting CSV.
          </Alert>
        </Modal>
      )}
    </div>
  )
}

function SourceModal({ source, onClose }: { source: DataSource | null; onClose: () => void }) {
  const { user } = useAuth()
  const [f, setF] = useState({
    title: source?.title ?? '',
    source_type: source?.source_type ?? 'uptac_official',
    document_type: source?.document_type ?? 'other',
    url: source?.url ?? '',
    academic_year: source?.academic_year ? String(source.academic_year) : '',
    status: source?.status ?? 'active',
    notes: source?.notes ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useAdminMutation((input: DataSourceInput) => saveDataSource(input, source?.id), {
    success: source ? 'Source saved' : 'Source added',
    invalidate: [KEY, ['admin', 'source-options']],
    onSuccess: onClose,
  })

  const submit = () => {
    const e: Record<string, string> = {}
    if (f.title.trim().length < 3) e.title = 'Enter a descriptive title.'
    if (f.url && !/^https?:\/\/\S+$/i.test(f.url.trim())) e.url = 'Must be an http(s) URL.'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    save.mutate({
      title: f.title.trim(),
      source_type: f.source_type as DataSource['source_type'],
      document_type: f.document_type as DocumentType,
      url: f.url.trim() || null,
      academic_year: f.academic_year ? Number(f.academic_year) : null,
      status: f.status as DataSource['status'],
      notes: f.notes.trim() || null,
      ...(source ? {} : { discovered_via: 'manual' as const, created_by: user?.id ?? null }),
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={source ? 'Edit data source' : 'Add data source'}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Title" required className="sm:col-span-2" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errors.title} />
        <SelectField label="Source type" value={f.source_type} onChange={(e) => setF({ ...f, source_type: e.target.value as DataSource['source_type'] })} options={SOURCE_TYPE_OPTIONS} />
        <SelectField label="Document type" value={f.document_type} onChange={(e) => setF({ ...f, document_type: e.target.value as DocumentType })} options={DOCUMENT_TYPE_OPTIONS} />
        <TextField label="Official URL" className="sm:col-span-2" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} error={errors.url} placeholder="https://" />
        <SelectField label="Academic year" value={f.academic_year} onChange={(e) => setF({ ...f, academic_year: e.target.value })} options={yearOptions()} placeholder="Not year-specific" />
        <SelectField
          label="Status"
          value={f.status}
          onChange={(e) => setF({ ...f, status: e.target.value as DataSource['status'] })}
          options={Object.entries(STATUS).map(([value, v]) => ({ value, label: v.label }))}
        />
        <TextareaField label="Notes (internal)" className="sm:col-span-2" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
    </Modal>
  )
}
