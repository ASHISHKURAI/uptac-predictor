import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Building2, ExternalLink, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react'
import { UP_DISTRICTS } from '@shared/import/districts.ts'
import { deleteCollege, listCollegesAdmin, saveCollege, setCollegeFlags, type CollegeInput } from '@/lib/api/admin'
import { instituteTypeLabel, prettyName } from '@/lib/utils'
import type { College, InstituteType } from '@/lib/types'
import { AdminPageHeader } from '@/components/layout/AdminLayout'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Checkbox, Input, Select } from '@/components/ui/Form'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Pagination, Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'
import { QueryError } from '@/components/common/ConfigNotice'
import { FilterBar, useAdminMutation } from '@/components/admin/Misc'
import { INSTITUTE_TYPE_OPTIONS, SelectField, TextareaField, TextField, intOrNull } from '@/components/admin/Fields'

const PAGE_SIZE = 25
const KEY = ['admin', 'colleges']

export function CollegesAdminPage() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [district, setDistrict] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive' | 'featured'>('all')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<College | 'new' | null>(null)
  const [deleting, setDeleting] = useState<College | null>(null)

  const query = useQuery({
    queryKey: [...KEY, { search, type, district, status, page }],
    queryFn: () => listCollegesAdmin({ search, type, district, status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const flags = useAdminMutation((v: { id: string; flags: Partial<Pick<College, 'is_active' | 'is_featured'>> }) => setCollegeFlags(v.id, v.flags), {
    success: 'College updated',
    invalidate: [KEY, ['colleges-lite']],
  })
  const remove = useAdminMutation((c: College) => deleteCollege(c.id), {
    success: 'College deleted',
    invalidate: [KEY, ['colleges-lite']],
    onSuccess: () => setDeleting(null),
  })

  const rows = query.data?.rows ?? []

  return (
    <div>
      <AdminPageHeader
        title="Colleges"
        description="Institutes participating in UPTAC counselling. Official codes come from the UPTAC seat matrix – new institutes found during imports can be created from the import review screen."
        actions={
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Add college
          </Button>
        }
      />

      <FilterBar>
        <div className="sm:col-span-2">
          <Input
            leftIcon={<Search className="h-4 w-4" />}
            placeholder="Search name, code or city"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            aria-label="Search colleges"
          />
        </div>
        <Select value={type} onChange={(e) => {
            setType(e.target.value)
            setPage(1)
          }} aria-label="Institute type">
          <option value="">All types</option>
          {INSTITUTE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select value={district} onChange={(e) => {
            setDistrict(e.target.value)
            setPage(1)
          }} aria-label="District">
          <option value="">All districts</option>
          {UP_DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => {
            setStatus(e.target.value as typeof status)
            setPage(1)
          }} aria-label="Status">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="featured">Featured</option>
        </Select>
      </FilterBar>

      {query.error ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="No colleges found"
          description="Import the official UPTAC seat matrix to create institutes with their official codes, or add a college manually."
          action={
            <Button size="sm" onClick={() => setEditing('new')} leftIcon={<Plus className="h-4 w-4" />}>
              Add college
            </Button>
          }
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>Code</Th>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th>District / city</Th>
                  <Th>Featured</Th>
                  <Th>Active</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((c) => (
                  <Tr key={c.id}>
                    <Td className="font-mono text-xs font-semibold">{c.code}</Td>
                    <Td className="max-w-md whitespace-normal">
                      <p className="font-medium text-navy-900">{prettyName(c.short_name || c.name)}</p>
                      <p className="text-xs text-navy-500">{c.name}</p>
                      {c.website && (
                        <a href={c.website} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-royal-600 hover:underline">
                          Website <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={c.institute_type === 'private' ? 'neutral' : 'royal'}>{instituteTypeLabel(c.institute_type)}</Badge>
                    </Td>
                    <Td className="text-sm">
                      {c.district ?? <span className="text-amber-700">District not set</span>}
                      {c.city && <span className="block text-xs text-navy-500">{c.city}</span>}
                    </Td>
                    <Td>
                      <button
                        type="button"
                        aria-label={c.is_featured ? 'Remove from featured' : 'Mark as featured'}
                        aria-pressed={c.is_featured}
                        disabled={flags.isPending}
                        onClick={() => flags.mutate({ id: c.id, flags: { is_featured: !c.is_featured } })}
                        className="rounded-lg p-1.5 hover:bg-amber-50"
                      >
                        <Star className={c.is_featured ? 'h-4.5 w-4.5 fill-amber-400 text-amber-500' : 'h-4.5 w-4.5 text-navy-300'} />
                      </button>
                    </Td>
                    <Td>
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-royal-600"
                          checked={c.is_active}
                          disabled={flags.isPending}
                          onChange={() => flags.mutate({ id: c.id, flags: { is_active: !c.is_active } })}
                        />
                        {c.is_active ? 'Active' : 'Hidden'}
                      </label>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination className="mt-4" page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPage={setPage} />
        </>
      )}

      {editing && <CollegeFormModal college={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete college?"
        tone="danger"
        confirmLabel="Delete"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        description={
          <>
            <p>
              Delete <strong>{deleting?.name}</strong> ({deleting?.code})? Colleges that still have cutoff or seat-matrix records cannot be deleted – mark them
              inactive instead. Fees, placements and saved items for this college are removed.
            </p>
          </>
        }
      />
    </div>
  )
}

interface FormState {
  code: string
  name: string
  short_name: string
  aliases: string
  institute_type: InstituteType | ''
  district: string
  city: string
  address: string
  pincode: string
  website: string
  email: string
  phone: string
  established_year: string
  affiliated_university: string
  naac_grade: string
  description: string
  is_featured: boolean
  is_active: boolean
}

function toForm(c: College | null): FormState {
  return {
    code: c?.code ?? '',
    name: c?.name ?? '',
    short_name: c?.short_name ?? '',
    aliases: (c?.aliases ?? []).join('\n'),
    institute_type: c?.institute_type ?? '',
    district: c?.district ?? '',
    city: c?.city ?? '',
    address: c?.address ?? '',
    pincode: c?.pincode ?? '',
    website: c?.website ?? '',
    email: c?.email ?? '',
    phone: c?.phone ?? '',
    established_year: c?.established_year ? String(c.established_year) : '',
    affiliated_university: c?.affiliated_university ?? '',
    naac_grade: c?.naac_grade ?? '',
    description: c?.description ?? '',
    is_featured: c?.is_featured ?? false,
    is_active: c?.is_active ?? true,
  }
}

const nil = (v: string) => (v.trim() === '' ? null : v.trim())

function CollegeFormModal({ college, onClose }: { college: College | null; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(() => toForm(college))
  const [changeCode, setChangeCode] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = useAdminMutation((input: CollegeInput) => saveCollege(input, college?.id), {
    success: college ? 'College saved' : 'College created',
    invalidate: [KEY, ['colleges-lite'], ['districts']],
    onSuccess: onClose,
  })

  const submit = () => {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!/^[A-Za-z0-9-]{1,20}$/.test(form.code.trim())) e.code = 'Use the official UPTAC institute code (letters, digits, hyphen; max 20).'
    if (form.name.trim().length < 2) e.name = 'Enter the official institute name.'
    if (!form.institute_type) e.institute_type = 'Select the institute type.'
    if (form.pincode && !/^\d{6}$/.test(form.pincode.trim())) e.pincode = 'PIN code must be 6 digits.'
    if (form.website && !/^https?:\/\/\S+$/i.test(form.website.trim())) e.website = 'Website must start with http:// or https://'
    const year = intOrNull(form.established_year)
    if (Number.isNaN(year) || (year !== null && (year < 1800 || year > 2100))) e.established_year = 'Enter a valid year.'
    if (form.short_name.length > 60) e.short_name = 'Maximum 60 characters.'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    save.mutate({
      code: form.code.trim(),
      name: form.name.trim(),
      short_name: nil(form.short_name),
      aliases: [...new Set(form.aliases.split(/[\n,]/).map((a) => a.trim()).filter(Boolean))],
      institute_type: form.institute_type as InstituteType,
      district: nil(form.district),
      city: nil(form.city),
      address: nil(form.address),
      pincode: nil(form.pincode),
      website: nil(form.website),
      email: nil(form.email),
      phone: nil(form.phone),
      established_year: year,
      affiliated_university: nil(form.affiliated_university),
      naac_grade: nil(form.naac_grade),
      description: nil(form.description),
      is_featured: form.is_featured,
      is_active: form.is_active,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={college ? `Edit ${college.code}` : 'Add college'}
      description="Use official names exactly as printed in UPTAC documents. Add other spellings as aliases so imports match automatically."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {college ? 'Save changes' : 'Create college'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="space-y-2">
          <TextField
            label="Official institute code"
            required
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            error={errors.code}
            disabled={Boolean(college) && !changeCode}
            hint="e.g. 043 – the number in brackets in the official seat matrix"
          />
          {college && (
            <Checkbox
              label="Change code"
              description="Codes cascade to every cutoff, seat-matrix, fee and saved record. Only change it to correct an error."
              checked={changeCode}
              onChange={(e) => setChangeCode(e.target.checked)}
            />
          )}
        </div>
        <SelectField
          label="Institute type"
          required
          value={form.institute_type}
          onChange={(e) => set('institute_type', e.target.value as InstituteType)}
          options={INSTITUTE_TYPE_OPTIONS}
          placeholder="Select type"
          error={errors.institute_type}
        />
        <TextField label="Official name" required className="sm:col-span-2" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <TextField label="Short name" value={form.short_name} onChange={(e) => set('short_name', e.target.value)} error={errors.short_name} hint="Optional display name, e.g. IET Lucknow" />
        <SelectField
          label="District"
          value={form.district}
          onChange={(e) => set('district', e.target.value)}
          options={UP_DISTRICTS.map((d) => ({ value: d, label: d }))}
          placeholder="Select district"
        />
        <TextField label="City / place" value={form.city} onChange={(e) => set('city', e.target.value)} />
        <TextField label="PIN code" value={form.pincode} onChange={(e) => set('pincode', e.target.value)} error={errors.pincode} inputMode="numeric" />
        <TextField label="Address" className="sm:col-span-2" value={form.address} onChange={(e) => set('address', e.target.value)} />
        <TextField label="Official website" value={form.website} onChange={(e) => set('website', e.target.value)} error={errors.website} placeholder="https://" />
        <TextField label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        <TextField label="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <TextField label="Established" value={form.established_year} onChange={(e) => set('established_year', e.target.value)} error={errors.established_year} inputMode="numeric" />
        <TextField label="Affiliated university" value={form.affiliated_university} onChange={(e) => set('affiliated_university', e.target.value)} />
        <TextField label="NAAC grade" value={form.naac_grade} onChange={(e) => set('naac_grade', e.target.value)} hint="Only from the official NAAC record" />
        <TextareaField
          label="Aliases"
          className="sm:col-span-2"
          value={form.aliases}
          onChange={(e) => set('aliases', e.target.value)}
          hint="One per line (or comma separated) – alternative official spellings used in UPTAC documents."
        />
        <TextareaField label="Description" className="sm:col-span-2" value={form.description} onChange={(e) => set('description', e.target.value)} />
        <div className="flex flex-wrap gap-6 sm:col-span-2">
          <Checkbox label="Active" description="Visible to students" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          <Checkbox label="Featured" description="Shown under popular colleges on the homepage" checked={form.is_featured} onChange={(e) => set('is_featured', e.target.checked)} />
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}
