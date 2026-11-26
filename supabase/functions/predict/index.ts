// Supabase Edge Function: predict
// Compares a student's JEE Main rank with VERIFIED historical UPTAC opening and
// closing ranks. Prediction logic lives in ../_shared/prediction (pure module,
// unit tested in tests/prediction.test.ts). No probabilities are generated.
import { DEFAULT_BANDS } from '../_shared/prediction/classify.ts'
import { deriveEligibility } from '../_shared/prediction/eligibility.ts'
import { runPrediction, selectYears } from '../_shared/prediction/engine.ts'
import type { CandidateData, PredictionRequest } from '../_shared/prediction/types.ts'
import { validatePredictionRequest } from '../_shared/prediction/validate.ts'
import { background, currentUserId, json, logError, preflight, serviceClient, userClient } from '../_shared/server.ts'

const MAX_GROUPS = 400

// Basic per-isolate rate limiting (defence in depth; use an API gateway / WAF for production-grade limits).
const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 30
const hits = new Map<string, number[]>()
function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > MAX_REQUESTS_PER_WINDOW
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (rateLimited(ip)) return json(req, { error: 'Too many requests. Please wait a minute and try again.' }, 429)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Request body must be JSON.' }, 400)
  }

  const validation = validatePredictionRequest(body)
  if (!validation.ok) return json(req, { error: 'Please correct the highlighted fields.', fields: validation.errors }, 400)
  const request: PredictionRequest = validation.value

  const client = userClient(req)
  try {
    const { data: yearRows, error: yearsError } = await client.rpc('get_cutoff_years')
    if (yearsError) throw yearsError
    const available = ((yearRows ?? []) as Array<{ year: number }>).map((y) => y.year)
    const years = selectYears(request.admissionYear, available, request.years)

    const empty: CandidateData = { records: [], colleges: [], branches: [], sources: [], total_groups: 0, returned_groups: 0 }
    let data: CandidateData & { branches_with_records?: string[] } = empty

    if (years.length > 0) {
      const rules = deriveEligibility(request, request.institutePreference)
      const { data: rpcData, error } = await client.rpc('prediction_candidates', {
        p_years: years,
        p_categories: rules.categories,
        p_seat_types: rules.seatTypes,
        p_genders: rules.genders,
        p_domiciles: rules.domiciles,
        p_quotas: rules.quotas,
        p_institute_types: rules.instituteTypes,
        p_crl_rank: request.crlRank,
        p_category_rank: request.categoryRank ?? null,
        p_branch_codes: request.branchCodes && request.branchCodes.length > 0 ? request.branchCodes : null,
        p_near_margin: DEFAULT_BANDS.nearMargin,
        p_max_groups: MAX_GROUPS,
      })
      if (error) throw error
      data = rpcData as typeof data
    }

    const result = runPrediction(request, years, data)

    // Log the prediction (anonymous users are logged without an identity).
    await background(
      (async () => {
        try {
          const userId = await currentUserId(req)
          await serviceClient()
            .from('prediction_logs')
            .insert({
              user_id: userId,
              input: request,
              summary: { ...result.summary, years: result.years, years_without_data: result.years_without_data },
              result_count: result.programs.length,
              data_years: result.years,
            })
        } catch (e) {
          console.error('prediction log failed', e)
        }
      })(),
    )

    return json(req, { ...result, available_years: available })
  } catch (e) {
    const message = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e)
    try {
      await logError(serviceClient(), 'predict', message, { request })
    } catch {
      // ignore logging failures
    }
    return json(req, { error: 'The prediction service could not complete your request. Please try again shortly.' }, 500)
  }
})
