/**
 * send-whatsapp — Supabase Edge Function
 *
 * Sends a WhatsApp message via Twilio.
 *
 * POST body:
 *   { to: string, message: string }
 *   `to` must be in E.164 format, e.g. "+919876543210"
 *
 * Response:
 *   { success: true, sid: string } | { error: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const TWILIO_ACCOUNT_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')   ?? ''
const TWILIO_AUTH_TOKEN    = Deno.env.get('TWILIO_AUTH_TOKEN')     ?? ''
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '' // e.g. "whatsapp:+14155238886"

const APP_DOWNLOAD_LINK = 'https://expo.dev/accounts/shivam1504mistry/projects/surge/builds/ad01b2eb-7f53-4d02-b33b-e2d710fbb4dd'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { to, message } = await req.json() as { to: string; message: string }

    if (!to || !message) return jsonResp({ error: 'Missing to or message' }, 400)
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
      return jsonResp({ error: 'Twilio secrets not configured' }, 500)
    }

    // Normalise recipient — Twilio needs "whatsapp:+91..."
    const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

    const body = new URLSearchParams({
      From: TWILIO_WHATSAPP_FROM,
      To:   toFormatted,
      Body: message,
    })

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

    const resp = await fetch(twilioUrl, {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    const data = await resp.json()

    if (!resp.ok) {
      console.error('Twilio error:', data)
      return jsonResp({ error: data.message ?? 'Twilio send failed' }, 502)
    }

    return jsonResp({ success: true, sid: data.sid })

  } catch (err: any) {
    console.error('send-whatsapp error:', err)
    return jsonResp({ error: err.message ?? 'Internal error' }, 500)
  }
})

// ---------------------------------------------------------------------------
// Helpers — exported for use by schedule-reports
// ---------------------------------------------------------------------------

export { APP_DOWNLOAD_LINK }
