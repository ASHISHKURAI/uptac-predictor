import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { useBranches, useCollegesLite } from '@/hooks/useCatalog'
import { listSourceOptions } from '@/lib/api/admin'
import { cn, prettyName } from '@/lib/utils'
import { Field, Select } from '@/components/ui/Form'

export interface ComboOption {
  value: string
  label: string
  sublabel?: string
}

/** Accessible searchable single-select (combobox) for long lists. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  loading,
  invalid,
  id,
  describedBy,
  disabled,
}: {
  value: string | null
  onChange: (value: string) => void
  options: ComboOption[]
  placeholder?: string
  loading?: boolean
  invalid?: boolean
  id?: string
  describedBy?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value) ?? null
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => `${o.value} ${o.label} ${o.sublabel ?? ''}`.toLowerCase().includes(q)) : options
    return list.slice(0, 60)
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const choose = (o: ComboOption) => {
    onChange(o.value)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" aria-hidden />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={describedBy}
          aria-invalid={invalid}
          disabled={disabled}
          className={cn(
            'h-11 w-full rounded-xl border border-navy-200 bg-white pl-9 pr-9 text-sm text-navy-900 placeholder:text-navy-400 hover:border-navy-300 focus:border-royal-500 focus:outline-none focus:ring-4 focus:ring-royal-500/15 disabled:bg-navy-50',
            invalid && 'border-red-400',
          )}
          placeholder={selected ? `${selected.value} · ${selected.label}` : placeholder}
          value={open ? query : selected ? `${selected.value} · ${selected.label}` : ''}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setActive((a) => Math.min(a + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter' && open && filtered[active]) {
              e.preventDefault()
              choose(filtered[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
        <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" aria-hidden />
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-navy-100 bg-white py-1 shadow-xl">
          {loading && <li className="px-3 py-2 text-sm text-navy-500">Loading…</li>}
          {!loading && filtered.length === 0 && <li className="px-3 py-2 text-sm text-navy-500">No matches</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(o)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-start gap-2 px-3 py-2 text-sm', i === active ? 'bg-royal-50' : '')}
            >
              <Check className={cn('mt-0.5 h-4 w-4 shrink-0 text-royal-600', o.value === value ? 'opacity-100' : 'opacity-0')} aria-hidden />
              <span className="min-w-0">
                <span className="font-mono text-xs font-semibold text-navy-500">{o.value}</span>{' '}
                <span className="text-navy-900">{o.label}</span>
                {o.sublabel && <span className="block text-xs text-navy-500">{o.sublabel}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CollegePicker({
  label = 'College',
  value,
  onChange,
  error,
  required,
  hint,
}: {
  label?: string
  value: string | null
  onChange: (code: string) => void
  error?: string | null
  required?: boolean
  hint?: string
}) {
  const colleges = useCollegesLite()
  const options = useMemo<ComboOption[]>(
    () =>
      (colleges.data ?? []).map((c) => ({
        value: c.code,
        label: prettyName(c.short_name || c.name),
        sublabel: [c.city, c.district].filter(Boolean).join(' · ') || undefined,
      })),
    [colleges.data],
  )
  return (
    <Field label={label} error={error} required={required} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <Combobox id={id} describedBy={describedBy} invalid={invalid} value={value} onChange={onChange} options={options} loading={colleges.isLoading} placeholder="Search by name or code…" />
      )}
    </Field>
  )
}

export function BranchPicker({
  label = 'Branch',
  value,
  onChange,
  error,
  required,
  hint,
}: {
  label?: string
  value: string | null
  onChange: (code: string) => void
  error?: string | null
  required?: boolean
  hint?: string
}) {
  const branches = useBranches()
  const options = useMemo<ComboOption[]>(
    () => (branches.data ?? []).map((b) => ({ value: b.code, label: b.name, sublabel: b.discipline ?? undefined })),
    [branches.data],
  )
  return (
    <Field label={label} error={error} required={required} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <Combobox id={id} describedBy={describedBy} invalid={invalid} value={value} onChange={onChange} options={options} loading={branches.isLoading} placeholder="Search branches…" />
      )}
    </Field>
  )
}

export function useSourceOptions() {
  return useQuery({ queryKey: ['admin', 'source-options'], queryFn: listSourceOptions, staleTime: 60_000 })
}

export function SourceSelect({
  value,
  onChange,
  error,
  required,
  label = 'Source document',
  hint,
}: {
  value: string | null
  onChange: (id: string) => void
  error?: string | null
  required?: boolean
  label?: string
  hint?: string
}) {
  const sources = useSourceOptions()
  return (
    <Field label={label} error={error} required={required} hint={hint ?? 'Every record must cite the official document it comes from.'}>
      {({ id, describedBy, invalid }) => (
        <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{sources.isLoading ? 'Loading sources…' : 'Select a data source'}</option>
          {(sources.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.academic_year ? `${s.academic_year} · ` : ''}
              {s.title}
            </option>
          ))}
        </Select>
      )}
    </Field>
  )
}
