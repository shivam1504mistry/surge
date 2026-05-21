import { create } from 'zustand'
import { supabase } from '../lib/supabase'

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type FoodSource   = 'search' | 'barcode' | 'voice' | 'image_ai'
export type AIConfidence = 'high' | 'medium' | 'low'

export interface FoodEntry {
  id:             string
  logged_date:    string        // 'YYYY-MM-DD' — avoids midnight edge cases
  food_name:      string
  calories:       number
  protein_g:      number
  carbs_g:        number
  fat_g:          number
  serving_size:   number
  serving_unit:   string        // 'g' | 'ml' | 'piece' | 'katori' etc
  source:         FoodSource
  ai_confidence?: AIConfidence
  off_food_id?:   string        // Open Food Facts product ID
  logged_at:      string
}

export interface DailyTotals {
  calories:  number
  protein_g: number
  carbs_g:   number
  fat_g:     number
}

interface NutritionState {
  todayEntries:  FoodEntry[]
  isLoading:     boolean

  // Local state mutations
  addEntry:      (entry: Omit<FoodEntry, 'id' | 'logged_at'>) => FoodEntry
  removeEntry:   (id: string) => void
  setEntries:    (entries: FoodEntry[]) => void
  getDailyTotals:() => DailyTotals

  // Supabase persistence
  addAndSave:         (userId: string, entryData: Omit<FoodEntry, 'id' | 'logged_at'>) => Promise<FoodEntry>
  loadTodayEntries:   (userId: string) => Promise<void>
  deleteEntry:        (userId: string, id: string) => Promise<void>
  updateEntry:        (userId: string, id: string, patch: Partial<Pick<FoodEntry, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'serving_size'>>) => Promise<void>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Returns today's date as 'YYYY-MM-DD' in LOCAL time — avoids UTC midnight offset bugs for IST users */
function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dy}`
}

// ---------------------------------------------------------------------------
// Store
// Agent 3 (Nutrition) owns writes to this store.
// All other agents read only.
// ---------------------------------------------------------------------------
export const useNutritionStore = create<NutritionState>((set, get) => ({
  todayEntries: [],
  isLoading:    false,

  // -------------------------------------------------------------------------
  // Local state
  // -------------------------------------------------------------------------
  addEntry: (entryData) => {
    const entry: FoodEntry = {
      ...entryData,
      id:        uuid(),
      logged_at: new Date().toISOString(),
    }
    set((state) => ({ todayEntries: [...state.todayEntries, entry] }))
    return entry
  },

  removeEntry: (id) =>
    set((state) => ({
      todayEntries: state.todayEntries.filter((e) => e.id !== id),
    })),

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

  // -------------------------------------------------------------------------
  // Supabase persistence
  // -------------------------------------------------------------------------

  /** Adds to local state first (instant UI), then persists to Supabase. */
  addAndSave: async (userId, entryData) => {
    const entry: FoodEntry = {
      ...entryData,
      id:        uuid(),
      logged_at: new Date().toISOString(),
    }
    // Optimistic local update
    set((state) => ({ todayEntries: [...state.todayEntries, entry] }))

    // Always get a fresh session directly from Supabase auth —
    // avoids race conditions where Zustand store hasn't loaded yet,
    // or where a token refresh left auth.uid() temporarily null.
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id ?? userId
    if (!uid) {
      console.warn('[NutritionStore] addAndSave: no user session — keeping local state only')
      return entry
    }

    // Persist to Supabase (food_entries table has user_id FK, not stored in FoodEntry type)
    const { error } = await supabase.from('food_entries').insert({
      id:           entry.id,
      user_id:      uid,
      logged_date:  entry.logged_date,
      food_name:    entry.food_name,
      calories:     Math.round(Number(entry.calories)),
      protein_g:    Math.round(Number(entry.protein_g)),
      carbs_g:      Math.round(Number(entry.carbs_g)),
      fat_g:        Math.round(Number(entry.fat_g)),
      serving_size: entry.serving_size,
      serving_unit: entry.serving_unit,
      source:       entry.source,
      ai_confidence:entry.ai_confidence ?? null,
      off_food_id:  entry.off_food_id   ?? null,
      logged_at:    entry.logged_at,
    })

    if (error) {
      console.error('[NutritionStore] Failed to save food entry:', error.message, 'code:', error.code, 'uid:', uid)
      // Roll back optimistic update on failure
      set((state) => ({
        todayEntries: state.todayEntries.filter((e) => e.id !== entry.id),
      }))
      throw error
    }

    return entry
  },

  /** Fetches today's entries from Supabase and populates local state. */
  loadTodayEntries: async (userId) => {
    set({ isLoading: true })
    try {
      const { data, error } = await supabase
        .from('food_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('logged_date', todayISO())
        .order('logged_at', { ascending: true })

      if (error) throw error

      // Strip user_id before storing in local state (not part of FoodEntry type)
      const entries: FoodEntry[] = (data ?? []).map(({ user_id: _uid, ...rest }) => rest as FoodEntry)
      set({ todayEntries: entries })
    } catch (err: any) {
      console.error('[NutritionStore] Failed to load today entries:', err.message)
    } finally {
      set({ isLoading: false })
    }
  },

  /** Updates macros/serving locally and persists to Supabase. */
  updateEntry: async (userId, id, patch) => {
    // Optimistic local update
    set((state) => ({
      todayEntries: state.todayEntries.map((e) =>
        e.id === id ? { ...e, ...patch } : e
      ),
    }))
    const { error } = await supabase
      .from('food_entries')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
    if (error) {
      console.error('[NutritionStore] Failed to update entry:', error.message)
      get().loadTodayEntries(userId)
    }
  },

  /** Removes from local state and deletes from Supabase. */
  deleteEntry: async (userId, id) => {
    // Optimistic local remove
    set((state) => ({
      todayEntries: state.todayEntries.filter((e) => e.id !== id),
    }))

    const { error } = await supabase
      .from('food_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      console.error('[NutritionStore] Failed to delete food entry:', error.message)
      // Re-fetch on failure to restore correct state
      get().loadTodayEntries(userId)
    }
  },
}))
