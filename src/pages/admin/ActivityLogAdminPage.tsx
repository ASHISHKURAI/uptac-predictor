import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { fetchProfilesByIds, listAuditLogs } from '@/lib/api/admin'
import { formatDate, timeAgo } from '@/lib/utils'
import type { AuditLog } from '@/lib/types'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Form'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Pagination, Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'
import { QueryError } from '@/components/common/ConfigNotice'
import { JsonView } from '@/components/admin/Misc'

const PAGE_SIZE = 30
const ENTITIES = ['colleges', 'branches', 'cutoff_records', 'seat_matrix', 'college_fees', 'placement_records', 'data_sources', 'monitored_sources', 'import_jobs', 'profiles']
const ACTIONS = ['INSERT', 'UPDATE', 'DELETE', 'PUBLISH']
const ACTION_TONE: Record<string, BadgeTone> = { INSERT: 'green', UPDATE: 'royal', DELETE: 'red', PUBLISH: 'violet' }
const IGNORED_KEYS = new Set(['updated_at', 'created_at'])

/** Keys whose values differ between old and new row snapshots. */
function changedKeys(log: AuditLog): string[] {
  if (!log.old_data || !log.new_data) return []
  const keys = new Set([...Object.keys(log.old_data), ...Object.keys(log.new_data)])
  return [...keys].filter((k) => !IGNORED_KEYS.has(k) && JSON.stringify(log.old_data?.[k]) !== JSON.stringify(log.new_data?.[k]))
}

function display(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 80)}…` : v
  const s = JSON.stringify(v)
  return s.length > 80 ? `${s.slice(0, 80)}…` : s
}

export function ActivityLogAdminPage() {
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['admin', 'audit', entity, action, page],
    queryFn: () => listAuditLogs({ entityType: entity, action, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const actorIds = useMemo(() => [...new Set((query.data?.rows ?? []).map((r) => r.actor_id).filter(Boolean) as string[])], [query.data])
  const actors = useQuery({ queryKey: ['admin', 'audit-actors', actorIds], queryFn: () => fetchProfilesByIds(actorIds), enabled: actorIds.length > 0 })
  const actorName = (id: string | null) => {
    if (!id) return 'System / service'
    const p = actors.data?.find((a) => a.id === id)
    return p?.full_name || p?.email || `${id.slice(0, 8)}…`
  }
  const rows = query.data?.rows ?? []

  return (
    <div>
      <AdminPageHeader title="Activity log" description="Append-only record of every change to official data, roles and publishing actions – written automatically by database triggers." />
      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value)
            setPage(1)
          }}
          aria-label="Entity"
          className="w-56"
        >
          <option value="">All entities</option>
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Select>
        <Select
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(1)
          }}
          aria-label="Action"
          className="w-40"
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>
      {query.error ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ScrollText className="h-6 w-6" />} title="No activity" description="Changes made by administrators will be listed here." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>Changes</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((log) => {
                  const keys = changedKeys(log)
                  return (
                    <Tr key={log.id}>
                      <Td className="whitespace-nowrap text-xs" title={formatDate(log.created_at, true)}>
                        {timeAgo(log.created_at)}
                      </Td>
                      <Td className="text-sm">{actorName(log.actor_id)}</Td>
                      <Td>
                        <Badge tone={ACTION_TONE[log.action] ?? 'neutral'}>{log.action}</Badge>
                      </Td>
                      <Td className="text-xs">
                        <span className="font-semibold text-navy-800">{log.entity_type}</span>
                        {log.entity_id && <span className="block font-mono text-navy-500">{log.entity_id.slice(0, 12)}</span>}
                      </Td>
                      <Td className="max-w-2xl whitespace-normal text-xs">
                        {log.action === 'UPDATE' && keys.length > 0 ? (
                          <ul className="space-y-0.5">
                            {keys.slice(0, 8).map((k) => (
                              <li key={k}>
                                <span className="font-semibold text-navy-700">{k}</span>: <span className="text-red-700 line-through">{display(log.old_data?.[k])}</span> →{' '}
                                <span className="text-emerald-700">{display(log.new_data?.[k])}</span>
                              </li>
                            ))}
                            {keys.length > 8 && <li className="text-navy-500">+{keys.length - 8} more</li>}
                          </ul>
                        ) : log.action === 'PUBLISH' ? (
                          <JsonView value={log.details} label="Publish summary" defaultOpen />
                        ) : (
                          <JsonView value={log.new_data ?? log.old_data} label={log.action === 'DELETE' ? 'Deleted row' : 'Row'} />
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination className="mt-4" page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </div>
  )
}
