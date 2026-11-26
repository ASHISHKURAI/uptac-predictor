import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T
  onChange: (v: T) => void
  tabs: Array<{ value: T; label: ReactNode; count?: number }>
  className?: string
}) {
  return (
    <div role="tablist" className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-navy-50 p-1', className)}>
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition',
              active ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500 hover:text-navy-800',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-xs tabular', active ? 'bg-royal-50 text-royal-700' : 'bg-navy-100 text-navy-600')}>
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
