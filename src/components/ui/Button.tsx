import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'white' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal-500 active:scale-[0.98] select-none'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-royal-600 text-white shadow-[0_8px_20px_-8px_rgb(42_75_224/0.7)] hover:bg-royal-700 hover:shadow-[0_12px_28px_-8px_rgb(42_75_224/0.75)] hover:-translate-y-px',
  secondary: 'bg-navy-900 text-white hover:bg-navy-800 hover:-translate-y-px',
  outline: 'border border-navy-200 bg-white text-navy-800 hover:border-royal-300 hover:bg-royal-50 hover:text-royal-700',
  ghost: 'text-navy-700 hover:bg-navy-50 hover:text-navy-900',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  white: 'bg-white text-navy-900 shadow-sm hover:bg-royal-50 hover:-translate-y-px',
  link: 'text-royal-600 underline-offset-4 hover:underline px-0 py-0 h-auto',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-base',
  icon: 'h-10 w-10 p-0',
}

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string): string {
  return cn(base, variants[variant], variant === 'link' ? '' : sizes[size], className)
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
})

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export function ButtonLink({ variant = 'primary', size = 'md', leftIcon, rightIcon, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {leftIcon}
      {children}
      {rightIcon}
    </Link>
  )
}
