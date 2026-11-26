import { useEffect, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router'
import { SiteHeader } from './SiteHeader'
import { SiteFooter } from './SiteFooter'

export function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    window.scrollTo({ top: 0 })
  }, [pathname, hash])
  return null
}

export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <SiteHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}

/** Consistent page heading block for inner pages. */
export function PageHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <section className="relative overflow-hidden border-b border-navy-100 bg-gradient-to-b from-royal-50/70 via-white to-white">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
      <div className="container-page relative py-10 sm:py-14">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.16em] text-royal-600">{eyebrow}</p>}
        <h1 className="mt-2 max-w-3xl text-3xl font-extrabold text-navy-950 sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-base leading-relaxed text-navy-600">{description}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  )
}
