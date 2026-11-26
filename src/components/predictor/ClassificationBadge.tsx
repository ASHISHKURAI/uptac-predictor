import { CircleCheckBig, CircleDashed, CircleHelp, CircleMinus, CircleX } from 'lucide-react'
import { CLASSIFICATION_DESCRIPTIONS, CLASSIFICATION_LABELS, type Classification } from '@shared/prediction/index.ts'
import { cn } from '@/lib/utils'

/** Status meaning is always carried by icon + text, never colour alone. */
export const CLASSIFICATION_STYLE: Record<Classification, { className: string; dot: string; Icon: typeof CircleCheckBig }> = {
  WITHIN_RANGE: { className: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-[var(--color-band-range)]', Icon: CircleCheckBig },
  WITHIN_CLOSING: { className: 'bg-royal-50 text-royal-800 ring-royal-200', dot: 'bg-[var(--color-band-closing)]', Icon: CircleDashed },
  NEAR_CUTOFF: { className: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-[var(--color-band-near)]', Icon: CircleMinus },
  BEYOND_CUTOFF: { className: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-[var(--color-band-beyond)]', Icon: CircleX },
  INSUFFICIENT_DATA: { className: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-[var(--color-band-none)]', Icon: CircleHelp },
}

export function ClassificationBadge({ value, size = 'md', className }: { value: Classification; size?: 'sm' | 'md'; className?: string }) {
  const s = CLASSIFICATION_STYLE[value]
  return (
    <span
      title={CLASSIFICATION_DESCRIPTIONS[value]}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5 text-[0.7rem]' : 'px-2.5 py-1 text-xs',
        s.className,
        className,
      )}
    >
      <s.Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
      {CLASSIFICATION_LABELS[value]}
    </span>
  )
}
