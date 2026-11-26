import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'
import { Button } from './Button'

export function TableWrap({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('overflow-x-auto rounded-2xl border border-navy-100 bg-white', className)}>{children}</div>
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full min-w-max border-collapse text-left text-sm', className)} {...props} />
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('sticky top-0 z-10 bg-navy-50/95 backdrop-blur', className)} {...props} />
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn('border-b border-navy-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-navy-500', className)}
      {...props}
    />
  )
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-navy-100/70 px-4 py-3 align-top text-navy-800', className)} {...props} />
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-royal-50/40', className)} {...props} />
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  className,
}: {
  page: number
  pageSize: number
  total: number | null
  onPage: (page: number) => void
  className?: string
}) {
  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = total === null ? page * pageSize : Math.min(page * pageSize, total)
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 text-sm text-navy-600', className)}>
      <p>
        {total === null ? `Rows ${formatNumber(from)}–${formatNumber(to)}` : `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)}`}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} leftIcon={<ChevronLeft className="h-4 w-4" />}>
          Previous
        </Button>
        <span className="tabular px-1">
          {page}
          {totalPages ? ` / ${totalPages}` : ''}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(page + 1)}
          disabled={totalPages !== null && page >= totalPages}
          rightIcon={<ChevronRight className="h-4 w-4" />}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
