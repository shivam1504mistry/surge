import { create } from 'zustand'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface WorkoutSet {
  id:           string
  exercise_id:  string
  exercise_name:string
  set_number:   number
  reps:         number
  weight_kg:    number
  rpe?:         number
  is_pr:        boolean
  input_source: 'tap' | 'voice' | 'template'
  logged_at:    string
}

export interface WorkoutSession {
  id:          string
  name:        string
  started_at:  string
  ended_at?:   string
  source:      'manual' | 'health_auto' | 'voice'
  sets:        WorkoutSet[]
}

export interface WorkoutTemplate {
  id:        string
  name:      string
  exercises: {
    exercise_id:       string
    exercise_name:     string
    default_sets:      number
    default_reps:      number
    default_weight_kg: number
  }[]
}

interface WorkoutState {
  activeSession:  WorkoutSession | null
  templates:      WorkoutTemplate[]
  startSession:   (name: string, source?: WorkoutSession['source']) => void
  endSession:     () => void
  addSet:         (set: Omit<WorkoutSet, 'id' | 'logged_at'>) => void
  setTemplates:   (templates: WorkoutTemplate[]) => void
}

// ---------------------------------------------------------------------------
// Store
// Agent 2 (Gym Logging) owns writes to this store.
// ---------------------------------------------------------------------------
export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  activeSession: null,
  templates:     [],

  startSession: (name, source = 'manual') => set({
    activeSession: {
      id:         crypto.randomUUID(),
      name,
      started_at: new Date().toISOString(),
      source,
      sets:       [],
    }
  }),

  endSession: () => set({ activeSession: null }),

  addSet: (setData) => {
    const session = get().activeSession
    if (!session) return
    const newSet: WorkoutSet = {
      ...setData,
      id:        crypto.randomUUID(),
      logged_at: new Date().toISOString(),
    }
    set({ activeSession: { ...session, sets: [...session.sets, newSet] } })
  },

  setTemplates: (templates) => set({ templates }),
}))
