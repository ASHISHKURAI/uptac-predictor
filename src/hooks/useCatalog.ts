import { useQuery } from '@tanstack/react-query'
import {
  fetchAllCollegesLite,
  fetchBranches,
  fetchCutoffOverview,
  fetchCutoffYears,
  fetchDistricts,
  fetchPublicStats,
} from '@/lib/api/catalog'
import { isSupabaseConfigured } from '@/lib/env'

const LONG = 10 * 60 * 1000

export function usePublicStats() {
  return useQuery({ queryKey: ['public-stats'], queryFn: fetchPublicStats, staleTime: LONG, enabled: isSupabaseConfigured })
}

export function useCutoffOverview(year?: number | null) {
  return useQuery({ queryKey: ['cutoff-overview', year ?? null], queryFn: () => fetchCutoffOverview(year), staleTime: LONG, enabled: isSupabaseConfigured })
}

export function useCutoffYears() {
  return useQuery({ queryKey: ['cutoff-years'], queryFn: fetchCutoffYears, staleTime: LONG, enabled: isSupabaseConfigured })
}

export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: fetchBranches, staleTime: LONG, enabled: isSupabaseConfigured })
}

export function useCollegesLite() {
  return useQuery({ queryKey: ['colleges-lite'], queryFn: fetchAllCollegesLite, staleTime: LONG, enabled: isSupabaseConfigured })
}

export function useDistricts() {
  return useQuery({ queryKey: ['districts'], queryFn: fetchDistricts, staleTime: LONG, enabled: isSupabaseConfigured })
}
