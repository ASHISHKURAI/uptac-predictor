import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowRight, Building2, ExternalLink, MapPin, Search } from 'lucide-react'
import { Seo } from '@/components/common/Seo'
import { PageHero } from '@/components/layout/PublicLayout'
import { ConfigNotice, QueryError } from '@/components/common/ConfigNotice'
import { SaveCollegeButton } from '@/components/common/StudentActions'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input, Select } from '@/components/ui/Form'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Table'
import { fetchColleges, type CollegeFilters } from '@/lib/api/catalog'
import { useDistricts } from '@/hooks/useCatalog'
import { isSupabaseConfigured } from '@/lib/env'
import { instituteTypeLabel, prettyName } from '@/lib/utils'

const PAGE_SIZE = 24

export function CollegesPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const filters: CollegeFilters = {
    search: params.get('q') ?? '',
    district: params.get('district') ?? '',
    type: (params.get('type') as CollegeFilters['type']) ?? 'all',
    page: Number(params.get('page') ?? 1) || 1,
    pageSize: PAGE_SIZE,
  }
  const districts = useDistricts()
  const colleges = useQuery({
    queryKey: ['colleges', filters],
    queryFn: () => fetchColleges(filters),
    enabled: isSupabaseConfigured,
    placeholderData: keepPreviousData,
  })

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== search) update({ q: search.trim() || null })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  return (
    <>
      <Seo title="UP B.Tech College Directory" description="Search engineering colleges participating in UPTAC counselling by name, district and government or private type." />
      <PageHero eyebrow="College Directory" title="Engineering colleges in UPTAC counselling" description="Search institutes from the official UPTAC seat matrix. Open a profile for branches, fees, placements and historical cutoffs." />
      <div className="container-page py-10">
        <div className="grid gap-3 rounded-2xl border border-navy-100 bg-white p-4 shadow-sm sm:grid-cols-[1fr_14rem_14rem]">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, code or city…" leftIcon={<Search className="h-4 w-4" />} aria-label="Search colleges" />
          <Select value={filters.district} onChange={(e) => update({ district: e.target.value || null })} aria-label="Filter by district">
            <option value="">All districts</option>
            {(districts.data ?? []).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <Select value={filters.type} onChange={(e) => update({ type: e.target.value === 'all' ? null : e.target.value })} aria-label="Filter by institute type">
            <option value="all">Government & private</option>
            <option value="government">Government & aided</option>
            <option value="private">Private</option>
            <option value="university">University</option>
          </Select>
        </div>

        <div className="mt-8">
          {!isSupabaseConfigured ? (
            <ConfigNotice />
          ) : colleges.isError ? (
            <QueryError error={colleges.error} onRetry={() => colleges.refetch()} />
          ) : colleges.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-2xl" />
              ))}
            </div>
          ) : (colleges.data?.rows ?? []).length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-6 w-6" />}
              title={filters.search || filters.district || filters.type !== 'all' ? 'No colleges match your filters' : 'No colleges in the directory yet'}
              description={
                filters.search || filters.district || filters.type !== 'all'
                  ? 'Try a different name or remove a filter.'
                  : 'Colleges are added from the official UPTAC seat matrix after administrator verification.'
              }
            />
          ) : (
            <>
              <p className="mb-4 text-sm text-navy-500">{colleges.data!.total.toLocaleString('en-IN')} colleges</p>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {colleges.data!.rows.map((c) => (
                  <Card key={c.code} interactive className="flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <Badge tone={c.institute_type === 'private' ? 'outline' : 'royal'}>{instituteTypeLabel(c.institute_type)}</Badge>
                      <span className="font-mono text-xs text-navy-400">Code {c.code}</span>
                    </div>
                    <Link to={`/colleges/${encodeURIComponent(c.code)}`} className="mt-3 font-bold leading-snug text-navy-900 hover:text-royal-700">
                      {c.short_name ?? prettyName(c.name)}
                    </Link>
                    <p className="mt-1.5 flex items-center gap-1.5 text-sm text-navy-500">
                      <MapPin className="h-4 w-4 shrink-0" aria-hidden /> {[c.city, c.district].filter(Boolean).join(', ') || '—'}
                    </p>
                    {c.naac_grade && <p className="mt-1 text-xs text-navy-500">NAAC {c.naac_grade}</p>}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5">
                      <div className="flex items-center gap-2">
                        <SaveCollegeButton code={c.code} compact />
                        {c.website && (
                          <a href={c.website} target="_blank" rel="noopener noreferrer" className="grid h-9 w-9 place-items-center rounded-xl text-navy-500 hover:bg-navy-50 hover:text-royal-600" aria-label="Official website">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                      <Link to={`/colleges/${encodeURIComponent(c.code)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-royal-600 hover:underline">
                        View profile <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
              <Pagination className="mt-8" page={filters.page ?? 1} pageSize={PAGE_SIZE} total={colleges.data!.total} onPage={(p) => update({ page: String(p) })} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
