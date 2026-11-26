import { useState } from 'react'
import { seatCode } from '@shared/prediction/labels.ts'
import { saveCutoff, saveSeatRow, type AdminCutoffRow, type AdminSeatRow, type CutoffInput, type SeatInput } from '@/lib/api/admin'
import type { DomicileRequirement, Quota, RankType, ReservationCategory, SeatGender, SeatType, VerificationStatus } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Form'
import { BranchPicker, CollegePicker, SourceSelect } from './Pickers'
import { useAdminMutation } from './Misc'
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
  VERIFICATION_OPTIONS,
  intOrNull,
  yearOptions,
} from './Fields'

type Kind = 'cutoff' | 'seat'

interface FormState {
  academic_year: string
  round_number: string
  round_label: string
  college_code: string | null
  branch_code: string | null
  shift: string
  program_name: string
  category: ReservationCategory
  seat_type: SeatType
  category_code: string
  gender: SeatGender
  domicile: DomicileRequirement
  quota: Quota
  rank_type: RankType
  exam: string
  opening_rank: string
  closing_rank: string
  seats: string
  source_id: string | null
  source_page: string
  source_reference: string
  verification_status: VerificationStatus
}

function initial(kind: Kind, row: AdminCutoffRow | AdminSeatRow | null): FormState {
  const c = kind === 'cutoff' ? (row as AdminCutoffRow | null) : null
  const s = kind === 'seat' ? (row as AdminSeatRow | null) : null
  return {
    academic_year: String(row?.academic_year ?? new Date().getFullYear()),
    round_number: c ? String(c.round_number) : '',
    round_label: c?.round_label ?? '',
    college_code: row?.college_code ?? null,
    branch_code: row?.branch_code ?? null,
    shift: row?.shift ?? '',
    program_name: row?.program_name ?? '',
    category: row?.category ?? 'OPEN',
    seat_type: row?.seat_type ?? 'GENERAL',
    category_code: row?.category_code ?? '',
    gender: row?.gender ?? 'NEUTRAL',
    domicile: row?.domicile ?? 'ANY',
    quota: row?.quota ?? 'STATE',
    rank_type: c?.rank_type ?? 'CRL',
    exam: c?.exam ?? 'JEE-MAIN',
    opening_rank: c ? String(c.opening_rank) : '',
    closing_rank: c ? String(c.closing_rank) : '',
    seats: s ? String(s.seats) : '',
    source_id: row?.source_id ?? null,
    source_page: row?.source_page ? String(row.source_page) : '',
    source_reference: row?.source_reference ?? '',
    verification_status: row?.verification_status ?? 'pending',
  }
}

export function RecordFormModal({ kind, row, onClose }: { kind: Kind; row: AdminCutoffRow | AdminSeatRow | null; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(() => initial(kind, row))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = useAdminMutation(
    (input: CutoffInput | SeatInput) => (kind === 'cutoff' ? saveCutoff(input as CutoffInput, row?.id) : saveSeatRow(input as SeatInput, row?.id)),
    {
      success: row ? 'Record saved' : 'Record added',
      invalidate: [['admin', kind === 'cutoff' ? 'cutoffs' : 'seat-matrix'], ['admin', 'stats']],
      onSuccess: onClose,
    },
  )

  const submit = () => {
    const e: Record<string, string> = {}
    const year = intOrNull(form.academic_year)
    if (!year || year < 2000 || year > 2100) e.academic_year = 'Select the academic year.'
    if (!form.college_code) e.college_code = 'Select a college.'
    if (!form.branch_code) e.branch_code = 'Select a branch.'
    if (!form.source_id) e.source_id = 'Select the official source document.'
    const page = intOrNull(form.source_page)
    if (Number.isNaN(page) || (page !== null && page < 1)) e.source_page = 'Page must be a positive number.'
    let round: number | null = null
    let opening: number | null = null
    let closing: number | null = null
    let seats: number | null = null
    if (kind === 'cutoff') {
      round = intOrNull(form.round_number)
      if (!round || round < 1 || round > 20) e.round_number = 'Round must be 1–20.'
      opening = intOrNull(form.opening_rank)
      closing = intOrNull(form.closing_rank)
      if (!opening || opening < 1) e.opening_rank = 'Enter a positive opening rank.'
      if (!closing || closing < 1) e.closing_rank = 'Enter a positive closing rank.'
      if (opening && closing && opening > closing) e.closing_rank = 'Closing rank must be ≥ opening rank.'
      if (!form.exam.trim()) e.exam = 'Exam is required.'
    } else {
      seats = intOrNull(form.seats)
      if (seats === null || Number.isNaN(seats) || seats < 0) e.seats = 'Seats must be a whole number ≥ 0.'
    }
    setErrors(e)
    if (Object.keys(e).length > 0) return
    const common = {
      academic_year: year as number,
      college_code: form.college_code as string,
      branch_code: form.branch_code as string,
      shift: form.shift,
      program_name: form.program_name.trim() || null,
      category: form.category,
      seat_type: form.seat_type,
      category_code: form.category_code.trim() || seatCode(form.category, form.seat_type),
      gender: form.gender,
      domicile: form.domicile,
      quota: form.quota,
      source_id: form.source_id as string,
      source_page: page,
      source_reference: form.source_reference.trim() || null,
      verification_status: form.verification_status,
    }
    if (kind === 'cutoff') {
      save.mutate({
        ...common,
        round_number: round as number,
        round_label: form.round_label.trim() || null,
        rank_type: form.rank_type,
        exam: form.exam.trim().toUpperCase(),
        opening_rank: opening as number,
        closing_rank: closing as number,
      })
    } else {
      save.mutate({ ...common, seats: seats as number })
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`${row ? 'Edit' : 'Add'} ${kind === 'cutoff' ? 'cutoff record' : 'seat-matrix row'}`}
      description="Enter values exactly as printed in the official document and cite the page."
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
      <form
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <SelectField label="Academic year" required value={form.academic_year} onChange={(e) => set('academic_year', e.target.value)} options={yearOptions()} error={errors.academic_year} />
        {kind === 'cutoff' && (
          <>
            <TextField label="Round" required value={form.round_number} onChange={(e) => set('round_number', e.target.value)} error={errors.round_number} inputMode="numeric" />
            <TextField label="Round label" value={form.round_label} onChange={(e) => set('round_label', e.target.value)} placeholder="R1: First Round" />
          </>
        )}
        <div className="sm:col-span-2 lg:col-span-3 grid gap-4 sm:grid-cols-2">
          <CollegePicker value={form.college_code} onChange={(v) => set('college_code', v)} error={errors.college_code} required />
          <BranchPicker value={form.branch_code} onChange={(v) => set('branch_code', v)} error={errors.branch_code} required />
        </div>
        <SelectField label="Shift" value={form.shift} onChange={(e) => set('shift', e.target.value)} options={SHIFT_OPTIONS} />
        <TextField label="Official programme name" className="lg:col-span-2" value={form.program_name} onChange={(e) => set('program_name', e.target.value)} />
        <SelectField label="Category" value={form.category} onChange={(e) => set('category', e.target.value as ReservationCategory)} options={CATEGORY_OPTIONS} />
        <SelectField label="Seat type (sub-category)" value={form.seat_type} onChange={(e) => set('seat_type', e.target.value as SeatType)} options={SEAT_TYPE_OPTIONS} />
        <TextField
          label="Official category code"
          value={form.category_code}
          onChange={(e) => set('category_code', e.target.value.toUpperCase())}
          placeholder={seatCode(form.category, form.seat_type)}
          hint="Leave blank to use the derived code"
        />
        <SelectField label="Seat gender" value={form.gender} onChange={(e) => set('gender', e.target.value as SeatGender)} options={GENDER_OPTIONS} />
        <SelectField label="Domicile" value={form.domicile} onChange={(e) => set('domicile', e.target.value as DomicileRequirement)} options={DOMICILE_OPTIONS} />
        <SelectField label="Quota" value={form.quota} onChange={(e) => set('quota', e.target.value as Quota)} options={QUOTA_OPTIONS} />
        {kind === 'cutoff' ? (
          <>
            <SelectField label="Rank type" value={form.rank_type} onChange={(e) => set('rank_type', e.target.value as RankType)} options={RANK_TYPE_OPTIONS} />
            <TextField label="Opening rank" required value={form.opening_rank} onChange={(e) => set('opening_rank', e.target.value)} error={errors.opening_rank} inputMode="numeric" />
            <TextField label="Closing rank" required value={form.closing_rank} onChange={(e) => set('closing_rank', e.target.value)} error={errors.closing_rank} inputMode="numeric" />
            <TextField label="Exam" value={form.exam} onChange={(e) => set('exam', e.target.value)} error={errors.exam} />
          </>
        ) : (
          <TextField label="Seats" required value={form.seats} onChange={(e) => set('seats', e.target.value)} error={errors.seats} inputMode="numeric" />
        )}
        <div className="sm:col-span-2">
          <SourceSelect value={form.source_id} onChange={(v) => set('source_id', v)} error={errors.source_id} required />
        </div>
        <TextField label="Source page" value={form.source_page} onChange={(e) => set('source_page', e.target.value)} error={errors.source_page} inputMode="numeric" />
        <TextField label="Source reference" className="sm:col-span-2" value={form.source_reference} onChange={(e) => set('source_reference', e.target.value)} placeholder="Row / table reference" />
        <SelectField label="Verification" value={form.verification_status} onChange={(e) => set('verification_status', e.target.value as VerificationStatus)} options={VERIFICATION_OPTIONS} hint="Only verified records are public" />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

/** Small status select used for bulk verification changes. */
export function BulkStatusSelect({ onApply, disabled }: { onApply: (s: VerificationStatus) => void; disabled?: boolean }) {
  return (
    <Select
      aria-label="Set verification status for selected rows"
      value=""
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value) onApply(e.target.value as VerificationStatus)
      }}
      className="h-9 w-52"
    >
      <option value="">Set status for selected…</option>
      {VERIFICATION_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  )
}
