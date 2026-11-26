import { useState } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CircleCheck, RotateCcw, TriangleAlert } from 'lucide-react'
import { listErrorLogs, resolveErrorLog } from '@/lib/api/admin'
import { useAuth } from '@/lib/auth'
import { formatDate, timeAgo } from '@/lib/utils'
import type { ErrorLog } from '@/lib/types'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Checkbox, Select } from '@/components/ui/Form'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Pagination, Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'
import { QueryError } from '@/components/common/ConfigNotice'
import { JsonView, useAdminMutation } from '@/components/admin/Misc'

const PAGE_SIZE = 25
const SOURCES: ErrorLog['source'][] = ['import', 'monitor', 'predict', 'processor', 'client', 'database']
const LEVEL_TONE = { error: 'red', warning: 'amber', info: 'royal' } as const

export function ErrorLogsAdminPage() {
  const { user } = useAuth()
  const [source, setSource] = useState<ErrorLog['source'] | ''>('')
  const [level, setLevel] = useState<ErrorLog['level'] | ''>('')
  const [unresolvedOnly, setUnresolvedOnly] = useState(true)
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['admin', 'errors', source, level, unresolvedOnly, page],
    queryFn: () => listErrorLogs({ source, level, unresolvedOnly, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const resolve = useAdminMutation((v: { id: string; resolved: boolean }) => resolveErrorLog(v.id, user?.id ?? null, v.resolved), {
    success: (_r, v) => (v.resolved ? 'Marked as resolved' : 'Re-opened'),
    invalidate: [['admin', 'errors'], ['admin', 'stats']],
  })
  const rows = query.data?.rows ?? []

  return (
    <div>
      <AdminPageHeader title="Error logs" description="Failures from imports, the PDF processor, the UPTAC monitor and the prediction service." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          value={source}
          onChange={(e) => {
            setSource(e.target.value as ErrorLog['source'] | '')
            setPage(1)
          }}
          aria-label="Source"
          className="w-44"
        >
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value as ErrorLog['level'] | '')
            setPage(1)
          }}
          aria-label="Level"
          className="w-40"
        >
          <option value="">All levels</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </Select>
        <Checkbox
          label="Unresolved only"
          checked={unresolvedOnly}
          onChange={(e) => {
            setUnresolvedOnly(e.target.checked)
            setPage(1)
          }}
        />
      </div>
      {query.error ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<TriangleAlert className="h-6 w-6" />} title="No errors" description={unresolvedOnly ? 'Nothing needs attention.' : 'No errors have been logged.'} />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>When</Th>
                  <Th>Source</Th>
                  <Th>Level</Th>
                  <Th>Message</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((e) => (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap text-xs" title={formatDate(e.created_at, true)}>
                      {timeAgo(e.created_at)}
                    </Td>
                    <Td className="text-xs">{e.source}</Td>
                    <Td>
                      <Badge tone={LEVEL_TONE[e.level]}>{e.level}</Badge>
                    </Td>
                    <Td className="max-w-xl whitespace-normal">
                      <p className="text-sm text-navy-900">{e.message}</p>
                      {e.import_job_id && (
                        <Link to={`/admin/imports/${e.import_job_id}`} className="text-xs font-semibold text-royal-600 hover:underline">
                          Open import
                        </Link>
                      )}
                      <div className="mt-1">
                        <JsonView value={e.context} label="Context" />
                      </div>
                    </Td>
                    <Td className="text-xs">{e.resolved_at ? <span className="text-emerald-700">Resolved {timeAgo(e.resolved_at)}</span> : <span className="text-amber-700">Open</span>}</Td>
                    <Td className="text-right">
                      {e.resolved_at ? (
                        <Button size="sm" variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => resolve.mutate({ id: e.id, resolved: false })} disabled={resolve.isPending}>
                          Re-open
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" leftIcon={<CircleCheck className="h-4 w-4" />} onClick={() => resolve.mutate({ id: e.id, resolved: true })} disabled={resolve.isPending}>
                          Resolve
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination className="mt-4" page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </div>
  )
}
