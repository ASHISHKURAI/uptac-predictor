import { useQuery } from '@tanstack/react-query'
import {
  Bell,
  Building2,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  FileUp,
  GitBranch,
  Radar,
  ShieldCheck,
  Sparkles,
  Table2,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { fetchAdminStats } from '@/lib/api/admin'
import { formatDate, formatNumber, timeAgo } from '@/lib/utils'
import type { ImportStatus } from '@/lib/types'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { QueryError } from '@/components/common/ConfigNotice'
import { StatTile } from '@/components/admin/Misc'
import { ImportStatusBadge } from '@/components/admin/Badges'
import { PredictionsByDayChart, RecordsByYearChart } from '@/components/admin/AdminCharts'

const IMPORT_ORDER: ImportStatus[] = ['uploaded', 'queued', 'processing', 'in_review', 'publishing', 'published', 'failed', 'cancelled']

export function AdminDashboardPage() {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: fetchAdminStats, refetchInterval: 60_000 })
  const s = stats.data
  const loading = stats.isLoading

  const hasRecords = (s?.records_by_year ?? []).some((r) => r.cutoffs > 0 || r.seat_rows > 0)
  const hasPredictions = (s?.predictions_by_day ?? []).some((r) => r.count > 0)

  return (
    <div>
      <AdminPageHeader
        title="Dashboard"
        description="Health of the official data pipeline and platform usage. All figures are computed live from the database."
        actions={
          <>
            <ButtonLink to="/admin/monitoring" variant="outline" size="sm" leftIcon={<Radar className="h-4 w-4" />}>
              Run monitor
            </ButtonLink>
            <ButtonLink to="/admin/imports" size="sm" leftIcon={<FileUp className="h-4 w-4" />}>
              Upload document
            </ButtonLink>
          </>
        }
      />

      {stats.error && <QueryError error={stats.error} onRetry={() => void stats.refetch()} />}

      {s && s.cutoffs_verified === 0 && (
        <Alert tone="info" title="No verified cutoff data yet" className="mb-6">
          Upload an official UPTAC opening & closing rank document (PDF, CSV or Excel) under <strong>Document imports</strong>, review the extracted rows and
          publish them. The student predictor only uses verified records.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Colleges" value={s?.colleges} loading={loading} icon={<Building2 className="h-4 w-4" />} />
        <StatTile label="Branches" value={s?.branches} loading={loading} icon={<GitBranch className="h-4 w-4" />} />
        <StatTile
          label="Verified cutoffs"
          value={s?.cutoffs_verified}
          loading={loading}
          icon={<ShieldCheck className="h-4 w-4" />}
          hint={s && s.cutoffs_pending > 0 ? `${formatNumber(s.cutoffs_pending)} pending` : undefined}
        />
        <StatTile label="Seat-matrix rows" value={s?.seat_matrix_verified} loading={loading} icon={<FileSpreadsheet className="h-4 w-4" />} />
        <StatTile
          label="Rows awaiting review"
          value={s?.staging_pending}
          loading={loading}
          icon={<ClipboardCheck className="h-4 w-4" />}
          tone={(s?.staging_pending ?? 0) > 0 ? 'attention' : 'default'}
        />
        <StatTile label="Users" value={s?.users} loading={loading} icon={<Users className="h-4 w-4" />} hint={s ? `${formatNumber(s.admins)} admins` : undefined} />
        <StatTile label="Predictions (30 days)" value={s?.predictions_30d} loading={loading} icon={<Sparkles className="h-4 w-4" />} />
        <StatTile
          label="Unread notifications"
          value={s?.unread_notifications}
          loading={loading}
          icon={<Bell className="h-4 w-4" />}
          tone={(s?.unread_notifications ?? 0) > 0 ? 'attention' : 'default'}
        />
        <StatTile
          label="Open errors"
          value={s?.open_errors}
          loading={loading}
          icon={<TriangleAlert className="h-4 w-4" />}
          tone={(s?.open_errors ?? 0) > 0 ? 'attention' : 'default'}
        />
        <StatTile
          label="New sources to review"
          value={s?.sources_discovered}
          loading={loading}
          icon={<Database className="h-4 w-4" />}
          tone={(s?.sources_discovered ?? 0) > 0 ? 'attention' : 'default'}
          hint={s ? `${formatNumber(s.data_sources)} sources total` : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Verified records by year" description="Cutoff records and seat-matrix rows published per academic year" icon={<Table2 className="h-4 w-4" />} />
          <CardBody>
            {loading ? (
              <div className="skeleton h-64 rounded-xl" />
            ) : hasRecords ? (
              <RecordsByYearChart data={s?.records_by_year ?? []} />
            ) : (
              <EmptyState title="No published records yet" description="Publish an import to see records per academic year." />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Predictions per day" description="Student predictions run in the last 30 days" icon={<Sparkles className="h-4 w-4" />} />
          <CardBody>
            {loading ? (
              <div className="skeleton h-64 rounded-xl" />
            ) : hasPredictions ? (
              <PredictionsByDayChart data={s?.predictions_by_day ?? []} />
            ) : (
              <EmptyState title="No predictions in the last 30 days" description="Usage will appear here once students run the predictor." />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Import jobs"
            description="Documents by processing status"
            icon={<FileUp className="h-4 w-4" />}
            action={
              <ButtonLink to="/admin/imports" variant="outline" size="sm">
                Review imports
              </ButtonLink>
            }
          />
          <CardBody>
            {loading ? (
              <div className="skeleton h-16 rounded-xl" />
            ) : Object.keys(s?.imports_by_status ?? {}).length === 0 ? (
              <p className="text-sm text-navy-500">No documents have been imported yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-3">
                {IMPORT_ORDER.filter((k) => (s?.imports_by_status?.[k] ?? 0) > 0).map((k) => (
                  <li key={k} className="flex items-center gap-2 rounded-xl border border-navy-100 px-3 py-2">
                    <ImportStatusBadge status={k} />
                    <span className="font-display text-lg font-bold text-navy-900 tabular">{formatNumber(s?.imports_by_status?.[k] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Last monitor run" icon={<Radar className="h-4 w-4" />} />
          <CardBody>
            {loading ? (
              <div className="skeleton h-16 rounded-xl" />
            ) : s?.last_monitor_run ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-navy-500">Status</dt>
                  <dd>
                    <Badge tone={s.last_monitor_run.status === 'success' ? 'green' : s.last_monitor_run.status === 'failed' ? 'red' : 'amber'}>
                      {s.last_monitor_run.status}
                    </Badge>
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-navy-500">Started</dt>
                  <dd title={formatDate(s.last_monitor_run.started_at, true)}>{timeAgo(s.last_monitor_run.started_at)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-navy-500">New documents</dt>
                  <dd className="font-semibold tabular">{formatNumber(s.last_monitor_run.new_documents)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-navy-500">Changed pages</dt>
                  <dd className="font-semibold tabular">{formatNumber(s.last_monitor_run.changed_pages)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-navy-500">The monitor has not run yet. Schedule it with pg_cron or run it manually.</p>
            )}
            <ButtonLink to="/admin/monitoring" variant="outline" size="sm" className="mt-4 w-full">
              Open monitoring
            </ButtonLink>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
