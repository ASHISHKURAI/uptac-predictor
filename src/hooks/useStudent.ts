import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { listChoiceLists, listSavedColleges, saveCollege, unsaveCollege } from '@/lib/api/student'
import { errorMessage } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'

export function useSavedColleges() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['saved-colleges', user?.id], queryFn: listSavedColleges, enabled: Boolean(user) })
}

export function useToggleSavedCollege() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ code, saved }: { code: string; saved: boolean }) => {
      if (!user) throw new Error('Sign in to save colleges.')
      if (saved) await unsaveCollege(code)
      else await saveCollege(user.id, code)
      return !saved
    },
    onSuccess: (nowSaved) => {
      void qc.invalidateQueries({ queryKey: ['saved-colleges'] })
      toast.success(nowSaved ? 'College saved to your dashboard' : 'College removed from saved list')
    },
    onError: (e) => toast.error('Could not update saved colleges', errorMessage(e)),
  })
}

export function useChoiceLists() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['choice-lists', user?.id], queryFn: listChoiceLists, enabled: Boolean(user) })
}
