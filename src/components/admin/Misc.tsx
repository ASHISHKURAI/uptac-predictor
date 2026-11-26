import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { errorMessage } from '@/lib/supabase'
import { cn, formatNumber } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

/** Compact KPI tile – label, value, optional hint and icon. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  loading,
}: {
  label: string
  value: number | string | null | undefined
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'attention'
  loading?: boolean
}) {
  return (
    <div className={cn('rounded-2xl border bg-white p-4 shadow-[var(--shadow-card)]', tone === 'attention' ? 'border-amber-200' : 'border-navy-100')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-navy-500">{label}</p>
        {icon && <span className="grid h-8 w-8 place-items-center rounded-lg bg-royal-50 text-royal-600">{icon}</span>}
      </div>
      {loading ? (
        <div className="skeleton mt-2 h-8 w-20 rounded-lg" aria-hidden />
      ) : (
        <p className="mt-1 font-display text-2xl font-bold text-navy-950 tabular">{typeof value === 'number' ? formatNumber(value) : (value ?? '—')}</p>
      )}
      {hint && <p className="mt-1 text-xs text-navy-500">{hint}</p>}
    </div>
  )
}

/** Collapsible pretty-printed JSON. */
export function JsonView({ value, label = 'Details', defaultOpen = false }: { value: unknown; label?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const empty = value === null || value === undefined || (typeof value === 'object' && Object.keys(value as object).length === 0)
  if (empty) return <span className="text-xs text-navy-400">—</span>
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-royal-600 hover:text-royal-700" aria-expanded={open}>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {label}
      </button>
      {open && (
        <pre className="mt-2 max-h-80 max-w-full overflow-auto rounded-xl bg-navy-950 p-3 text-[0.72rem] leading-relaxed text-navy-100">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  )
}

/**
 * Mutation with consistent success/error toasts and query invalidation.
 * `success` may be a string or a function of the result.
 */
export function useAdminMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  options: { success?: string | ((result: TResult, vars: TVars) => string); invalidate?: QueryKey[]; onSuccess?: (result: TResult, vars: TVars) => void } = {},
) {
  const toast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      for (const key of options.invalidate ?? []) await qc.invalidateQueries({ queryKey: key })
      if (options.success) toast.success(typeof options.success === 'function' ? options.success(result, vars) : options.success)
      options.onSuccess?.(result, vars)
    },
    onError: (error) => toast.error('Action failed', errorMessage(error)),
  })
}

/** Toolbar row for filters above tables. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6', className)}>{children}</div>
}

/** Row selection helper for bulk actions. */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  return {
    selected,
    has: (id: string) => selected.has(id),
    toggle: (id: string) =>
      setSelected((s) => {
        const next = new Set(s)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    setAll: (ids: string[], on: boolean) =>
      setSelected((s) => {
        const next = new Set(s)
        for (const id of ids) {
          if (on) next.add(id)
          else next.delete(id)
        }
        return next
      }),
    clear: () => setSelected(new Set()),
    ids: () => [...selected],
  }
}
