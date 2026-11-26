import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronDown, Info, Sparkles } from 'lucide-react'
import {
  validatePredictionRequest,
  type Gender,
  type InstitutePreference,
  type PredictionRequest,
  type StudentCategory,
  type StudentDomicile,
  type SubCategory,
} from '@shared/prediction/index.ts'
import type { Branch, CutoffYear } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Segmented, Select } from '@/components/ui/Form'
import { Alert } from '@/components/ui/Feedback'
import { BranchPicker } from '@/components/common/Pickers'

export interface PredictorFormState {
  crlRank: string
  categoryRank: string
  admissionYear: number
  category: StudentCategory | ''
  gender: Gender | ''
  domicile: StudentDomicile | ''
  subCategories: SubCategory[]
  branchCodes: string[]
  institutePreference: InstitutePreference
  years: number[]
}

export function defaultAdmissionYear(now = new Date()): number {
  // UPTAC counselling runs roughly June–October; after September students plan for next year.
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear()
}

export const EMPTY_FORM: PredictorFormState = {
  crlRank: '',
  categoryRank: '',
  admissionYear: defaultAdmissionYear(),
  category: '',
  gender: '',
  domicile: '',
  subCategories: [],
  branchCodes: [],
  institutePreference: 'both',
  years: [],
}

const SUBCATS: Array<{ value: SubCategory; label: string; description: string }> = [
  { value: 'AF', label: 'Armed Forces (AF)', description: 'Dependant of armed forces personnel, with a valid certificate.' },
  { value: 'FF', label: 'Freedom Fighter (FF)', description: 'Dependant of a freedom fighter, with a valid certificate.' },
  { value: 'PH', label: 'Person with Disability (PH)', description: 'Holding a valid disability certificate as per UPTAC rules.' },
  { value: 'TFW', label: 'Tuition Fee Waiver (TFW)', description: 'Meeting the official TFW eligibility (family income) criteria.' },
]

export function PredictorForm({
  initial,
  branches,
  years,
  loading,
  serverErrors,
  onSubmit,
}: {
  initial: PredictorFormState
  branches: Branch[]
  years: CutoffYear[]
  loading: boolean
  serverErrors?: Record<string, string>
  onSubmit: (request: PredictionRequest, form: PredictorFormState) => void
}) {
  const [form, setForm] = useState<PredictorFormState>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [advanced, setAdvanced] = useState(Boolean(initial.categoryRank) || initial.years.length > 0)

  useEffect(() => setForm(initial), [initial])
  useEffect(() => {
    if (serverErrors) setErrors(serverErrors)
  }, [serverErrors])

  const availableYears = useMemo(() => years.map((y) => y.year).filter((y) => y <= form.admissionYear).sort((a, b) => b - a), [years, form.admissionYear])
  const admissionYears = useMemo(() => {
    const base = defaultAdmissionYear()
    return [base + 1, base, base - 1, base - 2, base - 3]
  }, [])

  const set = <K extends keyof PredictorFormState>(key: K, value: PredictorFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => {
      if (!e[key as string]) return e
      const next = { ...e }
      delete next[key as string]
      return next
    })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const result = validatePredictionRequest({
      ...form,
      categoryRank: form.categoryRank || null,
      years: form.years.length > 0 ? form.years : undefined,
    })
    if (!result.ok) {
      setErrors(result.errors)
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    setErrors({})
    onSubmit(result.value, form)
  }

  const isOtherState = form.domicile === 'OTHER'

  return (
    <form onSubmit={submit} noValidate className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="JEE Main CRL rank" required error={errors.crlRank} hint="Common Rank List (All India) rank from your JEE Main scorecard.">
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 45210"
              value={form.crlRank}
              onChange={(e) => set('crlRank', e.target.value.replace(/[^\d,]/g, ''))}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="text-base font-semibold"
            />
          )}
        </Field>
        <Field label="Admission year" required error={errors.admissionYear} hint="The counselling year you are applying in.">
          {({ id, describedBy, invalid }) => (
            <Select id={id} value={form.admissionYear} onChange={(e) => set('admissionYear', Number(e.target.value))} aria-describedby={describedBy} aria-invalid={invalid}>
              {admissionYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field label="Category" required error={errors.category}>
        {() => (
          <Segmented
            name="category"
            value={form.category}
            onChange={(v) => set('category', v)}
            invalid={Boolean(errors.category)}
            className="grid-cols-3! sm:grid-cols-5! lg:grid-cols-3!"
            options={[
              { value: 'OPEN', label: 'General' },
              { value: 'BC', label: 'OBC-NCL' },
              { value: 'SC', label: 'SC' },
              { value: 'ST', label: 'ST' },
              { value: 'EWS', label: 'EWS' },
            ]}
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Field label="Gender" required error={errors.gender}>
          {() => (
            <Segmented
              name="gender"
              value={form.gender}
              onChange={(v) => set('gender', v)}
              invalid={Boolean(errors.gender)}
              options={[
                { value: 'MALE', label: 'Male' },
                { value: 'FEMALE', label: 'Female' },
              ]}
            />
          )}
        </Field>
        <Field label="Domicile" required error={errors.domicile}>
          {() => (
            <Segmented
              name="domicile"
              value={form.domicile}
              onChange={(v) => set('domicile', v)}
              invalid={Boolean(errors.domicile)}
              options={[
                { value: 'UP', label: 'Uttar Pradesh' },
                { value: 'OTHER', label: 'Other State' },
              ]}
            />
          )}
        </Field>
      </div>

      {isOtherState && (form.category !== 'OPEN' && form.category !== '' || form.gender === 'FEMALE' || form.subCategories.length > 0) && (
        <Alert tone="info" title="Reservation applies only to UP domicile candidates">
          As per UPTAC rules, vertical (EWS, OBC-NCL, SC, ST) and horizontal (girls, AF, FF, PH) reservations and TFW seats are available only to
          candidates domiciled in Uttar Pradesh. You will be compared with OPEN seats only.
        </Alert>
      )}

      <fieldset>
        <legend className="text-sm font-medium text-navy-800">Applicable sub-category & quota</legend>
        <p className="mt-1 text-xs text-navy-500">
          Select only what you hold a valid certificate for. Quota: {form.domicile === 'UP' ? 'Home-state (UP) and all-India seats' : form.domicile === 'OTHER' ? 'All-India / state seats open to other-state candidates' : 'chosen automatically from your domicile'}.
          {form.gender === 'FEMALE' && form.domicile === 'UP' && ' Girl (GL) seats are included automatically.'}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {SUBCATS.map((s) => (
            <Checkbox
              key={s.value}
              label={s.label}
              description={s.description}
              checked={form.subCategories.includes(s.value)}
              disabled={isOtherState}
              onChange={(e) => set('subCategories', e.target.checked ? [...form.subCategories, s.value] : form.subCategories.filter((x) => x !== s.value))}
              className={cn('rounded-xl border border-navy-100 p-3', isOtherState && 'opacity-60')}
            />
          ))}
        </div>
      </fieldset>

      <Field label="College preference">
        {() => (
          <Segmented
            name="institutePreference"
            value={form.institutePreference}
            onChange={(v) => set('institutePreference', v)}
            options={[
              { value: 'government', label: 'Government' },
              { value: 'private', label: 'Private' },
              { value: 'both', label: 'Both' },
            ]}
          />
        )}
      </Field>

      <Field label="Preferred branches" error={errors.branchCodes} hint="Leave empty to see every branch you are eligible for.">
        {() => <BranchPicker branches={branches} value={form.branchCodes} onChange={(v) => set('branchCodes', v)} />}
      </Field>

      <div className="rounded-2xl border border-navy-100">
        <button type="button" onClick={() => setAdvanced((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-navy-800" aria-expanded={advanced}>
          Advanced options
          <ChevronDown className={cn('h-4 w-4 transition-transform', advanced && 'rotate-180')} aria-hidden />
        </button>
        {advanced && (
          <div className="space-y-5 border-t border-navy-100 p-4">
            <Field
              label="JEE Main category rank (optional)"
              error={errors.categoryRank}
              hint="Only compared with official records published as category ranks – never mixed with CRL ranks."
            >
              {({ id, describedBy, invalid }) => (
                <Input id={id} inputMode="numeric" value={form.categoryRank} onChange={(e) => set('categoryRank', e.target.value.replace(/[^\d,]/g, ''))} aria-describedby={describedBy} aria-invalid={invalid} />
              )}
            </Field>
            <fieldset>
              <legend className="text-sm font-medium text-navy-800">Compare with counselling years</legend>
              <p className="mt-1 text-xs text-navy-500">Default: the three most recent years with verified data up to {form.admissionYear}.</p>
              {availableYears.length === 0 ? (
                <p className="mt-2 text-sm text-navy-500">No verified years available yet.</p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-3">
                  {availableYears.map((y) => (
                    <Checkbox
                      key={y}
                      label={String(y)}
                      checked={form.years.includes(y)}
                      onChange={(e) => set('years', e.target.checked ? [...form.years, y].slice(-5) : form.years.filter((x) => x !== y))}
                      className="rounded-xl border border-navy-100 px-3 py-2"
                    />
                  ))}
                </div>
              )}
              {errors.years && <p className="mt-2 text-xs font-medium text-red-600">{errors.years}</p>}
            </fieldset>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" loading={loading} leftIcon={<Sparkles className="h-4.5 w-4.5" />} className="sm:min-w-56">
          {loading ? 'Comparing with official data…' : 'Find my colleges'}
        </Button>
        <p className="flex items-start gap-1.5 text-xs text-navy-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Results compare historical data only and never guarantee admission.
        </p>
      </div>
    </form>
  )
}
