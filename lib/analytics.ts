/**
 * analytics.ts — PostHog event tracking
 *
 * Usage:
 *   import { track } from '../lib/analytics'
 *   track('voice_log_started')
 *   track('voice_log_saved', { exercise_count: 3 })
 */
import PostHog from 'posthog-react-native'

export const posthog = new PostHog('phc_sJo76MBGu3vpebb6WbRJGj4mUGxBHmesPmqcQnBpW5T2', {
  host: 'https://us.i.posthog.com',
})

// ---------------------------------------------------------------------------
// Typed event names — all tracking calls go through here
// ---------------------------------------------------------------------------
export type AnalyticsEvent =
  | 'app_open'
  | 'onboarding_complete'
  | 'voice_log_started'
  | 'voice_log_saved'
  | 'voice_log_failed'
  | 'image_log_started'
  | 'image_log_saved'
  | 'image_log_failed'
  | 'manual_food_log_saved'
  | 'manual_workout_log_saved'
  | 'share_card_generated'
  | 'share_card_whatsapp'
  | 'share_card_native'
  | 'share_card_saved'
  | 'pdf_report_generated'
  | 'pdf_report_shared'
  | 'schedule_report_saved'
  | 'whatsapp_test_sent'
  | 'pro_upsell_shown'
  | 'pro_upsell_converted'
  | 'template_created'
  | 'template_used'

export function track(event: AnalyticsEvent, properties?: Record<string, any>) {
  try {
    posthog.capture(event, properties)
  } catch {
    // Never let analytics crash the app
  }
}

export function identify(userId: string, properties?: Record<string, any>) {
  try {
    posthog.identify(userId, properties)
  } catch {}
}
