import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { EmptyState, PageLoader } from '@/components/ui/Feedback'
import { ButtonLink } from '@/components/ui/Button'
import { ConfigNotice } from './ConfigNotice'

/** Requires a signed-in user. (Real protection is enforced by RLS on the server.) */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { configured, loading, user } = useAuth()
  const location = useLocation()
  if (!configured) return <div className="container-page py-16"><ConfigNotice /></div>
  if (loading) return <PageLoader />
  if (!user) return <Navigate to={`/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <>{children}</>
}

/** Requires an admin role. UI gate only – every admin action is re-checked by RLS / RPCs. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { configured, loading, user, profile, isAdmin } = useAuth()
  const location = useLocation()
  if (!configured) return <div className="container-page py-16"><ConfigNotice /></div>
  if (loading || (user && !profile)) return <PageLoader label="Checking permissions…" />
  if (!user) return <Navigate to={`/auth/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (!isAdmin) {
    return (
      <div className="container-page py-20">
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="Administrator access required"
          description="Your account does not have permission to open the admin panel. Ask a super admin to grant you the admin role."
          action={<ButtonLink to="/">Back to home</ButtonLink>}
        />
      </div>
    )
  }
  return <>{children}</>
}
