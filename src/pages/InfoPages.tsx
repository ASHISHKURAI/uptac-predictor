import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CLASSIFICATION_DESCRIPTIONS, CLASSIFICATION_LABELS, CLASSIFICATION_ORDER } from '@shared/prediction/index.ts'
import { Seo } from '@/components/common/Seo'
import { PageHero } from '@/components/layout/PublicLayout'
import { ClassificationBadge } from '@/components/predictor/ClassificationBadge'

function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="container-page py-10">
      <article className="mx-auto max-w-3xl space-y-6 text-[0.95rem] leading-relaxed text-navy-700 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-navy-950 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2 [&_a]:font-semibold [&_a]:text-royal-600 hover:[&_a]:underline">
        {children}
      </article>
    </div>
  )
}

export function AboutPage() {
  return (
    <>
      <Seo title="How UPTAC Predictor works" description="Methodology: verified official UPTAC data, eligibility rules, and transparent classification bands instead of admission probabilities." />
      <PageHero eyebrow="Methodology" title="How UPTAC Predictor works" description="A transparent, data-driven comparison with official counselling data – no black boxes and no invented probabilities." />
      <Prose>
        <h2>1. Official data only</h2>
        <p>
          Opening and closing ranks and seat matrices come from official UPTAC documents and the official counselling portal (
          <a href="https://uptac.samarth.edu.in/" target="_blank" rel="noopener noreferrer">uptac.samarth.edu.in</a>). Administrators upload each document; the system
          extracts its tables, normalises institute and branch names, validates ranks and categories, and flags duplicates. Nothing is published until an
          administrator reviews and approves it. Every record keeps its source document, page and academic year.
        </p>
        <h2>2. Eligibility rules</h2>
        <ul>
          <li>OPEN (unreserved) seats are considered for every candidate.</li>
          <li>Vertical reservation (EWS, OBC-NCL, SC, ST) applies only to Uttar Pradesh domicile candidates; other-state candidates are compared with OPEN seats.</li>
          <li>Horizontal reservations – girls (GL), armed forces (AF), freedom fighters (FF) and persons with disability (PH) – and tuition fee waiver (TFW) seats apply only to UP domicile candidates who declare them.</li>
          <li>Female-only seats are considered only for female candidates; home-state quota seats only for UP domicile candidates.</li>
          <li>JEE Main CRL ranks are compared only with records published as CRL ranks, and category ranks only with category-rank records.</li>
        </ul>
        <p>Rules can change between years; administrators re-verify them against each year's official brochure.</p>
        <h2>3. Comparison bands</h2>
        <p>
          For every seat group you are eligible for, your rank is compared with the historical closing rank of each year and round. The classification of a year uses
          that year's last regular round – special, spot and internal-sliding rounds only fill leftover seats and their closing ranks jump around, so they are shown
          but not used for the headline. The headline uses the most recent year with data.
        </p>
        <div className="space-y-3">
          {CLASSIFICATION_ORDER.map((c) => (
            <div key={c} className="rounded-2xl border border-navy-100 bg-white p-4">
              <ClassificationBadge value={c} />
              <p className="mt-2 text-sm">{CLASSIFICATION_DESCRIPTIONS[c]}</p>
            </div>
          ))}
        </div>
        <p>
          The margins are 10% of the closing rank: “{CLASSIFICATION_LABELS.WITHIN_RANGE}” means your rank is at least 10% better than the closing rank; “
          {CLASSIFICATION_LABELS.NEAR_CUTOFF}” means up to 10% beyond it. These describe history – they are not probabilities.
        </p>
        <h2>4. Why no admission probability?</h2>
        <p>
          Closing ranks depend on how many students apply, how they fill choices, seat changes and round dynamics – none of which can be known in advance. Showing a
          percentage would suggest a precision that does not exist, so we show the historical facts and let you plan with them.
        </p>
        <h2>5. Data monitoring</h2>
        <p>
          The official portal is checked periodically for new or changed documents (seat matrices, opening & closing ranks, brochures and notices). New documents
          are recorded and administrators are notified – they are never imported automatically.
        </p>
        <p>
          See the <Link to="/sources">data sources</Link> and the <Link to="/disclaimer">disclaimer</Link>.
        </p>
      </Prose>
    </>
  )
}

export function DisclaimerPage() {
  return (
    <>
      <Seo title="Disclaimer" description="UPTAC Predictor is an independent advisory tool and does not guarantee admission." />
      <PageHero eyebrow="Legal" title="Disclaimer" />
      <Prose>
        <p>
          UPTAC Predictor is an independent informational tool. It is <strong>not</strong> affiliated with, endorsed by or connected to UPTAC, Dr. A.P.J. Abdul Kalam
          Technical University (AKTU), the National Testing Agency or any government body.
        </p>
        <ul>
          <li>Results compare your rank with verified historical opening and closing ranks. They are not forecasts and do not guarantee admission to any college or branch.</li>
          <li>Cutoffs change every year and every round. Seat matrices, reservation rules and eligibility criteria are defined only by official UPTAC notifications.</li>
          <li>Although every record is checked against official documents, errors in extraction or in the source documents are possible. Always verify with the official portal before making decisions.</li>
          <li>The Choice Filling Assistant is a planning aid. Choices must be filled and locked on the official UPTAC portal.</li>
          <li>Fee and placement figures are taken only from official college sources and may change; contact the institute for current information.</li>
        </ul>
        <p>By using this website you accept that decisions you make are your own responsibility.</p>
      </Prose>
    </>
  )
}

export function PrivacyPage() {
  return (
    <>
      <Seo title="Privacy policy" description="How UPTAC Predictor handles your personal data." />
      <PageHero eyebrow="Legal" title="Privacy policy" />
      <Prose>
        <h2>What we collect</h2>
        <ul>
          <li>Account data: your email address and the name you provide.</li>
          <li>Profile data you choose to save: JEE Main CRL rank, category, gender, domicile and favourite branches.</li>
          <li>Prediction inputs (rank, category, preferences) and summary results, to show your history. Predictions made without an account are stored without any identity.</li>
          <li>Saved colleges and choice lists you create.</li>
        </ul>
        <h2>How it is protected</h2>
        <p>
          Data is stored in a PostgreSQL database with row-level security: you can access only your own data. Administrators can view aggregated usage and profiles
          for support and abuse prevention. We do not sell personal data or use it for advertising.
        </p>
        <h2>Your choices</h2>
        <p>You can edit your profile, delete prediction history and delete choice lists at any time from your dashboard. To delete your account, contact the site administrator.</p>
        <h2>Cookies & storage</h2>
        <p>We use browser storage only to keep you signed in and to remember your last predictor inputs in the current session.</p>
      </Prose>
    </>
  )
}

export function TermsPage() {
  return (
    <>
      <Seo title="Terms of use" description="Terms of use for UPTAC Predictor." />
      <PageHero eyebrow="Legal" title="Terms of use" />
      <Prose>
        <ul>
          <li>The service is provided “as is” for informational purposes, without warranties of accuracy or fitness for a particular purpose.</li>
          <li>Do not attempt to scrape, overload, or bypass the security of the service, or to access other users' data.</li>
          <li>Accounts are personal. Keep your password secure and notify us of unauthorised use.</li>
          <li>Official data remains the property of its publishers; source links are provided for verification.</li>
          <li>We may update these terms; continued use after changes means you accept them.</li>
        </ul>
        <p>
          Please also read the <Link to="/disclaimer">disclaimer</Link> and <Link to="/privacy">privacy policy</Link>.
        </p>
      </Prose>
    </>
  )
}
