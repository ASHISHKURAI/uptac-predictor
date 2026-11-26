import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BarChart3, Briefcase, Building2, ExternalLink, GitCompare, Globe, IndianRupee, Layers, MapPin } from 'lucide-react'
import { CATEGORY_LABELS, SEAT_TYPE_LABELS, describeSeat } from '@shared/prediction/labels.ts'
import { Seo } from '@/components/common/Seo'
import { ConfigNotice, QueryError } from '@/components/common/ConfigNotice'
import { SaveCollegeButton, AddToChoiceListButton } from '@/components/common/StudentActions'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Select } from '@/components/ui/Form'
import { EmptyState, PageLoader, Skeleton } from '@/components/ui/Feedback'
import { Table, TableWrap, Td, Th, THead, Tr } from '@/components/ui/Table'
import { ChartFrame, Legend, MultiLine } from '@/components/charts/Charts'
import { seriesColor } from '@/components/charts/theme'
import { fetchCollege, fetchFees, fetchOfferings, fetchPlacements, fetchProgramCutoffs, fetchPublicSources } from '@/lib/api/catalog'
import { useBranches } from '@/hooks/useCatalog'
import { isSupabaseConfigured } from '@/lib/env'
import { formatCurrency, formatLpa, formatNumber, formatRank, instituteTypeLabel, prettyName } from '@/lib/utils'
import type { CollegeFee, PlacementRecord } from '@/lib/types'

export function CollegeDetailPage() {
  const { code = '' } = useParams()
  const college = useQuery({ queryKey: ['college', code], queryFn: () => fetchCollege(code), enabled: isSupabaseConfigured && Boolean(code) })
  const offerings = useQuery({ queryKey: ['offerings', code], queryFn: () => fetchOfferings([code]), enabled: Boolean(college.data) })
  const fees = useQuery({ queryKey: ['fees', code], queryFn: () => fetchFees([code]), enabled: Boolean(college.data) })
  const placements = useQuery({ queryKey: ['placements', code], queryFn: () => fetchPlacements([code]), enabled: Boolean(college.data) })
  const branches = useBranches()
  const branchName = useMemo(() => new Map((branches.data ?? []).map((b) => [b.code, b.name])), [branches.data])

  if (!isSupabaseConfigured) return <div className="container-page py-16"><ConfigNotice /></div>
  if (college.isLoading) return <PageLoader />
  if (college.isError) return <div className="container-page py-16"><QueryError error={college.error} onRetry={() => college.refetch()} /></div>
  const c = college.data
  if (!c) {
    return (
      <div className="container-page py-16">
        <EmptyState icon={<Building2 className="h-6 w-6" />} title="College not found" description={`No active college with code ${code} exists in the directory.`} action={<ButtonLink to="/colleges">Back to directory</ButtonLink>} />
      </div>
    )
  }
  const display = c.short_name ?? prettyName(c.name)

  return (
    <>
      <Seo title={`${display} – cutoffs, branches & fees`} description={`UPTAC opening and closing ranks, branches, fees and placements for ${display} (code ${c.code}), ${c.district ?? c.city ?? 'Uttar Pradesh'}.`} />
      <section className="relative overflow-hidden border-b border-navy-100 bg-gradient-to-b from-royal-50/70 to-white">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
        <div className="container-page relative py-10">
          <Link to="/colleges" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-royal-700">
            <ArrowLeft className="h-4 w-4" aria-hidden /> College directory
          </Link>
          <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={c.institute_type === 'private' ? 'outline' : 'royal'}>{instituteTypeLabel(c.institute_type)}</Badge>
                <Badge tone="neutral" className="font-mono">Code {c.code}</Badge>
                {c.naac_grade && <Badge tone="green">NAAC {c.naac_grade}</Badge>}
              </div>
              <h1 className="mt-3 text-3xl font-extrabold text-navy-950 sm:text-4xl">{display}</h1>
              <p className="mt-1 text-sm text-navy-500">Official name: {c.name}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-navy-600">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" aria-hidden /> {[c.address, c.city, c.district, c.pincode].filter(Boolean).join(', ') || '—'}
                </span>
                {c.website && (
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-royal-600 hover:underline">
                    <Globe className="h-4 w-4" aria-hidden /> Official website <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <SaveCollegeButton code={c.code} />
              <ButtonLink to={`/compare?c=${encodeURIComponent(c.code)}`} variant="outline" leftIcon={<GitCompare className="h-4 w-4" />}>
                Compare
              </ButtonLink>
            </div>
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { k: 'Established', v: c.established_year ?? '—' },
              { k: 'Affiliation', v: c.affiliated_university ?? '—' },
              { k: 'Branches offered', v: offerings.data ? new Set(offerings.data.map((o) => o.branch_code)).size : '—' },
              { k: 'District', v: c.district ?? '—' },
            ].map((x) => (
              <div key={x.k} className="rounded-2xl border border-navy-100 bg-white p-4">
                <dt className="text-xs text-navy-500">{x.k}</dt>
                <dd className="mt-1 truncate font-semibold text-navy-900">{x.v}</dd>
              </div>
            ))}
          </dl>
          {c.description && <p className="mt-6 max-w-3xl text-sm leading-relaxed text-navy-600">{c.description}</p>}
        </div>
      </section>

      <div className="container-page space-y-8 py-10">
        <Card>
          <CardHeader icon={<Layers className="h-5 w-5" />} title="Available branches" description="From verified official seat matrix and OR-CR records." />
          <CardBody>
            {offerings.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : offerings.isError ? (
              <QueryError error={offerings.error} />
            ) : (offerings.data ?? []).length === 0 ? (
              <EmptyState title="No verified branch data yet" description="Branches appear once the official seat matrix or OR-CR document for this college is verified." />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <Th>Branch</Th>
                      <Th>Shift</Th>
                      <Th>Latest year</Th>
                      <Th className="text-right">Seats (latest matrix)</Th>
                      <Th />
                    </tr>
                  </THead>
                  <tbody>
                    {offerings.data!
                      .slice()
                      .sort((a, b) => (branchName.get(a.branch_code) ?? a.branch_code).localeCompare(branchName.get(b.branch_code) ?? b.branch_code))
                      .map((o) => (
                        <Tr key={`${o.branch_code}-${o.shift}`}>
                          <Td className="font-medium">{branchName.get(o.branch_code) ?? o.program_name ?? o.branch_code}</Td>
                          <Td>{o.shift || '—'}</Td>
                          <Td>{o.latest_year}</Td>
                          <Td className="text-right tabular">{formatNumber(o.latest_total_seats)}</Td>
                          <Td className="text-right">
                            <AddToChoiceListButton
                              compact
                              collegeCode={c.code}
                              branchCode={o.branch_code}
                              shift={o.shift}
                              label={`${display} – ${branchName.get(o.branch_code) ?? o.branch_code}`}
                            />
                          </Td>
                        </Tr>
                      ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </CardBody>
        </Card>

        <CutoffSection collegeCode={c.code} branchOptions={[...new Set((offerings.data ?? []).map((o) => o.branch_code))]} branchName={branchName} />

        <div className="grid gap-8 lg:grid-cols-2">
          <FeesCard fees={fees.data} loading={fees.isLoading} error={fees.error} />
          <PlacementsCard placements={placements.data} loading={placements.isLoading} error={placements.error} />
        </div>
      </div>
    </>
  )
}

function CutoffSection({ collegeCode, branchOptions, branchName }: { collegeCode: string; branchOptions: string[]; branchName: Map<string, string> }) {
  const [branch, setBranch] = useState<string>('')
  const selected = branch || branchOptions[0] || ''
  const cutoffs = useQuery({ queryKey: ['program-cutoffs', collegeCode, selected], queryFn: () => fetchProgramCutoffs(collegeCode, selected), enabled: Boolean(selected) })
  const [seatKey, setSeatKey] = useState('')
  const [view, setView] = useState<'chart' | 'table'>('chart')

  const seatGroups = useMemo(() => {
    const map = new Map<string, { label: string; code: string | null }>()
    for (const r of cutoffs.data ?? []) {
      const key = `${r.category}|${r.seat_type}|${r.gender}|${r.quota}|${r.rank_type}|${r.shift}`
      if (!map.has(key)) map.set(key, { label: `${describeSeat(r)}${r.shift ? ` · Shift ${r.shift}` : ''}${r.rank_type === 'CATEGORY' ? ' · category rank' : ''}`, code: r.category_code })
    }
    return [...map.entries()].sort((a, b) => (a[0].startsWith('OPEN|GENERAL|NEUTRAL') ? -1 : b[0].startsWith('OPEN|GENERAL|NEUTRAL') ? 1 : a[1].label.localeCompare(b[1].label)))
  }, [cutoffs.data])
  const activeSeat = seatKey && seatGroups.some(([k]) => k === seatKey) ? seatKey : seatGroups[0]?.[0] ?? ''

  const rows = useMemo(
    () => (cutoffs.data ?? []).filter((r) => `${r.category}|${r.seat_type}|${r.gender}|${r.quota}|${r.rank_type}|${r.shift}` === activeSeat),
    [cutoffs.data, activeSeat],
  )
  const years = [...new Set(rows.map((r) => r.academic_year))].sort().slice(-5)
  const rounds = [...new Set(rows.map((r) => r.round_number))].sort((a, b) => a - b)
  const chartData = rounds.map((round) => {
    const point: Record<string, string | number | null> = { round: `R${round}` }
    for (const y of years) point[String(y)] = rows.find((r) => r.academic_year === y && r.round_number === round)?.closing_rank ?? null
    return point
  })
  const sources = useQuery({
    queryKey: ['sources', [...new Set(rows.map((r) => r.source_id))].sort()],
    queryFn: () => fetchPublicSources([...new Set(rows.map((r) => r.source_id))]),
    enabled: rows.length > 0,
  })

  return (
    <Card>
      <CardHeader icon={<BarChart3 className="h-5 w-5" />} title="Historical cutoffs" description="Closing ranks by counselling round, compared across years. Lower ranks are more competitive." />
      <CardBody>
        {branchOptions.length === 0 ? (
          <EmptyState title="No verified cutoff data for this college yet" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={selected} onChange={(e) => { setBranch(e.target.value); setSeatKey('') }} aria-label="Branch">
                {branchOptions.map((b) => (
                  <option key={b} value={b}>
                    {branchName.get(b) ?? b}
                  </option>
                ))}
              </Select>
              <Select value={activeSeat} onChange={(e) => setSeatKey(e.target.value)} aria-label="Seat group" disabled={seatGroups.length === 0}>
                {seatGroups.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.code ? `${v.code} – ` : ''}
                    {v.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mt-6">
              {cutoffs.isLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : cutoffs.isError ? (
                <QueryError error={cutoffs.error} />
              ) : rows.length === 0 ? (
                <EmptyState title="No verified records for this branch" description="Insufficient data – no official opening/closing rank has been verified for this branch yet." />
              ) : (
                <>
                  <div className="mb-3 flex justify-end">
                    <div className="inline-flex rounded-xl bg-navy-50 p-1 text-sm">
                      {(['chart', 'table'] as const).map((v) => (
                        <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={view === v ? 'rounded-lg bg-white px-3 py-1.5 font-semibold capitalize text-navy-900 shadow-sm' : 'rounded-lg px-3 py-1.5 font-semibold capitalize text-navy-500'}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  {view === 'chart' ? (
                    <ChartFrame
                      title="Closing rank by round"
                      subtitle={seatGroups.find(([k]) => k === activeSeat)?.[1].label}
                      legend={<Legend items={years.map((y, i) => ({ label: String(y), color: seriesColor(i) }))} />}
                    >
                      <MultiLine data={chartData} xKey="round" series={years.map((y) => ({ key: String(y), label: String(y) }))} xLabelPrefix="Round " />
                    </ChartFrame>
                  ) : (
                    <TableWrap>
                      <Table>
                        <THead>
                          <tr>
                            <Th>Year</Th>
                            <Th>Round</Th>
                            <Th>Category</Th>
                            <Th className="text-right">Opening rank</Th>
                            <Th className="text-right">Closing rank</Th>
                            <Th>Source page</Th>
                          </tr>
                        </THead>
                        <tbody>
                          {rows.map((r) => (
                            <Tr key={r.id}>
                              <Td>{r.academic_year}</Td>
                              <Td>{r.round_label ?? `Round ${r.round_number}`}</Td>
                              <Td>
                                {r.category_code ?? CATEGORY_LABELS[r.category]} <span className="text-xs text-navy-400">{SEAT_TYPE_LABELS[r.seat_type]}</span>
                              </Td>
                              <Td className="text-right tabular">{formatRank(r.opening_rank)}</Td>
                              <Td className="text-right font-semibold tabular">{formatRank(r.closing_rank)}</Td>
                              <Td>{r.source_page ?? '—'}</Td>
                            </Tr>
                          ))}
                        </tbody>
                      </Table>
                    </TableWrap>
                  )}
                  {sources.data && sources.data.length > 0 && (
                    <p className="mt-4 text-xs text-navy-500">
                      Source:{' '}
                      {sources.data.map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && '; '}
                          {s.url ? (
                            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-royal-600 hover:underline">
                              {s.title}
                            </a>
                          ) : (
                            s.title
                          )}
                          {s.academic_year ? ` (${s.academic_year})` : ''}
                        </span>
                      ))}
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}

const FEE_LABEL: Record<CollegeFee['fee_type'], string> = {
  tuition: 'Tuition fee',
  hostel: 'Hostel fee',
  mess: 'Mess fee',
  admission: 'Admission fee',
  examination: 'Examination fee',
  other: 'Other fees',
  total_annual: 'Total (per year)',
  total_program: 'Total (programme)',
}

function FeesCard({ fees, loading, error }: { fees?: CollegeFee[]; loading: boolean; error: unknown }) {
  const latestYear = fees && fees.length ? Math.max(...fees.map((f) => f.academic_year)) : null
  const latest = (fees ?? []).filter((f) => f.academic_year === latestYear)
  return (
    <Card>
      <CardHeader icon={<IndianRupee className="h-5 w-5" />} title="College fees" description={latestYear ? `Academic year ${latestYear}` : 'From official college sources'} />
      <CardBody>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : error ? (
          <QueryError error={error} />
        ) : latest.length === 0 ? (
          <EmptyState title="Fee data not available" description="Fees are published only from the college's official fee notice or website once verified." />
        ) : (
          <ul className="divide-y divide-navy-100 text-sm">
            {latest.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-navy-900">{FEE_LABEL[f.fee_type]}{f.branch_code ? ` · ${f.branch_code}` : ''}</p>
                  {f.notes && <p className="text-xs text-navy-500">{f.notes}</p>}
                  {f.source_url && (
                    <a href={f.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-royal-600 hover:underline">
                      Source
                    </a>
                  )}
                </div>
                <span className="font-semibold tabular text-navy-900">{formatCurrency(f.amount, f.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function PlacementsCard({ placements, loading, error }: { placements?: PlacementRecord[]; loading: boolean; error: unknown }) {
  const overall = (placements ?? []).filter((p) => !p.branch_code).slice(0, 4)
  const list = overall.length ? overall : (placements ?? []).slice(0, 4)
  return (
    <Card>
      <CardHeader icon={<Briefcase className="h-5 w-5" />} title="Placement statistics" description="As reported in official placement reports" />
      <CardBody>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : error ? (
          <QueryError error={error} />
        ) : list.length === 0 ? (
          <EmptyState title="Placement data not available" description="Only figures from official college placement reports are published, after verification." />
        ) : (
          <div className="space-y-4">
            {list.map((p) => (
              <div key={p.id} className="rounded-2xl border border-navy-100 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-navy-900">
                    {p.academic_year}
                    {p.branch_code ? ` · ${p.branch_code}` : ' · All branches'}
                  </p>
                  {p.source_url && (
                    <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-royal-600 hover:underline">
                      Source
                    </a>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <Stat k="Median package" v={formatLpa(p.median_package_lpa)} />
                  <Stat k="Average package" v={formatLpa(p.average_package_lpa)} />
                  <Stat k="Highest package" v={formatLpa(p.highest_package_lpa)} />
                  <Stat k="Students placed" v={p.students_placed != null ? `${formatNumber(p.students_placed)}${p.students_eligible ? ` / ${formatNumber(p.students_eligible)}` : ''}` : '—'} />
                  <Stat k="Companies" v={formatNumber(p.companies_visited)} />
                </dl>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-navy-500">{k}</dt>
      <dd className="font-semibold tabular text-navy-900">{v}</dd>
    </div>
  )
}
