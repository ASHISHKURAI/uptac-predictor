import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search, ShieldAlert, Users } from 'lucide-react'
import { listProfiles, setUserRole } from '@/lib/api/admin'
import { useAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { AppRole, Profile } from '@/lib/types'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Input, Select } from '@/components/ui/Form'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination, Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'
import { QueryError } from '@/components/common/ConfigNotice'
import { useAdminMutation } from '@/components/admin/Misc'

const PAGE_SIZE = 25
const ROLE: Record<AppRole, { label: string; tone: BadgeTone }> = {
  student: { label: 'Student', tone: 'neutral' },
  admin: { label: 'Admin', tone: 'royal' },
  super_admin: { label: 'Super admin', tone: 'violet' },
}

export function UsersAdminPage() {
  const { isSuperAdmin, user } = useAuth()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<AppRole | ''>('')
  const [page, setPage] = useState(1)
  const [pending, setPending] = useState<{ profile: Profile; role: AppRole } | null>(null)
  const query = useQuery({
    queryKey: ['admin', 'users', search, role, page],
    queryFn: () => listProfiles(search, role, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  })
  const change = useAdminMutation((v: { profile: Profile; role: AppRole }) => setUserRole(v.profile.id, v.role), {
    success: (_r, v) => `${v.profile.full_name || v.profile.email || 'User'} is now ${ROLE[v.role].label.toLowerCase()}`,
    invalidate: [['admin', 'users'], ['admin', 'stats']],
    onSuccess: () => setPending(null),
  })
  const rows = query.data?.rows ?? []

  const requestChange = (profile: Profile, next: AppRole) => {
    if (next === profile.role) return
    setPending({ profile, role: next })
  }

  return (
    <div>
      <AdminPageHeader title="Users & roles" description="Accounts registered on UPTAC Predictor. Only super admins can grant or revoke administrator access." />
      {!isSuperAdmin && (
        <Alert tone="info" title="Read-only" className="mb-4">
          You can view users, but only a super admin can change roles.
        </Alert>
      )}
      <Alert tone="warning" title="Bootstrapping the first super admin" className="mb-4">
        The first super admin is promoted once from the Supabase SQL editor (see <code className="font-mono text-xs">supabase/sql/bootstrap_super_admin.sql</code> and docs/DEPLOYMENT.md). After that, use this page. The
        database refuses role changes from anyone who is not a super admin and never allows removing the last super admin.
      </Alert>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Input
            leftIcon={<Search className="h-4 w-4" />}
            placeholder="Search name or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            aria-label="Search users"
          />
        </div>
        <Select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as AppRole | '')
            setPage(1)
          }}
          aria-label="Role"
        >
          <option value="">All roles</option>
          {Object.entries(ROLE).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </div>
      {query.error ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No users found" />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Joined</Th>
                  <Th>Change role</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium">
                      {p.full_name || <span className="text-navy-400">—</span>}
                      {p.id === user?.id && <span className="ml-2 text-xs text-navy-500">(you)</span>}
                    </Td>
                    <Td className="text-sm">{p.email ?? '—'}</Td>
                    <Td>
                      <Badge tone={ROLE[p.role].tone}>{ROLE[p.role].label}</Badge>
                    </Td>
                    <Td className="text-xs">{formatDate(p.created_at)}</Td>
                    <Td>
                      <Select
                        value={p.role}
                        disabled={!isSuperAdmin || change.isPending}
                        onChange={(e) => requestChange(p, e.target.value as AppRole)}
                        aria-label={`Role for ${p.full_name || p.email || 'user'}`}
                        className="h-9 w-40"
                      >
                        {Object.entries(ROLE).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </Select>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination className="mt-4" page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPage={setPage} />
        </>
      )}
      <ConfirmDialog
        open={Boolean(pending)}
        title="Change role?"
        tone={pending?.role === 'student' ? 'danger' : 'primary'}
        confirmLabel="Change role"
        loading={change.isPending}
        onClose={() => setPending(null)}
        onConfirm={() => pending && change.mutate(pending)}
        description={
          pending && (
            <div className="space-y-2">
              <p>
                Change <strong>{pending.profile.full_name || pending.profile.email}</strong> from {ROLE[pending.profile.role].label} to <strong>{ROLE[pending.role].label}</strong>?
              </p>
              {pending.role !== 'student' && (
                <p className="flex items-start gap-2 text-amber-800">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {pending.role === 'super_admin'
                    ? 'Super admins can manage all data and grant or revoke admin access for everyone.'
                    : 'Admins can upload documents, edit official data and publish verified records.'}
                </p>
              )}
            </div>
          )
        }
      />
    </div>
  )
}
