import { DatabaseZap } from 'lucide-react'
import { ConfigurationError, errorMessage } from '@/lib/supabase'
import { missingConfig } from '@/lib/env'
import { Alert, EmptyState } from '@/components/ui/Feedback'

/** Clear, honest message when Supabase is not configured – never fake data. */
export function ConfigNotice({ compact = false }: { compact?: boolean }) {
  const missing = missingConfig()
  if (missing.length === 0) return null
  if (compact) {
    return (
      <Alert tone="warning" title="Database not connected">
        Supabase is not configured yet (missing <code className="font-mono text-xs">{missing.join(', ')}</code>). Live data will appear once the
        project is connected – see <code className="font-mono text-xs">docs/DEPLOYMENT.md</code>.
      </Alert>
    )
  }
  return (
    <EmptyState
      icon={<DatabaseZap className="h-6 w-6" />}
      title="Database not connected"
      description={
        <>
          This feature needs the Supabase database. Add <code className="font-mono text-xs">{missing.join(' and ')}</code> to{' '}
          <code className="font-mono text-xs">.env.local</code> (see <code className="font-mono text-xs">.env.example</code>) and restart the app.
        </>
      }
    />
  )
}

/** Renders a query error, distinguishing configuration problems from others. */
export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ConfigurationError) return <ConfigNotice />
  return (
    <Alert
      tone="error"
      title="Something went wrong"
      action={
        onRetry && (
          <button type="button" onClick={onRetry} className="text-sm font-semibold text-red-700 underline underline-offset-4">
            Try again
          </button>
        )
      }
    >
      {errorMessage(error)}
    </Alert>
  )
}
