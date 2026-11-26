import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bookmark, BookmarkCheck, ListPlus, Plus } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { addChoiceItem, createChoiceList } from '@/lib/api/student'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useChoiceLists, useSavedColleges, useToggleSavedCollege } from '@/hooks/useStudent'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field, Input } from '@/components/ui/Form'
import { Spinner } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'

export function SaveCollegeButton({ code, compact = false }: { code: string; compact?: boolean }) {
  const { user } = useAuth()
  const saved = useSavedColleges()
  const toggle = useToggleSavedCollege()
  if (!user) {
    return (
      <ButtonLink to={`/auth/login?next=${encodeURIComponent(location.pathname)}`} variant="outline" size={compact ? 'sm' : 'md'} leftIcon={<Bookmark className="h-4 w-4" />}>
        {compact ? 'Save' : 'Sign in to save'}
      </ButtonLink>
    )
  }
  const isSaved = Boolean(saved.data?.some((s) => s.college_code === code))
  return (
    <Button
      variant={isSaved ? 'secondary' : 'outline'}
      size={compact ? 'sm' : 'md'}
      loading={toggle.isPending}
      onClick={() => toggle.mutate({ code, saved: isSaved })}
      leftIcon={isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      aria-pressed={isSaved}
    >
      {isSaved ? 'Saved' : 'Save'}
    </Button>
  )
}

export function AddToChoiceListButton({
  collegeCode,
  branchCode,
  shift = '',
  label,
  compact = false,
}: {
  collegeCode: string
  branchCode: string
  shift?: string
  label: string
  compact?: boolean
}) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  if (!user) {
    return (
      <Link to="/auth/login?next=/choice-filling" className={cn('inline-flex items-center gap-1.5 text-sm font-semibold text-royal-600 hover:underline')}>
        <ListPlus className="h-4 w-4" aria-hidden /> {compact ? 'Add' : 'Sign in to add to a choice list'}
      </Link>
    )
  }
  return (
    <>
      <Button variant="outline" size="sm" leftIcon={<ListPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>
        {compact ? 'Add' : 'Add to choice list'}
      </Button>
      {open && <ChoiceListPicker collegeCode={collegeCode} branchCode={branchCode} shift={shift} label={label} onClose={() => setOpen(false)} />}
    </>
  )
}

function ChoiceListPicker({ collegeCode, branchCode, shift, label, onClose }: { collegeCode: string; branchCode: string; shift: string; label: string; onClose: () => void }) {
  const { user } = useAuth()
  const lists = useChoiceLists()
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')

  const add = useMutation({
    mutationFn: async (listId: string | null) => {
      let id = listId
      if (!id) {
        if (!name.trim()) throw new Error('Enter a name for the new list.')
        id = (await createChoiceList(user!.id, name, null)).id
      }
      await addChoiceItem(id, { college_code: collegeCode, branch_code: branchCode, shift })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['choice-lists'] })
      void qc.invalidateQueries({ queryKey: ['choice-items'] })
      toast.success('Added to choice list', label)
      onClose()
    },
    onError: (e) => toast.error('Could not add to choice list', /23505/.test(JSON.stringify(e)) ? 'This choice is already in that list.' : errorMessage(e)),
  })

  return (
    <Modal open onClose={onClose} title="Add to a choice list" description={label} size="sm">
      {lists.isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {(lists.data ?? []).length > 0 && (
            <ul className="space-y-2">
              {lists.data!.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    disabled={add.isPending}
                    onClick={() => add.mutate(l.id)}
                    className="flex w-full items-center justify-between rounded-xl border border-navy-100 px-4 py-3 text-left text-sm font-semibold text-navy-800 transition hover:border-royal-300 hover:bg-royal-50"
                  >
                    {l.name}
                    <span className="text-xs font-medium text-navy-500">{l.item_count} choices</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="space-y-3 rounded-xl bg-navy-50 p-4"
            onSubmit={(e) => {
              e.preventDefault()
              add.mutate(null)
            }}
          >
            <Field label="Create a new list">{({ id }) => <Input id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Plan A – Round 1" />}</Field>
            <Button type="submit" size="sm" loading={add.isPending} leftIcon={<Plus className="h-4 w-4" />}>
              Create list & add
            </Button>
          </form>
        </div>
      )}
    </Modal>
  )
}
