import { create } from 'zustand'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks'
export type FoodSource = 'search' | 'barcode' | 'voice' | 'image_ai'
export type AIConfidence = 'high' | 'medium' | 'low'

export interface FoodEntry {
  id:            string
  logged_date:   string   // 'YYYY-MM-DD' — avoids midnight edge cases
  meal_slot:     MealSlot
  food_name:     string
  calories:      number
  protein_g:     number
  carbs_g:       number
  fat_g:         number
  serving_size:  number
  serving_unit:  string
  source:        FoodSource
  ai_confidence?: AIConfidence
  off_food_id?:  string
  logged_at:     string
}

export interface DailyTotals {
  calories:  number
  protein_g: number
  carbs_g:   number
  fat_g:     number
}

interface NutritionState {
  todayEntries:  FoodEntry[]
  addEntry:      (entry: Omit<FoodEntry, 'id' | 'logged_at'>) => void
  removeEntry:   (id: string) => void
  setEntries:    (entries: FoodEntry[]) => void
  getDailyTotals:() => DailyTotals
}

// ---------------------------------------------------------------------------
// Store
// Agent 3 (Nutrition) owns writes to this store.
// ---------------------------------------------------------------------------
export const useNutritionStore = create<NutritionState>((set, get) => ({
  todayEntries: [],

  addEntry: (entryData) => {
    const entry: FoodEntry = {
      ...entryData,
      id:        crypto.randomUUID(),
      logged_at: new Date().toISOString(),
    }
    set((state) => ({ todayEntries: [...state.todayEntries, entry] }))
  },

  removeEntry: (id) =>
    set((state) => ({ todayEntries: state.todayEntries.filter((e) => e.id !== id) })),

  setEntries: (entries) => set({ todayEntries: entries }),

  getDailyTotals: () => {
    const entries = get().todayEntries
    return entries.reduce<DailyTotals>(
      (acc, e) => ({
        calories:  acc.calories  + e.calories,
        protein_g: acc.protein_g + e.protein_g,
        carbs_g:   acc.carbs_g   + e.carbs_g,
        fat_g:     acc.fat_g     + e.fat_g,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    )
  },
}))
