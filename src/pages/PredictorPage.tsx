import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { Lock, Target } from 'lucide-react'
import type { PredictionRequest } from '@shared/prediction/index.ts'
import { Seo } from '@/components/common/Seo'
import { PageHero } from '@/components/layout/PublicLayout'
import { Card } from '@/components/ui/Card'
import { Alert, Skeleton } from '@/components/ui/Feedback'
import { ConfigNotice, QueryError } from '@/components/common/ConfigNotice'
import { EMPTY_FORM, PredictorForm, type PredictorFormState } from '@/components/predictor/PredictorForm'
import { PredictionResults } from '@/components/predictor/PredictionResults'
import { useBranches, useCutoffYears } from '@/hooks/useCatalog'
import { PredictionError, requestPrediction, type PredictionResponse } from '@/lib/api/student'
import { useAuth } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/env'

const STORAGE_KEY = 'uptac:last-prediction-form'

function readStoredForm(): Partial<PredictorFormState> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<PredictorFormState>) : null
  } catch {
    return null
  }
}

export function PredictorPage() {
  const [params] = useSearchParams()
  const { profile } = useAuth()
  const branches = useBranches()
  const years = useCutoffYears()
  const resultsRef = useRef<HTMLDivElement>(null)
  const [result, setResult] = useState<PredictionResponse | null>(null)

  const initial = useMemo<PredictorFormState>(() => {
    const stored = readStoredForm()
    const rankParam = params.get('rank')
    return {
      ...EMPTY_FORM,
      ...stored,
      ...(profile && !stored
        ? {
            crlRank: profile.jee_crl_rank ? String(profile.jee_crl_rank) : '',
            category: profile.category ?? '',
            gender: profile.gender ?? '',
            domicile: profile.domicile ?? '',
            branchCodes: profile.favourite_branches ?? [],
          }
        : {}),
      ...(rankParam && /^\d{1,7}$/.test(rankParam) ? { crlRank: rankParam } : {}),
    }
  }, [params, profile])

  const predict = useMutation({
    mutationFn: (request: PredictionRequest) => requestPrediction(request),
    onSuccess: (data) => {
      setResult(data)
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    },
  })

  useEffect(() => {
    if (predict.isPending) setResult(null)
  }, [predict.isPending])

  const branchNames = useMemo(() => new Map((branches.data ?? []).map((b) => [b.code, b.name])), [branches.data])
  const serverFields = predict.error instanceof PredictionError ? predict.error.fields : undefined

  return (
    <>
      <Seo
        title="UPTAC Rank Predictor"
        description="Enter your JEE Main CRL rank, category, gender and domicile to compare with verified historical UPTAC opening and closing ranks for every eligible B.Tech seat."
      />
      <PageHero
        eyebrow="Rank Predictor"
        title="Discover colleges that match your JEE Main rank"
        description="Your rank is compared with verified official UPTAC opening and closing ranks – separately for every year, round, category and seat type you are eligible for."
      />
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <Card className="p-5 sm:p-7 lg:sticky lg:top-24">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-royal-600 text-white">
              <Target className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-bold text-navy-900">Your details</h2>
              <p className="text-xs text-navy-500">Used only to compute this comparison.</p>
            </div>
          </div>
          {!isSupabaseConfigured ? (
            <ConfigNotice compact />
          ) : branches.isError ? (
            <QueryError error={branches.error} onRetry={() => branches.refetch()} />
          ) : branches.isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : (
            <PredictorForm
              initial={initial}
              branches={branches.data ?? []}
              years={years.data ?? []}
              loading={predict.isPending}
              serverErrors={serverFields}
              onSubmit={(request, form) => {
                try {
                  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form))
                } catch {
                  // storage unavailable – ignore
                }
                predict.mutate(request)
              }}
            />
          )}
          <p className="mt-6 flex items-start gap-2 border-t border-navy-100 pt-4 text-xs text-navy-500">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> We store the inputs of each prediction (rank, category, preferences – no name) to show your history and
            improve the service. See the privacy policy.
          </p>
        </Card>

        <div ref={resultsRef} className="min-w-0 scroll-mt-24" aria-live="polite">
          {predict.isPending ? (
            <div className="space-y-4">
              <Skeleton className="h-48 w-full rounded-2xl" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-2xl" />
              ))}
            </div>
          ) : predict.isError ? (
            <Alert
              tone={predict.error instanceof PredictionError && predict.error.kind === 'validation' ? 'warning' : 'error'}
              title={predict.error instanceof PredictionError && predict.error.kind === 'unavailable' ? 'Prediction service unavailable' : 'Could not complete the prediction'}
            >
              {predict.error.message}
            </Alert>
          ) : result ? (
            <PredictionResults result={result} branchNames={branchNames} />
          ) : (
            <IntroPanel />
          )}
        </div>
      </div>
    </>
  )
}

function IntroPanel() {
  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden p-8">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" aria-hidden />
        <div className="relative max-w-xl">
          <h2 className="text-2xl font-extrabold text-navy-950">What you will get</h2>
          <ul className="mt-5 space-y-3 text-sm text-navy-700">
            {[
              'Every college and branch whose historical closing rank is near or beyond your rank, for each seat you are eligible for.',
              'Opening and closing ranks for each year and counselling round, compared separately – quotas and categories are never mixed.',
              'A clear classification for each comparison, plus “Insufficient Data” wherever no verified record exists.',
              'College code, location, official website and the official source document behind every number.',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-royal-600" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <Alert tone="info" title="Advisory tool">
        UPTAC Predictor compares historical data. It does not predict future cutoffs, does not guarantee admission and is not connected to the official
        counselling portal.
      </Alert>
    </div>
  )
}
