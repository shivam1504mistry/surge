/**
 * parse-food-image — Supabase Edge Function
 *
 * Receives a base64-encoded image, sends to GPT-4o Vision to identify
 * food items and estimate macros, returns structured food data.
 *
 * POST body: { image: string (base64), mimeType: string }
 * Response:  { foods: ParsedFood[] }
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
    const { image, mimeType } = await req.json()
    if (!image) return jsonError('Missing image', 400)

    const mime = mimeType ?? 'image/jpeg'
    const dataUrl = `data:${mime};base64,${image}`

    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:       'gpt-4o',
        temperature: 0,
        max_tokens:  1000,
        messages: [
          {
            role:    'system',
            content: `You are a nutrition assistant. Look at the food image and identify all food items visible.
Estimate macros based on typical Indian/international portion sizes.

Output pure JSON (no markdown):
{
  "foods": [
    {
      "name": "food name",
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "serving_size": number,
      "serving_unit": "g|ml|piece|katori|roti|bowl|etc",
      "ai_estimated": true
    }
  ]
}

Rules:
- Always set ai_estimated: true (these are estimates from a photo)
- If no food is visible, return { "foods": [], "error": "No food detected" }
- Never make up food that isn't clearly visible`,
          },
          {
            role:    'user',
            content: [
              {
                type:      'image_url',
                image_url: { url: dataUrl, detail: 'low' },
              },
              {
                type: 'text',
                text: 'What food is in this image? Give me the nutritional breakdown.',
              },
            ],
          },
        ],
      }),
    })

    if (!gptRes.ok) {
      const err = await gptRes.text()
      console.error('[parse-food-image] GPT error:', err)
      return jsonError('Image analysis failed', 500)
    }

    const gptJson   = await gptRes.json()
    const rawOutput = gptJson.choices?.[0]?.message?.content ?? ''

    let parsed: any
    try {
      // Strip markdown code fences if present (GPT-4o sometimes wraps JSON in ```json ... ```)
      const cleaned = rawOutput.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[parse-food-image] GPT returned non-JSON:', rawOutput)
      return jsonError('Could not parse response', 500)
    }

    if (parsed.error || !parsed.foods?.length) {
      return jsonError(parsed.error ?? 'No food detected in image', 422)
    }

    return new Response(
      JSON.stringify({ foods: parsed.foods }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[parse-food-image] Unexpected error:', err)
    return jsonError('Internal error', 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
