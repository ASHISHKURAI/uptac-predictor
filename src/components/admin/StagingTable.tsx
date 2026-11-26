import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CheckCheck, Pencil, RotateCcw, Search, ThumbsDown, ThumbsUp } from 'lucide-react'
import { revalidateStagingRow, type EditableStagingRow } from '@shared/import/index.ts'
import { seatCode } from '@shared/prediction/labels.ts'
import { approveAllValid, fetchReferenceCodes, listStaging, setStagingStatus, updateStagingRow, type StagingFilters, type StagingPatch } from '@/lib/api/admin'
import { useAuth } from '@/lib/auth'
import { formatNumber, formatRank } from '@/lib/utils'
import type { DomicileRequirement, Quota, RankType, ReservationCategory, SeatGender, SeatType, StagingRow, StagingStatus } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Checkbox, Input, Select } from '@/components/ui/Form'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { Pagination, Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'
import { QueryError } from '@/components/common/ConfigNotice'
import { DuplicateBadge, IssueList, StagingStatusBadge } from './Badges'
import { JsonView, useAdminMutation, useSelection } from './Misc'
import { BranchPicker, CollegePicker } from './Pickers'
import {
  CATEGORY_OPTIONS,
  DOMICILE_OPTIONS,
  GENDER_OPTIONS,
  QUOTA_OPTIONS,
  RANK_TYPE_OPTIONS,
  SEAT_TYPE_OPTIONS,
  SHIFT_OPTIONS,
  SelectField,
  TextField,
  intOrNull,
} from './Fields'

const PAGE_SIZE = 50

type FilterState = Omit<StagingFilters, 'page' | 'pageSize'>

export function StagingTable({ jobId, editable, onChanged }: { jobId: string; editable: boolean; onChanged: () => void }) {
  const { user } = useAuth()
  const [filters, setFilters] = useState<FilterState>({ status: '', errorsOnly: false, warningsOnly: false, duplicate: '', recordType: '', search: '' })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<StagingRow | null>(null)
  const selection = useSelection()

  const query = useQuery({
    queryKey: ['admin', 'staging', jobId, filters, page],
    queryFn: () => listStaging(jobId, { ...filters, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const invalidate = [['admin', 'staging', jobId], ['admin', 'import', jobId]]
  const bulk = useAdminMutation((v: { ids: string[]; status: StagingStatus }) => setStagingStatus(jobId, v.ids, v.status, user?.id ?? null), {
    success: (n, v) => `${formatNumber(n)} row(s) set to ${v.status}${v.status === 'approved' ? ' (rows with errors are never approved)' : ''}`,
    invalidate,
    onSuccess: () => {
      selection.clear()
      onChanged()
    },
  })
  const approveAll = useAdminMutation(() => approveAllValid(jobId, user?.id ?? null), {
    success: (n) => `${formatNumber(n)} valid pending row(s) approved`,
    invalidate,
    onSuccess: onChanged,
  })

  const update = (patch: Partial<FilterState>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
    selection.clear()
  }

  const rows = query.data?.rows ?? []
  const pageIds = rows.filter((r) => r.status !== 'published').map((r) => r.id)
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selection.has(id))
  const busy = bulk.isPending || approveAll.isPending

  return (
    <div>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <form
          className="sm:col-span-2"
          onSubmit={(e) => {
            e.preventDefault()
            update({ search })
          }}
        >
          <Input leftIcon={<Search className="h-4 w-4" />} placeholder="Search institute, programme, code… (Enter)" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search staged rows" />
        </form>
        <Select value={filters.status ?? ''} onChange={(e) => update({ status: e.target.value as StagingStatus | '' })} aria-label="Row status">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="skipped">Skipped</option>
          <option value="published">Published</option>
        </Select>
        <Select value={filters.duplicate ?? ''} onChange={(e) => update({ duplicate: e.target.value as FilterState['duplicate'] })} aria-label="Duplicate status">
          <option value="">Any duplicate status</option>
          <option value="none">No duplicate</option>
          <option value="in_file">Duplicate in file</option>
          <option value="existing_conflict">Conflicts with published</option>
          <option value="existing_same">Identical to published</option>
        </Select>
        <Select value={filters.recordType ?? ''} onChange={(e) => update({ recordType: e.target.value as FilterState['recordType'] })} aria-label="Record type">
          <option value="">All record types</option>
          <option value="cutoff">Cutoff rows</option>
          <option value="seat_matrix">Seat-matrix rows</option>
        </Select>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-5">
          <Checkbox label="Errors only" checked={Boolean(filters.errorsOnly)} onChange={(e) => update({ errorsOnly: e.target.checked })} />
          <Checkbox label="Warnings only" checked={Boolean(filters.warningsOnly)} onChange={(e) => update({ warningsOnly: e.target.checked })} />
        </div>
      </div>

      {editable && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-navy-100 bg-white px-4 py-2.5 text-sm">
          <span className="mr-1 font-semibold text-navy-800">{selection.selected.size > 0 ? `${selection.selected.size} selected` : 'Bulk actions'}</span>
          <Button size="sm" variant="outline" leftIcon={<ThumbsUp className="h-4 w-4" />} disabled={busy || selection.selected.size === 0} onClick={() => bulk.mutate({ ids: selection.ids(), status: 'approved' })}>
            Approve
          </Button>
          <Button size="sm" variant="outline" leftIcon={<ThumbsDown className="h-4 w-4" />} disabled={busy || selection.selected.size === 0} onClick={() => bulk.mutate({ ids: selection.ids(), status: 'rejected' })}>
            Reject
          </Button>
          <Button size="sm" variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />} disabled={busy || selection.selected.size === 0} onClick={() => bulk.mutate({ ids: selection.ids(), status: 'pending' })}>
            Reset to pending
          </Button>
          <span className="hidden h-6 w-px bg-navy-100 sm:block" />
          <Button size="sm" leftIcon={<CheckCheck className="h-4 w-4" />} loading={approveAll.isPending} disabled={busy} onClick={() => approveAll.mutate(undefined)}>
            Approve all valid pending rows
          </Button>
        </div>
      )}

      {query.error ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState title="No staged rows match these filters" description="Adjust the filters above." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  {editable && (
                    <Th className="w-10">
                      <input type="checkbox" className="h-4 w-4 accent-royal-600" aria-label="Select all on page" checked={allSelected} onChange={(e) => selection.setAll(pageIds, e.target.checked)} />
                    </Th>
                  )}
                  <Th>Row</Th>
                  <Th>Institute</Th>
                  <Th>Programme</Th>
                  <Th>Seat</Th>
                  <Th className="text-right">Values</Th>
                  <Th>Issues</Th>
                  <Th>Status</Th>
                  {editable && <Th className="text-right">Edit</Th>}
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.id} className={r.has_errors ? 'bg-red-50/40' : selection.has(r.id) ? 'bg-royal-50/50' : undefined}>
                    {editable && (
                      <Td>
                        {r.status !== 'published' && (
                          <input type="checkbox" className="h-4 w-4 accent-royal-600" aria-label={`Select row ${r.row_index}`} checked={selection.has(r.id)} onChange={() => selection.toggle(r.id)} />
                        )}
                      </Td>
                    )}
                    <Td className="whitespace-nowrap text-xs text-navy-500">
                      #{r.row_index}
                      {r.source_page && <span className="block">p. {r.source_page}</span>}
                      {r.record_type === 'cutoff' && r.round_number && <span className="block font-semibold text-navy-700">R{r.round_number}</span>}
                    </Td>
                    <Td className="max-w-[16rem] whitespace-normal">
                      <p className="text-xs text-navy-500">{r.college_name_raw}</p>
                      {r.college_code ? <Badge tone="outline" className="mt-1 font-mono">{r.college_code}</Badge> : <Badge tone="red" className="mt-1">Unmapped</Badge>}
                    </Td>
                    <Td className="max-w-[16rem] whitespace-normal">
                      <p className="text-xs text-navy-500">{r.branch_name_raw}</p>
                      {r.branch_code ? (
                        <Badge tone="outline" className="mt-1 font-mono">
                          {r.branch_code}
                          {r.shift ? ` · Shift ${r.shift}` : ''}
                        </Badge>
                      ) : (
                        <Badge tone="red" className="mt-1">Unmapped</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <Badge tone="royal">{r.category_code || (r.category && r.seat_type ? seatCode(r.category, r.seat_type) : '?')}</Badge>
                      <span className="mt-1 block text-xs text-navy-500">
                        {r.gender === 'FEMALE_ONLY' ? 'Female only' : 'Neutral'} · {r.quota ?? '?'} · {r.domicile ?? '?'}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular">
                      {r.record_type === 'cutoff' ? (
                        <>
                          <span className="text-navy-500">{formatRank(r.opening_rank)}</span>
                          <span className="block font-semibold">{formatRank(r.closing_rank)}</span>
                        </>
                      ) : (
                        <span className="font-semibold">{formatNumber(r.seats)} seats</span>
                      )}
                    </Td>
                    <Td className="max-w-[18rem] whitespace-normal">
                      <IssueList issues={r.issues} />
                      <div className="mt-1">
                        <DuplicateBadge status={r.duplicate_status} />
                      </div>
                    </Td>
                    <Td>
                      <StagingStatusBadge status={r.status} />
                    </Td>
                    {editable && (
                      <Td className="text-right">
                        {r.status !== 'published' && (
                          <Button variant="ghost" size="icon" aria-label={`Edit row ${r.row_index}`} onClick={() => setEditing(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination className="mt-4" page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPage={setPage} />
        </>
      )}
      {editing && (
        <StagingEditModal
          jobId={jobId}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function StagingEditModal({ jobId, row, onClose, onSaved }: { jobId: string; row: StagingRow; onClose: () => void; onSaved: () => void }) {
  const refs = useQuery({ queryKey: ['admin', 'reference-codes'], queryFn: fetchReferenceCodes, staleTime: 30_000 })
  const str = (n: number | null) => (n === null ? '' : String(n))
  const [f, setF] = useState({
    academic_year: str(row.academic_year),
    round_number: str(row.round_number),
    college_code: row.college_code,
    branch_code: row.branch_code,
    shift: row.shift,
    category: row.category ?? '',
    seat_type: row.seat_type ?? '',
    category_code: row.category_code ?? '',
    gender: row.gender ?? '',
    domicile: row.domicile ?? '',
    quota: row.quota ?? '',
    rank_type: row.rank_type ?? '',
    exam: row.exam ?? 'JEE-MAIN',
    opening_rank: str(row.opening_rank),
    closing_rank: str(row.closing_rank),
    seats: str(row.seats),
  })
  const [numError, setNumError] = useState<string | null>(null)

  const save = useAdminMutation((patch: StagingPatch) => updateStagingRow(jobId, row.id, patch), {
    success: (_r, p) => (p.has_errors ? 'Saved – the row still has errors' : 'Row saved and re-validated'),
    invalidate: [['admin', 'staging', jobId], ['admin', 'import', jobId]],
    onSuccess: onSaved,
  })

  const submit = () => {
    const nums = {
      academic_year: intOrNull(f.academic_year),
      round_number: intOrNull(f.round_number),
      opening_rank: intOrNull(f.opening_rank),
      closing_rank: intOrNull(f.closing_rank),
      seats: intOrNull(f.seats),
    }
    if (Object.values(nums).some((v) => Number.isNaN(v))) {
      setNumError('Numeric fields must contain whole numbers only.')
      return
    }
    setNumError(null)
    const edited: EditableStagingRow = {
      record_type: row.record_type,
      academic_year: nums.academic_year,
      round_number: nums.round_number,
      college_code: f.college_code,
      branch_code: f.branch_code,
      shift: f.shift,
      category: f.category || null,
      seat_type: f.seat_type || null,
      gender: f.gender || null,
      domicile: f.domicile || null,
      quota: f.quota || null,
      rank_type: row.record_type === 'cutoff' ? f.rank_type || null : null,
      exam: row.record_type === 'cutoff' ? f.exam.trim().toUpperCase() || null : null,
      opening_rank: row.record_type === 'cutoff' ? nums.opening_rank : null,
      closing_rank: row.record_type === 'cutoff' ? nums.closing_rank : null,
      seats: row.record_type === 'seat_matrix' ? nums.seats : null,
      issues: row.issues,
    }
    const result = revalidateStagingRow(edited, { collegeCodes: refs.data?.colleges ?? new Set(), branchCodes: refs.data?.branches ?? new Set() })
    const category = (f.category || null) as ReservationCategory | null
    const seatType = (f.seat_type || null) as SeatType | null
    save.mutate({
      academic_year: edited.academic_year,
      round_number: edited.round_number,
      college_code: edited.college_code,
      branch_code: edited.branch_code,
      shift: edited.shift,
      category,
      seat_type: seatType,
      category_code: f.category_code.trim() || (category && seatType ? seatCode(category, seatType) : null),
      gender: (f.gender || null) as SeatGender | null,
      domicile: (f.domicile || null) as DomicileRequirement | null,
      quota: (f.quota || null) as Quota | null,
      rank_type: edited.rank_type as RankType | null,
      exam: edited.exam,
      opening_rank: edited.opening_rank,
      closing_rank: edited.closing_rank,
      seats: edited.seats,
      issues: result.issues,
      has_errors: result.has_errors,
      ...(result.has_errors && row.status === 'approved' ? { status: 'pending' as StagingStatus } : {}),
    })
  }

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Edit staged row #${row.row_index}`}
      description="Correct the normalised values against the original document. The row is re-validated when you save."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={refs.isLoading}>
            Save & re-validate
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {row.issues.length > 0 && (
          <Alert tone={row.has_errors ? 'error' : 'warning'} title="Current issues">
            <IssueList issues={row.issues} />
          </Alert>
        )}
        {numError && <Alert tone="error">{numError}</Alert>}
        <div className="rounded-2xl border border-navy-100 bg-navy-50/50 p-4 text-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-500">
            Original values {row.source_page ? `· page ${row.source_page}` : ''} {row.source_reference ? `· ${row.source_reference}` : ''}
          </p>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {Object.entries(row.raw ?? {})
              .slice(0, 20)
              .map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="shrink-0 text-navy-500">{k}:</dt>
                  <dd className="min-w-0 break-words font-medium text-navy-900">{v || '—'}</dd>
                </div>
              ))}
          </dl>
          {Object.keys(row.raw ?? {}).length > 20 && (
            <div className="mt-2">
              <JsonView value={row.raw} label="All original cells" />
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">
            <CollegePicker value={f.college_code} onChange={(v) => set('college_code', v)} required />
            <BranchPicker value={f.branch_code} onChange={(v) => set('branch_code', v)} required />
          </div>
          <TextField label="Academic year" value={f.academic_year} onChange={(e) => set('academic_year', e.target.value)} inputMode="numeric" />
          {row.record_type === 'cutoff' && <TextField label="Round" value={f.round_number} onChange={(e) => set('round_number', e.target.value)} inputMode="numeric" />}
          <SelectField label="Shift" value={f.shift} onChange={(e) => set('shift', e.target.value)} options={SHIFT_OPTIONS} />
          <SelectField label="Category" value={f.category} onChange={(e) => set('category', e.target.value)} options={CATEGORY_OPTIONS} placeholder="Select" />
          <SelectField label="Seat type" value={f.seat_type} onChange={(e) => set('seat_type', e.target.value)} options={SEAT_TYPE_OPTIONS} placeholder="Select" />
          <TextField label="Official category code" value={f.category_code} onChange={(e) => set('category_code', e.target.value.toUpperCase())} />
          <SelectField label="Seat gender" value={f.gender} onChange={(e) => set('gender', e.target.value)} options={GENDER_OPTIONS} placeholder="Select" />
          <SelectField label="Domicile" value={f.domicile} onChange={(e) => set('domicile', e.target.value)} options={DOMICILE_OPTIONS} placeholder="Select" />
          <SelectField label="Quota" value={f.quota} onChange={(e) => set('quota', e.target.value)} options={QUOTA_OPTIONS} placeholder="Select" />
          {row.record_type === 'cutoff' ? (
            <>
              <SelectField label="Rank type" value={f.rank_type} onChange={(e) => set('rank_type', e.target.value)} options={RANK_TYPE_OPTIONS} placeholder="Select" />
              <TextField label="Exam" value={f.exam} onChange={(e) => set('exam', e.target.value)} />
              <TextField label="Opening rank" value={f.opening_rank} onChange={(e) => set('opening_rank', e.target.value)} inputMode="numeric" />
              <TextField label="Closing rank" value={f.closing_rank} onChange={(e) => set('closing_rank', e.target.value)} inputMode="numeric" />
            </>
          ) : (
            <TextField label="Seats" value={f.seats} onChange={(e) => set('seats', e.target.value)} inputMode="numeric" />
          )}
        </div>
      </div>
    </Modal>
  )
}
