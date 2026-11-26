import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type BadgeTone = 'neutral' | 'royal' | 'navy' | 'green' | 'amber' | 'red' | 'violet' | 'outline'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-navy-50 text-navy-700 ring-navy-200/70',
  royal: 'bg-royal-50 text-royal-700 ring-royal-200',
  navy: 'bg-navy-900 text-white ring-navy-900',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  outline: 'bg-white text-navy-700 ring-navy-200',
}

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap', tones[tone], className)}
      {...props}
    />
  )
}
