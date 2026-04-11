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
    const { audio, mimeType } = await req.json()
    if (!audio) return jsonError('Missing audio', 400)

    // -------------------------------------------------------------------------
    // Step 1 — Whisper transcription
    // -------------------------------------------------------------------------
    const audioBytes  = Uint8Array.from(atob(audio), c => c.charCodeAt(0))
    const audioBlob   = new Blob([audioBytes], { type: mimeType ?? 'audio/m4a' })
    const formData    = new FormData()
    formData.append('file', audioBlob, `audio.${extensionFor(mimeType)}`)
    formData.append('model', 'whisper-1')
    formData.append('language', 'en')  // accepts Hindi too (Whisper is multilingual)

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

    const { text: transcript } = await whisperRes.json()
    if (!transcript?.trim()) return jsonError('Empty transcript', 422)

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

Rules:
- ONLY log what was explicitly stated. Never assume sets, reps, weight, or portion sizes.
- If the user says "bench press 80kg for 8 reps" → 1 set, 80kg, 8 reps.
- If the user says "3 sets of bench press at 80kg, 8 reps each" → 3 sets.
- For food: estimate macros from standard Indian/international portions if not stated. Mark ai_estimated: true.
- Detect language: English or Hindi/Hinglish both work.

Output JSON (no markdown, pure JSON):

Always return BOTH arrays. Set type to "workout", "food", or "both".

{
  "type": "workout" | "food" | "both",
  "exercises": [
    {
      "name": "EXERCISE NAME (uppercase)",
      "muscle": "muscle group",
      "sets": [{ "weight": number_kg, "reps": number }]
    }
  ],
  "foods": [
    {
      "name": "food name",
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "serving_size": number,
      "serving_unit": "g|ml|piece|katori|roti|etc",
      "meal_slot": "breakfast|lunch|dinner|snacks",
      "ai_estimated": boolean
    }
  ]
}

Examples:
- "bench press 80kg 8 reps" → type: "workout", exercises: [...], foods: []
- "had a banana and protein shake" → type: "food", exercises: [], foods: [...]
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
