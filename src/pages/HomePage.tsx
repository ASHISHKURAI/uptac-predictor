import { lazy, Suspense, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  ChevronDown,
  Database,
  FileSearch,
  GitCompare,
  GraduationCap,
  ListChecks,
  MapPin,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'
import { CLASSIFICATION_DESCRIPTIONS, CLASSIFICATION_LABELS, CLASSIFICATION_ORDER } from '@shared/prediction/index.ts'
import { Seo } from '@/components/common/Seo'
import { Reveal } from '@/components/common/Reveal'
import { ConfigNotice, QueryError } from '@/components/common/ConfigNotice'
import { ButtonLink, Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ClassificationBadge, CLASSIFICATION_STYLE } from '@/components/predictor/ClassificationBadge'
import { usePublicStats, useCutoffOverview } from '@/hooks/useCatalog'
import { fetchColleges } from '@/lib/api/catalog'
import { isSupabaseConfigured } from '@/lib/env'
import { cn, formatDate, formatNumber, formatRank, instituteTypeLabel, prettyName } from '@/lib/utils'

// Recharts is loaded only when the chart is rendered (keeps the landing page bundle small).
const HorizontalBars = lazy(() => import('@/components/charts/Charts').then((m) => ({ default: m.HorizontalBars })))

export function HomePage() {
  return (
    <>
      <Seo
        title="UPTAC Predictor – Your Rank. Your College. Your Future."
        description="Find your best UP B.Tech college with your JEE Main CRL rank. Compare against verified official UPTAC opening and closing ranks for every category, round and year."
      />
      <Hero />
      <StatsBand />
      <HowItWorks />
      <ClassificationScale />
      <PopularColleges />
      <CutoffOverview />
      <ToolsGrid />
      <Faq />
      <FinalCta />
    </>
  )
}

function Hero() {
  const navigate = useNavigate()
  const [rank, setRank] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = Number(rank.replace(/[,\s]/g, ''))
    if (!Number.isInteger(n) || n < 1 || n > 2_000_000) {
      setError('Enter a valid JEE Main CRL rank')
      return
    }
    navigate(`/predictor?rank=${n}`)
  }

  return (
    <section className="relative -mt-16 overflow-hidden pt-16 lg:-mt-[4.5rem] lg:pt-[4.5rem]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-royal-50 via-white to-white" aria-hidden />
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" aria-hidden />
      <div className="pointer-events-none absolute -left-24 top-16 h-80 w-80 animate-blob rounded-full bg-royal-300/40 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-16 top-40 h-96 w-96 animate-blob rounded-full bg-royal-500/20 blur-3xl [animation-delay:-6s]" aria-hidden />

      <div className="container-page relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div className="animate-fade-up">
          <Badge tone="royal" className="px-3 py-1">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> JEE Main based · UPTAC B.Tech counselling
          </Badge>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] text-navy-950 sm:text-5xl lg:text-6xl">
            Find Your <span className="text-gradient">Best College</span> With Your JEE Rank
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-navy-600">
            Compare your JEE Main CRL rank with verified official UPTAC opening and closing ranks – by category, seat type, round and year –
            and discover the B.Tech colleges and branches that fit you in Uttar Pradesh.
          </p>

          <form onSubmit={submit} className="mt-8 max-w-xl" noValidate>
            <label htmlFor="hero-rank" className="sr-only">
              Your JEE Main CRL rank
            </label>
            <div className="flex flex-col gap-2 rounded-2xl border border-navy-100 bg-white p-2 shadow-[var(--shadow-lift)] sm:flex-row">
              <div className="flex flex-1 items-center gap-3 px-3">
                <Target className="h-5 w-5 shrink-0 text-royal-600" aria-hidden />
                <input
                  id="hero-rank"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Enter your JEE Main CRL rank"
                  value={rank}
                  onChange={(e) => {
                    setRank(e.target.value)
                    setError(null)
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'hero-rank-error' : undefined}
                  className="h-12 w-full bg-transparent text-base font-medium text-navy-900 placeholder:text-navy-400 focus:outline-none"
                />
              </div>
              <Button type="submit" size="lg" className="h-12" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Start Predicting
              </Button>
            </div>
            {error && (
              <p id="hero-rank-error" role="alert" className="mt-2 pl-2 text-sm font-medium text-red-600">
                {error}
              </p>
            )}
          </form>

          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-navy-600">
            {[
              { icon: ShieldCheck, text: 'Official UPTAC data only' },
              { icon: FileSearch, text: 'Source cited on every record' },
              { icon: Scale, text: 'No made-up probabilities' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <Icon className="h-4.5 w-4.5 text-royal-600" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  )
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md animate-fade-up [animation-delay:150ms] lg:max-w-none">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-royal-500/20 via-transparent to-navy-900/10 blur-2xl" aria-hidden />
      <div className="relative rounded-3xl border border-white/60 bg-white/80 p-6 shadow-[var(--shadow-lift)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-navy-900 text-white">
              <GraduationCap className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-bold text-navy-900">How results are shown</p>
              <p className="text-xs text-navy-500">Your rank vs. historical closing rank</p>
            </div>
          </div>
          <Badge tone="green" className="shrink-0">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified
          </Badge>
        </div>

        <div className="mt-6 space-y-2.5">
          {CLASSIFICATION_ORDER.map((c, i) => (
            <div
              key={c}
              className="flex animate-fade-up items-center justify-between gap-3 rounded-2xl border border-navy-100 bg-white px-4 py-3"
              style={{ animationDelay: `${300 + i * 90}ms` }}
            >
              <ClassificationBadge value={c} size="sm" />
              <span className="hidden text-right text-[0.7rem] leading-tight text-navy-500 sm:block">{shortBand(c)}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl bg-navy-50 p-4 text-xs leading-relaxed text-navy-600">
          Every result shows the college code, branch, year, round, category, seat type and the official source document – compared separately
          for each seat group.
        </div>
      </div>
      <div className="absolute -bottom-5 -left-4 hidden animate-float items-center gap-2 rounded-2xl border border-navy-100 bg-white px-4 py-3 text-sm font-semibold text-navy-800 shadow-lg sm:flex">
        <MapPin className="h-4.5 w-4.5 text-royal-600" aria-hidden /> Uttar Pradesh B.Tech
      </div>
    </div>
  )
}

function shortBand(c: (typeof CLASSIFICATION_ORDER)[number]): string {
  switch (c) {
    case 'WITHIN_RANGE':
      return 'Rank well inside the range'
    case 'WITHIN_CLOSING':
      return 'At or just inside closing rank'
    case 'NEAR_CUTOFF':
      return 'Up to 10% beyond closing rank'
    case 'BEYOND_CUTOFF':
      return 'More than 10% beyond'
    default:
      return 'No verified record'
  }
}

function StatsBand() {
  const stats = usePublicStats()
  const s = stats.data
  const tiles = [
    { label: 'Colleges in directory', value: s ? formatNumber(s.colleges) : null, icon: Building2 },
    { label: 'Verified cutoff records', value: s ? formatNumber(s.verified_cutoff_records) : null, icon: Database },
    { label: 'Counselling years covered', value: s ? (s.years.length ? s.years.slice().sort().join(', ') : '0') : null, icon: BarChart3 },
    { label: 'Official source documents', value: s ? formatNumber(s.official_sources) : null, icon: FileSearch },
  ]
  return (
    <section aria-labelledby="stats-heading" className="relative z-10">
      <div className="container-page">
        <Reveal>
          <div className="rounded-3xl bg-navy-950 p-6 text-white shadow-[var(--shadow-lift)] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="stats-heading" className="text-lg font-bold">
                Verified database statistics
              </h2>
              <p className="text-xs text-navy-300">
                {s?.last_verified_at ? `Last verified ${formatDate(s.last_verified_at)}` : 'Live counts from the verified database'}
              </p>
            </div>
            {!isSupabaseConfigured ? (
              <p className="mt-4 text-sm text-navy-300">The database is not connected yet, so no statistics are shown. Nothing on this site is estimated or invented.</p>
            ) : stats.isError ? (
              <p className="mt-4 text-sm text-red-300">Statistics could not be loaded right now.</p>
            ) : (
              <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {tiles.map((t) => (
                  <div key={t.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <t.icon className="h-5 w-5 text-royal-300" aria-hidden />
                    <dd className="mt-3 font-display text-2xl font-extrabold tabular sm:text-3xl">
                      {t.value ?? <Skeleton className="h-8 w-20 opacity-20" />}
                    </dd>
                    <dt className="mt-1 text-xs text-navy-300 sm:text-sm">{t.label}</dt>
                  </div>
                ))}
              </dl>
            )}
            {s && s.verified_cutoff_records === 0 && (
              <p className="mt-4 rounded-xl bg-white/5 px-4 py-3 text-sm text-navy-200">
                Official cutoff data has not been imported yet. Results appear here as soon as administrators verify and publish official UPTAC
                documents.
              </p>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

const STEPS = [
  { icon: Target, title: 'Enter your rank & profile', text: 'Your JEE Main CRL rank, category, gender, domicile, sub-category and preferences.' },
  { icon: ShieldCheck, title: 'Eligibility rules applied', text: 'Only seats you are eligible for under UPTAC rules are considered – quotas are never mixed.' },
  { icon: Database, title: 'Matched with official data', text: 'Your rank is compared with verified opening & closing ranks, year by year and round by round.' },
  { icon: ListChecks, title: 'Plan your choices', text: 'Shortlist, compare colleges and build a choice list you can reorder and export as PDF.' },
]

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 sm:py-24">
      <div className="container-page">
        <SectionHeading eyebrow="How it works" title="From rank to shortlist in four clear steps" description="A transparent process with no black boxes – every number you see can be traced back to an official document." />
        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 80}>
              <li className="group relative h-full rounded-3xl border border-navy-100 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-royal-200 hover:shadow-[var(--shadow-lift)]">
                <span className="absolute right-5 top-5 font-display text-4xl font-extrabold text-navy-100 transition-colors group-hover:text-royal-100">
                  0{i + 1}
                </span>
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-royal-600 text-white shadow-[var(--shadow-glow)]">
                  <step.icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mt-5 text-lg font-bold text-navy-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-600">{step.text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

function ClassificationScale() {
  return (
    <section className="bg-navy-50/60 py-20 sm:py-24">
      <div className="container-page grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <Reveal>
          <SectionHeading
            align="left"
            eyebrow="Honest comparisons"
            title="Clear bands instead of fake percentages"
            description="Admission depends on how many students choose a seat each year, so nobody can know your exact chance. We show exactly where your rank sits against past closing ranks – nothing more, nothing less."
          />
          <ButtonLink to="/about" variant="outline" className="mt-6" rightIcon={<ArrowRight className="h-4 w-4" />}>
            Read the methodology
          </ButtonLink>
        </Reveal>
        <Reveal delay={100}>
          <div className="space-y-3">
            {CLASSIFICATION_ORDER.map((c) => {
              const s = CLASSIFICATION_STYLE[c]
              return (
                <div key={c} className="flex gap-4 rounded-2xl border border-navy-100 bg-white p-4 shadow-sm">
                  <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset', s.className)}>
                    <s.Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <p className="font-semibold text-navy-900">{CLASSIFICATION_LABELS[c]}</p>
                    <p className="mt-0.5 text-sm text-navy-600">{CLASSIFICATION_DESCRIPTIONS[c]}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function PopularColleges() {
  const query = useQuery({
    queryKey: ['home', 'popular-colleges'],
    queryFn: async () => {
      const featured = await fetchColleges({ featured: true, pageSize: 6 })
      if (featured.rows.length > 0) return featured.rows
      return (await fetchColleges({ type: 'government', pageSize: 6 })).rows
    },
    enabled: isSupabaseConfigured,
    staleTime: 10 * 60 * 1000,
  })

  return (
    <section className="py-20 sm:py-24">
      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading align="left" eyebrow="Explore" title="Popular engineering colleges" description="Government and private institutes participating in UPTAC counselling." />
          <ButtonLink to="/colleges" variant="outline" rightIcon={<ArrowRight className="h-4 w-4" />}>
            View all colleges
          </ButtonLink>
        </div>
        <div className="mt-10">
          {!isSupabaseConfigured ? (
            <ConfigNotice />
          ) : query.isError ? (
            <QueryError error={query.error} onRetry={() => query.refetch()} />
          ) : query.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-3xl" />
              ))}
            </div>
          ) : (query.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-6 w-6" />}
              title="College directory is being prepared"
              description="Colleges are added from the official UPTAC seat matrix after administrator verification."
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {query.data!.map((c, i) => (
                <Reveal key={c.code} delay={i * 60}>
                  <Link to={`/colleges/${encodeURIComponent(c.code)}`} className="group block h-full">
                    <Card interactive className="flex h-full flex-col p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-royal-500 to-navy-800 font-display text-sm font-extrabold text-white">
                          {(c.short_name ?? c.name).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}
                        </div>
                        <Badge tone={c.institute_type === 'private' ? 'outline' : 'royal'}>{instituteTypeLabel(c.institute_type)}</Badge>
                      </div>
                      <h3 className="mt-4 line-clamp-2 font-bold text-navy-900 group-hover:text-royal-700">{c.short_name ?? prettyName(c.name)}</h3>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-navy-500">
                        <MapPin className="h-4 w-4" aria-hidden /> {c.district ?? c.city ?? '—'}
                      </p>
                      <div className="mt-auto flex items-center justify-between pt-5 text-sm">
                        <span className="font-mono text-xs text-navy-400">Code {c.code}</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-royal-600">
                          Profile <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                        </span>
                      </div>
                    </Card>
                  </Link>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function CutoffOverview() {
  const overview = useCutoffOverview()
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const data = (overview.data?.branches ?? []).map((b) => ({ ...b, label: b.short_name ?? b.branch_name }))

  return (
    <section className="bg-gradient-to-b from-white to-royal-50/50 py-20 sm:py-24">
      <div className="container-page">
        <SectionHeading
          eyebrow="Previous year cutoff overview"
          title={overview.data?.year ? `UPTAC ${overview.data.year} closing ranks at a glance` : 'Closing ranks at a glance'}
          description="Median final-round closing rank (OPEN · no sub-category · gender-neutral · JEE Main CRL) across all programmes of each branch. Lower ranks mean more competitive programmes."
        />
        <Card className="mt-10 p-5 sm:p-8">
          {!isSupabaseConfigured ? (
            <ConfigNotice />
          ) : overview.isError ? (
            <QueryError error={overview.error} onRetry={() => overview.refetch()} />
          ) : overview.isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : data.length === 0 ? (
            <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No verified cutoff data yet" description="Charts appear automatically once official opening & closing rank documents are verified and published." />
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-navy-900">Median closing rank by branch – {overview.data?.year}</p>
                <div className="inline-flex rounded-xl bg-navy-50 p-1 text-sm">
                  {(['chart', 'table'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={cn('rounded-lg px-3 py-1.5 font-semibold capitalize', view === v ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500')}
                      aria-pressed={view === v}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              {view === 'chart' ? (
                <Suspense fallback={<Skeleton className="h-80 w-full" />}>
                  <HorizontalBars data={data} valueKey="median_closing" labelKey="label" name="Median closing rank" />
                </Suspense>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-navy-500">
                      <tr>
                        <th className="py-2 pr-4">Branch</th>
                        <th className="py-2 pr-4 text-right">Programmes</th>
                        <th className="py-2 pr-4 text-right">Most competitive</th>
                        <th className="py-2 pr-4 text-right">Median</th>
                        <th className="py-2 text-right">Least competitive</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {data.map((b) => (
                        <tr key={b.branch_code} className="border-t border-navy-100">
                          <td className="py-2.5 pr-4 font-medium text-navy-900">{b.branch_name}</td>
                          <td className="py-2.5 pr-4 text-right">{b.programs}</td>
                          <td className="py-2.5 pr-4 text-right">{formatRank(b.best_closing)}</td>
                          <td className="py-2.5 pr-4 text-right">{formatRank(b.median_closing)}</td>
                          <td className="py-2.5 text-right">{formatRank(b.max_closing)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-navy-100 pt-4 text-xs text-navy-500">
                <span>Source: verified official UPTAC OR-CR records · see the Data Sources page for documents.</span>
                <Link to="/cutoffs" className="font-semibold text-royal-600 hover:underline">
                  Open the Cutoff Explorer →
                </Link>
              </div>
            </>
          )}
        </Card>
      </div>
    </section>
  )
}

const TOOLS = [
  { to: '/predictor', icon: Target, title: 'Rank Predictor', text: 'Eligible colleges & branches by year and round.', accent: 'from-royal-500 to-royal-700' },
  { to: '/cutoffs', icon: BarChart3, title: 'Cutoff Explorer', text: 'Search opening & closing ranks with year comparisons.', accent: 'from-navy-700 to-navy-900' },
  { to: '/compare', icon: GitCompare, title: 'College Comparison', text: 'Fees, placements, branches and cutoffs side by side.', accent: 'from-royal-600 to-navy-800' },
  { to: '/choice-filling', icon: ListChecks, title: 'Choice Filling Assistant', text: 'Build, reorder and export your preference lists.', accent: 'from-navy-800 to-royal-600' },
]

function ToolsGrid() {
  return (
    <section className="py-20 sm:py-24">
      <div className="container-page">
        <SectionHeading eyebrow="Everything in one place" title="Tools built for UPTAC counselling" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map((t, i) => (
            <Reveal key={t.to} delay={i * 70}>
              <Link to={t.to} className="group relative block h-full overflow-hidden rounded-3xl p-6 text-white shadow-[var(--shadow-card)] transition-transform duration-300 hover:-translate-y-1">
                <div className={cn('absolute inset-0 bg-gradient-to-br', t.accent)} aria-hidden />
                <div className="bg-grid-dark absolute inset-0 opacity-50" aria-hidden />
                <div className="relative">
                  <t.icon className="h-8 w-8 text-royal-200" aria-hidden />
                  <h3 className="mt-6 text-lg font-bold">{t.title}</h3>
                  <p className="mt-1.5 text-sm text-white/75">{t.text}</p>
                  <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold">
                    Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

const FAQS = [
  {
    q: 'What is UPTAC?',
    a: 'UPTAC (Uttar Pradesh Technical Admission Counselling) is the counselling process conducted by Dr. A.P.J. Abdul Kalam Technical University (AKTU), Lucknow, for admission to B.Tech and other technical programmes in institutes of Uttar Pradesh. The official portal is uptac.samarth.edu.in.',
  },
  {
    q: 'Which rank should I enter?',
    a: 'Enter your JEE Main CRL (Common Rank List) rank exactly as shown on your scorecard. If you also know your category rank you can add it – it is compared only with records that were published as category ranks, never mixed with CRL records.',
  },
  {
    q: 'Does a result guarantee admission?',
    a: 'No. Results only compare your rank with verified historical opening and closing ranks. Cutoffs change every year and every round depending on seats, applicants and choices. We never show admission probabilities.',
  },
  {
    q: 'Where does the data come from?',
    a: 'Only from official UPTAC documents (opening & closing ranks, seat matrices) and official college sources. Each record is reviewed and verified by an administrator before publication, and every result links to its source document and academic year.',
  },
  {
    q: 'How are categories and quotas handled?',
    a: 'The predictor applies UPTAC eligibility rules: reserved-category (BC, SC, ST, EWS) and horizontal reservations (girls, AF, FF, PH, TFW) apply only to Uttar Pradesh domicile candidates. Different seat types and quotas are always shown separately and never treated as interchangeable.',
  },
  {
    q: 'Is this the official choice filling portal?',
    a: 'No. The Choice Filling Assistant is an advisory planning tool. You must submit your choices on the official UPTAC portal before the deadline.',
  },
  {
    q: 'What does "Insufficient Data" mean?',
    a: 'It means no verified official record exists for that comparison – for example a new programme, a year that has not been imported yet, or a seat that was not allotted in that round. We say so clearly instead of guessing.',
  },
]

function Faq() {
  return (
    <section id="faq" className="bg-navy-50/60 py-20 sm:py-24">
      <div className="container-page grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHeading align="left" eyebrow="FAQ" title="Frequently asked questions" description="Still unsure? Read the methodology or the disclaimer for details." />
        <div className="space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-navy-100 bg-white p-5 shadow-sm open:shadow-[var(--shadow-card)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-navy-900 [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-navy-400 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-navy-600">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="py-20">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-[2rem] bg-navy-950 px-6 py-14 text-center text-white sm:px-12">
          <div className="bg-grid-dark absolute inset-0 opacity-70" aria-hidden />
          <div className="absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-royal-600/40 blur-3xl" aria-hidden />
          <div className="relative">
            <h2 className="text-3xl font-extrabold sm:text-4xl">Your Rank. Your College. Your Future.</h2>
            <p className="mx-auto mt-4 max-w-xl text-navy-200">Start with your JEE Main CRL rank and explore every UPTAC option you are eligible for – backed by official data.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink to="/predictor" size="lg" variant="white" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Start Predicting
              </ButtonLink>
              <ButtonLink to="/auth/signup" size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                Create free account
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function SectionHeading({ eyebrow, title, description, align = 'center' }: { eyebrow?: string; title: string; description?: string; align?: 'center' | 'left' }) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.16em] text-royal-600">{eyebrow}</p>}
      <h2 className="mt-2 text-3xl font-extrabold text-navy-950 sm:text-4xl">{title}</h2>
      {description && <p className="mt-3 text-base leading-relaxed text-navy-600">{description}</p>}
    </div>
  )
}
