import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, History, Heart, ListChecks, LogOut, RotateCcw, Save, Target, Trash2, User } from 'lucide-react'
import { CLASSIFICATION_LABELS, CLASSIFICATION_ORDER } from '@shared/prediction/index.ts'
import { Seo } from '@/components/common/Seo'
import { QueryError } from '@/components/common/ConfigNotice'
import { BranchPicker } from '@/components/common/Pickers'
import { SaveCollegeButton } from '@/components/common/StudentActions'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Input, Segmented } from '@/components/ui/Form'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/supabase'
import { deletePredictionLog, listPredictionLogs, updateProfile } from '@/lib/api/student'
import { fetchCollegesByCodes } from '@/lib/api/catalog'
import { useBranches } from '@/hooks/useCatalog'
import { useChoiceLists, useSavedColleges } from '@/hooks/useStudent'
import { formatDate, formatRank, instituteTypeLabel, prettyName, timeAgo } from '@/lib/utils'
import type { Profile } from '@/lib/types'

type Tab = 'overview' | 'saved' | 'predictions' | 'branches' | 'lists' | 'profile'

export function DashboardPage() {
  const { profile, user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'overview'
  const saved = useSavedColleges()
  const lists = useChoiceLists()
  const predictions = useQuery({ queryKey: ['prediction-logs', user?.id], queryFn: () => listPredictionLogs(50), enabled: Boolean(user) })

  const name = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <>
      <Seo title="My dashboard" noindex />
      <section className="border-b border-navy-100 bg-gradient-to-b from-royal-50/70 to-white">
        <div className="container-page py-10">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-royal-600">Student dashboard</p>
          <h1 className="mt-2 text-3xl font-extrabold text-navy-950">Hi {name} 👋</h1>
          <p className="mt-1 text-navy-600">Your saved colleges, predictions and choice lists in one place.</p>
          <Tabs
            className="mt-6"
            value={tab}
            onChange={(v) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true })}
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'saved', label: 'Saved colleges', count: saved.data?.length },
              { value: 'predictions', label: 'Predictions', count: predictions.data?.length },
              { value: 'branches', label: 'Favourite branches', count: profile?.favourite_branches.length },
              { value: 'lists', label: 'Choice lists', count: lists.data?.length },
              { value: 'profile', label: 'Profile' },
            ]}
          />
        </div>
      </section>
      <div className="container-page py-8">
        {tab === 'overview' && <Overview savedCount={saved.data?.length ?? 0} listCount={lists.data?.length ?? 0} predictionCount={predictions.data?.length ?? 0} profile={profile} />}
        {tab === 'saved' && <SavedColleges />}
        {tab === 'predictions' && <Predictions query={predictions} />}
        {tab === 'branches' && profile && <FavouriteBranches profile={profile} />}
        {tab === 'lists' && <Lists />}
        {tab === 'profile' && profile && <ProfileForm profile={profile} />}
      </div>
    </>
  )
}

function Overview({ savedCount, listCount, predictionCount, profile }: { savedCount: number; listCount: number; predictionCount: number; profile: Profile | null }) {
  const tiles = [
    { label: 'Saved colleges', value: savedCount, icon: Bookmark, to: '?tab=saved' },
    { label: 'Predictions run', value: predictionCount, icon: History, to: '?tab=predictions' },
    { label: 'Choice lists', value: listCount, icon: ListChecks, to: '?tab=lists' },
    { label: 'Favourite branches', value: profile?.favourite_branches.length ?? 0, icon: Heart, to: '?tab=branches' },
  ]
  const complete = Boolean(profile?.jee_crl_rank && profile.category && profile.gender && profile.domicile)
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to}>
            <Card interactive className="p-5">
              <t.icon className="h-5 w-5 text-royal-600" aria-hidden />
              <p className="mt-3 font-display text-3xl font-extrabold tabular text-navy-950">{t.value}</p>
              <p className="text-sm text-navy-500">{t.label}</p>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-bold text-navy-900">{complete ? 'Ready when you are' : 'Complete your profile for faster predictions'}</h2>
          <p className="mt-1 text-sm text-navy-500">
            {complete
              ? `CRL rank ${formatRank(profile?.jee_crl_rank)} · ${profile?.category} · ${profile?.domicile === 'UP' ? 'UP domicile' : 'Other state'} – the predictor is pre-filled with these details.`
              : 'Save your rank, category, gender and domicile once and the predictor fills them in for you.'}
          </p>
        </div>
        <div className="flex gap-2">
          {!complete && (
            <ButtonLink to="?tab=profile" variant="outline">
              Edit profile
            </ButtonLink>
          )}
          <ButtonLink to="/predictor" leftIcon={<Target className="h-4 w-4" />}>
            Run predictor
          </ButtonLink>
        </div>
      </Card>
    </div>
  )
}

function SavedColleges() {
  const saved = useSavedColleges()
  const codes = (saved.data ?? []).map((s) => s.college_code)
  const colleges = useQuery({ queryKey: ['colleges-by-code', codes], queryFn: () => fetchCollegesByCodes(codes), enabled: codes.length > 0 })
  if (saved.isLoading || colleges.isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />
  if (saved.isError) return <QueryError error={saved.error} onRetry={() => saved.refetch()} />
  if (codes.length === 0)
    return <EmptyState icon={<Bookmark className="h-6 w-6" />} title="No saved colleges yet" description="Save colleges from the directory, profiles or predictor results." action={<ButtonLink to="/colleges">Browse colleges</ButtonLink>} />
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ButtonLink to={`/compare?c=${codes.slice(0, 4).join(',')}`} variant="outline" size="sm">
          Compare first {Math.min(4, codes.length)}
        </ButtonLink>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(saved.data ?? []).map((s) => {
          const c = colleges.data?.find((x) => x.code === s.college_code)
          return (
            <Card key={s.id} className="flex flex-col p-5">
              <Badge tone="royal" className="self-start">{instituteTypeLabel(c?.institute_type)}</Badge>
              <Link to={`/colleges/${encodeURIComponent(s.college_code)}`} className="mt-3 font-bold text-navy-900 hover:text-royal-700">
                {c ? c.short_name ?? prettyName(c.name) : s.college_code}
              </Link>
              <p className="text-sm text-navy-500">{[c?.city, c?.district].filter(Boolean).join(', ') || '—'}</p>
              <div className="mt-auto flex items-center justify-between pt-4">
                <span className="text-xs text-navy-400">Saved {timeAgo(s.created_at)}</span>
                <SaveCollegeButton code={s.college_code} compact />
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function Predictions({ query }: { query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof listPredictionLogs>>>> }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const del = useMutation({
    mutationFn: deletePredictionLog,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['prediction-logs'] }),
    onError: (e) => toast.error('Could not delete', errorMessage(e)),
  })
  if (query.isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />
  if (query.isError) return <QueryError error={query.error} onRetry={() => query.refetch()} />
  const logs = query.data ?? []
  if (logs.length === 0)
    return <EmptyState icon={<History className="h-6 w-6" />} title="No predictions yet" description="Predictions you run while signed in are listed here." action={<ButtonLink to="/predictor">Run predictor</ButtonLink>} />

  const rerun = (input: (typeof logs)[number]['input']) => {
    try {
      sessionStorage.setItem(
        'uptac:last-prediction-form',
        JSON.stringify({
          crlRank: String(input.crlRank),
          categoryRank: input.categoryRank ? String(input.categoryRank) : '',
          admissionYear: input.admissionYear,
          category: input.category,
          gender: input.gender,
          domicile: input.domicile,
          subCategories: input.subCategories ?? [],
          branchCodes: input.branchCodes ?? [],
          institutePreference: input.institutePreference ?? 'both',
          years: input.years ?? [],
        }),
      )
    } catch {
      // ignore storage errors
    }
    navigate('/predictor')
  }

  return (
    <Card>
      <ul className="divide-y divide-navy-100">
        {logs.map((l) => (
          <li key={l.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-navy-900">
                CRL rank {formatRank(l.input.crlRank)} · {l.input.category} · {l.input.gender === 'FEMALE' ? 'Female' : 'Male'} · {l.input.domicile === 'UP' ? 'UP' : 'Other state'}
              </p>
              <p className="text-xs text-navy-500">
                {formatDate(l.created_at, true)} · {l.result_count} programmes · years {l.data_years.join(', ') || '—'}
                {(l.input.branchCodes?.length ?? 0) > 0 && ` · ${l.input.branchCodes!.length} preferred branches`}
              </p>
              {l.summary.by_classification && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CLASSIFICATION_ORDER.filter((c) => (l.summary.by_classification?.[c] ?? 0) > 0).map((c) => (
                    <Badge key={c} tone="neutral">
                      {CLASSIFICATION_LABELS[c]}: {l.summary.by_classification![c]}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => rerun(l.input)}>
                Run again
              </Button>
              <Button variant="ghost" size="sm" onClick={() => del.mutate(l.id)} aria-label="Delete prediction" className="text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function FavouriteBranches({ profile }: { profile: Profile }) {
  const branches = useBranches()
  const { refreshProfile } = useAuth()
  const toast = useToast()
  const [value, setValue] = useState(profile.favourite_branches)
  const save = useMutation({
    mutationFn: () => updateProfile(profile.id, { favourite_branches: value }),
    onSuccess: async () => {
      await refreshProfile()
      toast.success('Favourite branches saved', 'They will be pre-selected in the predictor.')
    },
    onError: (e) => toast.error('Could not save', errorMessage(e)),
  })
  return (
    <Card>
      <CardHeader icon={<Heart className="h-5 w-5" />} title="Favourite branches" description="Pre-selected as preferred branches whenever you open the predictor." action={<Button size="sm" loading={save.isPending} onClick={() => save.mutate()} leftIcon={<Save className="h-4 w-4" />}>Save</Button>} />
      <CardBody>{branches.isLoading ? <Skeleton className="h-72 w-full" /> : <BranchPicker branches={branches.data ?? []} value={value} onChange={setValue} max={50} />}</CardBody>
    </Card>
  )
}

function Lists() {
  const lists = useChoiceLists()
  if (lists.isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />
  if (lists.isError) return <QueryError error={lists.error} onRetry={() => lists.refetch()} />
  if ((lists.data ?? []).length === 0)
    return <EmptyState icon={<ListChecks className="h-6 w-6" />} title="No choice lists yet" description="Plan your preferences with the Choice Filling Assistant." action={<ButtonLink to="/choice-filling">Open assistant</ButtonLink>} />
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {lists.data!.map((l) => (
        <Link key={l.id} to="/choice-filling">
          <Card interactive className="p-5">
            <ListChecks className="h-5 w-5 text-royal-600" aria-hidden />
            <p className="mt-3 font-bold text-navy-900">{l.name}</p>
            <p className="text-sm text-navy-500">
              {l.item_count} choices · updated {timeAgo(l.updated_at)}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  )
}

function ProfileForm({ profile }: { profile: Profile }) {
  const { refreshProfile, signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: profile.full_name ?? '',
    jee_crl_rank: profile.jee_crl_rank ? String(profile.jee_crl_rank) : '',
    category: profile.category ?? '',
    gender: profile.gender ?? '',
    domicile: profile.domicile ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setError(null), [form])
  const rank = useMemo(() => (form.jee_crl_rank ? Number(form.jee_crl_rank.replace(/,/g, '')) : null), [form.jee_crl_rank])

  const save = useMutation({
    mutationFn: () =>
      updateProfile(profile.id, {
        full_name: form.full_name.trim() || null,
        jee_crl_rank: rank,
        category: (form.category || null) as Profile['category'],
        gender: (form.gender || null) as Profile['gender'],
        domicile: (form.domicile || null) as Profile['domicile'],
      }),
    onSuccess: async () => {
      await refreshProfile()
      toast.success('Profile updated')
    },
    onError: (e) => toast.error('Could not update profile', errorMessage(e)),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (rank !== null && (!Number.isInteger(rank) || rank < 1 || rank > 2_000_000)) return setError('Enter a valid CRL rank.')
    save.mutate()
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader icon={<User className="h-5 w-5" />} title="Profile" description={`Signed in as ${profile.email ?? '—'} · member since ${formatDate(profile.created_at)}`} />
      <CardBody>
        <form onSubmit={submit} className="space-y-5">
          <Field label="Full name">{({ id }) => <Input id={id} value={form.full_name} maxLength={120} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />}</Field>
          <Field label="JEE Main CRL rank" error={error} hint="Optional – used to pre-fill the predictor.">
            {({ id, invalid }) => <Input id={id} inputMode="numeric" value={form.jee_crl_rank} onChange={(e) => setForm({ ...form, jee_crl_rank: e.target.value.replace(/[^\d,]/g, '') })} aria-invalid={invalid} />}
          </Field>
          <Field label="Category">
            {() => (
              <Segmented
                name="p-category"
                value={form.category as 'OPEN'}
                onChange={(v) => setForm({ ...form, category: v })}
                className="grid-cols-3! sm:grid-cols-5!"
                options={[
                  { value: 'OPEN', label: 'General' },
                  { value: 'BC', label: 'OBC-NCL' },
                  { value: 'SC', label: 'SC' },
                  { value: 'ST', label: 'ST' },
                  { value: 'EWS', label: 'EWS' },
                ]}
              />
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Gender">
              {() => <Segmented name="p-gender" value={form.gender as 'MALE'} onChange={(v) => setForm({ ...form, gender: v })} options={[{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }]} />}
            </Field>
            <Field label="Domicile">
              {() => <Segmented name="p-domicile" value={form.domicile as 'UP'} onChange={(v) => setForm({ ...form, domicile: v })} options={[{ value: 'UP', label: 'Uttar Pradesh' }, { value: 'OTHER', label: 'Other State' }]} />}
            </Field>
          </div>
          <div className="flex flex-wrap justify-between gap-3 border-t border-navy-100 pt-5">
            <Button
              variant="ghost"
              leftIcon={<LogOut className="h-4 w-4" />}
              onClick={async () => {
                await signOut()
                navigate('/')
              }}
            >
              Sign out
            </Button>
            <Button type="submit" loading={save.isPending} leftIcon={<Save className="h-4 w-4" />}>
              Save profile
            </Button>
          </div>
          <p className="text-xs text-navy-500">
            To delete your account and all personal data, contact the site administrator (see the <Link to="/privacy" className="text-royal-600 underline">privacy policy</Link>).
          </p>
        </form>
      </CardBody>
    </Card>
  )
}
