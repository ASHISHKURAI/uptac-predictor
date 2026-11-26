import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

type AlertTone = 'info' | 'success' | 'warning' | 'error'

const alertStyles: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: 'border-royal-200 bg-royal-50/70 text-navy-800', icon: <Info className="h-5 w-5 text-royal-600" aria-hidden /> },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: <CircleCheck className="h-5 w-5 text-emerald-600" aria-hidden /> },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: <TriangleAlert className="h-5 w-5 text-amber-600" aria-hidden /> },
  error: { box: 'border-red-200 bg-red-50 text-red-900', icon: <CircleAlert className="h-5 w-5 text-red-600" aria-hidden /> },
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const s = alertStyles[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-2xl border p-4 text-sm', s.box, className)}>
      <div className="shrink-0 pt-px">{s.icon}</div>
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed opacity-90">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  )
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-navy-500">
      <LoaderCircle className={cn('h-5 w-5 animate-spin text-royal-600', className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-sm text-navy-500">
        <LoaderCircle className="h-8 w-8 animate-spin text-royal-600" aria-hidden />
        {label}
      </div>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} aria-hidden />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-navy-200 bg-navy-50/40 px-6 py-12 text-center', className)}>
      {icon && <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white text-royal-600 shadow-sm ring-1 ring-navy-100">{icon}</div>}
      <h3 className="text-base font-semibold text-navy-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-navy-500">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
