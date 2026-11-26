import { useState } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Bell, CheckCheck, ExternalLink } from 'lucide-react'
import { listNotifications, markNotificationsRead } from '@/lib/api/admin'
import { useAuth } from '@/lib/auth'
import { cn, formatDate, timeAgo } from '@/lib/utils'
import type { AdminNotification } from '@/lib/types'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { Button } from '@/components/ui/Button'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Checkbox } from '@/components/ui/Form'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Table'
import { QueryError } from '@/components/common/ConfigNotice'
import { JsonView, useAdminMutation } from '@/components/admin/Misc'

const PAGE_SIZE = 20
const KIND: Record<AdminNotification['kind'], { label: string; tone: BadgeTone }> = {
  new_document: { label: 'New document', tone: 'amber' },
  changed_document: { label: 'Changed document', tone: 'amber' },
  changed_page: { label: 'Page changed', tone: 'violet' },
  import_ready: { label: 'Import ready', tone: 'green' },
  import_failed: { label: 'Import failed', tone: 'red' },
  system: { label: 'System', tone: 'neutral' },
}

export function NotificationsAdminPage() {
  const { user } = useAuth()
  const [unreadOnly, setUnreadOnly] = useState(true)
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['admin', 'notifications', unreadOnly, page],
    queryFn: () => listNotifications(page, PAGE_SIZE, unreadOnly),
    placeholderData: keepPreviousData,
  })
  const invalidate = [['admin', 'notifications'], ['admin', 'unread-notifications'], ['admin', 'stats']]
  const mark = useAdminMutation((ids: string[] | 'all') => markNotificationsRead(ids, user?.id ?? null), {
    success: (_r, ids) => (ids === 'all' ? 'All notifications marked as read' : 'Marked as read'),
    invalidate,
  })
  const rows = query.data?.rows ?? []

  return (
    <div>
      <AdminPageHeader
        title="Notifications"
        description="Alerts from the UPTAC monitor and the import pipeline."
        actions={
          <Button size="sm" variant="outline" leftIcon={<CheckCheck className="h-4 w-4" />} onClick={() => mark.mutate('all')} loading={mark.isPending && mark.variables === 'all'}>
            Mark all as read
          </Button>
        }
      />
      <div className="mb-4">
        <Checkbox
          label="Unread only"
          checked={unreadOnly}
          onChange={(e) => {
            setUnreadOnly(e.target.checked)
            setPage(1)
          }}
        />
      </div>
      {query.error ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title={unreadOnly ? 'You are all caught up' : 'No notifications yet'} description="New official documents and import results will appear here." />
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((n) => (
              <li key={n.id} className={cn('rounded-2xl border bg-white p-4 shadow-[var(--shadow-card)]', n.read_at ? 'border-navy-100' : 'border-royal-200 ring-1 ring-royal-100')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {!n.read_at && <span className="h-2 w-2 rounded-full bg-royal-600" aria-label="Unread" />}
                      <Badge tone={KIND[n.kind].tone}>{KIND[n.kind].label}</Badge>
                      <span className="text-xs text-navy-500" title={formatDate(n.created_at, true)}>
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 font-semibold text-navy-900">{n.title}</p>
                    {n.body && <p className="mt-1 whitespace-pre-line text-sm text-navy-600">{n.body}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      {n.link &&
                        (n.link.startsWith('/') ? (
                          <Link to={n.link} className="text-sm font-semibold text-royal-600 hover:underline">
                            Open
                          </Link>
                        ) : (
                          <a href={n.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-royal-600 hover:underline">
                            Open link <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ))}
                      <JsonView value={n.data} label="Data" />
                    </div>
                  </div>
                  {!n.read_at && (
                    <Button size="sm" variant="ghost" onClick={() => mark.mutate([n.id])} disabled={mark.isPending}>
                      Mark read
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination className="mt-4" page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </div>
  )
}
