import { useState } from 'react'
import { saveBranch, type BranchInput } from '@/lib/api/admin'
import type { Branch } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { useAdminMutation } from './Misc'
import { TextareaField, TextField } from './Fields'

const KEY = ['admin', 'branches']
export const BRANCH_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,29}$/

/** Suggests an uppercase branch code from a programme name (admin can edit). */
export function suggestBranchCode(name: string): string {
  const words = name
    .replace(/&/g, ' and ')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w && !['and', 'of', 'the', 'in', 'for'].includes(w.toLowerCase()))
  const code = words.map((w) => w[0]).join('').toUpperCase()
  return code.slice(0, 12) || 'BR'
}

export function BranchFormModal({
  branch,
  onClose,
  initialName,
  onCreated,
}: {
  branch: Branch | null
  onClose: () => void
  initialName?: string
  onCreated?: (b: Branch) => void
}) {
  const [form, setForm] = useState(() => ({
    code: branch?.code ?? (initialName ? suggestBranchCode(initialName) : ''),
    name: branch?.name ?? initialName ?? '',
    short_name: branch?.short_name ?? '',
    discipline: branch?.discipline ?? '',
    aliases: (branch?.aliases ?? []).join('\n'),
    degree: branch?.degree ?? 'B.Tech',
    duration_years: String(branch?.duration_years ?? 4),
    is_active: branch?.is_active ?? true,
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = useAdminMutation((input: BranchInput) => saveBranch(input, branch?.id), {
    success: branch ? 'Branch saved' : 'Branch created',
    invalidate: [KEY, ['branches']],
    onSuccess: (b) => {
      onCreated?.(b)
      onClose()
    },
  })

  const submit = () => {
    const e: Record<string, string> = {}
    const code = form.code.trim().toUpperCase()
    if (!BRANCH_CODE_PATTERN.test(code)) e.code = 'Uppercase letters, digits and hyphens (max 30), e.g. CSE-AIML.'
    if (form.name.trim().length < 2) e.name = 'Enter the branch name.'
    const duration = Number(form.duration_years)
    if (!Number.isInteger(duration) || duration < 1 || duration > 6) e.duration_years = 'Duration must be 1–6 years.'
    if (form.short_name.length > 40) e.short_name = 'Maximum 40 characters.'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    save.mutate({
      code,
      name: form.name.trim(),
      short_name: form.short_name.trim() || null,
      discipline: form.discipline.trim() || null,
      aliases: [...new Set(form.aliases.split(/[\n,]/).map((a) => a.trim()).filter(Boolean))],
      degree: form.degree.trim() || 'B.Tech',
      duration_years: duration,
      is_active: form.is_active,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={branch ? `Edit ${branch.code}` : 'Add branch'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {branch ? 'Save changes' : 'Create branch'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <TextField label="Code" required value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} error={errors.code} hint="Changing a code cascades to all records." />
        <TextField label="Short name" value={form.short_name} onChange={(e) => set('short_name', e.target.value)} error={errors.short_name} />
        <TextField label="Name" required className="sm:col-span-2" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <TextField label="Discipline group" value={form.discipline} onChange={(e) => set('discipline', e.target.value)} hint="e.g. Computer Science & IT" />
        <TextField label="Degree" value={form.degree} onChange={(e) => set('degree', e.target.value)} />
        <TextField label="Duration (years)" value={form.duration_years} onChange={(e) => set('duration_years', e.target.value)} error={errors.duration_years} inputMode="numeric" />
        <div className="flex items-end pb-2">
          <Checkbox label="Active" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
        </div>
        <TextareaField
          label="Aliases"
          className="sm:col-span-2"
          value={form.aliases}
          onChange={(e) => set('aliases', e.target.value)}
          hint="Official programme spellings (one per line). Shift / (FW) suffixes are stripped automatically."
        />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}
