import type {
  CutoffRecord,
  DomicileRequirement,
  EligibilityRules,
  InstitutePreference,
  InstituteType,
  Quota,
  RankType,
  ReservationCategory,
  SeatGender,
  SeatType,
  StudentProfile,
} from './types.ts'

/**
 * UPTAC counselling eligibility rules applied by the prediction engine.
 *
 * Source: UPTAC (AKTU) B.Tech counselling information brochure and the official
 * seat matrix / OR-CR category codes (OPNO, BCGL, SCPH, EWSAF, TFW …).
 * Rules can change between years – an administrator must re-verify them against
 * each year's official brochure (see docs/PREDICTION_ENGINE.md).
 *
 *  1. OPEN (unreserved) seats are filled on merit and are open to every candidate.
 *  2. Vertical reservation (EWS, BC, SC, ST) applies only to candidates domiciled
 *     in Uttar Pradesh. Non-domiciled reserved-category candidates are considered
 *     only for OPEN seats.
 *  3. Horizontal reservations – girls (GL), dependants of armed forces personnel
 *     (AF), dependants of freedom fighters (FF) and persons with disability (PH) –
 *     apply only to UP-domiciled candidates who hold the relevant certificate.
 *     They apply inside OPEN as well as inside the candidate's own category.
 *  4. Tuition fee waiver (TFW) seats are supernumerary seats for UP-domiciled
 *     candidates who meet the official TFW eligibility (income) criteria.
 *  5. Female-only seats can be allotted only to female candidates.
 *  6. Home-state quota seats are for UP-domiciled candidates only.
 *  7. CRL ranks and category ranks are never compared with each other.
 */
export function deriveEligibility(
  student: StudentProfile,
  institutePreference: InstitutePreference = 'both',
): EligibilityRules {
  const notes: string[] = []
  const isUp = student.domicile === 'UP'
  const categories: ReservationCategory[] = ['OPEN']
  const seatTypes: SeatType[] = ['GENERAL']

  notes.push('OPEN (unreserved) seats are considered for every candidate.')

  if (student.category !== 'OPEN') {
    if (isUp) {
      categories.push(student.category)
      notes.push(`${categoryLabel(student.category)} reserved seats are considered because you are domiciled in Uttar Pradesh.`)
    } else {
      notes.push(
        `${categoryLabel(student.category)} reservation is available only to Uttar Pradesh domicile candidates, so only OPEN seats are considered.`,
      )
    }
  }

  if (isUp) {
    if (student.gender === 'FEMALE') {
      seatTypes.push('GIRL')
      notes.push('Girl (GL) horizontal reservation seats are considered.')
    }
    for (const sub of student.subCategories) {
      if (sub === 'AF' || sub === 'FF' || sub === 'PH') {
        seatTypes.push(sub)
        notes.push(`${subCategoryLabel(sub)} (${sub}) seats are considered based on your declaration.`)
      }
    }
    if (student.subCategories.includes('TFW')) {
      seatTypes.push('TFW')
      categories.push('ANY')
      notes.push('Tuition fee waiver (TFW) supernumerary seats are considered based on your declaration.')
    }
  } else if (student.gender === 'FEMALE' || student.subCategories.length > 0) {
    notes.push('Horizontal reservations (GL, AF, FF, PH) and TFW seats apply only to Uttar Pradesh domicile candidates.')
  }

  const genders: SeatGender[] = student.gender === 'FEMALE' ? ['NEUTRAL', 'FEMALE_ONLY'] : ['NEUTRAL']
  if (student.gender === 'FEMALE') notes.push('Female-only seats are considered in addition to gender-neutral seats.')

  const domiciles: DomicileRequirement[] = isUp ? ['ANY', 'UP'] : ['ANY']
  const quotas: Quota[] = isUp ? ['STATE', 'HOME_STATE', 'ALL_INDIA'] : ['STATE', 'ALL_INDIA']
  if (!isUp) notes.push('Home-state quota seats are excluded because they are reserved for Uttar Pradesh domicile candidates.')

  const rankTypes: RankType[] = ['CRL']
  if (student.categoryRank && student.categoryRank > 0) {
    rankTypes.push('CATEGORY')
    notes.push('Your category rank is compared only with records published as category ranks; your CRL rank only with CRL records.')
  } else {
    notes.push('Only records published as JEE Main CRL ranks are compared with your CRL rank.')
  }

  return {
    categories: unique(categories),
    seatTypes: unique(seatTypes),
    genders,
    domiciles,
    quotas,
    rankTypes,
    instituteTypes: instituteTypesFor(institutePreference),
    notes,
  }
}

export function instituteTypesFor(preference: InstitutePreference): InstituteType[] {
  switch (preference) {
    case 'government':
      return ['government', 'aided']
    case 'private':
      return ['private']
    default:
      return ['government', 'aided', 'private', 'university']
  }
}

/** Defensive check used by the engine even though the database already filters. */
export function isRecordEligible(record: CutoffRecord, rules: EligibilityRules): boolean {
  return (
    rules.categories.includes(record.category) &&
    rules.seatTypes.includes(record.seat_type) &&
    rules.genders.includes(record.gender) &&
    rules.domiciles.includes(record.domicile) &&
    rules.quotas.includes(record.quota) &&
    rules.rankTypes.includes(record.rank_type)
  )
}

/** The student rank that may be compared with a record, or null when none applies. */
export function comparableRank(record: Pick<CutoffRecord, 'rank_type'>, student: StudentProfile): number | null {
  if (record.rank_type === 'CRL') return student.crlRank > 0 ? student.crlRank : null
  return student.categoryRank && student.categoryRank > 0 ? student.categoryRank : null
}

export function categoryLabel(category: ReservationCategory): string {
  switch (category) {
    case 'OPEN':
      return 'OPEN (General)'
    case 'EWS':
      return 'EWS'
    case 'BC':
      return 'OBC-NCL (BC)'
    case 'SC':
      return 'SC'
    case 'ST':
      return 'ST'
    default:
      return 'Any category'
  }
}

export function subCategoryLabel(sub: SeatType | 'AF' | 'FF' | 'PH' | 'TFW'): string {
  switch (sub) {
    case 'GENERAL':
      return 'General (no sub-category)'
    case 'GIRL':
      return 'Girl candidates'
    case 'AF':
      return 'Dependants of armed forces personnel'
    case 'FF':
      return 'Dependants of freedom fighters'
    case 'PH':
      return 'Persons with disability'
    case 'TFW':
      return 'Tuition fee waiver'
    default:
      return 'Other'
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}
