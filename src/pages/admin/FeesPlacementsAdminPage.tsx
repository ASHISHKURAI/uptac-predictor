import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Briefcase, ExternalLink, IndianRupee, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCollegesLite } from '@/hooks/useCatalog'
import {
  deleteRecords,
  listFeesAdmin,
  listPlacementsAdmin,
  saveFee,
  savePlacement,
  type AdminFeeRow,
  type AdminPlacementRow,
  type FeeInput,
  type PlacementInput,
} from '@/lib/api/admin'
import { formatCurrency, formatLpa, formatNumber, prettyName } from '@/lib/utils'
import type { CollegeFee, VerificationStatus } from '@/lib/types'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Form'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Pagination, Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { QueryError } from '@/components/common/ConfigNotice'
import { useAdminMutation } from '@/components/admin/Misc'
import { VerificationBadge } from '@/components/admin/Badges'
import { BranchPicker, CollegePicker, Combobox, SourceSelect } from '@/components/admin/Pickers'
import { SelectField, TextareaField, TextField, VERIFICATION_OPTIONS, intOrNull, yearOptions } from '@/components/admin/Fields'

const PAGE_SIZE = 25
const FEE_TYPES: Array<{ value: CollegeFee['fee_type']; label: string }> = [
  { value: 'tuition', label: 'Tuition fee (per year)' },
  { value: 'hostel', label: 'Hostel fee (per year)' },
  { value: 'mess', label: 'Mess fee (per year)' },
  { value: 'admission', label: 'Admission / one-time fee' },
  { value: 'examination', label: 'Examination fee' },
  { value: 'total_annual', label: 'Total annual fee' },
  { value: 'total_program', label: 'Total programme fee' },
  { value: 'other', label: 'Other' },
]

type Tab = 'fees' | 'placements'

export function FeesPlacementsAdminPage() {
  const [tab, setTab] = useState<Tab>('fees')
  const [collegeCode, setCollegeCode] = useState('')
  const [year, setYear] = useState('')
  const [status, setStatus] = useState<VerificationStatus | ''>('')
  const colleges = useCollegesLite()
  const collegeOptions = useMemo(() => (colleges.data ?? []).map((c) => ({ value: c.code, label: prettyName(c.short_name || c.name) })), [colleges.data])

  return (
    <div>
      <AdminPageHeader
        title="Fees & placements"
        description="College fee structures and placement statistics. Every figure must cite the college's official website or official placement report."
      />
      <Alert tone="warning" title="Only official figures" className="mb-5">
        Enter values exactly as published on the college's official website or in its official placement report / NIRF submission, with the source URL.
        Never estimate or copy figures from third-party aggregator sites.
      </Alert>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'fees', label: 'Fees' },
            { value: 'placements', label: 'Placements' },
          ]}
        />
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Combobox value={collegeCode || null} onChange={setCollegeCode} options={collegeOptions} loading={colleges.isLoading} placeholder="Filter by college…" />
        </div>
        <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Academic year">
          <option value="">All years</option>
          {yearOptions().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value as VerificationStatus | '')} aria-label="Verification status">
            <option value="">All statuses</option>
            {VERIFICATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {(collegeCode || year || status) && (
            <Button
              variant="ghost"
              onClick={() => {
                setCollegeCode('')
                setYear('')
                setStatus('')
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
      {tab === 'fees' ? (
        <FeesTab collegeCode={collegeCode} year={year ? Number(year) : null} status={status} />
      ) : (
        <PlacementsTab collegeCode={collegeCode} year={year ? Number(year) : null} status={status} />
      )}
    </div>
  )
}

interface TabProps {
  collegeCode: string
  year: number | null
  status: VerificationStatus | ''
}

function SourceLink({ url, title }: { url: string | null; title?: string | null }) {
  if (url)
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-royal-600 hover:underline">
        Source <ExternalLink className="h-3 w-3" />
      </a>
    )
  return <span className="text-xs text-navy-500">{title ?? 'Linked document'}</span>
}

function FeesTab({ collegeCode, year, status }: TabProps) {
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<AdminFeeRow | 'new' | null>(null)
  const [deleting, setDeleting] = useState<AdminFeeRow | null>(null)
  const query = useQuery({
    queryKey: ['admin', 'fees', collegeCode, year, status, page],
    queryFn: () => listFeesAdmin({ collegeCode: collegeCode || undefined, year, status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const remove = useAdminMutation((id: string) => deleteRecords('college_fees', [id]), {
    success: 'Fee deleted',
    invalidate: [['admin', 'fees']],
    onSuccess: () => setDeleting(null),
  })
  const rows = query.data?.rows ?? []
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Add fee
        </Button>
      </div>
      {query.error ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<IndianRupee className="h-6 w-6" />} title="No fee records" description="Add fee figures from official college fee notices." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>College</Th>
                  <Th>Year</Th>
                  <Th>Branch</Th>
                  <Th>Fee type</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                  <Th>Source</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="max-w-xs whitespace-normal">
                      <span className="font-mono text-xs text-navy-500">{r.college_code}</span> {prettyName(r.colleges?.name)}
                    </Td>
                    <Td>{r.academic_year}</Td>
                    <Td className="text-xs">{r.branches?.name ?? 'All branches'}</Td>
                    <Td className="text-xs">{FEE_TYPES.find((f) => f.value === r.fee_type)?.label ?? r.fee_type}</Td>
                    <Td className="text-right font-semibold tabular">{formatCurrency(Number(r.amount), r.currency)}</Td>
                    <Td>
                      <VerificationBadge status={r.verification_status} />
                    </Td>
                    <Td>
                      <SourceLink url={r.source_url} />
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label="Edit fee" onClick={() => setEditing(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Delete fee" onClick={() => setDeleting(r)}>
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
      {editing && <FeeModal row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete fee record?"
        tone="danger"
        confirmLabel="Delete"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  )
}

function validUrl(v: string): boolean {
  return /^https?:\/\/\S+$/i.test(v.trim())
}

function FeeModal({ row, onClose }: { row: AdminFeeRow | null; onClose: () => void }) {
  const [f, setF] = useState({
    college_code: row?.college_code ?? null,
    branch_code: row?.branch_code ?? null,
    academic_year: String(row?.academic_year ?? new Date().getFullYear()),
    fee_type: row?.fee_type ?? 'tuition',
    amount: row ? String(row.amount) : '',
    currency: row?.currency ?? 'INR',
    notes: row?.notes ?? '',
    source_url: row?.source_url ?? '',
    source_id: row?.source_id ?? null,
    verification_status: row?.verification_status ?? 'pending',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useAdminMutation((input: FeeInput) => saveFee(input, row?.id), { success: 'Fee saved', invalidate: [['admin', 'fees']], onSuccess: onClose })

  const submit = () => {
    const e: Record<string, string> = {}
    if (!f.college_code) e.college_code = 'Select a college.'
    const amount = Number(f.amount.replace(/,/g, ''))
    if (!f.amount.trim() || !Number.isFinite(amount) || amount < 0) e.amount = 'Enter a valid amount.'
    if (f.source_url && !validUrl(f.source_url)) e.source_url = 'Must be an http(s) URL.'
    if (!f.source_url.trim() && !f.source_id) e.source_url = 'Provide the official source URL or select a source document.'
    if (!/^[A-Z]{3}$/.test(f.currency)) e.currency = '3-letter currency code.'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    save.mutate({
      college_code: f.college_code as string,
      branch_code: f.branch_code,
      academic_year: Number(f.academic_year),
      fee_type: f.fee_type,
      amount,
      currency: f.currency,
      notes: f.notes.trim() || null,
      source_url: f.source_url.trim() || null,
      source_id: f.source_id,
      verification_status: f.verification_status,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={row ? 'Edit fee' : 'Add fee'}
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
        <div className="sm:col-span-2">
          <CollegePicker value={f.college_code} onChange={(v) => setF({ ...f, college_code: v })} error={errors.college_code} required />
        </div>
        <BranchPicker label="Branch (optional)" value={f.branch_code} onChange={(v) => setF({ ...f, branch_code: v })} hint="Leave empty if the fee applies to all branches" />
        <SelectField label="Academic year" value={f.academic_year} onChange={(e) => setF({ ...f, academic_year: e.target.value })} options={yearOptions()} />
        <SelectField label="Fee type" value={f.fee_type} onChange={(e) => setF({ ...f, fee_type: e.target.value as CollegeFee['fee_type'] })} options={FEE_TYPES} />
        <TextField label="Amount" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} error={errors.amount} inputMode="decimal" />
        <TextField label="Currency" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} error={errors.currency} />
        <SelectField label="Verification" value={f.verification_status} onChange={(e) => setF({ ...f, verification_status: e.target.value as VerificationStatus })} options={VERIFICATION_OPTIONS} />
        <TextField label="Official source URL" className="sm:col-span-2" value={f.source_url} onChange={(e) => setF({ ...f, source_url: e.target.value })} error={errors.source_url} placeholder="https://college.ac.in/fee-structure.pdf" />
        <div className="sm:col-span-2">
          <SourceSelect label="…or source document" value={f.source_id} onChange={(v) => setF({ ...f, source_id: v || null })} hint="Optional when a source URL is given." />
        </div>
        <TextareaField label="Notes" className="sm:col-span-2" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
    </Modal>
  )
}

function PlacementsTab({ collegeCode, year, status }: TabProps) {
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<AdminPlacementRow | 'new' | null>(null)
  const [deleting, setDeleting] = useState<AdminPlacementRow | null>(null)
  const query = useQuery({
    queryKey: ['admin', 'placements', collegeCode, year, status, page],
    queryFn: () => listPlacementsAdmin({ collegeCode: collegeCode || undefined, year, status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const remove = useAdminMutation((id: string) => deleteRecords('placement_records', [id]), {
    success: 'Placement record deleted',
    invalidate: [['admin', 'placements']],
    onSuccess: () => setDeleting(null),
  })
  const rows = query.data?.rows ?? []
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Add placement record
        </Button>
      </div>
      {query.error ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Briefcase className="h-6 w-6" />} title="No placement records" description="Add statistics from official placement reports (e.g. NIRF data submitted by the college)." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>College</Th>
                  <Th>Year</Th>
                  <Th>Branch</Th>
                  <Th className="text-right">Placed / eligible</Th>
                  <Th className="text-right">Median</Th>
                  <Th className="text-right">Average</Th>
                  <Th className="text-right">Highest</Th>
                  <Th>Status</Th>
                  <Th>Source</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="max-w-xs whitespace-normal">
                      <span className="font-mono text-xs text-navy-500">{r.college_code}</span> {prettyName(r.colleges?.name)}
                    </Td>
                    <Td>{r.academic_year}</Td>
                    <Td className="text-xs">{r.branches?.name ?? 'All branches'}</Td>
                    <Td className="text-right tabular">
                      {formatNumber(r.students_placed)} / {formatNumber(r.students_eligible)}
                    </Td>
                    <Td className="text-right tabular">{formatLpa(r.median_package_lpa)}</Td>
                    <Td className="text-right tabular">{formatLpa(r.average_package_lpa)}</Td>
                    <Td className="text-right tabular">{formatLpa(r.highest_package_lpa)}</Td>
                    <Td>
                      <VerificationBadge status={r.verification_status} />
                    </Td>
                    <Td>
                      <SourceLink url={r.source_url} />
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label="Edit placement record" onClick={() => setEditing(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Delete placement record" onClick={() => setDeleting(r)}>
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
      {editing && <PlacementModal row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete placement record?"
        tone="danger"
        confirmLabel="Delete"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  )
}

function decOrNull(v: string): number | null {
  const s = v.replace(/,/g, '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : Number.NaN
}

function PlacementModal({ row, onClose }: { row: AdminPlacementRow | null; onClose: () => void }) {
  const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))
  const [f, setF] = useState({
    college_code: row?.college_code ?? null,
    branch_code: row?.branch_code ?? null,
    academic_year: String(row?.academic_year ?? new Date().getFullYear()),
    students_eligible: str(row?.students_eligible),
    students_placed: str(row?.students_placed),
    median_package_lpa: str(row?.median_package_lpa),
    average_package_lpa: str(row?.average_package_lpa),
    highest_package_lpa: str(row?.highest_package_lpa),
    companies_visited: str(row?.companies_visited),
    notes: row?.notes ?? '',
    source_url: row?.source_url ?? '',
    source_id: row?.source_id ?? null,
    verification_status: row?.verification_status ?? 'pending',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useAdminMutation((input: PlacementInput) => savePlacement(input, row?.id), {
    success: 'Placement record saved',
    invalidate: [['admin', 'placements']],
    onSuccess: onClose,
  })

  const submit = () => {
    const e: Record<string, string> = {}
    if (!f.college_code) e.college_code = 'Select a college.'
    const eligible = intOrNull(f.students_eligible)
    const placed = intOrNull(f.students_placed)
    const companies = intOrNull(f.companies_visited)
    const median = decOrNull(f.median_package_lpa)
    const average = decOrNull(f.average_package_lpa)
    const highest = decOrNull(f.highest_package_lpa)
    for (const [k, v] of Object.entries({ students_eligible: eligible, students_placed: placed, companies_visited: companies, median_package_lpa: median, average_package_lpa: average, highest_package_lpa: highest })) {
      if (v !== null && (Number.isNaN(v) || v < 0)) e[k] = 'Must be a non-negative number.'
    }
    if (placed !== null && eligible !== null && !Number.isNaN(placed) && !Number.isNaN(eligible) && placed > eligible) e.students_placed = 'Placed cannot exceed eligible.'
    if (f.source_url && !validUrl(f.source_url)) e.source_url = 'Must be an http(s) URL.'
    if (!f.source_url.trim() && !f.source_id) e.source_url = 'Provide the official source URL or select a source document.'
    if ([eligible, placed, median, average, highest, companies].every((v) => v === null)) e.students_eligible = 'Enter at least one statistic.'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    save.mutate({
      college_code: f.college_code as string,
      branch_code: f.branch_code,
      academic_year: Number(f.academic_year),
      students_eligible: eligible,
      students_placed: placed,
      median_package_lpa: median,
      average_package_lpa: average,
      highest_package_lpa: highest,
      companies_visited: companies,
      notes: f.notes.trim() || null,
      source_url: f.source_url.trim() || null,
      source_id: f.source_id,
      verification_status: f.verification_status,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={row ? 'Edit placement record' : 'Add placement record'}
      description="Packages in lakh per annum (LPA) exactly as stated in the official report."
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
        <div className="sm:col-span-2">
          <CollegePicker value={f.college_code} onChange={(v) => setF({ ...f, college_code: v })} error={errors.college_code} required />
        </div>
        <BranchPicker label="Branch (optional)" value={f.branch_code} onChange={(v) => setF({ ...f, branch_code: v })} />
        <SelectField label="Academic year (graduating batch)" value={f.academic_year} onChange={(e) => setF({ ...f, academic_year: e.target.value })} options={yearOptions()} />
        <TextField label="Students eligible" value={f.students_eligible} onChange={(e) => setF({ ...f, students_eligible: e.target.value })} error={errors.students_eligible} inputMode="numeric" />
        <TextField label="Students placed" value={f.students_placed} onChange={(e) => setF({ ...f, students_placed: e.target.value })} error={errors.students_placed} inputMode="numeric" />
        <TextField label="Median package (LPA)" value={f.median_package_lpa} onChange={(e) => setF({ ...f, median_package_lpa: e.target.value })} error={errors.median_package_lpa} inputMode="decimal" />
        <TextField label="Average package (LPA)" value={f.average_package_lpa} onChange={(e) => setF({ ...f, average_package_lpa: e.target.value })} error={errors.average_package_lpa} inputMode="decimal" />
        <TextField label="Highest package (LPA)" value={f.highest_package_lpa} onChange={(e) => setF({ ...f, highest_package_lpa: e.target.value })} error={errors.highest_package_lpa} inputMode="decimal" />
        <TextField label="Companies visited" value={f.companies_visited} onChange={(e) => setF({ ...f, companies_visited: e.target.value })} error={errors.companies_visited} inputMode="numeric" />
        <SelectField label="Verification" value={f.verification_status} onChange={(e) => setF({ ...f, verification_status: e.target.value as VerificationStatus })} options={VERIFICATION_OPTIONS} />
        <TextField label="Official source URL" className="sm:col-span-2" value={f.source_url} onChange={(e) => setF({ ...f, source_url: e.target.value })} error={errors.source_url} placeholder="https://" />
        <div className="sm:col-span-2">
          <SourceSelect label="…or source document" value={f.source_id} onChange={(v) => setF({ ...f, source_id: v || null })} hint="Optional when a source URL is given." />
        </div>
        <TextareaField label="Notes" className="sm:col-span-2" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
    </Modal>
  )
}
