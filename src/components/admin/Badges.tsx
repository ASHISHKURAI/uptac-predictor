import { CircleAlert, Copy, Info, TriangleAlert } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import type { ImportStatus, StagingIssue, StagingRow, StagingStatus, VerificationStatus } from '@/lib/types'

const IMPORT_STATUS: Record<ImportStatus, { label: string; tone: BadgeTone }> = {
  uploaded: { label: 'Uploaded', tone: 'neutral' },
  queued: { label: 'Queued', tone: 'violet' },
  processing: { label: 'Processing', tone: 'royal' },
  in_review: { label: 'In review', tone: 'amber' },
  publishing: { label: 'Publishing', tone: 'royal' },
  published: { label: 'Published', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'outline' },
}

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  const s = IMPORT_STATUS[status] ?? { label: status, tone: 'neutral' as BadgeTone }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export const ACTIVE_IMPORT_STATUSES: ImportStatus[] = ['uploaded', 'queued', 'processing', 'publishing']

const VERIFICATION: Record<VerificationStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'amber' },
  verified: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const s = VERIFICATION[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

const STAGING: Record<StagingStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'neutral' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  published: { label: 'Published', tone: 'royal' },
  skipped: { label: 'Skipped', tone: 'outline' },
}

export function StagingStatusBadge({ status }: { status: StagingStatus }) {
  const s = STAGING[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

const DUPLICATE: Record<Exclude<StagingRow['duplicate_status'], 'none'>, { label: string; tone: BadgeTone; title: string }> = {
  in_file: { label: 'Duplicate in file', tone: 'red', title: 'Another row of this file has the same seat group key.' },
  existing_same: { label: 'Already published', tone: 'outline', title: 'An identical verified record already exists.' },
  existing_conflict: { label: 'Conflicts with published', tone: 'amber', title: 'A published record with the same key has different values – publishing overwrites it.' },
}

export function DuplicateBadge({ status }: { status: StagingRow['duplicate_status'] }) {
  if (status === 'none') return null
  const s = DUPLICATE[status]
  return (
    <Badge tone={s.tone} title={s.title}>
      <Copy className="h-3 w-3" aria-hidden />
      {s.label}
    </Badge>
  )
}

export function IssueList({ issues }: { issues: StagingIssue[] }) {
  if (issues.length === 0) return <span className="text-xs text-navy-400">—</span>
  return (
    <ul className="space-y-1">
      {issues.map((i, idx) => (
        <li key={`${i.code}-${idx}`} className="flex items-start gap-1.5 text-xs">
          {i.severity === 'error' ? (
            <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-red-600" aria-label="Error" />
          ) : i.severity === 'warning' ? (
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Warning" />
          ) : (
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-royal-600" aria-label="Info" />
          )}
          <span className={i.severity === 'error' ? 'text-red-800' : i.severity === 'warning' ? 'text-amber-900' : 'text-navy-700'}>
            {i.message}
            {i.suggestion && (
              <span className="block text-navy-500">
                Suggestion: {i.suggestion.code} – {i.suggestion.name} ({Math.round(i.suggestion.score * 100)}% match)
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
