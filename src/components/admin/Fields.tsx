import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import {
  CATEGORY_LABELS,
  DOMICILE_LABELS,
  GENDER_LABELS,
  QUOTA_LABELS,
  RANK_TYPE_LABELS,
  SEAT_TYPE_LABELS,
} from '@shared/prediction/labels.ts'

interface Common {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
}

export function TextField({ label, hint, error, required, className, ...props }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} required={required} {...props} />}
    </Field>
  )
}

export function TextareaField({ label, hint, error, required, className, ...props }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} required={required} {...props} />}
    </Field>
  )
}

export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  options,
  placeholder,
  ...props
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string }>; placeholder?: string }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} required={required} {...props}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  )
}

const toOptions = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label: `${value} – ${label}` }))

export const CATEGORY_OPTIONS = toOptions(CATEGORY_LABELS)
export const SEAT_TYPE_OPTIONS = toOptions(SEAT_TYPE_LABELS)
export const GENDER_OPTIONS = toOptions(GENDER_LABELS)
export const DOMICILE_OPTIONS = toOptions(DOMICILE_LABELS)
export const QUOTA_OPTIONS = toOptions(QUOTA_LABELS)
export const RANK_TYPE_OPTIONS = toOptions(RANK_TYPE_LABELS)
export const SHIFT_OPTIONS = [
  { value: '', label: 'No shift' },
  { value: 'I', label: 'Shift I' },
  { value: 'II', label: 'Shift II' },
  { value: 'III', label: 'Shift III' },
]
export const VERIFICATION_OPTIONS = [
  { value: 'pending', label: 'Pending review' },
  { value: 'verified', label: 'Verified (public)' },
  { value: 'rejected', label: 'Rejected' },
]
export const INSTITUTE_TYPE_OPTIONS = [
  { value: 'government', label: 'Government' },
  { value: 'aided', label: 'Government aided' },
  { value: 'private', label: 'Private' },
  { value: 'university', label: 'University (other)' },
]
export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'opening_closing_rank', label: 'Opening & closing ranks (OR-CR)' },
  { value: 'seat_matrix', label: 'Seat matrix' },
  { value: 'brochure', label: 'Counselling brochure' },
  { value: 'notice', label: 'Official notice' },
  { value: 'fee_structure', label: 'Fee structure' },
  { value: 'placement_report', label: 'Placement report' },
  { value: 'other', label: 'Other' },
]
export const SOURCE_TYPE_OPTIONS = [
  { value: 'uptac_official', label: 'UPTAC official' },
  { value: 'college_official', label: 'College official website' },
  { value: 'placement_report', label: 'Official placement report' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
]

/** Parses an optional integer input value. */
export function intOrNull(value: string): number | null {
  const v = value.replace(/[,\s]/g, '')
  if (v === '') return null
  const n = Number(v)
  return Number.isInteger(n) ? n : Number.NaN
}

export function yearOptions(from = 2018, to = new Date().getFullYear() + 1): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = []
  for (let y = to; y >= from; y--) out.push({ value: String(y), label: String(y) })
  return out
}
