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
  // App lifecycle
  | 'app_open'
  // Onboarding funnel
  | 'onboarding_landing_viewed'
  | 'onboarding_phone_viewed'
  | 'onboarding_phone_submitted'
  | 'onboarding_otp_viewed'
  | 'onboarding_otp_verified'
  | 'onboarding_google_tapped'
  | 'onboarding_profile_viewed'
  | 'onboarding_profile_next'
  | 'onboarding_goals_viewed'
  | 'onboarding_goals_selected'
  | 'onboarding_experience_viewed'
  | 'onboarding_experience_selected'
  | 'onboarding_food_units_viewed'
  | 'onboarding_food_units_selected'
  | 'onboarding_accountability_viewed'
  | 'onboarding_complete'
  // Today screen
  | 'screen_today'
  | 'hero_speak_tap'
  | 'share_tap'
  | 'nutrition_section_tap'
  // Voice modal
  | 'voice_modal_open'
  | 'voice_recording_start'
  | 'voice_recording_stop'
  | 'voice_log_started'
  | 'voice_log_saved'
  | 'voice_log_failed'
  | 'voice_save_workout'
  | 'voice_save_food'
  | 'voice_manual_fallback'
  | 'voice_modal_close'
  // Food confirm (review)
  | 'food_confirm_open'
  | 'food_confirm_qty_change'
  | 'food_confirm_macro_edit'
  | 'food_confirm_save'
  | 'food_confirm_close'
  // Food diary
  | 'food_diary_open'
  | 'food_diary_entry_expand'
  | 'food_diary_qty_change'
  | 'food_diary_macro_edit'
  | 'food_diary_entry_delete'
  // Manual picker
  | 'manual_picker_open'
  | 'manual_picker_workout'
  | 'manual_picker_food'
  | 'manual_picker_image'
  // Exercise search
  | 'exercise_search_open'
  | 'exercise_search_query'
  | 'exercise_selected'
  // Set entry
  | 'set_entry_open'
  | 'set_entry_add_set'
  | 'set_entry_remove_set'
  | 'set_entry_save'
  // Food search
  | 'food_search_open'
  | 'food_search_query'
  | 'food_search_result_tap'
  | 'food_search_barcode_open'
  | 'food_search_save'
  | 'manual_food_log_saved'
  | 'manual_workout_log_saved'
  // Image food
  | 'image_log_started'
  | 'image_log_saved'
  | 'image_log_failed'
  | 'image_log_retake'
  | 'image_log_error'
  // History
  | 'screen_history'
  | 'history_month_prev'
  | 'history_month_next'
  | 'history_day_tap'
  // Share / reports
  | 'screen_share'
  | 'share_pdf_generate'
  | 'share_whatsapp_tap'
  | 'share_test_send'
  | 'share_card_generated'
  | 'share_card_whatsapp'
  | 'share_card_native'
  | 'share_card_saved'
  | 'pdf_report_generated'
  | 'pdf_report_shared'
  | 'schedule_report_saved'
  | 'whatsapp_test_sent'
  // Profile
  | 'screen_profile'
  | 'profile_edit_tap'
  | 'profile_logout'
  // Pro / templates
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
