import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FileDown, GripVertical, ListChecks, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { seatCode } from '@shared/prediction/labels.ts'
import type { ReservationCategory, SeatType } from '@shared/prediction/types.ts'
import { Seo } from '@/components/common/Seo'
import { PageHero } from '@/components/layout/PublicLayout'
import { ConfigNotice, QueryError } from '@/components/common/ConfigNotice'
import { CollegeSearch } from '@/components/common/Pickers'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Form'
import { Alert, EmptyState, PageLoader, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/env'
import { errorMessage } from '@/lib/supabase'
import { cn, formatRank, prettyName } from '@/lib/utils'
import { useBranches, useCollegesLite } from '@/hooks/useCatalog'
import { useChoiceLists } from '@/hooks/useStudent'
import { fetchOfferings, fetchSeatComparison, finalRoundClosing } from '@/lib/api/catalog'
import {
  addChoiceItem,
  createChoiceList,
  deleteChoiceList,
  listChoiceItems,
  removeChoiceItem,
  reorderChoiceItems,
  updateChoiceItemNotes,
  updateChoiceList,
} from '@/lib/api/student'
import { exportChoiceListPdf } from '@/lib/pdf'
import type { ChoiceListItem } from '@/lib/types'

const SEAT_OPTIONS: Array<{ category: ReservationCategory; seat: SeatType; label: string }> = [
  { category: 'OPEN', seat: 'GENERAL', label: 'OPNO – OPEN' },
  { category: 'OPEN', seat: 'GIRL', label: 'OPGL – OPEN girl' },
  { category: 'EWS', seat: 'GENERAL', label: 'EWSNO – EWS' },
  { category: 'BC', seat: 'GENERAL', label: 'BCNO – OBC-NCL' },
  { category: 'BC', seat: 'GIRL', label: 'BCGL – OBC-NCL girl' },
  { category: 'SC', seat: 'GENERAL', label: 'SCNO – SC' },
  { category: 'ST', seat: 'GENERAL', label: 'STNO – ST' },
]

export function ChoiceFillingPage() {
  const { configured, loading, user } = useAuth()
  return (
    <>
      <Seo title="UPTAC Choice Filling Assistant" description="Plan your UPTAC preference list: add colleges and branches, reorder with drag and drop, compare historical cutoffs and export as PDF." />
      <PageHero
        eyebrow="Choice Filling Assistant"
        title="Plan your UPTAC preference list"
        description="Add colleges and branches, reorder them by drag and drop, compare historical closing ranks and export your plan as a PDF."
      />
      <div className="container-page py-10">
        <Alert tone="warning" title="Advisory tool – not the official UPTAC choice submission portal" className="mb-8">
          Lists you make here are for planning only and are not sent to UPTAC. You must fill and lock your choices on the official portal{' '}
          <a href="https://uptac.samarth.edu.in/" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            uptac.samarth.edu.in
          </a>{' '}
          before the deadline.
        </Alert>
        {!configured ? (
          <ConfigNotice />
        ) : loading ? (
          <PageLoader />
        ) : !user ? (
          <EmptyState
            icon={<ListChecks className="h-6 w-6" />}
            title="Sign in to build and save choice lists"
            description="Create multiple preference lists, reorder them and export them as PDF. Your lists are private to your account."
            action={
              <>
                <ButtonLink to="/auth/login?next=/choice-filling">Sign in</ButtonLink>
                <ButtonLink to="/auth/signup" variant="outline">
                  Create account
                </ButtonLink>
              </>
            }
          />
        ) : (
          <ChoiceWorkspace />
        )}
      </div>
    </>
  )
}

function ChoiceWorkspace() {
  const { user, profile } = useAuth()
  const lists = useChoiceLists()
  const qc = useQueryClient()
  const toast = useToast()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const active = lists.data?.find((l) => l.id === activeId) ?? lists.data?.[0] ?? null

  useEffect(() => {
    if (!activeId && lists.data?.[0]) setActiveId(lists.data[0].id)
  }, [lists.data, activeId])

  const create = useMutation({
    mutationFn: () => {
      if (!newName.trim()) throw new Error('Enter a list name.')
      return createChoiceList(user!.id, newName, null)
    },
    onSuccess: (l) => {
      setNewName('')
      setActiveId(l.id)
      void qc.invalidateQueries({ queryKey: ['choice-lists'] })
      toast.success('Choice list created')
    },
    onError: (e) => toast.error('Could not create list', errorMessage(e)),
  })

  if (lists.isLoading) return <PageLoader />
  if (lists.isError) return <QueryError error={lists.error} onRetry={() => lists.refetch()} />

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Card className="h-fit p-4">
        <p className="px-1 text-xs font-bold uppercase tracking-wider text-navy-400">My lists</p>
        <ul className="mt-3 space-y-1">
          {(lists.data ?? []).map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => setActiveId(l.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition',
                  active?.id === l.id ? 'bg-royal-600 text-white' : 'text-navy-700 hover:bg-navy-50',
                )}
              >
                <span className="truncate">{l.name}</span>
                <span className={cn('text-xs', active?.id === l.id ? 'text-royal-100' : 'text-navy-400')}>{l.item_count}</span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 space-y-2 border-t border-navy-100 pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} placeholder="New list name" aria-label="New list name" />
          <Button type="submit" size="sm" className="w-full" loading={create.isPending} leftIcon={<Plus className="h-4 w-4" />}>
            Create list
          </Button>
        </form>
      </Card>

      {active ? (
        <ListEditor key={active.id} listId={active.id} listName={active.name} studentName={profile?.full_name ?? null} onDeleted={() => setActiveId(null)} />
      ) : (
        <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Create your first choice list" description="Give it a name like “Plan A – Round 1” and start adding colleges and branches." />
      )}
    </div>
  )
}

function ListEditor({ listId, listName, studentName, onDeleted }: { listId: string; listName: string; studentName: string | null; onDeleted: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const items = useQuery({ queryKey: ['choice-items', listId], queryFn: () => listChoiceItems(listId) })
  const collegesLite = useCollegesLite()
  const branches = useBranches()
  const [order, setOrder] = useState<ChoiceListItem[]>([])
  const [seatIdx, setSeatIdx] = useState(0)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(listName)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (items.data) setOrder(items.data)
  }, [items.data])

  const collegeName = useMemo(() => new Map((collegesLite.data ?? []).map((c) => [c.code, c.short_name ?? prettyName(c.name)])), [collegesLite.data])
  const branchName = useMemo(() => new Map((branches.data ?? []).map((b) => [b.code, b.name])), [branches.data])
  const seat = SEAT_OPTIONS[seatIdx]

  const refCutoffs = useQuery({
    queryKey: ['choice-ref', listId, order.map((i) => `${i.college_code}|${i.branch_code}`).sort().join(','), seatIdx],
    queryFn: () =>
      fetchSeatComparison({
        branchCodes: [...new Set(order.map((i) => i.branch_code))],
        collegeCodes: [...new Set(order.map((i) => i.college_code))],
        category: seat.category,
        seatType: seat.seat,
      }),
    enabled: order.length > 0,
  })
  const reference = (item: ChoiceListItem): { closing: number; year: number; round: number } | null => {
    const finals = finalRoundClosing(refCutoffs.data ?? [])
    let best: { closing: number; year: number; round: number } | null = null
    for (const [key, v] of finals) {
      const [c, b, s] = key.split('|')
      if (c === item.college_code && b === item.branch_code && s === item.shift && (!best || v.year > best.year)) best = v
    }
    return best
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderChoiceItems(listId, ids),
    onError: (e) => {
      toast.error('Could not save the new order', errorMessage(e))
      void items.refetch()
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['choice-lists'] }),
  })
  const remove = useMutation({
    mutationFn: removeChoiceItem,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['choice-items', listId] })
      void qc.invalidateQueries({ queryKey: ['choice-lists'] })
    },
    onError: (e) => toast.error('Could not remove choice', errorMessage(e)),
  })
  const rename = useMutation({
    mutationFn: () => updateChoiceList(listId, { name: name.trim() }),
    onSuccess: () => {
      setRenaming(false)
      void qc.invalidateQueries({ queryKey: ['choice-lists'] })
    },
    onError: (e) => toast.error('Could not rename list', errorMessage(e)),
  })
  const del = useMutation({
    mutationFn: () => deleteChoiceList(listId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['choice-lists'] })
      toast.success('Choice list deleted')
      onDeleted()
    },
    onError: (e) => toast.error('Could not delete list', errorMessage(e)),
  })

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = order.findIndex((i) => i.id === e.active.id)
    const to = order.findIndex((i) => i.id === e.over!.id)
    const next = arrayMove(order, from, to)
    setOrder(next)
    reorder.mutate(next.map((i) => i.id))
  }

  const moveBy = (index: number, delta: number) => {
    const to = index + delta
    if (to < 0 || to >= order.length) return
    const next = arrayMove(order, index, to)
    setOrder(next)
    reorder.mutate(next.map((i) => i.id))
  }

  const exportPdf = async () => {
    setExporting(true)
    try {
      await exportChoiceListPdf({
        listName,
        studentName,
        seatLabel: `${seatCode(seat.category, seat.seat)} · final round · JEE Main CRL`,
        rows: order.map((item, i) => {
          const ref = reference(item)
          return {
            position: i + 1,
            collegeCode: item.college_code,
            collegeName: collegeName.get(item.college_code) ?? item.college_code,
            branchCode: item.branch_code,
            branchName: branchName.get(item.branch_code) ?? item.branch_code,
            shift: item.shift,
            reference: ref ? `${formatRank(ref.closing)} (${ref.year}, round ${ref.round})` : 'Insufficient data',
            notes: item.notes,
          }
        }),
      })
    } catch (e) {
      toast.error('PDF export failed', errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={
            renaming ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (name.trim()) rename.mutate()
                }}
              >
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="List name" className="h-9" autoFocus />
                <Button type="submit" size="sm" loading={rename.isPending}>
                  Save
                </Button>
              </form>
            ) : (
              <span className="flex items-center gap-2">
                {listName}
                <button type="button" onClick={() => setRenaming(true)} className="text-navy-400 hover:text-royal-600" aria-label="Rename list">
                  <Pencil className="h-4 w-4" />
                </button>
              </span>
            )
          }
          description={`${order.length} choices · drag the handle (or use the arrow buttons) to reorder`}
          action={
            <>
              <Button variant="outline" size="sm" leftIcon={<FileDown className="h-4 w-4" />} onClick={() => void exportPdf()} loading={exporting} disabled={order.length === 0}>
                Export PDF
              </Button>
              <Button variant="ghost" size="sm" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                Delete
              </Button>
            </>
          }
        />
        <CardBody className="space-y-4">
          <AddChoice listId={listId} existing={order} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-navy-500">Compare with historical closing rank for</span>
            <Select value={seatIdx} onChange={(e) => setSeatIdx(Number(e.target.value))} className="h-9 w-56 text-xs" aria-label="Reference seat">
              {SEAT_OPTIONS.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      {items.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : items.isError ? (
        <QueryError error={items.error} onRetry={() => items.refetch()} />
      ) : order.length === 0 ? (
        <EmptyState icon={<ListChecks className="h-6 w-6" />} title="No choices yet" description="Search a college above, pick a branch and add it. You can also add choices from predictor results and college profiles." />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2.5">
              {order.map((item, index) => (
                <SortableChoice
                  key={item.id}
                  item={item}
                  index={index}
                  total={order.length}
                  collegeName={collegeName.get(item.college_code) ?? item.college_code}
                  branchName={branchName.get(item.branch_code) ?? item.branch_code}
                  reference={refCutoffs.isLoading ? undefined : reference(item)}
                  onMove={(d) => moveBy(index, d)}
                  onRemove={() => remove.mutate(item.id)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this choice list?"
        description="All choices in this list will be removed. This cannot be undone."
        confirmLabel="Delete list"
        tone="danger"
        loading={del.isPending}
        onConfirm={() => del.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function SortableChoice({
  item,
  index,
  total,
  collegeName,
  branchName,
  reference,
  onMove,
  onRemove,
}: {
  item: ChoiceListItem
  index: number
  total: number
  collegeName: string
  branchName: string
  reference: { closing: number; year: number; round: number } | null | undefined
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [editing, setEditing] = useState(false)
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-3 rounded-2xl border border-navy-100 bg-white p-3 shadow-sm sm:p-4', isDragging && 'z-10 border-royal-300 shadow-[var(--shadow-lift)]')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="grid h-10 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-navy-400 hover:bg-navy-50 hover:text-navy-700 active:cursor-grabbing"
        aria-label={`Drag to reorder choice ${index + 1}`}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy-900 font-display text-sm font-bold text-white tabular">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <Link to={`/colleges/${encodeURIComponent(item.college_code)}`} className="block truncate font-semibold text-navy-900 hover:text-royal-700">
          {collegeName} <span className="font-mono text-xs font-normal text-navy-400">{item.college_code}</span>
        </Link>
        <p className="truncate text-sm text-royal-700">
          {branchName}
          {item.shift && <span className="text-navy-500"> · Shift {item.shift}</span>}
        </p>
        {item.notes && <p className="mt-0.5 truncate text-xs text-navy-500">Note: {item.notes}</p>}
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-[0.7rem] text-navy-500">Ref. closing rank</p>
        <p className="font-semibold tabular text-navy-900">
          {reference === undefined ? '…' : reference ? formatRank(reference.closing) : <span className="text-xs font-medium text-navy-400">Insufficient data</span>}
        </p>
        {reference && <p className="text-[0.7rem] text-navy-400">{reference.year} · R{reference.round}</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
        <div className="flex">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="rounded-lg px-2 py-1 text-navy-400 hover:bg-navy-50 hover:text-navy-800 disabled:opacity-30" aria-label="Move up">
            ↑
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="rounded-lg px-2 py-1 text-navy-400 hover:bg-navy-50 hover:text-navy-800 disabled:opacity-30" aria-label="Move down">
            ↓
          </button>
        </div>
        <div className="flex">
          <button type="button" onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-50 hover:text-royal-600" aria-label="Edit note">
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-navy-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove choice">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {editing && <NoteEditor item={item} onClose={() => setEditing(false)} />}
    </li>
  )
}

function NoteEditor({ item, onClose }: { item: ChoiceListItem; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [note, setNote] = useState(item.notes ?? '')
  const save = useMutation({
    mutationFn: () => updateChoiceItemNotes(item.id, note.trim() || null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['choice-items', item.list_id] })
      onClose()
    },
    onError: (e) => toast.error('Could not save note', errorMessage(e)),
  })
  return (
    <Modal open onClose={onClose} title="Note for this choice" size="sm" footer={<Button onClick={() => save.mutate()} loading={save.isPending}>Save note</Button>}>
      <Field label="Note" hint="Up to 300 characters, e.g. hostel availability or reasons.">
        {({ id, describedBy }) => <Input id={id} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-describedby={describedBy} />}
      </Field>
    </Modal>
  )
}

function AddChoice({ listId, existing }: { listId: string; existing: ChoiceListItem[] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const collegesLite = useCollegesLite()
  const branches = useBranches()
  const [college, setCollege] = useState<{ code: string; label: string } | null>(null)
  const [choice, setChoice] = useState('')
  const offerings = useQuery({ queryKey: ['offerings', college?.code], queryFn: () => fetchOfferings([college!.code]), enabled: Boolean(college) })
  const branchName = useMemo(() => new Map((branches.data ?? []).map((b) => [b.code, b.name])), [branches.data])

  const options = (offerings.data ?? [])
    .filter((o) => !existing.some((e) => e.college_code === o.college_code && e.branch_code === o.branch_code && e.shift === o.shift))
    .map((o) => ({ value: `${o.branch_code}|${o.shift}`, label: `${branchName.get(o.branch_code) ?? o.branch_code}${o.shift ? ` (Shift ${o.shift})` : ''}` }))

  const add = useMutation({
    mutationFn: () => {
      const [branch_code, shift] = choice.split('|')
      return addChoiceItem(listId, { college_code: college!.code, branch_code, shift })
    },
    onSuccess: () => {
      setChoice('')
      void qc.invalidateQueries({ queryKey: ['choice-items', listId] })
      void qc.invalidateQueries({ queryKey: ['choice-lists'] })
      toast.success('Choice added')
    },
    onError: (e) => toast.error('Could not add choice', errorMessage(e)),
  })

  if (!isSupabaseConfigured) return null
  return (
    <div className="grid gap-3 rounded-2xl bg-navy-50/70 p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
      <div>
        <p className="mb-1.5 text-sm font-medium text-navy-800">College</p>
        {college ? (
          <button type="button" onClick={() => { setCollege(null); setChoice('') }} className="flex h-11 w-full items-center justify-between rounded-xl border border-royal-300 bg-white px-3.5 text-left text-sm font-semibold text-royal-800">
            <span className="truncate">{college.label}</span>
            <span className="text-xs text-navy-500">change</span>
          </button>
        ) : (
          <CollegeSearch colleges={collegesLite.data ?? []} onSelect={(c) => setCollege({ code: c.code, label: c.short_name ?? prettyName(c.name) })} />
        )}
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-navy-800">Branch</p>
        <Select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={!college || offerings.isLoading} aria-label="Branch">
          <option value="">{!college ? 'Select a college first' : offerings.isLoading ? 'Loading branches…' : options.length ? 'Select branch' : 'No verified branches available'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <Button onClick={() => add.mutate()} disabled={!college || !choice} loading={add.isPending} leftIcon={<Plus className="h-4 w-4" />}>
        Add choice
      </Button>
      {college && offerings.isSuccess && (offerings.data ?? []).length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-navy-500 lg:col-span-3">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Branches are listed only from verified official seat matrix / OR-CR data.
        </p>
      )}
    </div>
  )
}
