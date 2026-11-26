import { useQuery } from '@tanstack/react-query'
import { ExternalLink, FileText } from 'lucide-react'
import { Seo } from '@/components/common/Seo'
import { PageHero } from '@/components/layout/PublicLayout'
import { ConfigNotice, QueryError } from '@/components/common/ConfigNotice'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { fetchPublicSources } from '@/lib/api/catalog'
import { isSupabaseConfigured } from '@/lib/env'
import { formatDate } from '@/lib/utils'

const TYPE_LABEL: Record<string, string> = {
  opening_closing_rank: 'Opening & closing ranks',
  seat_matrix: 'Seat matrix',
  brochure: 'Brochure',
  notice: 'Notice',
  fee_structure: 'Fee structure',
  placement_report: 'Placement report',
  other: 'Other',
}

export function SourcesPage() {
  const sources = useQuery({ queryKey: ['public-sources'], queryFn: () => fetchPublicSources(null), enabled: isSupabaseConfigured })
  const byYear = new Map<string, NonNullable<typeof sources.data>>()
  for (const s of sources.data ?? []) {
    const key = s.academic_year ? String(s.academic_year) : 'Undated'
    byYear.set(key, [...(byYear.get(key) ?? []), s])
  }
  return (
    <>
      <Seo title="Data sources" description="Official UPTAC documents and college sources behind every record on UPTAC Predictor." />
      <PageHero
        eyebrow="Transparency"
        title="Data sources"
        description="Every published record links to one of these official documents. Records are imported, checked and approved by administrators before they appear on the site."
      />
      <div className="container-page py-10">
        {!isSupabaseConfigured ? (
          <ConfigNotice />
        ) : sources.isError ? (
          <QueryError error={sources.error} onRetry={() => sources.refetch()} />
        ) : sources.isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : byYear.size === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="No published sources yet" description="Official documents appear here once they are imported and verified." />
        ) : (
          <div className="space-y-8">
            {[...byYear.entries()].map(([year, list]) => (
              <section key={year}>
                <h2 className="text-lg font-bold text-navy-900">{year}</h2>
                <Card className="mt-3 divide-y divide-navy-100">
                  {list.map((s) => (
                    <div key={s.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-navy-900">{s.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-navy-500">
                          <Badge tone="neutral">{TYPE_LABEL[s.document_type] ?? s.document_type}</Badge>
                          {s.source_type === 'uptac_official' ? 'Official UPTAC' : s.source_type.replace('_', ' ')} · added {formatDate(s.created_at)}
                        </p>
                      </div>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-royal-600 hover:underline">
                          Official link <ExternalLink className="h-4 w-4" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-xs text-navy-400">Archived copy held by administrators</span>
                      )}
                    </div>
                  ))}
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
