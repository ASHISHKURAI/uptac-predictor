import { normalizeKey } from './text.ts'

/** The 75 districts of Uttar Pradesh (official names). */
export const UP_DISTRICTS = [
  'Agra', 'Aligarh', 'Ambedkar Nagar', 'Amethi', 'Amroha', 'Auraiya', 'Ayodhya', 'Azamgarh', 'Baghpat', 'Bahraich',
  'Ballia', 'Balrampur', 'Banda', 'Barabanki', 'Bareilly', 'Basti', 'Bhadohi', 'Bijnor', 'Budaun', 'Bulandshahr',
  'Chandauli', 'Chitrakoot', 'Deoria', 'Etah', 'Etawah', 'Farrukhabad', 'Fatehpur', 'Firozabad', 'Gautam Buddha Nagar',
  'Ghaziabad', 'Ghazipur', 'Gonda', 'Gorakhpur', 'Hamirpur', 'Hapur', 'Hardoi', 'Hathras', 'Jalaun', 'Jaunpur', 'Jhansi',
  'Kannauj', 'Kanpur Dehat', 'Kanpur Nagar', 'Kasganj', 'Kaushambi', 'Kushinagar', 'Lakhimpur Kheri', 'Lalitpur',
  'Lucknow', 'Maharajganj', 'Mahoba', 'Mainpuri', 'Mathura', 'Mau', 'Meerut', 'Mirzapur', 'Moradabad', 'Muzaffarnagar',
  'Pilibhit', 'Pratapgarh', 'Prayagraj', 'Rae Bareli', 'Rampur', 'Saharanpur', 'Sambhal', 'Sant Kabir Nagar',
  'Shahjahanpur', 'Shamli', 'Shravasti', 'Siddharthnagar', 'Sitapur', 'Sonbhadra', 'Sultanpur', 'Unnao', 'Varanasi',
] as const

/** Well-known alternative names / cities that map unambiguously to a district. */
const ALIASES: Record<string, string> = {
  allahabad: 'Prayagraj',
  faizabad: 'Ayodhya',
  noida: 'Gautam Buddha Nagar',
  greaternoida: 'Gautam Buddha Nagar',
  gautambudhnagar: 'Gautam Buddha Nagar',
  kanpur: 'Kanpur Nagar',
  raebareli: 'Rae Bareli',
  raebareilly: 'Rae Bareli',
  raibareilly: 'Rae Bareli',
  raibareli: 'Rae Bareli',
  raibarelly: 'Rae Bareli',
  santravidasnagar: 'Bhadohi',
  kheri: 'Lakhimpur Kheri',
  lakhimpur: 'Lakhimpur Kheri',
  jyotibaphulenagar: 'Amroha',
  badaun: 'Budaun',
  siddharthnagar: 'Siddharthnagar',
  siddharthnagr: 'Siddharthnagar',
  shrawasti: 'Shravasti',
  maharajganj: 'Maharajganj',
  mahrajganj: 'Maharajganj',
  orai: 'Jalaun',
  modinagar: 'Ghaziabad',
  bagpat: 'Baghpat',
}

const DISTRICT_BY_KEY = new Map<string, string>(UP_DISTRICTS.map((d) => [normalizeKey(d), d]))

/** Infers the UP district from a city / place name, or null when unsure. */
export function inferDistrict(place: string | null | undefined): string | null {
  if (!place) return null
  const key = normalizeKey(place)
  if (!key) return null
  return DISTRICT_BY_KEY.get(key) ?? ALIASES[key] ?? null
}
