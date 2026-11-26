import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Bell,
  Building2,
  Database,
  FileSpreadsheet,
  FileUp,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Radar,
  ScrollText,
  Table2,
  TriangleAlert,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { db } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { ScrollToTop } from './PublicLayout'
import { Seo } from '@/components/common/Seo'

export const ADMIN_NAV = [
  { group: 'Overview', items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    group: 'Official data',
    items: [
      { to: '/admin/colleges', label: 'Colleges', icon: Building2 },
      { to: '/admin/branches', label: 'Branches', icon: GitBranch },
      { to: '/admin/cutoffs', label: 'Cutoff records', icon: Table2 },
      { to: '/admin/seat-matrix', label: 'Seat matrix', icon: FileSpreadsheet },
      { to: '/admin/fees-placements', label: 'Fees & placements', icon: Wallet },
    ],
  },
  {
    group: 'Import pipeline',
    items: [
      { to: '/admin/imports', label: 'Document imports', icon: FileUp },
      { to: '/admin/sources', label: 'Data sources', icon: Database },
      { to: '/admin/monitoring', label: 'UPTAC monitoring', icon: Radar },
    ],
  },
  {
    group: 'System',
    items: [
      { to: '/admin/notifications', label: 'Notifications', icon: Bell, badge: 'notifications' as const },
      { to: '/admin/errors', label: 'Error logs', icon: TriangleAlert },
      { to: '/admin/activity', label: 'Activity log', icon: ScrollText },
      { to: '/admin/users', label: 'Users & roles', icon: Users },
    ],
  },
]

function useUnreadCount() {
  return useQuery({
    queryKey: ['admin', 'unread-notifications'],
    queryFn: async () => {
      const { count, error } = await db().from('admin_notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
    refetchInterval: 60_000,
  })
}

export function AdminLayout() {
  const [open, setOpen] = useState(false)
  const { profile, signOut } = useAuth()
  const unread = useUnreadCount()
  const location = useLocation()

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-6 px-3 py-5">
      {ADMIN_NAV.map((g) => (
        <div key={g.group}>
          <p className="px-3 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-navy-400">{g.group}</p>
          <ul className="mt-2 space-y-0.5">
            {g.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                      isActive ? 'bg-white/10 text-white shadow-inner' : 'text-navy-300 hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {'badge' in item && (unread.data ?? 0) > 0 && (
                    <span className="rounded-full bg-royal-500 px-2 py-0.5 text-[0.68rem] font-bold text-white tabular">{unread.data}</span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="min-h-dvh bg-navy-50/60">
      <Seo title="Admin" noindex />
      <ScrollToTop />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-navy-950 lg:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <Logo inverted />
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <AdminUserCard name={profile?.full_name ?? profile?.email ?? 'Admin'} role={profile?.role ?? 'admin'} onSignOut={signOut} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-fade-in flex-col bg-navy-950">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
              <Logo inverted />
              <button type="button" onClick={() => setOpen(false)} className="text-navy-300 hover:text-white" aria-label="Close menu">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            <AdminUserCard name={profile?.full_name ?? profile?.email ?? 'Admin'} role={profile?.role ?? 'admin'} onSignOut={signOut} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-navy-100 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl text-navy-700 hover:bg-navy-50 lg:hidden" onClick={() => setOpen(true)} aria-label="Open admin menu">
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-navy-500">
            <Activity className="h-4 w-4 text-royal-600" aria-hidden />
            <span className="truncate">Admin · {location.pathname.replace('/admin', '') || '/dashboard'}</span>
          </div>
          <NavLink to="/" className="text-sm font-semibold text-royal-600 hover:text-royal-700">
            View site →
          </NavLink>
        </header>
        <main id="main" className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function AdminUserCard({ name, role, onSignOut }: { name: string; role: string; onSignOut: () => Promise<void> }) {
  return (
    <div className="border-t border-white/10 p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-royal-600 text-sm font-bold text-white">{name.charAt(0).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <p className="text-xs capitalize text-navy-400">{role.replace('_', ' ')}</p>
        </div>
        <button type="button" onClick={() => void onSignOut()} className="text-navy-400 hover:text-white" aria-label="Sign out">
          <LogOut className="h-4.5 w-4.5" />
        </button>
      </div>
    </div>
  )
}

/** Standard admin page header. */
export function AdminPageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-950">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-navy-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
