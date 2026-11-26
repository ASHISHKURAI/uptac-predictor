import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const control =
  'w-full rounded-xl border border-navy-200 bg-white px-3.5 text-sm text-navy-900 shadow-xs transition placeholder:text-navy-400 hover:border-navy-300 focus:border-royal-500 focus:outline-none focus:ring-4 focus:ring-royal-500/15 disabled:cursor-not-allowed disabled:bg-navy-50 disabled:text-navy-400 aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-red-500/10'

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
}

/** Label + control + hint/error wiring with correct aria attributes. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-navy-800">
          {label}
          {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
        </label>
      )}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-navy-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { leftIcon?: ReactNode }>(function Input(
  { className, leftIcon, ...props },
  ref,
) {
  if (!leftIcon) return <input ref={ref} className={cn(control, 'h-11', className)} {...props} />
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-navy-400">{leftIcon}</span>
      <input ref={ref} className={cn(control, 'h-11 pl-10', className)} {...props} />
    </div>
  )
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, 'h-11 appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" aria-hidden />
    </div>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-24 py-2.5', className)} {...props} />
})

export function Checkbox({
  label,
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId()
  return (
    <label htmlFor={props.id ?? id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl', className)}>
      <input
        id={props.id ?? id}
        type="checkbox"
        className="mt-0.5 h-4.5 w-4.5 shrink-0 cursor-pointer rounded border-navy-300 accent-royal-600"
        {...props}
      />
      <span className="text-sm">
        <span className="font-medium text-navy-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-navy-500">{description}</span>}
      </span>
    </label>
  )
}

/** Segmented single-choice control (radio group) – large touch targets. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  name,
  className,
  invalid,
}: {
  value: T | ''
  onChange: (value: T) => void
  options: Array<{ value: T; label: ReactNode; hint?: string }>
  name: string
  className?: string
  invalid?: boolean
}) {
  return (
    <div role="radiogroup" className={cn('grid gap-2', className)} style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 5)}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <label
            key={o.value}
            className={cn(
              'relative flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-semibold transition',
              active
                ? 'border-royal-500 bg-royal-50 text-royal-700 ring-4 ring-royal-500/10'
                : 'border-navy-200 bg-white text-navy-700 hover:border-navy-300 hover:bg-navy-50',
              invalid && !value && 'border-red-300',
            )}
            title={o.hint}
          >
            <input type="radio" name={name} value={o.value} checked={active} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        )
      })}
    </div>
  )
}
