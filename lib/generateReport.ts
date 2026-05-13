/**
 * generateReport.ts
 * Fetches workout + nutrition data for a date range from Supabase,
 * generates HTML via reportTemplate, converts to PDF via expo-print,
 * and returns an array of local file URIs (one per day).
 */
import * as Print from 'expo-print'
import { supabase } from './supabase'
import { buildDayHTML, buildMultiDayHTML, ReportDay, ReportMeal, ReportExercise } from './reportTemplate'

// App download link — Android APK (EAS preview build)
export const APP_DOWNLOAD_LINK = 'https://expo.dev/accounts/shivam1504mistry/projects/surge/builds/ad01b2eb-7f53-4d02-b33b-e2d710fbb4dd'

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Formats a Date as 'YYYY-MM-DD' in LOCAL time (not UTC) — avoids IST midnight offset bugs */
function toLocalISO(d: Date): string {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dy}`
}

/** Returns array of 'YYYY-MM-DD' strings for [startDate, endDate] inclusive */
export function dateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = []
  // Use noon local time to avoid UTC-midnight parse shifting the date backward in IST (+5:30)
  const cur = new Date(toLocalISO(startDate) + 'T12:00:00')
  const end = new Date(toLocalISO(endDate)   + 'T12:00:00')
  while (cur <= end) {
    dates.push(toLocalISO(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

/** 'YYYY-MM-DD' → display string e.g. "Friday, 18 Apr 2026" */
export function formatDisplayDate(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

/** Today as 'YYYY-MM-DD' in local time */
export function todayISO(): string {
  return toLocalISO(new Date())
}

/** N days ago as 'YYYY-MM-DD' in local time */
export function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toLocalISO(d)
}

// ---------------------------------------------------------------------------
// Fetch data for a single day
// ---------------------------------------------------------------------------

async function fetchDayData(userId: string, isoDate: string): Promise<{
  exercises: ReportExercise[]
  sessionName?: string
  meals: ReportMeal[]
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
}> {
  const dayStart = new Date(`${isoDate}T00:00:00`)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(`${isoDate}T23:59:59`)
  dayEnd.setHours(23, 59, 59, 999)

  // Fetch sessions for this user on this day
  const { data: sessions } = await supabase
    .from('workout_sessions')
    .select('id, name')
    .eq('user_id', userId)
    .gte('started_at', dayStart.toISOString())
    .lte('started_at', dayEnd.toISOString())
    .order('started_at', { ascending: true })

  let exercises: ReportExercise[] = []
  let sessionName: string | undefined

  if (sessions && sessions.length > 0) {
    sessionName = sessions[0].name
    const sessionIds = sessions.map(s => s.id)
    const { data: sets } = await supabase
      .from('workout_sets')
      .select('exercise_name, set_number, reps, weight_kg, is_pr')
      .in('session_id', sessionIds)
      .order('exercise_name')
      .order('set_number')
    if (sets) {
      const map: Record<string, ReportExercise> = {}
      for (const s of sets) {
        if (!map[s.exercise_name]) map[s.exercise_name] = { name: s.exercise_name, sets: [] }
        map[s.exercise_name].sets.push({ weight_kg: s.weight_kg, reps: s.reps, is_pr: s.is_pr })
      }
      exercises = Object.values(map)
    }
  }

  // Fetch food entries
  const { data: foodEntries, error: foodError } = await supabase
    .from('food_entries')
    .select('meal_slot, food_name, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g')
    .eq('user_id', userId)
    .eq('logged_date', isoDate)
    .order('logged_at')

  console.log(`[Report] date=${isoDate} userId=${userId}`)
  console.log(`[Report] foodEntries=${JSON.stringify(foodEntries)} error=${foodError?.message}`)
  console.log(`[Report] exercises=${exercises.length}`)

  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
  const meals: ReportMeal[] = SLOTS.map(slot => ({
    slot,
    items: (foodEntries ?? [])
      .filter(f => f.meal_slot === slot)
      .map(f => ({
        food_name:    f.food_name,
        serving_size: f.serving_size,
        serving_unit: f.serving_unit,
        calories:     Math.round(f.calories),
      })),
  }))

  const totals = (foodEntries ?? []).reduce(
    (acc, f) => ({
      calories:  acc.calories  + Math.round(f.calories),
      protein_g: acc.protein_g + Math.round(f.protein_g),
      carbs_g:   acc.carbs_g   + Math.round(f.carbs_g),
      fat_g:     acc.fat_g     + Math.round(f.fat_g),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  return { exercises, sessionName, meals, totals }
}

// ---------------------------------------------------------------------------
// Generate PDFs for a date range
// Returns array of { date, uri } — one PDF file per day
// ---------------------------------------------------------------------------

export interface GeneratedPDF {
  date:        string   // 'YYYY-MM-DD'
  displayDate: string
  uri:         string   // local file URI
}

export interface GenerateOptions {
  userId:           string
  startDate:        string   // 'YYYY-MM-DD'
  endDate:          string   // 'YYYY-MM-DD'
  receiverName?:    string
  profile: {
    name:             string
    goal:             string
    weight_kg:        number
    calorie_target:   number
    protein_target_g: number
    carbs_target_g:   number
    fat_target_g:     number
  }
}

export async function generateReports(opts: GenerateOptions): Promise<GeneratedPDF[]> {
  const dates    = dateRange(new Date(opts.startDate + 'T12:00:00'), new Date(opts.endDate + 'T12:00:00'))
  const now      = new Date()
  const generatedAt = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
                      ', ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  const goalLabels: Record<string, string> = {
    fat_loss: 'Fat Loss', muscle_gain: 'Muscle Gain',
    recomp: 'Body Recomp', maintain: 'Maintain', performance: 'Performance',
  }

  // Fetch all days
  const allDays: ReportDay[] = []
  for (const isoDate of dates) {
    const dayData = await fetchDayData(opts.userId, isoDate)
    allDays.push({
      date:             formatDisplayDate(isoDate),
      athleteName:      opts.profile.name,
      athleteGoal:      goalLabels[opts.profile.goal] ?? opts.profile.goal,
      weightKg:         opts.profile.weight_kg,
      receiverName:     opts.receiverName,
      appLink:          APP_DOWNLOAD_LINK,
      calories:         dayData.totals.calories,
      protein_g:        dayData.totals.protein_g,
      carbs_g:          dayData.totals.carbs_g,
      fat_g:            dayData.totals.fat_g,
      calorie_target:   opts.profile.calorie_target,
      protein_target_g: opts.profile.protein_target_g,
      carbs_target_g:   opts.profile.carbs_target_g,
      fat_target_g:     opts.profile.fat_target_g,
      meals:            dayData.meals,
      sessionName:      dayData.sessionName,
      exercises:        dayData.exercises,
    })
  }

  // Single PDF for all days (avoids sequential share-sheet crash on iOS)
  const html = allDays.length === 1
    ? buildDayHTML(allDays[0], generatedAt)
    : buildMultiDayHTML(allDays, generatedAt)

  const { uri } = await Print.printToFileAsync({ html, base64: false })

  const rangeLabel = allDays.length === 1
    ? formatDisplayDate(dates[0])
    : `${formatDisplayDate(dates[0])} – ${formatDisplayDate(dates[dates.length - 1])}`

  return [{ date: dates[0], displayDate: rangeLabel, uri }]
}
