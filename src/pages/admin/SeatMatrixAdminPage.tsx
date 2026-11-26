import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, Pencil, Plus, Trash2 } from 'lucide-react'
import { seatCode } from '@shared/prediction/labels.ts'
import { deleteRecords, listSeatMatrixAdmin, setRecordStatus, type AdminSeatRow } from '@/lib/api/admin'
import { formatNumber, prettyName } from '@/lib/utils'
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
const KEY = ['admin', 'seat-matrix']

export function SeatMatrixAdminPage() {
  const [filters, setFilters] = useState<RecordFilterState>(EMPTY_RECORD_FILTERS)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<AdminSeatRow | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  const selection = useSelection()

  const query = useQuery({
    queryKey: [...KEY, filters, page],
    queryFn: () =>
      listSeatMatrixAdmin({
        year: filters.year ? Number(filters.year) : null,
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

  const status = useAdminMutation((v: { ids: string[]; status: VerificationStatus }) => setRecordStatus('seat_matrix', v.ids, v.status), {
    success: (n, v) => `${n} row(s) marked ${v.status}`,
    invalidate: [KEY, ['admin', 'stats']],
    onSuccess: () => selection.clear(),
  })
  const remove = useAdminMutation((ids: string[]) => deleteRecords('seat_matrix', ids), {
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

  return (
    <div>
      <AdminPageHeader
        title="Seat matrix"
        description="Official seats per programme and category (from the UPTAC seat matrix). Only verified rows are public."
        actions={
          <>
            <ButtonLink to="/admin/imports" variant="outline" size="sm">
              Import seat matrix
            </ButtonLink>
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              Add row
            </Button>
          </>
        }
      />

      <RecordFilters
        value={filters}
        onChange={(f) => {
          setFilters(f)
          setPage(1)
          selection.clear()
        }}
      />

      {selection.selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-royal-200 bg-royal-50/70 px-4 py-2.5 text-sm">
          <span className="font-semibold text-navy-800">{selection.selected.size} selected</span>
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
          icon={<FileSpreadsheet className="h-6 w-6" />}
          title="No seat-matrix rows match"
          description="Import the official UPTAC seat matrix (CSV/Excel export or PDF) and publish the reviewed rows."
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
                  <Th>Year</Th>
                  <Th>College</Th>
                  <Th>Branch</Th>
                  <Th>Seat</Th>
                  <Th className="text-right">Seats</Th>
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
                    <Td className="font-semibold">{r.academic_year}</Td>
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
                        {r.quota}
                      </span>
                    </Td>
                    <Td className="text-right font-semibold tabular">{formatNumber(r.seats)}</Td>
                    <Td>
                      <VerificationBadge status={r.verification_status} />
                    </Td>
                    <Td className="max-w-[12rem] whitespace-normal text-xs text-navy-600">{r.data_sources?.title ?? '—'}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label="Edit row" onClick={() => setEditing(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Delete row" onClick={() => setConfirmDelete([r.id])}>
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

      {editing && <RecordFormModal kind="seat" row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete seat-matrix row(s)?"
        tone="danger"
        confirmLabel="Delete"
        loading={remove.isPending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete)}
        description={`Permanently delete ${confirmDelete?.length ?? 0} row(s)?`}
      />
    </div>
  )
}
