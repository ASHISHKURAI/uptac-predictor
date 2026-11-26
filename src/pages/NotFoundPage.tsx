import { Compass } from 'lucide-react'
import { Seo } from '@/components/common/Seo'
import { ButtonLink } from '@/components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-16 text-center">
      <Seo title="Page not found" noindex />
      <div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-royal-50 text-royal-600">
          <Compass className="h-8 w-8" aria-hidden />
        </div>
        <p className="mt-6 font-display text-6xl font-extrabold text-navy-950">404</p>
        <h1 className="mt-2 text-xl font-bold text-navy-900">This page does not exist</h1>
        <p className="mt-2 text-navy-500">The link may be outdated. Try the predictor or the college directory instead.</p>
        <div className="mt-6 flex justify-center gap-2">
          <ButtonLink to="/predictor">Rank Predictor</ButtonLink>
          <ButtonLink to="/colleges" variant="outline">
            Colleges
          </ButtonLink>
        </div>
      </div>
    </div>
  )
}
