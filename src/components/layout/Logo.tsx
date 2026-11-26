import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-9 w-9', className)} aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3d63f5" />
          <stop offset="1" stopColor="#0b1739" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-g)" />
      <path d="M14 26 32 17l18 9-18 9-18-9Z" fill="#fff" />
      <path d="M21 31v8c0 3 5 6 11 6s11-3 11-6v-8l-11 5.5L21 31Z" fill="#bfd0ff" />
      <path d="M48 27v11" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return (
    <Link to="/" className={cn('group inline-flex items-center gap-2.5', className)} aria-label="UPTAC Predictor home">
      <LogoMark className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105" />
      <span className="leading-none">
        <span className={cn('block font-display text-[1.05rem] font-extrabold tracking-tight', inverted ? 'text-white' : 'text-navy-900')}>
          UPTAC <span className={inverted ? 'text-royal-300' : 'text-royal-600'}>Predictor</span>
        </span>
        <span className={cn('mt-1 block text-[0.62rem] font-semibold uppercase tracking-[0.14em]', inverted ? 'text-navy-300' : 'text-navy-400')}>
          Rank · College · Future
        </span>
      </span>
    </Link>
  )
}
