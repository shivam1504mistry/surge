/**
 * schedule-reports — Supabase Edge Function
 *
 * Called by Supabase pg_cron every day at 21:00 IST (15:30 UTC).
 * Finds all users with accountability_phone set, checks their frequency,
 * fetches today's workout + nutrition data, and sends a WhatsApp summary.
 *
 * Trigger (run in Supabase SQL Editor):
 *   select cron.schedule(
 *     'surge-daily-reports',
 *     '30 15 * * *',   -- 21:00 IST every day
 *     $$
 *       select net.http_post(
 *         url    := 'https://<project-ref>.supabase.co/functions/v1/schedule-reports',
 *         headers := '{"Authorization":"Bearer <service-role-key>","Content-Type":"application/json"}'::jsonb,
 *         body   := '{}'::jsonb
 *       )
 *     $$
 *   );
 */

import { serve }       from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')            ?? ''
const SUPABASE_SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TWILIO_ACCOUNT_SID      = Deno.env.get('TWILIO_ACCOUNT_SID')      ?? ''
const TWILIO_AUTH_TOKEN       = Deno.env.get('TWILIO_AUTH_TOKEN')        ?? ''
const TWILIO_WHATSAPP_FROM    = Deno.env.get('TWILIO_WHATSAPP_FROM')    ?? ''
const APP_DOWNLOAD_LINK       = 'https://expo.dev/accounts/shivam1504mistry/projects/surge/builds/ad01b2eb-7f53-4d02-b33b-e2d710fbb4dd'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface UserRow {
  id:                   string
  name:                 string
  accountability_name:  string | null
  accountability_phone: string
  accountability_freq:  'daily' | 'weekly'
  calorie_target:       number
  protein_target_g:     number
  carbs_target_g:       number
  fat_target_g:         number
}

interface MacroTotals {
  calories: number
  protein:  number
  carbs:    number
  fat:      number
}

// ---------------------------------------------------------------------------
// Twilio send helper
// ---------------------------------------------------------------------------
async function sendWhatsApp(to: string, message: string): Promise<void> {
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  const body = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To:   toFormatted,
    Body: message,
  })
  const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method:  'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    }
  )
  if (!resp.ok) {
    const err = await resp.json()
    throw new Error(`Twilio error: ${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// Format IST date string
// ---------------------------------------------------------------------------
function todayIST(): string {
  return new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function todayISOInIST(): string {
  // Get current date in IST as YYYY-MM-DD
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const ist = new Date(now.getTime() + istOffset)
  return ist.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Fetch today's nutrition totals for a user
// ---------------------------------------------------------------------------
async function fetchNutrition(supabase: ReturnType<typeof createClient>, userId: string, isoDate: string): Promise<MacroTotals> {
  const { data } = await supabase
    .from('food_entries')
    .select('calories, protein_g, carbs_g, fat_g')
    .eq('user_id', userId)
    .eq('logged_date', isoDate)

  if (!data || data.length === 0) return { calories: 0, protein: 0, carbs: 0, fat: 0 }

  return data.reduce((acc: MacroTotals, row: any) => ({
    calories: acc.calories + (row.calories   ?? 0),
    protein:  acc.protein  + (row.protein_g  ?? 0),
    carbs:    acc.carbs    + (row.carbs_g    ?? 0),
    fat:      acc.fat      + (row.fat_g      ?? 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
}

// ---------------------------------------------------------------------------
// Fetch today's workout session for a user
// ---------------------------------------------------------------------------
async function fetchWorkout(supabase: ReturnType<typeof createClient>, userId: string, isoDate: string): Promise<string | null> {
  const { data } = await supabase
    .from('workout_sessions')
    .select('name, workout_sets(count)')
    .eq('user_id', userId)
    .gte('started_at', `${isoDate}T00:00:00Z`)
    .lte('started_at', `${isoDate}T23:59:59Z`)
    .limit(1)
    .single()

  if (!data) return null
  const sets = (data as any).workout_sets?.[0]?.count ?? 0
  return `${(data as any).name ?? 'Workout'} · ${sets} sets`
}

// ---------------------------------------------------------------------------
// Build the WhatsApp message
// ---------------------------------------------------------------------------
function buildMessage(user: UserRow, nutrition: MacroTotals, workoutLine: string | null, isoDate: string): string {
  const coachLine = user.accountability_name ? `Prepared for *${user.accountability_name}*\n` : ''
  const dateStr   = todayIST()

  const cal  = Math.round(nutrition.calories)
  const pro  = Math.round(nutrition.protein)
  const carb = Math.round(nutrition.carbs)
  const fat  = Math.round(nutrition.fat)

  const calPct  = Math.min(100, Math.round((cal  / user.calorie_target)       * 100))
  const proPct  = Math.min(100, Math.round((pro  / user.protein_target_g)     * 100))
  const carbPct = Math.min(100, Math.round((carb / user.carbs_target_g)       * 100))
  const fatPct  = Math.min(100, Math.round((fat  / user.fat_target_g)         * 100))

  const bar = (pct: number) => {
    const filled = Math.round(pct / 10)
    return '█'.repeat(filled) + '░'.repeat(10 - filled)
  }

  const workoutSection = workoutLine
    ? `🏋️ *Workout*\n${workoutLine}`
    : `🏋️ *Workout*\nRest day`

  const nutritionLogged = cal > 0

  const nutritionSection = nutritionLogged
    ? `🥗 *Nutrition*\nCalories: ${cal} / ${user.calorie_target} kcal  ${bar(calPct)} ${calPct}%\nProtein:  ${pro}g / ${user.protein_target_g}g  ${bar(proPct)} ${proPct}%\nCarbs:    ${carb}g / ${user.carbs_target_g}g  ${bar(carbPct)} ${carbPct}%\nFat:      ${fat}g / ${user.fat_target_g}g  ${bar(fatPct)} ${fatPct}%`
    : `🥗 *Nutrition*\nNot logged today`

  return `📊 *Surge Report — ${user.name}*
📅 ${dateStr}
${coachLine}
${workoutSection}

${nutritionSection}

Track your fitness with Surge ⚡
${APP_DOWNLOAD_LINK}`
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    const isoDate = todayISOInIST()
    const isMonday = new Date().getDay() === 1  // weekly reports go on Monday IST

    // Support test-send: POST body may include { testPhone, testUserId }
    let testPhone: string | undefined
    let testUserId: string | undefined
    try {
      const body = await req.json()
      testPhone  = body?.testPhone
      testUserId = body?.testUserId
    } catch { /* cron calls send no body — that's fine */ }

    // Fetch all users with accountability phone set (or just the test user)
    const query = supabase
      .from('users')
      .select('id, name, accountability_name, accountability_phone, accountability_freq, calorie_target, protein_target_g, carbs_target_g, fat_target_g')
      .not('accountability_phone', 'is', null)

    if (testUserId) query.eq('id', testUserId)

    const { data: users, error } = await query

    if (error) throw error
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: corsHeaders })
    }

    const results: { userId: string; status: 'sent' | 'skipped' | 'error'; reason?: string }[] = []

    for (const user of users as UserRow[]) {
      // Skip weekly users if today isn't Monday (unless it's a test send)
      if (!testPhone && user.accountability_freq === 'weekly' && !isMonday) {
        results.push({ userId: user.id, status: 'skipped', reason: 'not-monday' })
        continue
      }

      try {
        const [nutrition, workoutLine] = await Promise.all([
          fetchNutrition(supabase, user.id, isoDate),
          fetchWorkout(supabase, user.id, isoDate),
        ])

        const message = buildMessage(user, nutrition, workoutLine, isoDate)
        // Test send overrides the stored phone (sends to the requesting user's device)
        const sendTo = testPhone ?? user.accountability_phone
        await sendWhatsApp(sendTo, message)
        results.push({ userId: user.id, status: 'sent' })
      } catch (err: any) {
        console.error(`Failed for user ${user.id}:`, err.message)
        results.push({ userId: user.id, status: 'error', reason: err.message })
      }
    }

    const sent = results.filter(r => r.status === 'sent').length
    console.log(`schedule-reports: ${sent}/${users.length} sent`)
    return new Response(JSON.stringify({ sent, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('schedule-reports fatal error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
