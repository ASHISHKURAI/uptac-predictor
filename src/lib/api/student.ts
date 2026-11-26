import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import type { PredictionRequest, PredictionResult } from '@shared/prediction/types.ts'
import { db } from '@/lib/supabase'
import type { ChoiceList, ChoiceListItem, PredictionLog, Profile, SavedCollege } from '@/lib/types'

// ---------------------------------------------------------------------------
// Prediction (Edge Function `predict`)
// ---------------------------------------------------------------------------
export type PredictionResponse = PredictionResult & { available_years: number[] }

export class PredictionError extends Error {
  readonly fields?: Record<string, string>
  readonly kind: 'validation' | 'unavailable' | 'server'
  constructor(message: string, kind: PredictionError['kind'], fields?: Record<string, string>) {
    super(message)
    this.name = 'PredictionError'
    this.kind = kind
    this.fields = fields
  }
}

export async function requestPrediction(request: PredictionRequest): Promise<PredictionResponse> {
  const { data, error } = await db().functions.invoke('predict', { body: request })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let body: { error?: string; fields?: Record<string, string> } = {}
      try {
        body = await error.context.json()
      } catch {
        // non-JSON error body
      }
      const status = (error.context as Response).status
      if (status === 404) {
        throw new PredictionError('The prediction service (Edge Function "predict") is not deployed on this Supabase project yet.', 'unavailable')
      }
      throw new PredictionError(body.error ?? 'The prediction service returned an error.', status === 400 ? 'validation' : 'server', body.fields)
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      throw new PredictionError(
        'Could not reach the prediction service. Check your connection – administrators: make sure the "predict" Edge Function is deployed.',
        'unavailable',
      )
    }
    throw new PredictionError(error.message, 'server')
  }
  return data as PredictionResponse
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, 'full_name' | 'jee_crl_rank' | 'category' | 'gender' | 'domicile' | 'favourite_branches'>>,
): Promise<void> {
  const { error } = await db().from('profiles').update(patch).eq('id', userId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Saved colleges
// ---------------------------------------------------------------------------
export async function listSavedColleges(): Promise<SavedCollege[]> {
  const { data, error } = await db().from('saved_colleges').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data as SavedCollege[]) ?? []
}

export async function saveCollege(userId: string, collegeCode: string, note?: string): Promise<void> {
  const { error } = await db().from('saved_colleges').upsert({ user_id: userId, college_code: collegeCode, note: note ?? null }, { onConflict: 'user_id,college_code' })
  if (error) throw error
}

export async function unsaveCollege(collegeCode: string): Promise<void> {
  const { error } = await db().from('saved_colleges').delete().eq('college_code', collegeCode)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Prediction history
// ---------------------------------------------------------------------------
export async function listPredictionLogs(limit = 50): Promise<PredictionLog[]> {
  const { data, error } = await db().from('prediction_logs').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data as PredictionLog[]) ?? []
}

export async function deletePredictionLog(id: string): Promise<void> {
  const { error } = await db().from('prediction_logs').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Choice lists
// ---------------------------------------------------------------------------
export async function listChoiceLists(): Promise<Array<ChoiceList & { item_count: number }>> {
  const { data, error } = await db().from('choice_lists').select('*, choice_list_items(count)').order('updated_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Array<ChoiceList & { choice_list_items: Array<{ count: number }> }>).map(({ choice_list_items, ...l }) => ({
    ...l,
    item_count: choice_list_items?.[0]?.count ?? 0,
  }))
}

export async function createChoiceList(userId: string, name: string, academicYear: number | null): Promise<ChoiceList> {
  const { data, error } = await db().from('choice_lists').insert({ user_id: userId, name: name.trim(), academic_year: academicYear }).select('*').single()
  if (error) throw error
  return data as ChoiceList
}

export async function updateChoiceList(id: string, patch: Partial<Pick<ChoiceList, 'name' | 'academic_year' | 'notes'>>): Promise<void> {
  const { error } = await db().from('choice_lists').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteChoiceList(id: string): Promise<void> {
  const { error } = await db().from('choice_lists').delete().eq('id', id)
  if (error) throw error
}

export async function listChoiceItems(listId: string): Promise<ChoiceListItem[]> {
  const { data, error } = await db().from('choice_list_items').select('*').eq('list_id', listId).order('position')
  if (error) throw error
  return (data as ChoiceListItem[]) ?? []
}

export async function addChoiceItem(listId: string, item: { college_code: string; branch_code: string; shift?: string }): Promise<void> {
  const { data: last } = await db().from('choice_list_items').select('position').eq('list_id', listId).order('position', { ascending: false }).limit(1)
  const position = ((last?.[0] as { position: number } | undefined)?.position ?? -1) + 1
  const { error } = await db()
    .from('choice_list_items')
    .insert({ list_id: listId, position, college_code: item.college_code, branch_code: item.branch_code, shift: item.shift ?? '' })
  if (error) throw error
  await db().from('choice_lists').update({ updated_at: new Date().toISOString() }).eq('id', listId)
}

export async function removeChoiceItem(id: string): Promise<void> {
  const { error } = await db().from('choice_list_items').delete().eq('id', id)
  if (error) throw error
}

export async function updateChoiceItemNotes(id: string, notes: string | null): Promise<void> {
  const { error } = await db().from('choice_list_items').update({ notes }).eq('id', id)
  if (error) throw error
}

export async function reorderChoiceItems(listId: string, itemIds: string[]): Promise<void> {
  const { error } = await db().rpc('reorder_choice_list', { p_list_id: listId, p_item_ids: itemIds })
  if (error) throw error
}
