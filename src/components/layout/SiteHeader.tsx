import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { LayoutDashboard, LogIn, Menu, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { ButtonLink } from '@/components/ui/Button'
import { Logo } from './Logo'

export const NAV_ITEMS = [
  { to: '/predictor', label: 'Rank Predictor' },
  { to: '/colleges', label: 'Colleges' },
  { to: '/cutoffs', label: 'Cutoff Explorer' },
  { to: '/compare', label: 'Compare' },
  { to: '/choice-filling', label: 'Choice Filling' },
]

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { user, isAdmin } = useAuth()
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setOpen(false), [location.pathname])

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-300',
        scrolled || open ? 'border-b border-navy-100/80 bg-white/85 shadow-[0_6px_24px_-12px_rgb(11_23_57/0.18)] backdrop-blur-xl' : 'bg-transparent',
      )}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>
      <div className="container-page flex h-16 items-center justify-between gap-4 lg:h-[4.5rem]">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                  isActive ? 'text-royal-700' : 'text-navy-600 hover:text-navy-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  <span
                    className={cn(
                      'absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-royal-600 transition-transform duration-300',
                      isActive ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {isAdmin && (
            <ButtonLink to="/admin" variant="ghost" size="sm" leftIcon={<ShieldCheck className="h-4 w-4" />}>
              Admin
            </ButtonLink>
          )}
          {user ? (
            <ButtonLink to="/dashboard" variant="outline" size="sm" leftIcon={<LayoutDashboard className="h-4 w-4" />}>
              Dashboard
            </ButtonLink>
          ) : (
            <ButtonLink to="/auth/login" variant="ghost" size="sm" leftIcon={<LogIn className="h-4 w-4" />}>
              Sign in
            </ButtonLink>
          )}
          <ButtonLink to="/predictor" size="sm">
            Start Predicting
          </ButtonLink>
        </div>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-xl text-navy-700 hover:bg-navy-50 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="animate-fade-in border-t border-navy-100 bg-white lg:hidden">
          <nav aria-label="Mobile" className="container-page flex flex-col gap-1 py-4">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn('rounded-xl px-4 py-3 text-base font-semibold', isActive ? 'bg-royal-50 text-royal-700' : 'text-navy-700 hover:bg-navy-50')
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-navy-100 pt-4">
              {user ? (
                <ButtonLink to="/dashboard" variant="outline">
                  Dashboard
                </ButtonLink>
              ) : (
                <ButtonLink to="/auth/login" variant="outline">
                  Sign in
                </ButtonLink>
              )}
              <ButtonLink to="/predictor">Start Predicting</ButtonLink>
              {isAdmin && (
                <ButtonLink to="/admin" variant="ghost" className="col-span-2">
                  Admin panel
                </ButtonLink>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
