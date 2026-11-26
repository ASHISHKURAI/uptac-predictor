import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ExternalLink, FileText, Globe, Info, ListChecks, MapPin, Search, ShieldCheck, TriangleAlert } from 'lucide-react'
import {
  CLASSIFICATION_LABELS,
  CLASSIFICATION_ORDER,
  DOMICILE_LABELS,
  QUOTA_LABELS,
  RANK_TYPE_LABELS,
  describeSeat,
  type Classification,
  type ProgramResult,
  type SeatGroupResult,
  type SourceInfo,
} from '@shared/prediction/index.ts'
import type { PredictionResponse } from '@/lib/api/student'
import { cn, formatNumber, formatRank, instituteTypeLabel, prettyName } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/Form'
import { Sparkline } from '@/components/charts/Charts'
import { AddToChoiceListButton, SaveCollegeButton } from '@/components/common/StudentActions'
import { ClassificationBadge, CLASSIFICATION_STYLE } from './ClassificationBadge'

const PAGE = 20

export function PredictionResults({ result, branchNames }: { result: PredictionResponse; branchNames: Map<string, string> }) {
  const [filter, setFilter] = useState<Classification | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [type, setType] = useState<'all' | 'government' | 'private' | 'university'>('all')
  const [sort, setSort] = useState<'band' | 'closing' | 'name'>('band')
  const [visible, setVisible] = useState(PAGE)
  const sourceById = useMemo(() => new Map(result.sources.map((s) => [s.id, s])), [result.sources])

  const programs = useMemo(() => {
    const term = search.trim().toLowerCase()
    let list = result.programs.filter((p) => {
      if (filter !== 'ALL' && p.best_classification !== filter) return false
      if (type === 'government' && !['government', 'aided'].includes(p.college.institute_type)) return false
      if (type === 'private' && p.college.institute_type !== 'private') return false
      if (type === 'university' && p.college.institute_type !== 'university') return false
      if (term && !`${p.college.name} ${p.college.short_name ?? ''} ${p.college.code} ${p.branch.name} ${p.college.district ?? ''} ${p.college.city ?? ''}`.toLowerCase().includes(term)) return false
      return true
    })
    if (sort === 'closing') list = [...list].sort((a, b) => (a.reference_closing_rank ?? Infinity) - (b.reference_closing_rank ?? Infinity))
    if (sort === 'name') list = [...list].sort((a, b) => a.college.name.localeCompare(b.college.name) || a.branch.name.localeCompare(b.branch.name))
    return list
  }, [result.programs, filter, search, type, sort])

  const r = result.request

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-navy-950 p-6 text-white sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-royal-300">Your comparison</p>
              <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">
                {formatNumber(result.summary.programs)} programmes matched for CRL rank {formatRank(r.crlRank)}
              </h2>
              <p className="mt-2 text-sm text-navy-300">
                {categoryName(r.category)} · {r.gender === 'FEMALE' ? 'Female' : 'Male'} · {r.domicile === 'UP' ? 'UP domicile' : 'Other state'}
                {r.subCategories.length > 0 && ` · ${r.subCategories.join(', ')}`} · Years {result.years.length ? result.years.join(', ') : '—'}
              </p>
            </div>
            <Badge tone="green" className="bg-emerald-400/15 text-emerald-200 ring-emerald-400/30">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verified official data only
            </Badge>
          </div>
          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by classification">
            <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')} label="All" count={result.summary.programs} />
            {CLASSIFICATION_ORDER.filter((c) => c !== 'INSUFFICIENT_DATA').map((c) => (
              <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)} label={CLASSIFICATION_LABELS[c]} count={result.summary.by_classification[c]} dot={CLASSIFICATION_STYLE[c].dot} />
            ))}
          </div>
        </div>
        <div className="space-y-3 p-5 sm:p-6">
          {result.years.length === 0 && (
            <Alert tone="warning" title="Insufficient data">
              No verified counselling data is available for the selected years yet. Results will appear once official documents are verified and published.
            </Alert>
          )}
          {result.years_without_data.length > 0 && result.years.length > 0 && (
            <Alert tone="warning" title={`Insufficient data for ${result.years_without_data.join(', ')}`}>
              No verified record matching your profile exists for {result.years_without_data.length === 1 ? 'this year' : 'these years'}. Those years are marked “Insufficient Data” in every result.
            </Alert>
          )}
          {result.branches_without_data.length > 0 && (
            <Alert tone="info" title="Some preferred branches have no matching records">
              {result.branches_without_data.map((b) => branchNames.get(b) ?? b).join(', ')} – no verified cutoff record matches your eligibility in the selected years (Insufficient Data).
            </Alert>
          )}
          {result.truncated && (
            <Alert tone="info" title="Showing the most relevant programmes">
              {formatNumber(result.total_groups)} seat groups matched; the {formatNumber(result.summary.seat_groups)} closest to your rank are shown. Choose preferred branches or a college type to narrow the search.
            </Alert>
          )}
          <EligibilityNotes notes={result.eligibility.notes} bands={result.bands} />
        </div>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setVisible(PAGE) }} placeholder="Filter by college, branch or district…" leftIcon={<Search className="h-4 w-4" />} aria-label="Filter results" />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="sm:w-44" aria-label="Institute type">
          <option value="all">All institute types</option>
          <option value="government">Government & aided</option>
          <option value="private">Private</option>
          <option value="university">University</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="sm:w-52" aria-label="Sort results">
          <option value="band">Sort: best band first</option>
          <option value="closing">Sort: closing rank (competitive first)</option>
          <option value="name">Sort: college name</option>
        </Select>
      </div>

      {programs.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title={result.programs.length === 0 ? 'No matching programmes found' : 'No programmes match these filters'}
          description={
            result.programs.length === 0
              ? 'No verified seat group you are eligible for had a closing rank near your rank in the selected years. Try other branches, include both college types, or check back after more official data is published.'
              : 'Clear the search or choose a different classification.'
          }
        />
      ) : (
        <ul className="space-y-4">
          {programs.slice(0, visible).map((p) => (
            <li key={p.key}>
              <ProgramCard program={p} sourceById={sourceById} />
            </li>
          ))}
        </ul>
      )}
      {visible < programs.length && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setVisible((v) => v + PAGE)}>
            Show more ({formatNumber(programs.length - visible)} remaining)
          </Button>
        </div>
      )}

      <SourcesList sources={result.sources} />
      <Alert tone="warning" title="This is not an admission guarantee">
        {result.disclaimer}
      </Alert>
    </div>
  )
}

function FilterChip({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
        active ? 'bg-white text-navy-900' : 'bg-white/10 text-white hover:bg-white/15',
      )}
    >
      {dot && <span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden />}
      {label}
      <span className={cn('rounded-full px-1.5 tabular', active ? 'bg-navy-100' : 'bg-white/15')}>{count}</span>
    </button>
  )
}

function EligibilityNotes({ notes, bands }: { notes: string[]; bands: PredictionResponse['bands'] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl bg-navy-50/70">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-navy-800">
        <span className="flex items-center gap-2">
          <Info className="h-4 w-4 text-royal-600" aria-hidden /> Eligibility rules & bands applied to your profile
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4 text-sm text-navy-700">
          <ul className="list-disc space-y-1 pl-5">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="text-xs text-navy-500">
            Bands: “Within Range” = rank ≤ closing rank − {Math.round(bands.comfortMargin * 100)}%; “Within Closing Rank” = up to the closing rank; “Near Cutoff” = up to{' '}
            {Math.round(bands.nearMargin * 100)}% beyond it; “Beyond” = further away. These are descriptive comparisons, not probabilities.
          </p>
        </div>
      )}
    </div>
  )
}

function ProgramCard({ program: p, sourceById }: { program: ProgramResult; sourceById: Map<string, SourceInfo> }) {
  const [open, setOpen] = useState(false)
  const best = p.seat_groups[0]
  const label = `${p.college.short_name ?? prettyName(p.college.name)} – ${p.branch.name}${p.shift ? ` (Shift ${p.shift})` : ''}`
  return (
    <Card className="transition-shadow hover:shadow-[var(--shadow-lift)]">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ClassificationBadge value={p.best_classification} />
              <Badge tone={p.college.institute_type === 'private' ? 'outline' : 'royal'}>{instituteTypeLabel(p.college.institute_type)}</Badge>
              <span className="font-mono text-xs text-navy-400">College code {p.college.code}</span>
            </div>
            <h3 className="mt-3 text-lg font-bold text-navy-950">
              <Link to={`/colleges/${encodeURIComponent(p.college.code)}`} className="hover:text-royal-700">
                {p.college.short_name ?? prettyName(p.college.name)}
              </Link>
            </h3>
            <p className="mt-0.5 font-semibold text-royal-700">
              {p.branch.name}
              {p.shift && <span className="ml-1.5 whitespace-nowrap text-sm font-medium text-navy-500">· Shift {p.shift}</span>}
              <span className="ml-1.5 font-mono text-xs font-medium text-navy-400">({p.branch.code})</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy-500">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden />
                {[p.college.city, p.college.district].filter(Boolean).join(', ') || '—'}
              </span>
              {p.college.website && (
                <a href={p.college.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-royal-600 hover:underline">
                  <Globe className="h-4 w-4" aria-hidden /> Official website
                </a>
              )}
            </div>
          </div>
          {best && (
            <div className="flex shrink-0 items-center gap-5 rounded-2xl bg-navy-50/70 px-4 py-3">
              <div>
                <p className="text-xs text-navy-500">
                  {best.latest_year_with_data ? `${best.latest_year_with_data} last regular round closing` : 'Closing rank'}
                </p>
                <p className="font-display text-xl font-extrabold tabular text-navy-950">{formatRank(p.reference_closing_rank)}</p>
                <p className="text-[0.7rem] text-navy-500">{describeSeat(best)}</p>
              </div>
              <Sparkline points={best.closing_trend.map((t) => ({ year: t.year, value: t.closing_rank }))} />
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} rightIcon={<ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />}>
            {open ? 'Hide' : 'Show'} year & round details ({p.seat_groups.length} seat {p.seat_groups.length === 1 ? 'group' : 'groups'})
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <SaveCollegeButton code={p.college.code} compact />
            <AddToChoiceListButton collegeCode={p.college.code} branchCode={p.branch.code} shift={p.shift} label={label} />
          </div>
        </div>
      </div>
      {open && (
        <div className="space-y-5 border-t border-navy-100 bg-navy-50/30 p-5 sm:p-6">
          {p.seat_groups.map((g) => (
            <SeatGroupDetail key={g.key} group={g} sourceById={sourceById} />
          ))}
        </div>
      )}
    </Card>
  )
}

function SeatGroupDetail({ group: g, sourceById }: { group: SeatGroupResult; sourceById: Map<string, SourceInfo> }) {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-navy-900">
            {describeSeat(g)} {g.category_code && <span className="ml-1 font-mono text-xs text-navy-400">{g.category_code}</span>}
          </p>
          <p className="text-xs text-navy-500">
            Seat type: {QUOTA_LABELS[g.quota]} · {DOMICILE_LABELS[g.domicile]} · Compared with your {RANK_TYPE_LABELS[g.rank_type]} {formatRank(g.compared_rank)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-navy-500">
            Within closing rank in {g.years_within_closing} of {g.years_with_data} {g.years_with_data === 1 ? 'year' : 'years'} with data
          </span>
          <ClassificationBadge value={g.classification} size="sm" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-navy-500">
            <tr className="border-b border-navy-100">
              <th className="px-4 py-2">Year</th>
              <th className="px-4 py-2">Round</th>
              <th className="px-4 py-2 text-right">Opening rank</th>
              <th className="px-4 py-2 text-right">Closing rank</th>
              <th className="px-4 py-2">Classification</th>
              <th className="px-4 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {g.years.map((y) =>
              y.rounds.length === 0 ? (
                <tr key={y.year} className="border-b border-navy-100/70">
                  <td className="px-4 py-2.5 font-semibold text-navy-900">{y.year}</td>
                  <td className="px-4 py-2.5 text-navy-400" colSpan={3}>
                    No verified record for this seat group
                  </td>
                  <td className="px-4 py-2.5">
                    <ClassificationBadge value="INSUFFICIENT_DATA" size="sm" />
                  </td>
                  <td className="px-4 py-2.5 text-navy-400">—</td>
                </tr>
              ) : (
                y.rounds.map((rd, i) => {
                  const src = sourceById.get(rd.source_id)
                  const isFinal = y.final_round?.round_number === rd.round_number
                  return (
                    <tr key={`${y.year}-${rd.round_number}`} className={cn('border-b border-navy-100/70', isFinal && 'bg-royal-50/40')}>
                      <td className="px-4 py-2.5 font-semibold text-navy-900">{i === 0 ? y.year : ''}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-navy-700">
                        {rd.round_label ?? `Round ${rd.round_number}`}
                        {isFinal && <span className="ml-1.5 text-[0.68rem] font-semibold uppercase text-royal-600" title="Round used for this year's classification (last regular round)">used</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">{formatRank(rd.opening_rank)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular text-navy-900">{formatRank(rd.closing_rank)}</td>
                      <td className="px-4 py-2.5">
                        <ClassificationBadge value={rd.classification} size="sm" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-navy-500">
                        {src?.url ? (
                          <a href={src.url} target="_blank" rel="noopener noreferrer" title={src.title} className="inline-flex items-center gap-1 text-royal-600 hover:underline">
                            Source <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        ) : (
                          <span title={src?.title ?? 'Official document'}>Official doc</span>
                        )}
                        {rd.source_page && ` · p.${rd.source_page}`}
                      </td>
                    </tr>
                  )
                })
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SourcesList({ sources }: { sources: SourceInfo[] }) {
  if (sources.length === 0) return null
  return (
    <Card className="p-5 sm:p-6">
      <h3 className="flex items-center gap-2 text-base font-bold text-navy-900">
        <FileText className="h-5 w-5 text-royal-600" aria-hidden /> Source of cutoff information
      </h3>
      <ul className="mt-3 divide-y divide-navy-100 text-sm">
        {sources.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="text-navy-800">
              {s.title} {s.academic_year && <Badge tone="neutral" className="ml-1">{s.academic_year}</Badge>}
            </span>
            {s.url && (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-royal-600 hover:underline">
                Official link <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-navy-500">
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Always confirm figures with the official UPTAC portal.{' '}
        <Link to="/choice-filling" className="inline-flex items-center gap-1 font-semibold text-royal-600 hover:underline">
          <ListChecks className="h-3.5 w-3.5" aria-hidden /> Plan your choices
        </Link>
      </p>
    </Card>
  )
}

function categoryName(c: string): string {
  return c === 'OPEN' ? 'General' : c === 'BC' ? 'OBC-NCL' : c
}
