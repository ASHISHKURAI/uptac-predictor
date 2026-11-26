import { useMemo } from 'react'
import { X } from 'lucide-react'
import { useBranches, useCollegesLite } from '@/hooks/useCatalog'
import { prettyName } from '@/lib/utils'
import { Select } from '@/components/ui/Form'
import { Combobox } from './Pickers'
import { CATEGORY_OPTIONS, SEAT_TYPE_OPTIONS, VERIFICATION_OPTIONS, yearOptions } from './Fields'

export interface RecordFilterState {
  year: string
  round: string
  collegeCode: string
  branchCode: string
  category: string
  seatType: string
  status: string
}

export const EMPTY_RECORD_FILTERS: RecordFilterState = { year: '', round: '', collegeCode: '', branchCode: '', category: '', seatType: '', status: '' }

export function RecordFilters({
  value,
  onChange,
  showRound,
}: {
  value: RecordFilterState
  onChange: (next: RecordFilterState) => void
  showRound?: boolean
}) {
  const colleges = useCollegesLite()
  const branches = useBranches()
  const collegeOptions = useMemo(
    () => (colleges.data ?? []).map((c) => ({ value: c.code, label: prettyName(c.short_name || c.name), sublabel: c.city ?? undefined })),
    [colleges.data],
  )
  const branchOptions = useMemo(() => (branches.data ?? []).map((b) => ({ value: b.code, label: b.name })), [branches.data])
  const set = (k: keyof RecordFilterState, v: string) => onChange({ ...value, [k]: v })
  const active = Object.values(value).some(Boolean)

  return (
    <div className="mb-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="sr-only">College</span>
          <Combobox value={value.collegeCode || null} onChange={(v) => set('collegeCode', v)} options={collegeOptions} loading={colleges.isLoading} placeholder="Filter by college…" />
        </div>
        <div>
          <span className="sr-only">Branch</span>
          <Combobox value={value.branchCode || null} onChange={(v) => set('branchCode', v)} options={branchOptions} loading={branches.isLoading} placeholder="Filter by branch…" />
        </div>
        <Select value={value.year} onChange={(e) => set('year', e.target.value)} aria-label="Academic year">
          <option value="">All years</option>
          {yearOptions().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {showRound ? (
          <Select value={value.round} onChange={(e) => set('round', e.target.value)} aria-label="Round">
            <option value="">All rounds</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => (
              <option key={r} value={r}>
                Round {r}
              </option>
            ))}
          </Select>
        ) : (
          <span className="hidden lg:block" />
        )}
        <Select value={value.category} onChange={(e) => set('category', e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select value={value.seatType} onChange={(e) => set('seatType', e.target.value)} aria-label="Seat type">
          <option value="">All seat types</option>
          {SEAT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select value={value.status} onChange={(e) => set('status', e.target.value)} aria-label="Verification status">
          <option value="">All statuses</option>
          {VERIFICATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {active && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_RECORD_FILTERS)}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-royal-600 hover:bg-royal-50"
          >
            <X className="h-4 w-4" /> Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
