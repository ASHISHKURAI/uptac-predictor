import { useLocation } from 'react-router'
import { env } from '@/lib/env'

/**
 * Per-page metadata. React 19 hoists <title>, <meta> and <link> rendered
 * anywhere in the tree into the document <head>.
 */
export function Seo({ title, description, noindex = false }: { title: string; description?: string; noindex?: boolean }) {
  const { pathname } = useLocation()
  const fullTitle = title.includes('UPTAC Predictor') ? title : `${title} | UPTAC Predictor`
  const canonical = env.siteUrl ? `${env.siteUrl}${pathname}` : undefined
  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      {canonical && <link rel="canonical" href={canonical} />}
      {canonical && <meta property="og:url" content={canonical} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}
    </>
  )
}
