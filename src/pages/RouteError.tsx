import { isRouteErrorResponse, useRouteError } from 'react-router'
import { TriangleAlert } from 'lucide-react'
import { buttonClasses } from '@/components/ui/Button'

/** Top-level error boundary for route rendering / lazy-loading failures. */
export function RouteError() {
  const error = useRouteError()
  const isChunkError = error instanceof Error && /dynamically imported module|Loading chunk/i.test(error.message)
  const title = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : isChunkError ? 'A new version is available' : 'Something went wrong'
  const message = isChunkError
    ? 'The site was updated while you were browsing. Reload the page to continue.'
    : 'An unexpected error occurred. Please reload the page – if it keeps happening, try again later.'
  if (!isRouteErrorResponse(error)) console.error(error)
  return (
    <div className="grid min-h-dvh place-items-center bg-navy-50 px-4">
      <div className="max-w-md rounded-3xl border border-navy-100 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <TriangleAlert className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-bold text-navy-950">{title}</h1>
        <p className="mt-2 text-sm text-navy-600">{message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className={buttonClasses('primary', 'md')}>
            Reload page
          </button>
          <a href="/" className={buttonClasses('outline', 'md')}>
            Home
          </a>
        </div>
      </div>
    </div>
  )
}
