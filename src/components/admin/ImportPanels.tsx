import { useMemo, useState } from 'react'
import { Building2, Check, GitBranch, Plus, Wand2 } from 'lucide-react'
import { UP_DISTRICTS } from '@shared/import/districts.ts'
import { useBranches, useCollegesLite } from '@/hooks/useCatalog'
import { applyBranchMapping, applyCollegeMapping, createColleges, revalidateReferences } from '@/lib/api/admin'
import { formatNumber, prettyName } from '@/lib/utils'
import type { Branch, ImportStats, InstituteType } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Form'
import { Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Combobox } from './Pickers'
import { useAdminMutation } from './Misc'
import { INSTITUTE_TYPE_OPTIONS } from './Fields'
import { BranchFormModal } from './BranchFormModal'

type NewCollege = NonNullable<ImportStats['new_colleges']>[number]
type Unresolved = NonNullable<ImportStats['unresolved_colleges']>[number]

const reviewKeys = (jobId: string) => [['admin', 'import', jobId], ['admin', 'staging', jobId], ['colleges-lite'], ['branches'], ['admin', 'colleges']]

export function NewInstitutesPanel({ jobId, proposals, disabled }: { jobId: string; proposals: NewCollege[]; disabled?: boolean }) {
  const colleges = useCollegesLite()
  const existing = useMemo(() => new Set((colleges.data ?? []).map((c) => c.code)), [colleges.data])
  const pending = proposals.filter((p) => !existing.has(p.code))
  const [drafts, setDrafts] = useState<Record<string, { selected: boolean; name: string; type: InstituteType | ''; district: string; city: string }>>(() =>
    Object.fromEntries(
      proposals.map((p) => [p.code, { selected: true, name: p.name, type: p.institute_type ?? '', district: p.district ?? '', city: p.city ?? '' }]),
    ),
  )
  const [error, setError] = useState<string | null>(null)

  const create = useAdminMutation(
    async (rows: Array<{ code: string; name: string; institute_type: InstituteType; district: string | null; city: string | null }>) => {
      const created = await createColleges(rows)
      const result = await revalidateReferences(jobId)
      return { created, result }
    },
    {
      success: (r) => `${formatNumber(r.created)} college(s) created · ${formatNumber(r.result.unresolved_college_rows)} rows still unresolved`,
      invalidate: reviewKeys(jobId),
    },
  )

  if (colleges.isLoading || pending.length === 0) return null

  const selected = pending.filter((p) => drafts[p.code]?.selected)
  const submit = () => {
    const missing = selected.filter((p) => !drafts[p.code]?.type)
    if (missing.length > 0) {
      setError(`Select the institute type for: ${missing.map((m) => m.code).join(', ')}`)
      return
    }
    if (selected.some((p) => (drafts[p.code]?.name ?? '').trim().length < 2)) {
      setError('Every selected institute needs a name.')
      return
    }
    setError(null)
    create.mutate(
      selected.map((p) => {
        const d = drafts[p.code]
        return { code: p.code, name: d.name.trim(), institute_type: d.type as InstituteType, district: d.district || null, city: d.city.trim() || null }
      }),
    )
  }
  const update = (code: string, patch: Partial<(typeof drafts)[string]>) => setDrafts((d) => ({ ...d, [code]: { ...d[code], ...patch } }))

  return (
    <Card>
      <CardHeader
        icon={<Building2 className="h-4 w-4" />}
        title={`New institutes found (${pending.length})`}
        description="These official institute codes are not in the college directory yet. Review the details and create them – rows referencing them will then resolve automatically."
        action={
          <Button size="sm" onClick={submit} loading={create.isPending} disabled={disabled || selected.length === 0} leftIcon={<Plus className="h-4 w-4" />}>
            Create {selected.length} selected
          </Button>
        }
      />
      <CardBody className="space-y-3">
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <TableWrap className="max-h-96 overflow-y-auto">
          <Table>
            <THead>
              <tr>
                <Th className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-royal-600"
                    aria-label="Select all new institutes"
                    checked={selected.length === pending.length}
                    onChange={(e) => pending.forEach((p) => update(p.code, { selected: e.target.checked }))}
                  />
                </Th>
                <Th>Code</Th>
                <Th>Official name</Th>
                <Th>Type</Th>
                <Th>District</Th>
                <Th>City</Th>
                <Th className="text-right">Rows</Th>
              </tr>
            </THead>
            <tbody>
              {pending.map((p) => {
                const d = drafts[p.code]
                return (
                  <Tr key={p.code}>
                    <Td>
                      <input type="checkbox" className="h-4 w-4 accent-royal-600" aria-label={`Select ${p.code}`} checked={d?.selected ?? false} onChange={(e) => update(p.code, { selected: e.target.checked })} />
                    </Td>
                    <Td className="font-mono text-xs font-semibold">{p.code}</Td>
                    <Td className="min-w-72">
                      <Input value={d?.name ?? ''} onChange={(e) => update(p.code, { name: e.target.value })} aria-label={`Name for ${p.code}`} className="h-9" />
                    </Td>
                    <Td className="min-w-44">
                      <Select value={d?.type ?? ''} onChange={(e) => update(p.code, { type: e.target.value as InstituteType })} aria-label={`Type for ${p.code}`} className="h-9" aria-invalid={d?.selected && !d.type}>
                        <option value="">Select…</option>
                        {INSTITUTE_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td className="min-w-44">
                      <Select value={d?.district ?? ''} onChange={(e) => update(p.code, { district: e.target.value })} aria-label={`District for ${p.code}`} className="h-9">
                        <option value="">Unknown</option>
                        {UP_DISTRICTS.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td className="min-w-36">
                      <Input value={d?.city ?? ''} onChange={(e) => update(p.code, { city: e.target.value })} aria-label={`City for ${p.code}`} className="h-9" />
                    </Td>
                    <Td className="text-right tabular">{formatNumber(p.rows)}</Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        </TableWrap>
        <p className="text-xs text-navy-500">Type comes from the “Institute Type” column of the official seat matrix when available; district is inferred from the place name and can be corrected.</p>
      </CardBody>
    </Card>
  )
}

export function UnresolvedCollegesPanel({ jobId, items, remainingRows, disabled }: { jobId: string; items: Unresolved[]; remainingRows: number; disabled?: boolean }) {
  const colleges = useCollegesLite()
  const options = useMemo(
    () => (colleges.data ?? []).map((c) => ({ value: c.code, label: prettyName(c.short_name || c.name), sublabel: c.name })),
    [colleges.data],
  )
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [done, setDone] = useState<Set<string>>(new Set())
  const map = useAdminMutation((v: { raw: string; code: string }) => applyCollegeMapping(jobId, v.raw, v.code), {
    success: (n, v) => `Mapped ${formatNumber(n)} row(s) to ${v.code}. The name is saved as an alias for future imports.`,
    invalidate: reviewKeys(jobId),
    onSuccess: (_n, v) => setDone((d) => new Set(d).add(v.raw)),
  })

  if (remainingRows === 0 || items.length === 0) return null
  return (
    <Card>
      <CardHeader
        icon={<Building2 className="h-4 w-4" />}
        title="Unresolved institute names"
        description={`${formatNumber(remainingRows)} row(s) reference institute names that did not match the directory. Map each name to the correct college.`}
      />
      <CardBody>
        <ul className="divide-y divide-navy-100">
          {items.map((u) => (
            <li key={u.raw} className="grid gap-3 py-3 lg:grid-cols-[1fr_minmax(16rem,22rem)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="font-medium text-navy-900">{u.raw || <em className="text-navy-400">(empty)</em>}</p>
                <p className="text-xs text-navy-500">{formatNumber(u.rows)} row(s)</p>
                {u.suggestion && !done.has(u.raw) && (
                  <button
                    type="button"
                    disabled={disabled || map.isPending}
                    onClick={() => map.mutate({ raw: u.raw, code: u.suggestion?.code ?? '' })}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-royal-600 hover:underline disabled:opacity-50"
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Use suggestion: {u.suggestion.code} – {prettyName(u.suggestion.name)} ({Math.round(u.suggestion.score * 100)}%)
                  </button>
                )}
              </div>
              {done.has(u.raw) ? (
                <Badge tone="green" className="justify-self-start lg:col-span-2">
                  <Check className="h-3 w-3" /> Mapped
                </Badge>
              ) : (
                <>
                  <Combobox value={choice[u.raw] ?? null} onChange={(v) => setChoice((c) => ({ ...c, [u.raw]: v }))} options={options} loading={colleges.isLoading} placeholder="Find college…" disabled={disabled} />
                  <Button size="sm" variant="outline" disabled={disabled || !choice[u.raw]} loading={map.isPending && map.variables?.raw === u.raw} onClick={() => map.mutate({ raw: u.raw, code: choice[u.raw] })}>
                    Map
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

export function UnresolvedBranchesPanel({ jobId, items, remainingRows, disabled }: { jobId: string; items: Unresolved[]; remainingRows: number; disabled?: boolean }) {
  const branches = useBranches()
  const options = useMemo(() => (branches.data ?? []).map((b) => ({ value: b.code, label: b.name, sublabel: b.discipline ?? undefined })), [branches.data])
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [done, setDone] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState<string | null>(null)
  const map = useAdminMutation((v: { raw: string; code: string }) => applyBranchMapping(jobId, v.raw, v.code), {
    success: (n, v) => `Mapped ${formatNumber(n)} row(s) to ${v.code}. The programme name is saved as an alias.`,
    invalidate: reviewKeys(jobId),
    onSuccess: (_n, v) => setDone((d) => new Set(d).add(v.raw)),
  })

  if (remainingRows === 0 || items.length === 0) return null
  return (
    <Card>
      <CardHeader
        icon={<GitBranch className="h-4 w-4" />}
        title="Unresolved programmes"
        description={`${formatNumber(remainingRows)} row(s) use programme names that are not in the branch catalogue. Map them to an existing branch or create a new branch.`}
      />
      <CardBody>
        <ul className="divide-y divide-navy-100">
          {items.map((u) => (
            <li key={u.raw} className="grid gap-3 py-3 lg:grid-cols-[1fr_minmax(16rem,22rem)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="font-medium text-navy-900">{u.raw || <em className="text-navy-400">(empty)</em>}</p>
                <p className="text-xs text-navy-500">{formatNumber(u.rows)} row(s)</p>
                {u.suggestion && !done.has(u.raw) && (
                  <button
                    type="button"
                    disabled={disabled || map.isPending}
                    onClick={() => map.mutate({ raw: u.raw, code: u.suggestion?.code ?? '' })}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-royal-600 hover:underline disabled:opacity-50"
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Use suggestion: {u.suggestion.code} – {u.suggestion.name} ({Math.round(u.suggestion.score * 100)}%)
                  </button>
                )}
              </div>
              {done.has(u.raw) ? (
                <Badge tone="green" className="justify-self-start lg:col-span-2">
                  <Check className="h-3 w-3" /> Mapped
                </Badge>
              ) : (
                <>
                  <Combobox value={choice[u.raw] ?? null} onChange={(v) => setChoice((c) => ({ ...c, [u.raw]: v }))} options={options} loading={branches.isLoading} placeholder="Find branch…" disabled={disabled} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={disabled || !choice[u.raw]} loading={map.isPending && map.variables?.raw === u.raw} onClick={() => map.mutate({ raw: u.raw, code: choice[u.raw] })}>
                      Map
                    </Button>
                    <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setCreating(u.raw)} leftIcon={<Plus className="h-4 w-4" />}>
                      New branch
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
      {creating !== null && (
        <BranchFormModal
          branch={null}
          initialName={creating}
          onClose={() => setCreating(null)}
          onCreated={(b: Branch) => map.mutate({ raw: creating, code: b.code })}
        />
      )}
    </Card>
  )
}
