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
export interface WorkoutSet {
  id:            string
  exercise_id:   string
  exercise_name: string
  set_number:    number
  reps:          number
  weight_kg:     number
  rpe?:          number
  is_pr:         boolean
  input_source:  'tap' | 'voice' | 'template'
  logged_at:     string
}

export interface WorkoutSession {
  id:         string
  name:       string
  started_at: string
  ended_at?:  string
  source:     'manual' | 'health_auto' | 'voice'
  sets:       WorkoutSet[]
}

export interface WorkoutTemplate {
  id:        string
  name:      string
  exercises: {
    exercise_id:        string
    exercise_name:      string
    default_sets:       number
    default_reps:       number
    default_weight_kg:  number
  }[]
}

// What's shown on the Today screen — loaded from DB, not from a memory buffer
export interface TodayExercise {
  exercise_name: string
  sets: Array<{ weight_kg: number; reps: number; set_number: number }>
}

interface WorkoutState {
  activeSession:    WorkoutSession | null   // kept for manual log path only
  todayExercises:   TodayExercise[]         // what's been logged today (from DB)
  templates:        WorkoutTemplate[]
  previousSetsMap:  Record<string, WorkoutSet[]>
  prMap:            Record<string, number>

  // ---- Voice log — instant save, no manual start/end ----
  saveVoiceLog: (exercises: Array<{
    name: string
    muscle: string
    sets: Array<{ weight: number; reps: number }>
  }>) => Promise<{ error: string | null }>

  // ---- Today display ----
  loadTodayExercises: () => Promise<void>

  // ---- Session lifecycle (manual log path only) ----
  startSession:      (name: string, source?: WorkoutSession['source']) => void
  endSession:        () => void
  saveAndEndSession: () => Promise<{ error: string | null }>

  // ---- Set management ----
  addSet:        (set: Omit<WorkoutSet, 'id' | 'logged_at' | 'is_pr'>) => void
  removeSet:     (setId: string) => void
  updateSet:     (setId: string, updates: { reps?: number; weight_kg?: number; rpe?: number }) => void
  removeExercise:(exerciseId: string) => void

  // ---- Templates ----
  setTemplates: (templates: WorkoutTemplate[]) => void

  // ---- Async data loaders ----
  loadPreviousSets: (exerciseId: string) => Promise<void>
  initPRMap:        (exerciseId: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// Store
// Agent 2 (Gym Logging) owns writes to this store.
// ---------------------------------------------------------------------------
export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  activeSession:   null,
  todayExercises:  [],
  templates:       [],
  previousSetsMap: {},
  prMap:           {},

  // --------------------------------------------------------------------------
  // Voice log — instant save + 3-hour session grouping
  // --------------------------------------------------------------------------
  saveVoiceLog: async (exercises) => {
    // Optimistic local update — UI responds immediately regardless of DB outcome
    set(state => {
      const map = new Map<string, TodayExercise['sets']>()
      // Preserve existing exercises
      for (const ex of state.todayExercises) {
        map.set(ex.exercise_name, [...ex.sets])
      }
      // Merge new exercises
      for (const ex of exercises) {
        const existing = map.get(ex.name) ?? []
        const startSet = existing.length + 1
        map.set(ex.name, [
          ...existing,
          ...ex.sets.map((s, idx) => ({
            weight_kg:  s.weight,
            reps:       s.reps,
            set_number: startSet + idx,
          })),
        ])
      }
      return {
        todayExercises: Array.from(map.entries()).map(([exercise_name, sets]) => ({
          exercise_name,
          sets,
        })),
      }
    })

    const { data: { session }, error: authError } = await supabase.auth.getSession()
    const user = session?.user
    if (authError || !user) {
      console.error('[Surge] saveVoiceLog: not authenticated', authError?.message)
      return { error: 'Not authenticated' }
    }

    const now          = new Date()
    const threeHrsAgo  = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()

    // Reuse most recent session if within last 3 hours — otherwise start a new one
    const { data: recent } = await supabase
      .from('workout_sessions')
      .select('id')
      .gte('started_at', threeHrsAgo)
      .order('started_at', { ascending: false })
      .limit(1)

    let sessionId: string

    if (recent && recent.length > 0) {
      sessionId = recent[0].id
    } else {
      const { data: newSession, error: sessionErr } = await supabase
        .from('workout_sessions')
        .insert({
          user_id:    user.id,
          name:       'Voice Log',
          started_at: now.toISOString(),
          source:     'voice',
        })
        .select('id')
        .single()

      if (sessionErr || !newSession) {
        console.error('[Surge] saveVoiceLog: failed to create session', sessionErr?.message)
        return { error: sessionErr?.message ?? 'Failed to create session' }
      }
      sessionId = newSession.id
    }

    // Insert all sets
    const rows = exercises.flatMap(ex =>
      ex.sets.map((s, idx) => ({
        session_id:    sessionId,
        exercise_id:   ex.name.toLowerCase().replace(/\s+/g, '_'),
        exercise_name: ex.name,
        set_number:    idx + 1,
        reps:          s.reps,
        weight_kg:     s.weight,
        is_pr:         false,
        input_source:  'voice',
        logged_at:     now.toISOString(),
      }))
    )

    const { error: setsErr } = await supabase.from('workout_sets').insert(rows)
    if (setsErr) {
      console.error('[Surge] saveVoiceLog: failed to insert sets', setsErr.message)
      return { error: setsErr.message }
    }

    await get().loadTodayExercises()
    return { error: null }
  },

  // --------------------------------------------------------------------------
  // Load today's exercises from DB for display
  // --------------------------------------------------------------------------
  loadTodayExercises: async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data } = await supabase
      .from('workout_sets')
      .select('exercise_name, weight_kg, reps, set_number, logged_at')
      .gte('logged_at', todayStart.toISOString())
      .order('logged_at', { ascending: true })

    if (!data) return

    const map = new Map<string, TodayExercise['sets']>()
    for (const s of data) {
      if (!map.has(s.exercise_name)) map.set(s.exercise_name, [])
      map.get(s.exercise_name)!.push({
        weight_kg:  Number(s.weight_kg),
        reps:       Number(s.reps),
        set_number: Number(s.set_number),
      })
    }

    set({
      todayExercises: Array.from(map.entries()).map(([exercise_name, sets]) => ({
        exercise_name,
        sets,
      })),
    })
  },

  // --------------------------------------------------------------------------
  // Session lifecycle (manual log path only)
  // --------------------------------------------------------------------------
  startSession: (name, source = 'manual') => set({
    activeSession: {
      id:         uuid(),
      name,
      started_at: new Date().toISOString(),
      source,
      sets:       [],
    },
  }),

  endSession: () => set({ activeSession: null }),

  saveAndEndSession: async () => {
    const session = get().activeSession
    if (!session) return { error: 'No active session' }

    const { data: { session: authSession }, error: authError } = await supabase.auth.getSession()
    const user = authSession?.user
    if (authError || !user) return { error: 'Not authenticated' }

    const endedAt       = new Date().toISOString()
    const durationSecs  = Math.round(
      (new Date(endedAt).getTime() - new Date(session.started_at).getTime()) / 1000
    )

    const { data: savedSession, error: sessionErr } = await supabase
      .from('workout_sessions')
      .insert({
        user_id:          user.id,
        name:             session.name,
        started_at:       session.started_at,
        ended_at:         endedAt,
        duration_seconds: durationSecs,
        source:           session.source,
      })
      .select('id')
      .single()

    if (sessionErr || !savedSession) {
      return { error: sessionErr?.message ?? 'Failed to save session' }
    }

    if (session.sets.length > 0) {
      const { error: setsErr } = await supabase
        .from('workout_sets')
        .insert(
          session.sets.map(s => ({
            session_id:    savedSession.id,
            exercise_id:   s.exercise_id,
            exercise_name: s.exercise_name,
            set_number:    s.set_number,
            reps:          s.reps,
            weight_kg:     s.weight_kg,
            rpe:           s.rpe ?? null,
            is_pr:         s.is_pr,
            input_source:  s.input_source,
          }))
        )

      if (setsErr) {
        // Session saved but sets failed — don't block UX, just log
        console.error('[Surge] Failed to save workout sets:', setsErr.message)
      }
    }

    set({ activeSession: null })
    return { error: null }
  },

  // --------------------------------------------------------------------------
  // Set management
  // --------------------------------------------------------------------------
  addSet: (setData) => {
    const session = get().activeSession
    if (!session) return

    const prevMax = get().prMap[setData.exercise_id] ?? 0
    const is_pr   = setData.weight_kg > 0 && setData.weight_kg > prevMax

    const newSet: WorkoutSet = {
      ...setData,
      id:        uuid(),
      logged_at: new Date().toISOString(),
      is_pr,
    }

    // Update prMap immediately so consecutive sets in the same session can beat each other
    if (is_pr) {
      set(state => ({
        prMap: { ...state.prMap, [setData.exercise_id]: setData.weight_kg },
      }))
    }

    set({
      activeSession: {
        ...session,
        sets: [...session.sets, newSet],
      },
    })
  },

  removeSet: (setId) => {
    const session = get().activeSession
    if (!session) return
    set({
      activeSession: {
        ...session,
        sets: session.sets.filter(s => s.id !== setId),
      },
    })
  },

  updateSet: (setId, updates) => {
    const session = get().activeSession
    if (!session) return
    set({
      activeSession: {
        ...session,
        sets: session.sets.map(s =>
          s.id === setId ? { ...s, ...updates } : s
        ),
      },
    })
  },

  removeExercise: (exerciseId) => {
    const session = get().activeSession
    if (!session) return
    set({
      activeSession: {
        ...session,
        sets: session.sets.filter(s => s.exercise_id !== exerciseId),
      },
    })
  },

  // --------------------------------------------------------------------------
  // Templates
  // --------------------------------------------------------------------------
  setTemplates: (templates) => set({ templates }),

  // --------------------------------------------------------------------------
  // Async loaders — called when an exercise is added to the session
  // --------------------------------------------------------------------------
  loadPreviousSets: async (exerciseId) => {
    // Find the most recent completed session containing this exercise (via RLS, only user's own data)
    const { data: latestRows } = await supabase
      .from('workout_sets')
      .select('session_id, logged_at')
      .eq('exercise_id', exerciseId)
      .order('logged_at', { ascending: false })
      .limit(1)

    if (!latestRows || latestRows.length === 0) {
      set(state => ({
        previousSetsMap: { ...state.previousSetsMap, [exerciseId]: [] },
      }))
      return
    }

    const lastSessionId = latestRows[0].session_id

    // Confirm that session is completed (has ended_at)
    const { data: sessionRow } = await supabase
      .from('workout_sessions')
      .select('ended_at')
      .eq('id', lastSessionId)
      .single()

    if (!sessionRow?.ended_at) {
      // Most recent occurrence is the current (unsaved) session — look one further
      const { data: olderRows } = await supabase
        .from('workout_sets')
        .select('session_id, logged_at')
        .eq('exercise_id', exerciseId)
        .neq('session_id', lastSessionId)
        .order('logged_at', { ascending: false })
        .limit(1)

      if (!olderRows || olderRows.length === 0) {
        set(state => ({
          previousSetsMap: { ...state.previousSetsMap, [exerciseId]: [] },
        }))
        return
      }

      const olderSessionId = olderRows[0].session_id
      const { data: prevSets } = await supabase
        .from('workout_sets')
        .select('*')
        .eq('session_id', olderSessionId)
        .eq('exercise_id', exerciseId)
        .order('set_number')

      set(state => ({
        previousSetsMap: {
          ...state.previousSetsMap,
          [exerciseId]: (prevSets ?? []) as WorkoutSet[],
        },
      }))
      return
    }

    const { data: prevSets } = await supabase
      .from('workout_sets')
      .select('*')
      .eq('session_id', lastSessionId)
      .eq('exercise_id', exerciseId)
      .order('set_number')

    set(state => ({
      previousSetsMap: {
        ...state.previousSetsMap,
        [exerciseId]: (prevSets ?? []) as WorkoutSet[],
      },
    }))
  },

  initPRMap: async (exerciseId) => {
    // Get all-time max weight for this exercise (RLS ensures only user's data)
    const { data } = await supabase
      .from('workout_sets')
      .select('weight_kg')
      .eq('exercise_id', exerciseId)
      .order('weight_kg', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      set(state => ({
        prMap: { ...state.prMap, [exerciseId]: Number(data.weight_kg) },
      }))
    }
  },
}))
