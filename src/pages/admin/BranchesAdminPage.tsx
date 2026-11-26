import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitBranch, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { deleteBranch, listBranchesAdmin } from '@/lib/api/admin'
import type { Branch } from '@/lib/types'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Form'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'
import { QueryError } from '@/components/common/ConfigNotice'
import { useAdminMutation } from '@/components/admin/Misc'
import { BranchFormModal } from '@/components/admin/BranchFormModal'

const KEY = ['admin', 'branches']

export function BranchesAdminPage() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Branch | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Branch | null>(null)
  const query = useQuery({ queryKey: [...KEY, search], queryFn: () => listBranchesAdmin(search) })

  const remove = useAdminMutation((b: Branch) => deleteBranch(b.id), {
    success: 'Branch deleted',
    invalidate: [KEY, ['branches']],
    onSuccess: () => setDeleting(null),
  })

  const grouped = useMemo(() => {
    const map = new Map<string, Branch[]>()
    for (const b of query.data ?? []) {
      const k = b.discipline ?? 'Other'
      map.set(k, [...(map.get(k) ?? []), b])
    }
    return [...map.entries()]
  }, [query.data])

  return (
    <div>
      <AdminPageHeader
        title="Branches"
        description="Canonical B.Tech branch catalogue. Official programme names from UPTAC documents are matched against branch names and aliases during import."
        actions={
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Add branch
          </Button>
        }
      />
      <div className="mb-4 max-w-md">
        <Input leftIcon={<Search className="h-4 w-4" />} placeholder="Search code, name or discipline" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search branches" />
      </div>

      {query.error ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState icon={<GitBranch className="h-6 w-6" />} title="No branches found" description="Add a branch or adjust the search." />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Degree</Th>
                <Th>Aliases</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </THead>
            <tbody>
              {grouped.map(([discipline, list]) => (
                <BranchGroup key={discipline} discipline={discipline} list={list} onEdit={setEditing} onDelete={setDeleting} />
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {editing && <BranchFormModal branch={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete branch?"
        tone="danger"
        confirmLabel="Delete"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        description={`Delete ${deleting?.code} – ${deleting?.name}? Branches referenced by cutoff or seat-matrix records cannot be deleted; mark them inactive instead.`}
      />
    </div>
  )
}

function BranchGroup({
  discipline,
  list,
  onEdit,
  onDelete,
}: {
  discipline: string
  list: Branch[]
  onEdit: (b: Branch) => void
  onDelete: (b: Branch) => void
}) {
  return (
    <>
      <tr>
        <td colSpan={6} className="bg-navy-50/70 px-4 py-2 text-xs font-bold uppercase tracking-wider text-navy-500">
          {discipline} · {list.length}
        </td>
      </tr>
      {list.map((b) => (
        <Tr key={b.id}>
          <Td className="font-mono text-xs font-semibold">{b.code}</Td>
          <Td className="max-w-md whitespace-normal">
            <p className="font-medium">{b.name}</p>
            {b.short_name && <p className="text-xs text-navy-500">{b.short_name}</p>}
          </Td>
          <Td className="text-xs">
            {b.degree} · {b.duration_years} yrs
          </Td>
          <Td className="max-w-xs whitespace-normal text-xs text-navy-600">{b.aliases.length > 0 ? b.aliases.join(' · ') : '—'}</Td>
          <Td>{b.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="outline">Inactive</Badge>}</Td>
          <Td className="text-right">
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" aria-label={`Edit ${b.code}`} onClick={() => onEdit(b)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Delete ${b.code}`} onClick={() => onDelete(b)}>
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </Td>
        </Tr>
      ))}
    </>
  )
}
