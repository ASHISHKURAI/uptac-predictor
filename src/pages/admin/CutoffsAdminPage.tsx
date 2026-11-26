import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Table2, Trash2 } from 'lucide-react'
import { seatCode } from '@shared/prediction/labels.ts'
import { deleteRecords, listCutoffsAdmin, setRecordStatus, type AdminCutoffRow } from '@/lib/api/admin'
import { formatRank, prettyName } from '@/lib/utils'
import type { VerificationStatus } from '@/lib/types'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination, Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'
import { QueryError } from '@/components/common/ConfigNotice'
import { useAdminMutation, useSelection } from '@/components/admin/Misc'
import { VerificationBadge } from '@/components/admin/Badges'
import { BulkStatusSelect, RecordFormModal } from '@/components/admin/RecordForms'
import { EMPTY_RECORD_FILTERS, RecordFilters, type RecordFilterState } from '@/components/admin/RecordFilters'

const PAGE_SIZE = 50
const KEY = ['admin', 'cutoffs']

export function CutoffsAdminPage() {
  const [filters, setFilters] = useState<RecordFilterState>(EMPTY_RECORD_FILTERS)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<AdminCutoffRow | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  const selection = useSelection()

  const query = useQuery({
    queryKey: [...KEY, filters, page],
    queryFn: () =>
      listCutoffsAdmin({
        year: filters.year ? Number(filters.year) : null,
        round: filters.round ? Number(filters.round) : null,
        collegeCode: filters.collegeCode || undefined,
        branchCode: filters.branchCode || undefined,
        category: filters.category || undefined,
        seatType: filters.seatType || undefined,
        status: (filters.status as VerificationStatus) || '',
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })

  const status = useAdminMutation((v: { ids: string[]; status: VerificationStatus }) => setRecordStatus('cutoff_records', v.ids, v.status), {
    success: (n, v) => `${n} record(s) marked ${v.status}`,
    invalidate: [KEY, ['admin', 'stats']],
    onSuccess: () => selection.clear(),
  })
  const remove = useAdminMutation((ids: string[]) => deleteRecords('cutoff_records', ids), {
    success: 'Deleted',
    invalidate: [KEY, ['admin', 'stats']],
    onSuccess: () => {
      selection.clear()
      setConfirmDelete(null)
    },
  })

  const rows = query.data?.rows ?? []
  const pageIds = rows.map((r) => r.id)
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selection.has(id))
  const selectedCount = selection.selected.size

  return (
    <div>
      <AdminPageHeader
        title="Cutoff records"
        description="Official opening and closing ranks. Only verified records are visible to students and used by the predictor."
        actions={
          <>
            <ButtonLink to="/admin/imports" variant="outline" size="sm">
              Import document
            </ButtonLink>
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              Add record
            </Button>
          </>
        }
      />

      <RecordFilters
        value={filters}
        showRound
        onChange={(f) => {
          setFilters(f)
          setPage(1)
          selection.clear()
        }}
      />

      {selectedCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-royal-200 bg-royal-50/70 px-4 py-2.5 text-sm">
          <span className="font-semibold text-navy-800">{selectedCount} selected</span>
          <BulkStatusSelect disabled={status.isPending} onApply={(s) => status.mutate({ ids: selection.ids(), status: s })} />
          <Button variant="outline" size="sm" leftIcon={<Trash2 className="h-4 w-4 text-red-600" />} onClick={() => setConfirmDelete(selection.ids())}>
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={selection.clear}>
            Clear selection
          </Button>
        </div>
      )}

      {query.error ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Table2 className="h-6 w-6" />}
          title="No cutoff records match"
          description="Records are created by publishing a reviewed import of an official UPTAC OR-CR document (or added manually with a cited source)."
          action={
            <ButtonLink to="/admin/imports" size="sm">
              Go to imports
            </ButtonLink>
          }
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th className="w-10">
                    <input type="checkbox" className="h-4 w-4 accent-royal-600" aria-label="Select all on page" checked={allSelected} onChange={(e) => selection.setAll(pageIds, e.target.checked)} />
                  </Th>
                  <Th>Year · Round</Th>
                  <Th>College</Th>
                  <Th>Branch</Th>
                  <Th>Seat</Th>
                  <Th className="text-right">Opening</Th>
                  <Th className="text-right">Closing</Th>
                  <Th>Status</Th>
                  <Th>Source</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.id} className={selection.has(r.id) ? 'bg-royal-50/50' : undefined}>
                    <Td>
                      <input type="checkbox" className="h-4 w-4 accent-royal-600" aria-label="Select row" checked={selection.has(r.id)} onChange={() => selection.toggle(r.id)} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="font-semibold">{r.academic_year}</span> · R{r.round_number}
                      {r.round_label && <span className="block text-xs text-navy-500">{r.round_label}</span>}
                    </Td>
                    <Td className="max-w-xs whitespace-normal">
                      <span className="font-mono text-xs text-navy-500">{r.college_code}</span> {prettyName(r.colleges?.name)}
                    </Td>
                    <Td className="max-w-xs whitespace-normal">
                      <span className="font-mono text-xs text-navy-500">{r.branch_code}</span> {r.branches?.name}
                      {r.shift && <span className="text-xs text-navy-500"> · Shift {r.shift}</span>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <Badge tone="royal">{r.category_code || seatCode(r.category, r.seat_type)}</Badge>
                      <span className="mt-1 block text-xs text-navy-500">
                        {r.gender === 'FEMALE_ONLY' ? 'Female only · ' : ''}
                        {r.quota} · {r.rank_type}
                      </span>
                    </Td>
                    <Td className="text-right tabular">{formatRank(r.opening_rank)}</Td>
                    <Td className="text-right font-semibold tabular">{formatRank(r.closing_rank)}</Td>
                    <Td>
                      <VerificationBadge status={r.verification_status} />
                    </Td>
                    <Td className="max-w-[12rem] whitespace-normal text-xs text-navy-600">
                      {r.data_sources?.title ?? '—'}
                      {r.source_page && <span className="block text-navy-400">Page {r.source_page}</span>}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label="Edit record" onClick={() => setEditing(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Delete record" onClick={() => setConfirmDelete([r.id])}>
                          <Trash2 className="h-4 w-4 text-red-600" />
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

      {editing && <RecordFormModal kind="cutoff" row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete cutoff record(s)?"
        tone="danger"
        confirmLabel="Delete"
        loading={remove.isPending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete)}
        description={`Permanently delete ${confirmDelete?.length ?? 0} record(s)? Prefer marking incorrect records as rejected so the change history stays visible.`}
      />
    </div>
  )
}
