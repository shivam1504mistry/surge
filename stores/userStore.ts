import { create } from 'zustand'
import { Session } from '@supabase/supabase-js'
import { Goal, Sex } from '../constants/macros'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type UnitPref = 'kg' | 'lbs'
export type Tier     = 'free' | 'pro'

export interface UserProfile {
  id:                   string
  phone:                string
  name:                 string
  age:                  number
  sex:                  Sex
  weight_kg:            number
  height_cm:            number
  body_fat_pct?:        number
  goal:                 Goal
  unit_pref:            UnitPref
  calorie_target:       number
  protein_target_g:     number
  carbs_target_g:       number
  fat_target_g:         number
  tier:                 Tier
  accountability_name?: string
  accountability_phone?:string
  accountability_freq?: 'daily' | 'weekly' | 'after_each'
}

interface UserState {
  session:    Session | null
  profile:    UserProfile | null
  isLoading:  boolean
  setSession: (session: Session | null) => void
  setProfile: (profile: UserProfile | null) => void
  setLoading: (loading: boolean) => void
  clearUser:  () => void
}

// ---------------------------------------------------------------------------
// Store
// Agent 1 (Onboarding) owns writes to this store.
// All other agents read only.
// ---------------------------------------------------------------------------
export const useUserStore = create<UserState>((set) => ({
  session:    null,
  profile:    null,
  isLoading:  true,

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  clearUser:  () => set({ session: null, profile: null }),
}))
