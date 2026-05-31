import { create } from 'zustand'
import { Session } from '@supabase/supabase-js'
import { Goal, Sex } from '../constants/macros'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type UnitPref      = 'kg' | 'lbs'
export type FoodUnitPref  = 'metric' | 'imperial' | 'natural'
export type Tier          = 'free' | 'pro'

export interface UserProfile {
  id:                   string
  phone:                string | null
  email:                string | null
  name:                 string
  age:                  number
  sex:                  Sex
  weight_kg:            number
  height_cm:            number
  body_fat_pct?:        number
  goal:                 Goal
  unit_pref:            UnitPref
  food_unit_pref?:      FoodUnitPref
  calorie_target:       number
  protein_target_g:     number
  carbs_target_g:       number
  fat_target_g:         number
  tier:                 Tier
  accountability_name?: string
  accountability_phone?:string
  accountability_freq?: 'daily' | 'weekly'
  referral_code?:       string
  referred_by?:         string | null
}

interface UserState {
  session:              Session | null
  profile:              UserProfile | null
  isLoading:            boolean
  pendingReferralCode:  string | null
  setSession:           (session: Session | null) => void
  setProfile:           (profile: UserProfile | null) => void
  setLoading:           (loading: boolean) => void
  setPendingReferralCode: (code: string | null) => void
  clearUser:            () => void
}

// ---------------------------------------------------------------------------
// Store
// Agent 1 (Onboarding) owns writes to this store.
// All other agents read only.
// ---------------------------------------------------------------------------
export const useUserStore = create<UserState>((set) => ({
  session:             null,
  profile:             null,
  isLoading:           true,
  pendingReferralCode: null,

  setSession:             (session)  => set({ session }),
  setProfile:             (profile)  => set({ profile }),
  setLoading:             (isLoading) => set({ isLoading }),
  setPendingReferralCode: (code)     => set({ pendingReferralCode: code }),
  clearUser:              ()         => set({ session: null, profile: null, pendingReferralCode: null }),
}))
