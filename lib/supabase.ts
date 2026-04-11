import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

// Required for OAuth flow on mobile
WebBrowser.maybeCompleteAuthSession()

// ---------------------------------------------------------------------------
// AsyncStorage adapter for Supabase auth tokens
// ---------------------------------------------------------------------------
const AsyncStorageAdapter = {
  getItem:    (key: string) => AsyncStorage.getItem(key),
  setItem:    (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
}

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------
const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? ''
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.warn('[Surge] Supabase env vars missing.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:            AsyncStorageAdapter,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
})

// ---------------------------------------------------------------------------
// Google OAuth — opens in-app browser, handles redirect back automatically
// ---------------------------------------------------------------------------
export async function signInWithGoogle() {
  const redirectTo = Linking.createURL('auth/callback')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options:  { redirectTo, skipBrowserRedirect: true },
  })

  if (error || !data?.url) return { error: error ?? new Error('No OAuth URL') }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

  if (result.type === 'success') {
    const { url } = result
    const params  = new URL(url)
    const accessToken  = params.searchParams.get('access_token')
    const refreshToken = params.searchParams.get('refresh_token')

    if (accessToken && refreshToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    } else {
      // Try parsing from hash fragment
      const hash = url.split('#')[1] ?? ''
      const hashParams = new URLSearchParams(hash)
      const at = hashParams.get('access_token')
      const rt = hashParams.get('refresh_token')
      if (at && rt) {
        await supabase.auth.setSession({ access_token: at, refresh_token: rt })
      }
    }
  }

  return { error: null }
}

// ---------------------------------------------------------------------------
// Phone OTP auth
// ---------------------------------------------------------------------------
export async function sendOTP(phone: string) {
  return supabase.auth.signInWithOtp({ phone })
}

export async function verifyOTP(phone: string, token: string) {
  return supabase.auth.verifyOtp({ phone, token, type: 'sms' })
}

// ---------------------------------------------------------------------------
// AI feedback
// ---------------------------------------------------------------------------
export async function submitAIFeedback(feedback: {
  type:          'voice_workout' | 'voice_food' | 'image_food'
  reason:        string
  transcript?:   string
  parsed_output?: any
  user_saved:    boolean
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  return supabase.from('ai_feedback').insert({
    user_id:       user.id,
    type:          feedback.type,
    reason:        feedback.reason,
    transcript:    feedback.transcript ?? null,
    parsed_output: feedback.parsed_output ?? null,
    user_saved:    feedback.user_saved,
  })
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------
export async function signOut() {
  return supabase.auth.signOut()
}

export async function getSession() {
  return supabase.auth.getSession()
}
