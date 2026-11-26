import { useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { Branch, College } from '@/lib/types'
import { cn, instituteTypeLabel, prettyName } from '@/lib/utils'
import { Input } from '@/components/ui/Form'

/** Multi-select of canonical branches, grouped by discipline, with search. */
export function BranchPicker({
  branches,
  value,
  onChange,
  max = 80,
}: {
  branches: Branch[]
  value: string[]
  onChange: (codes: string[]) => void
  max?: number
}) {
  const [q, setQ] = useState('')
  const selected = new Set(value)
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    const map = new Map<string, Branch[]>()
    for (const b of branches) {
      if (term && !`${b.name} ${b.short_name ?? ''} ${b.code}`.toLowerCase().includes(term)) continue
      const g = b.discipline ?? 'Other'
      map.set(g, [...(map.get(g) ?? []), b])
    }
    return [...map.entries()]
  }, [branches, q])

  const toggle = (code: string) => {
    if (selected.has(code)) onChange(value.filter((c) => c !== code))
    else if (value.length < max) onChange([...value, code])
  }
  const toggleGroup = (codes: string[]) => {
    const allOn = codes.every((c) => selected.has(c))
    if (allOn) onChange(value.filter((c) => !codes.includes(c)))
    else onChange([...new Set([...value, ...codes])].slice(0, max))
  }

  return (
    <div className="rounded-2xl border border-navy-200 bg-white">
      <div className="border-b border-navy-100 p-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search branches…" leftIcon={<Search className="h-4 w-4" />} aria-label="Search branches" />
        {value.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {value.map((code) => {
              const b = branches.find((x) => x.code === code)
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggle(code)}
                  className="inline-flex items-center gap-1 rounded-full bg-royal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-royal-700"
                  aria-label={`Remove ${b?.name ?? code}`}
                >
                  {b?.short_name ?? code}
                  <X className="h-3 w-3" aria-hidden />
                </button>
              )
            })}
            <button type="button" onClick={() => onChange([])} className="px-2 text-xs font-semibold text-navy-500 hover:text-navy-800">
              Clear all
            </button>
          </div>
        )}
      </div>
      <div className="max-h-72 overflow-y-auto p-2">
        {groups.length === 0 && <p className="p-4 text-center text-sm text-navy-500">No branches match “{q}”.</p>}
        {groups.map(([group, list]) => (
          <div key={group} className="mb-2">
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-xs font-bold uppercase tracking-wide text-navy-400">{group}</p>
              <button type="button" onClick={() => toggleGroup(list.map((b) => b.code))} className="text-xs font-semibold text-royal-600 hover:underline">
                {list.every((b) => selected.has(b.code)) ? 'Unselect group' : 'Select group'}
              </button>
            </div>
            <ul>
              {list.map((b) => {
                const on = selected.has(b.code)
                return (
                  <li key={b.code}>
                    <button
                      type="button"
                      onClick={() => toggle(b.code)}
                      aria-pressed={on}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition',
                        on ? 'bg-royal-50 text-royal-800' : 'text-navy-700 hover:bg-navy-50',
                      )}
                    >
                      <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border', on ? 'border-royal-600 bg-royal-600 text-white' : 'border-navy-300')}>
                        {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                      </span>
                      <span className="flex-1">{b.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

type CollegeLite = Pick<College, 'code' | 'name' | 'short_name' | 'institute_type' | 'district' | 'city'>

/** Searchable college combobox over the (lightweight) directory. */
export function CollegeSearch({
  colleges,
  onSelect,
  exclude = [],
  placeholder = 'Search by college name, code or city…',
}: {
  colleges: CollegeLite[]
  onSelect: (c: CollegeLite) => void
  exclude?: string[]
  placeholder?: string
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) return []
    return colleges
      .filter((c) => !exclude.includes(c.code) && `${c.name} ${c.short_name ?? ''} ${c.code} ${c.city ?? ''} ${c.district ?? ''}`.toLowerCase().includes(term))
      .slice(0, 12)
  }, [colleges, q, exclude])

  return (
    <div className="relative">
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        leftIcon={<Search className="h-4 w-4" />}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-autocomplete="list"
        aria-label="Search colleges"
      />
      {open && q.trim().length >= 2 && (
        <ul role="listbox" className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-navy-100 bg-white p-1.5 shadow-xl">
          {results.length === 0 && <li className="px-3 py-3 text-sm text-navy-500">No colleges found.</li>}
          {results.map((c) => (
            <li key={c.code} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(c)
                  setQ('')
                  setOpen(false)
                }}
                className="flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left hover:bg-royal-50"
              >
                <span className="text-sm font-semibold text-navy-900">{c.short_name ?? prettyName(c.name)}</span>
                <span className="text-xs text-navy-500">
                  Code {c.code} · {instituteTypeLabel(c.institute_type)} · {c.district ?? c.city ?? '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
