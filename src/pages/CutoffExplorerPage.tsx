import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDownUp, BarChart3, Download, Filter, Table2, X } from 'lucide-react'
import { CATEGORY_LABELS, GENDER_LABELS, QUOTA_LABELS, SEAT_TYPE_LABELS, seatCode } from '@shared/prediction/labels.ts'
import type { ReservationCategory, SeatType } from '@shared/prediction/types.ts'
import { Seo } from '@/components/common/Seo'
import { PageHero } from '@/components/layout/PublicLayout'
import { ConfigNotice, QueryError } from '@/components/common/ConfigNotice'
import { CollegeSearch } from '@/components/common/Pickers'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Form'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Pagination, Table, TableWrap, Td, Th, THead, Tr } from '@/components/ui/Table'
import { ChartFrame, GroupedColumns, Legend } from '@/components/charts/Charts'
import { seriesColor } from '@/components/charts/theme'
import { fetchCutoffs, fetchSeatComparison, finalRoundClosing, type CutoffFilters, type CutoffWithRelations } from '@/lib/api/catalog'
import { useBranches, useCollegesLite, useCutoffYears } from '@/hooks/useCatalog'
import { isSupabaseConfigured } from '@/lib/env'
import { formatNumber, formatRank, instituteTypeLabel, prettyName } from '@/lib/utils'

const PAGE_SIZE = 50
const CATEGORIES: ReservationCategory[] = ['OPEN', 'EWS', 'BC', 'SC', 'ST', 'ANY']
const SEATS: SeatType[] = ['GENERAL', 'GIRL', 'AF', 'FF', 'PH', 'TFW']

export function CutoffExplorerPage() {
  const [params, setParams] = useSearchParams()
  const years = useCutoffYears()
  const branches = useBranches()
  const colleges = useCollegesLite()
  const [tab, setTab] = useState<'table' | 'compare'>('table')

  const get = (k: string) => params.get(k) ?? ''
  const filters: CutoffFilters = {
    year: get('year') ? Number(get('year')) : years.data?.[0]?.year ?? null,
    round: get('round') ? Number(get('round')) : null,
    collegeCode: get('college') || null,
    branchCode: get('branch') || null,
    category: get('category') || null,
    seatType: get('seat') || null,
    gender: get('gender') || null,
    quota: get('quota') || null,
    instituteType: (get('type') as CutoffFilters['instituteType']) || 'all',
    sort: (get('sort') as CutoffFilters['sort']) || 'closing_rank',
    ascending: get('dir') !== 'desc',
    page: Number(get('page') || 1),
    pageSize: PAGE_SIZE,
  }

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const ready = isSupabaseConfigured && years.isSuccess
  const cutoffs = useQuery({
    queryKey: ['cutoffs', filters],
    queryFn: () => fetchCutoffs(filters),
    enabled: ready && (years.data?.length ?? 0) > 0,
    placeholderData: keepPreviousData,
  })

  const yearRounds = years.data?.find((y) => y.year === filters.year)?.rounds ?? []
  const selectedCollege = colleges.data?.find((c) => c.code === filters.collegeCode)
  const activeFilterCount = ['round', 'college', 'branch', 'category', 'seat', 'gender', 'quota', 'type'].filter((k) => get(k)).length

  return (
    <>
      <Seo title="UPTAC Cutoff Explorer – opening & closing ranks" description="Search verified UPTAC opening and closing ranks by year, round, college, branch, category and seat type, and compare cutoffs across years." />
      <PageHero
        eyebrow="Cutoff Explorer"
        title="Historical opening & closing ranks"
        description="Every verified official UPTAC record – filter by year, round, category, branch and seat type, and compare how cutoffs moved between years."
      />
      <div className="container-page py-10">
        {!isSupabaseConfigured ? (
          <ConfigNotice />
        ) : years.isError ? (
          <QueryError error={years.error} onRetry={() => years.refetch()} />
        ) : years.isLoading ? (
          <Skeleton className="h-96 w-full rounded-2xl" />
        ) : (years.data ?? []).length === 0 ? (
          <EmptyState icon={<Table2 className="h-6 w-6" />} title="No verified cutoff data yet" description="Opening and closing ranks appear here as soon as administrators verify and publish official UPTAC documents." />
        ) : (
          <>
            <div className="mb-6 inline-flex rounded-xl bg-navy-50 p-1" role="tablist">
              {[
                { v: 'table' as const, label: 'Cutoff tables', icon: Table2 },
                { v: 'compare' as const, label: 'Year comparison', icon: BarChart3 },
              ].map((t) => (
                <button
                  key={t.v}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.v}
                  onClick={() => setTab(t.v)}
                  className={tab === t.v ? 'inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-navy-900 shadow-sm' : 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-navy-500 hover:text-navy-800'}
                >
                  <t.icon className="h-4 w-4" aria-hidden /> {t.label}
                </button>
              ))}
            </div>

            {tab === 'compare' ? (
              <YearComparison branches={branches.data ?? []} collegesLite={colleges.data ?? []} />
            ) : (
              <>
                <Card className="p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="flex items-center gap-2 text-sm font-semibold text-navy-800">
                      <Filter className="h-4 w-4 text-royal-600" aria-hidden /> Filters {activeFilterCount > 0 && <Badge tone="royal">{activeFilterCount}</Badge>}
                    </p>
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" leftIcon={<X className="h-4 w-4" />} onClick={() => setParams(filters.year ? { year: String(filters.year) } : {}, { replace: true })}>
                        Clear filters
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Select value={filters.year ?? ''} onChange={(e) => update({ year: e.target.value, round: null })} aria-label="Academic year">
                      {(years.data ?? []).map((y) => (
                        <option key={y.year} value={y.year}>
                          Year {y.year}
                        </option>
                      ))}
                    </Select>
                    <Select value={filters.round ?? ''} onChange={(e) => update({ round: e.target.value || null })} aria-label="Round">
                      <option value="">All rounds</option>
                      {yearRounds.map((r) => (
                        <option key={r.round_number} value={r.round_number}>
                          {r.round_label ?? `Round ${r.round_number}`}
                        </option>
                      ))}
                    </Select>
                    <Select value={filters.category ?? ''} onChange={(e) => update({ category: e.target.value || null })} aria-label="Category">
                      <option value="">All categories</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </Select>
                    <Select value={filters.seatType ?? ''} onChange={(e) => update({ seat: e.target.value || null })} aria-label="Seat type">
                      <option value="">All seat types</option>
                      {SEATS.map((s) => (
                        <option key={s} value={s}>
                          {SEAT_TYPE_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                    <Select value={filters.branchCode ?? ''} onChange={(e) => update({ branch: e.target.value || null })} aria-label="Branch">
                      <option value="">All branches</option>
                      {(branches.data ?? []).map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                    <Select value={filters.gender ?? ''} onChange={(e) => update({ gender: e.target.value || null })} aria-label="Seat gender">
                      <option value="">All seat genders</option>
                      <option value="NEUTRAL">{GENDER_LABELS.NEUTRAL}</option>
                      <option value="FEMALE_ONLY">{GENDER_LABELS.FEMALE_ONLY}</option>
                    </Select>
                    <Select value={filters.instituteType} onChange={(e) => update({ type: e.target.value === 'all' ? null : e.target.value })} aria-label="Institute type">
                      <option value="all">All institute types</option>
                      <option value="government">Government & aided</option>
                      <option value="private">Private</option>
                      <option value="university">University</option>
                    </Select>
                    <div>
                      {selectedCollege ? (
                        <button
                          type="button"
                          onClick={() => update({ college: null })}
                          className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-royal-300 bg-royal-50 px-3.5 text-left text-sm font-semibold text-royal-800"
                        >
                          <span className="truncate">{selectedCollege.short_name ?? prettyName(selectedCollege.name)}</span>
                          <X className="h-4 w-4 shrink-0" aria-label="Clear college filter" />
                        </button>
                      ) : (
                        <CollegeSearch colleges={colleges.data ?? []} onSelect={(c) => update({ college: c.code })} placeholder="Filter by college…" />
                      )}
                    </div>
                  </div>
                </Card>

                <div className="mt-6">
                  {cutoffs.isError ? (
                    <QueryError error={cutoffs.error} onRetry={() => cutoffs.refetch()} />
                  ) : cutoffs.isLoading ? (
                    <Skeleton className="h-96 w-full rounded-2xl" />
                  ) : (cutoffs.data?.rows ?? []).length === 0 ? (
                    <EmptyState title="No records match these filters" description="Insufficient data – try another year, round or category." />
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-navy-500">{formatNumber(cutoffs.data!.total)} verified records</p>
                        <div className="flex gap-2">
                          <Select
                            value={`${filters.sort}:${filters.ascending ? 'asc' : 'desc'}`}
                            onChange={(e) => {
                              const [sort, dir] = e.target.value.split(':')
                              update({ sort, dir: dir === 'desc' ? 'desc' : null })
                            }}
                            className="h-9 w-56 text-xs"
                            aria-label="Sort"
                          >
                            <option value="closing_rank:asc">Closing rank ↑ (competitive first)</option>
                            <option value="closing_rank:desc">Closing rank ↓</option>
                            <option value="opening_rank:asc">Opening rank ↑</option>
                            <option value="college_code:asc">College code</option>
                          </Select>
                          <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(cutoffs.data!.rows)}>
                            CSV (this page)
                          </Button>
                        </div>
                      </div>
                      <TableWrap className="max-h-[70vh]">
                        <Table>
                          <THead>
                            <tr>
                              <Th>Year · Round</Th>
                              <Th>College</Th>
                              <Th>Branch</Th>
                              <Th>Category</Th>
                              <Th>Seat</Th>
                              <Th className="text-right">
                                <span className="inline-flex items-center gap-1">
                                  Opening <ArrowDownUp className="h-3 w-3" aria-hidden />
                                </span>
                              </Th>
                              <Th className="text-right">Closing</Th>
                              <Th>Source</Th>
                            </tr>
                          </THead>
                          <tbody>
                            {cutoffs.data!.rows.map((r) => (
                              <Tr key={r.id}>
                                <Td className="whitespace-nowrap">
                                  <span className="font-semibold">{r.academic_year}</span>
                                  <span className="block text-xs text-navy-500">{r.round_label ?? `Round ${r.round_number}`}</span>
                                </Td>
                                <Td className="max-w-72">
                                  <Link to={`/colleges/${encodeURIComponent(r.college_code)}`} className="font-medium text-navy-900 hover:text-royal-700">
                                    {r.colleges?.short_name ?? prettyName(r.colleges?.name ?? r.college_code)}
                                  </Link>
                                  <span className="block text-xs text-navy-500">
                                    {r.college_code} · {instituteTypeLabel(r.colleges?.institute_type)}
                                  </span>
                                </Td>
                                <Td className="max-w-64">
                                  {r.branches?.name ?? r.branch_code}
                                  {r.shift && <span className="block text-xs text-navy-500">Shift {r.shift}</span>}
                                </Td>
                                <Td>
                                  <Badge tone="neutral" className="font-mono">{r.category_code ?? seatCode(r.category, r.seat_type)}</Badge>
                                </Td>
                                <Td className="text-xs text-navy-600">
                                  {SEAT_TYPE_LABELS[r.seat_type]}
                                  <span className="block">{GENDER_LABELS[r.gender]}{r.quota !== 'STATE' ? ` · ${QUOTA_LABELS[r.quota]}` : ''}</span>
                                </Td>
                                <Td className="text-right tabular">{formatRank(r.opening_rank)}</Td>
                                <Td className="text-right font-semibold tabular text-navy-950">{formatRank(r.closing_rank)}</Td>
                                <Td className="text-xs text-navy-500">{r.source_page ? `p. ${r.source_page}` : '—'}</Td>
                              </Tr>
                            ))}
                          </tbody>
                        </Table>
                      </TableWrap>
                      <Pagination className="mt-4" page={filters.page ?? 1} pageSize={PAGE_SIZE} total={cutoffs.data!.total} onPage={(p) => update({ page: String(p) })} />
                      <p className="mt-4 text-xs text-navy-500">
                        Ranks are JEE Main CRL ranks unless marked otherwise. Source documents are listed on the <Link to="/sources" className="text-royal-600 hover:underline">Data Sources</Link> page.
                      </p>
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

function YearComparison({
  branches,
  collegesLite,
}: {
  branches: Array<{ code: string; name: string; short_name: string | null }>
  collegesLite: Array<{ code: string; name: string; short_name: string | null }>
}) {
  const [branch, setBranch] = useState(branches.find((b) => b.code === 'CSE')?.code ?? branches[0]?.code ?? '')
  const [category, setCategory] = useState<ReservationCategory>('OPEN')
  const [seat, setSeat] = useState<SeatType>('GENERAL')
  const [gender, setGender] = useState<'NEUTRAL' | 'FEMALE_ONLY'>('NEUTRAL')
  const [count, setCount] = useState(8)

  const data = useQuery({
    queryKey: ['seat-comparison', branch, category, seat, gender],
    queryFn: () => fetchSeatComparison({ branchCodes: [branch], category, seatType: seat, gender }),
    enabled: Boolean(branch),
  })
  const names = useMemo(() => new Map(collegesLite.map((c) => [c.code, c.short_name ?? prettyName(c.name)])), [collegesLite])

  const { chartData, years, tableRows } = useMemo(() => {
    const finals = finalRoundClosing(data.data ?? [])
    const yearsAll = [...new Set([...finals.values()].map((f) => f.year))].sort().slice(-5)
    const latest = yearsAll[yearsAll.length - 1]
    const programs = new Map<string, Record<number, number>>()
    for (const [key, v] of finals) {
      const [college, , shift] = key.split('|')
      const pk = `${college}|${shift}`
      programs.set(pk, { ...programs.get(pk), [v.year]: v.closing })
    }
    const ranked = [...programs.entries()]
      .filter(([, byYear]) => latest && byYear[latest] !== undefined)
      .sort((a, b) => a[1][latest] - b[1][latest])
      .slice(0, count)
    const rows = ranked.map(([pk, byYear]) => {
      const [college, shift] = pk.split('|')
      const label = `${names.get(college) ?? college}${shift ? ` (S-${shift})` : ''}`
      return { label, college, byYear }
    })
    return {
      years: yearsAll,
      tableRows: rows,
      chartData: rows.map((r) => {
        const point: Record<string, string | number | null> = { college: r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label }
        for (const y of yearsAll) point[String(y)] = r.byYear[y] ?? null
        return point
      }),
    }
  }, [data.data, names, count])

  return (
    <Card>
      <CardHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Interactive year comparison"
        description="Final-round closing ranks of the most competitive programmes for a branch and seat type, compared across years."
      />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch" className="lg:col-span-2">
            {branches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value as ReservationCategory)} aria-label="Category">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
          <Select value={seat} onChange={(e) => setSeat(e.target.value as SeatType)} aria-label="Seat type">
            {SEATS.map((s) => (
              <option key={s} value={s}>
                {SEAT_TYPE_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select value={`${gender}:${count}`} onChange={(e) => { const [g, n] = e.target.value.split(':'); setGender(g as typeof gender); setCount(Number(n)) }} aria-label="Seat gender and number of programmes">
            {(['NEUTRAL', 'FEMALE_ONLY'] as const).flatMap((g) =>
              [8, 12].map((n) => (
                <option key={`${g}:${n}`} value={`${g}:${n}`}>
                  {g === 'NEUTRAL' ? 'Gender-neutral' : 'Female only'} · top {n}
                </option>
              )),
            )}
          </Select>
        </div>
        <div className="mt-6">
          {data.isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : data.isError ? (
            <QueryError error={data.error} />
          ) : tableRows.length === 0 ? (
            <EmptyState title="Insufficient data" description="No verified records exist for this branch and seat type." />
          ) : (
            <>
              <ChartFrame
                title={`${branches.find((b) => b.code === branch)?.name} · ${seatCode(category, seat)}`}
                subtitle="Final-round closing rank (JEE Main CRL) – lower is more competitive"
                legend={<Legend items={years.map((y, i) => ({ label: String(y), color: seriesColor(i) }))} />}
                height={360}
              >
                <GroupedColumns data={chartData} xKey="college" series={years.map((y) => ({ key: String(y), label: String(y) }))} />
              </ChartFrame>
              <TableWrap className="mt-6">
                <Table>
                  <THead>
                    <tr>
                      <Th>Programme</Th>
                      {years.map((y) => (
                        <Th key={y} className="text-right">
                          {y}
                        </Th>
                      ))}
                    </tr>
                  </THead>
                  <tbody>
                    {tableRows.map((r) => (
                      <Tr key={r.label}>
                        <Td>
                          <Link to={`/colleges/${encodeURIComponent(r.college)}`} className="font-medium hover:text-royal-700">
                            {r.label}
                          </Link>
                        </Td>
                        {years.map((y) => (
                          <Td key={y} className="text-right tabular">
                            {r.byYear[y] !== undefined ? formatRank(r.byYear[y]) : <span className="text-navy-400">No data</span>}
                          </Td>
                        ))}
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

function downloadCsv(rows: CutoffWithRelations[]) {
  const header = ['Year', 'Round', 'College code', 'College', 'Branch code', 'Branch', 'Shift', 'Category code', 'Category', 'Seat type', 'Seat gender', 'Quota', 'Rank type', 'Opening rank', 'Closing rank', 'Source page']
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = rows.map((r) =>
    [r.academic_year, r.round_label ?? r.round_number, r.college_code, r.colleges?.name, r.branch_code, r.branches?.name, r.shift, r.category_code, r.category, r.seat_type, r.gender, r.quota, r.rank_type, r.opening_rank, r.closing_rank, r.source_page]
      .map(esc)
      .join(','),
  )
  const blob = new Blob([[header.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'uptac-cutoffs.csv'
  a.click()
  URL.revokeObjectURL(url)
}
