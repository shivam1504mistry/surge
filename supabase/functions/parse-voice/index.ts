/**
 * parse-voice — Supabase Edge Function
 *
 * Receives base64-encoded audio, sends to OpenAI Whisper for transcription,
 * then passes transcript to GPT-4o-mini to parse into structured workout or food data.
 *
 * POST body: { audio: string (base64), mimeType: string }
 * Response:  { transcript, type: 'workout'|'food', exercises?, foods? }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { audio, mimeType, _test_transcript, food_unit_pref, localHour } = body

    // Determine meal slot from local hour if provided
    const mealSlotHint =
      typeof localHour === 'number'
        ? localHour >= 5  && localHour < 11 ? 'breakfast'
        : localHour >= 11 && localHour < 15 ? 'lunch'
        : localHour >= 15 && localHour < 19 ? 'snacks'
        : 'dinner'
        : 'dinner'

    // Map unit pref to a human-readable instruction injected into the GPT prompt
    const unitInstruction =
      food_unit_pref === 'imperial'
        ? 'Food units: The user prefers oz, cups, and tbsp. Use these as the primary serving_unit and in ingredients (e.g. "6oz chicken", "1 cup milk", "2 tbsp peanut butter"). Always include "g" as an alternative in unit_options.'
        : food_unit_pref === 'natural'
        ? 'Food units: The user prefers natural language portions (e.g. "2 rotis", "1 katori dal", "1 medium bowl rice", "1 piece"). Use these as serving_unit where possible. Always include "g" as an alternative in unit_options.'
        : 'Food units: The user prefers metric units (grams and ml). Use "g" or "ml" as serving_unit in most cases.'

    // DEV ONLY: allow bypassing Whisper with a pre-supplied transcript
    let transcript: string
    if (_test_transcript) {
      transcript = _test_transcript
    } else {
      if (!audio) return jsonError('Missing audio', 400)

      // -----------------------------------------------------------------------
      // Step 1 — Whisper transcription
      // -----------------------------------------------------------------------
      const audioBytes  = Uint8Array.from(atob(audio), c => c.charCodeAt(0))
      const audioBlob   = new Blob([audioBytes], { type: mimeType ?? 'audio/m4a' })
      const formData    = new FormData()
      formData.append('file', audioBlob, `audio.${extensionFor(mimeType)}`)
      formData.append('model', 'whisper-1')
      formData.append('language', 'en')

      const whisperRes  = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method:  'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body:    formData,
      })

      if (!whisperRes.ok) {
        const err = await whisperRes.text()
        console.error('[parse-voice] Whisper error:', err)
        return jsonError('Transcription failed', 500)
      }

      const { text: t } = await whisperRes.json()
      if (!t?.trim()) return jsonError('Empty transcript', 422)
      transcript = t
    }

    // -------------------------------------------------------------------------
    // Step 2 — GPT-4o-mini structured parse
    // -------------------------------------------------------------------------
    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role:    'system',
            content: `You are a fitness logging assistant. Parse the user's voice note into structured JSON.

${unitInstruction}

Rules:
- ONLY log what was explicitly stated. Never assume sets, reps, weight, or portion sizes.
- Weighted exercises: "bench press 80kg for 8 reps" → sets: [{weight:80, reps:8}]
- Bodyweight exercises: "35 push ups" → sets: [{weight:0, reps:35}]. "3 sets of 20 pull ups" → 3 set objects with weight:0, reps:20.
- Cardio: Always store distance_km in km. ALSO output distance_original (the number the user said) and distance_original_unit (the unit they said: "km", "miles", "m"). "ran 2 miles" → sets: [{weight:0, reps:0, distance_km:3.22, distance_original:2, distance_original_unit:"miles"}]. "ran 5km" → sets: [{weight:0, reps:0, distance_km:5, distance_original:5, distance_original_unit:"km"}]. "cycled 30 minutes" → sets: [{weight:0, reps:0, duration_min:30}].
- Weight units: ALWAYS output weight in kg. If user says "lbs" convert to kg (1 lb = 0.4536 kg). "225 lbs bench press" → weight: 102.1.
- Abs/core: "100 sit ups" → sets: [{weight:0, reps:100}]
- For food: estimate macros from standard Indian/international portions if not stated. Mark ai_estimated: true.
- meal_slot: set based on what the user says ("had breakfast", "for lunch", etc). If not mentioned, default to "${mealSlotHint}" (detected from current time).
- Detect language: English or Hindi/Hinglish both work.

Output JSON (no markdown, pure JSON):

Always return BOTH arrays. Set type to "workout", "food", or "both".

{
  "type": "workout" | "food" | "both",
  "exercises": [
    {
      "name": "EXERCISE NAME (uppercase)",
      "muscle": "muscle group",
      "sets": [{ "weight": number_kg_or_0_for_bodyweight, "reps": number_or_0_for_cardio, "distance_km": number_optional, "distance_original": number_optional, "distance_original_unit": "km|miles|m optional", "duration_min": number_optional }]
    }
  ],
  "foods": [
    {
      "name": "dish or food name",
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "serving_size": number,
      "serving_unit": "g|ml|piece|katori|roti|etc",
      "meal_slot": "breakfast" | "lunch" | "dinner" | "snacks",
      "ai_estimated": boolean,
      "ingredients": [
        {
          "name": "ingredient name",
          "qty": number,
          "unit": "most natural unit (slice|g|ml|piece|katori|tbsp|tsp|whole|cup|roti|etc)",
          "calories": number (total kcal for this qty+unit),
          "protein_g": number,
          "carbs_g": number,
          "fat_g": number,
          "unit_options": ["primary unit", "g", "ml", "piece"]
        }
      ]
    }
  ]
}

Food rules:
- SEPARATE DISHES: Each distinct food item is its own entry in foods[]. "paneer sabzi with 2 rotis" → 2 foods: Paneer Sabzi + Roti. "dal chawal" → 2 foods: Dal + Rice. Never merge roti/rice/bread into a sabzi/curry dish.
- Break each dish into its ingredients. "bread butter" → dish: Bread Butter, ingredients: [White Bread, Butter]. "boiled eggs" → dish: Boiled Eggs, ingredients: [Eggs].
- For simple foods (banana, apple), one ingredient = the food itself.
- unit_options: always include the primary unit + "g" + 1-2 other sensible alternatives.
- Per-ingredient macros: estimate realistic macros for each ingredient at the stated qty+unit. The dish-level calories/protein_g/carbs_g/fat_g MUST equal the exact sum of all its ingredients' macros. Compute ingredients first, then sum them to get the dish total — never estimate dish totals independently.
- Estimate macros from standard Indian/international portions.

Examples:
- "bench press 80kg 8 reps" → type: "workout", exercises: [...], foods: []
- "had a banana and protein shake" → type: "food", exercises: [], foods: [{name:"Banana", ingredients:[{name:"Banana",...}]}, {name:"Protein Shake", ingredients:[{name:"Protein Shake",...}]}]
- "paneer sabzi with 2 rotis" → type: "food", foods: [{name:"Paneer Sabzi", ingredients:[Paneer, Vegetables, Spices]}, {name:"Roti", ingredients:[{name:"Roti", qty:2, unit:"piece",...}]}]
- "bench press 80kg 8 reps and then had a protein shake" → type: "both", exercises: [...], foods: [...]`,
          },
          { role: 'user', content: transcript },
        ],
      }),
    })

    if (!gptRes.ok) {
      const err = await gptRes.text()
      console.error('[parse-voice] GPT error:', err)
      return jsonError('Parse failed', 500)
    }

    const gptJson   = await gptRes.json()
    const rawOutput = gptJson.choices?.[0]?.message?.content ?? ''

    let parsed: any
    try {
      parsed = JSON.parse(rawOutput)
    } catch {
      console.error('[parse-voice] GPT returned non-JSON:', rawOutput)
      return jsonError('Could not parse response', 500)
    }

    return new Response(
      JSON.stringify({ transcript, ...parsed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[parse-voice] Unexpected error:', err)
    return jsonError('Internal error', 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

function extensionFor(mimeType: string): string {
  if (mimeType?.includes('mp4') || mimeType?.includes('m4a')) return 'm4a'
  if (mimeType?.includes('webm')) return 'webm'
  if (mimeType?.includes('wav'))  return 'wav'
  return 'm4a'
}
