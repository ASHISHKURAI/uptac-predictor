import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { GitCompare, X } from 'lucide-react'
import { CATEGORY_LABELS, SEAT_TYPE_LABELS, seatCode } from '@shared/prediction/labels.ts'
import type { ReservationCategory, SeatType } from '@shared/prediction/types.ts'
import { Seo } from '@/components/common/Seo'
import { PageHero } from '@/components/layout/PublicLayout'
import { ConfigNotice, QueryError } from '@/components/common/ConfigNotice'
import { CollegeSearch } from '@/components/common/Pickers'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Form'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ChartFrame, GroupedColumns, Legend } from '@/components/charts/Charts'
import { seriesColor } from '@/components/charts/theme'
import { fetchCollegesByCodes, fetchFees, fetchOfferings, fetchPlacements, fetchSeatComparison, finalRoundClosing } from '@/lib/api/catalog'
import { useBranches, useCollegesLite } from '@/hooks/useCatalog'
import { isSupabaseConfigured } from '@/lib/env'
import { cn, formatCurrency, formatLpa, formatNumber, formatRank, instituteTypeLabel, prettyName } from '@/lib/utils'
import type { College, CollegeFee, PlacementRecord } from '@/lib/types'

const MAX = 4

export function ComparePage() {
  const [params, setParams] = useSearchParams()
  const codes = (params.get('c') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX)
  const collegesLite = useCollegesLite()
  const branches = useBranches()
  const setCodes = (next: string[]) => setParams(next.length ? { c: next.join(',') } : {}, { replace: true })

  const enabled = isSupabaseConfigured && codes.length > 0
  const colleges = useQuery({ queryKey: ['compare', 'colleges', codes], queryFn: () => fetchCollegesByCodes(codes), enabled })
  const offerings = useQuery({ queryKey: ['compare', 'offerings', codes], queryFn: () => fetchOfferings(codes), enabled })
  const fees = useQuery({ queryKey: ['compare', 'fees', codes], queryFn: () => fetchFees(codes), enabled })
  const placements = useQuery({ queryKey: ['compare', 'placements', codes], queryFn: () => fetchPlacements(codes), enabled })

  const ordered = codes.map((c) => colleges.data?.find((x) => x.code === c)).filter(Boolean) as College[]
  const branchName = useMemo(() => new Map((branches.data ?? []).map((b) => [b.code, b.name])), [branches.data])
  const offeredBranches = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of offerings.data ?? []) counts.set(o.branch_code, (counts.get(o.branch_code) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code]) => code)
  }, [offerings.data])

  return (
    <>
      <Seo title="Compare UP engineering colleges" description="Compare up to four UPTAC colleges on fees, placements, branches, location and historical cutoffs." />
      <PageHero eyebrow="College Comparison" title="Compare up to four colleges side by side" description="Fees, placement statistics, available branches, location and historical cutoffs – from verified official sources only." />
      <div className="container-page space-y-8 py-10">
        {!isSupabaseConfigured ? (
          <ConfigNotice />
        ) : (
          <>
            <Card className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="lg:w-96">
                  {codes.length < MAX ? (
                    <CollegeSearch colleges={collegesLite.data ?? []} exclude={codes} onSelect={(c) => setCodes([...codes, c.code])} placeholder={`Add a college (${codes.length}/${MAX})…`} />
                  ) : (
                    <p className="text-sm text-navy-500">Maximum of {MAX} colleges selected.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {codes.map((code, i) => {
                    const c = collegesLite.data?.find((x) => x.code === code)
                    return (
                      <span key={code} className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white py-1 pl-2 pr-1 text-sm font-semibold text-navy-800">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: seriesColor(i) }} aria-hidden />
                        {c ? c.short_name ?? prettyName(c.name) : code}
                        <button type="button" onClick={() => setCodes(codes.filter((x) => x !== code))} className="grid h-6 w-6 place-items-center rounded-full text-navy-400 hover:bg-navy-50 hover:text-navy-800" aria-label={`Remove ${code}`}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              </div>
            </Card>

            {codes.length === 0 ? (
              <EmptyState icon={<GitCompare className="h-6 w-6" />} title="Select colleges to compare" description="Search and add up to four colleges. Tip: open a college profile and press “Compare”." />
            ) : colleges.isError ? (
              <QueryError error={colleges.error} onRetry={() => colleges.refetch()} />
            ) : colleges.isLoading ? (
              <Skeleton className="h-96 w-full rounded-2xl" />
            ) : (
              <>
                <CompareTable colleges={ordered} offerings={offerings.data ?? []} fees={fees.data ?? []} placements={placements.data ?? []} branchName={branchName} />
                <CutoffComparison colleges={ordered} branchOptions={offeredBranches} branchName={branchName} />
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

function CompareTable({
  colleges,
  offerings,
  fees,
  placements,
  branchName,
}: {
  colleges: College[]
  offerings: Array<{ college_code: string; branch_code: string; latest_total_seats: number | null; latest_year: number }>
  fees: CollegeFee[]
  placements: PlacementRecord[]
  branchName: Map<string, string>
}) {
  const latestFee = (code: string) => {
    const list = fees.filter((f) => f.college_code === code && !f.branch_code)
    const year = Math.max(...list.map((f) => f.academic_year))
    const pick = list.find((f) => f.academic_year === year && f.fee_type === 'total_annual') ?? list.find((f) => f.academic_year === year && f.fee_type === 'tuition')
    return pick ? `${formatCurrency(pick.amount)} ${pick.fee_type === 'tuition' ? 'tuition' : 'total'} / yr (${pick.academic_year})` : null
  }
  const latestPlacement = (code: string) => placements.filter((p) => p.college_code === code && !p.branch_code).sort((a, b) => b.academic_year - a.academic_year)[0]

  const rows: Array<{ label: string; render: (c: College) => ReactNode }> = [
    { label: 'Institute type', render: (c) => <Badge tone={c.institute_type === 'private' ? 'outline' : 'royal'}>{instituteTypeLabel(c.institute_type)}</Badge> },
    { label: 'Location', render: (c) => [c.city, c.district].filter(Boolean).join(', ') || '—' },
    { label: 'College code', render: (c) => <span className="font-mono">{c.code}</span> },
    { label: 'Established', render: (c) => c.established_year ?? '—' },
    { label: 'NAAC grade', render: (c) => c.naac_grade ?? '—' },
    {
      label: 'Branches offered',
      render: (c) => {
        const list = [...new Set(offerings.filter((o) => o.college_code === c.code).map((o) => o.branch_code))]
        if (list.length === 0) return <span className="text-navy-400">No verified data</span>
        return (
          <details>
            <summary className="cursor-pointer font-semibold text-royal-700">{list.length} branches</summary>
            <ul className="mt-2 space-y-0.5 text-xs text-navy-600">
              {list.map((b) => (
                <li key={b}>{branchName.get(b) ?? b}</li>
              ))}
            </ul>
          </details>
        )
      },
    },
    {
      label: 'Total seats (latest matrix)',
      render: (c) => {
        const total = offerings.filter((o) => o.college_code === c.code).reduce((s, o) => s + (o.latest_total_seats ?? 0), 0)
        return total ? formatNumber(total) : <span className="text-navy-400">No verified data</span>
      },
    },
    { label: 'Fees', render: (c) => latestFee(c.code) ?? <span className="text-navy-400">Not available</span> },
    {
      label: 'Placements (latest)',
      render: (c) => {
        const p = latestPlacement(c.code)
        if (!p) return <span className="text-navy-400">Not available</span>
        return (
          <div className="space-y-0.5 text-xs">
            <p>
              <strong>{p.academic_year}</strong> · Median {formatLpa(p.median_package_lpa)}
            </p>
            <p>Average {formatLpa(p.average_package_lpa)} · Highest {formatLpa(p.highest_package_lpa)}</p>
            {p.students_placed != null && (
              <p>
                Placed {formatNumber(p.students_placed)}
                {p.students_eligible ? ` / ${formatNumber(p.students_eligible)}` : ''}
              </p>
            )}
          </div>
        )
      },
    },
    {
      label: 'Website',
      render: (c) =>
        c.website ? (
          <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-royal-600 hover:underline">
            Visit
          </a>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-navy-100 bg-navy-50/70">
              <th className="w-48 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-navy-500">Criteria</th>
              {colleges.map((c, i) => (
                <th key={c.code} className="px-5 py-4 align-top">
                  <span className="mb-1 block h-1 w-10 rounded-full" style={{ background: seriesColor(i) }} aria-hidden />
                  <Link to={`/colleges/${encodeURIComponent(c.code)}`} className="font-bold text-navy-900 hover:text-royal-700">
                    {c.short_name ?? prettyName(c.name)}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.label} className={cn('border-b border-navy-100/70', i % 2 === 1 && 'bg-navy-50/30')}>
                <th scope="row" className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-navy-500">
                  {row.label}
                </th>
                {colleges.map((c) => (
                  <td key={c.code} className="px-5 py-3.5 align-top text-navy-800">
                    {row.render(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function CutoffComparison({ colleges, branchOptions, branchName }: { colleges: College[]; branchOptions: string[]; branchName: Map<string, string> }) {
  const [branch, setBranch] = useState('')
  const [category, setCategory] = useState<ReservationCategory>('OPEN')
  const [seat, setSeat] = useState<SeatType>('GENERAL')
  const selected = branch || branchOptions[0] || ''
  const codes = colleges.map((c) => c.code)
  const data = useQuery({
    queryKey: ['compare', 'cutoffs', codes, selected, category, seat],
    queryFn: () => fetchSeatComparison({ branchCodes: [selected], collegeCodes: codes, category, seatType: seat }),
    enabled: Boolean(selected) && codes.length > 0,
  })
  const finals = finalRoundClosing(data.data ?? [])
  const years = [...new Set([...finals.values()].map((f) => f.year))].sort().slice(-5)
  const valueFor = (code: string, year: number) => {
    // Shift I (or no shift) is used for the headline comparison.
    for (const shift of ['', 'I', 'II']) {
      const v = finals.get(`${code}|${selected}|${shift}|${year}`)
      if (v) return v.closing
    }
    return null
  }
  const chartData = years.map((y) => {
    const point: Record<string, string | number | null> = { year: String(y) }
    colleges.forEach((c) => (point[c.code] = valueFor(c.code, y)))
    return point
  })

  return (
    <Card>
      <CardHeader title="Historical cutoffs" description="Final-round closing ranks (JEE Main CRL) for one branch and seat type." />
      <CardBody>
        {branchOptions.length === 0 ? (
          <EmptyState title="No verified branch data" description="None of the selected colleges have verified branch records yet." />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select value={selected} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
                {branchOptions.map((b) => (
                  <option key={b} value={b}>
                    {branchName.get(b) ?? b}
                  </option>
                ))}
              </Select>
              <Select value={category} onChange={(e) => setCategory(e.target.value as ReservationCategory)} aria-label="Category">
                {(['OPEN', 'EWS', 'BC', 'SC', 'ST'] as const).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
              <Select value={seat} onChange={(e) => setSeat(e.target.value as SeatType)} aria-label="Seat type">
                {(['GENERAL', 'GIRL', 'AF', 'FF', 'PH'] as const).map((s) => (
                  <option key={s} value={s}>
                    {SEAT_TYPE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mt-6">
              {data.isLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : data.isError ? (
                <QueryError error={data.error} />
              ) : years.length === 0 ? (
                <EmptyState title="Insufficient data" description="No verified records for this branch and seat type at the selected colleges." />
              ) : (
                <>
                  <ChartFrame
                    title={`${branchName.get(selected) ?? selected} · ${seatCode(category, seat)}`}
                    subtitle="Lower closing rank = more competitive"
                    legend={<Legend items={colleges.map((c, i) => ({ label: c.short_name ?? prettyName(c.name), color: seriesColor(i) }))} />}
                  >
                    <GroupedColumns data={chartData} xKey="year" series={colleges.map((c) => ({ key: c.code, label: c.short_name ?? prettyName(c.name) }))} />
                  </ChartFrame>
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="text-xs uppercase tracking-wide text-navy-500">
                        <tr className="border-b border-navy-100">
                          <th className="py-2 pr-4 text-left">College</th>
                          {years.map((y) => (
                            <th key={y} className="py-2 pr-4 text-right">
                              {y}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="tabular">
                        {colleges.map((c) => (
                          <tr key={c.code} className="border-b border-navy-100/70">
                            <td className="py-2.5 pr-4 font-medium">{c.short_name ?? prettyName(c.name)}</td>
                            {years.map((y) => (
                              <td key={y} className="py-2.5 pr-4 text-right">
                                {valueFor(c.code, y) !== null ? formatRank(valueFor(c.code, y)) : <span className="text-navy-400">No data</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}
