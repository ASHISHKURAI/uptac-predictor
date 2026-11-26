import { Link } from 'react-router'
import { ExternalLink, ShieldCheck } from 'lucide-react'
import { Logo } from './Logo'

const groups = [
  {
    title: 'Tools',
    links: [
      { to: '/predictor', label: 'Rank Predictor' },
      { to: '/cutoffs', label: 'Cutoff Explorer' },
      { to: '/compare', label: 'Compare Colleges' },
      { to: '/choice-filling', label: 'Choice Filling Assistant' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { to: '/colleges', label: 'College Directory' },
      { to: '/sources', label: 'Data Sources' },
      { to: '/about', label: 'How it works' },
      { to: '/#faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/disclaimer', label: 'Disclaimer' },
      { to: '/privacy', label: 'Privacy Policy' },
      { to: '/terms', label: 'Terms of Use' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-navy-950 text-navy-200">
      <div className="bg-grid-dark pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="pointer-events-none absolute -top-40 right-0 h-80 w-80 rounded-full bg-royal-600/25 blur-3xl" aria-hidden />
      <div className="container-page relative py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <Logo inverted />
            <p className="mt-5 font-display text-lg font-semibold text-white">Your Rank. Your College. Your Future.</p>
            <p className="mt-3 text-sm leading-relaxed text-navy-300">
              An independent, data-driven guide for JEE Main aspirants exploring B.Tech admission through UPTAC counselling in Uttar
              Pradesh.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-navy-200">
              <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
              Verified official data only – every record cites its source
            </div>
          </div>
          {groups.map((g) => (
            <div key={g.title}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">{g.title}</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {g.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-navy-300 transition-colors hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-xs leading-relaxed text-navy-300">
          <strong className="text-navy-100">Important:</strong> UPTAC Predictor is not affiliated with UPTAC, AKTU or any government body. Results compare
          your rank with verified historical opening and closing ranks and do not guarantee admission. Always rely on the official portal{' '}
          <a href="https://uptac.samarth.edu.in/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-royal-300 hover:text-white">
            uptac.samarth.edu.in <ExternalLink className="h-3 w-3" aria-hidden />
          </a>{' '}
          for counselling schedules, rules and choice submission.
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-navy-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} UPTAC Predictor. All rights reserved.</p>
          <p>Built for students, with official data and transparency.</p>
        </div>
      </div>
    </footer>
  )
}
