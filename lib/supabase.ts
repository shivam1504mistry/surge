import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'

// Required for OAuth flow on mobile
WebBrowser.maybeCompleteAuthSession()

// ---------------------------------------------------------------------------
// Storage adapter — SecureStore primary, AsyncStorage fallback
// ---------------------------------------------------------------------------
function toSecureKey(key: string) {
  return key.replace(/[^A-Za-z0-9._-]/g, '_')
}

const StorageAdapter = {
  getItem: async (key: string) => {
    const safeKey = toSecureKey(key)
    try {
      const val = await SecureStore.getItemAsync(safeKey)
      if (val !== null) return val
    } catch {}
    return AsyncStorage.getItem(key)
  },
  setItem: async (key: string, value: string) => {
    const safeKey = toSecureKey(key)
    try { await SecureStore.setItemAsync(safeKey, value) } catch {}
    return AsyncStorage.setItem(key, value)
  },
  removeItem: async (key: string) => {
    const safeKey = toSecureKey(key)
    try { await SecureStore.deleteItemAsync(safeKey) } catch {}
    return AsyncStorage.removeItem(key)
  },
}

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------
const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? ''
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.warn('[Surge] Supabase env vars missing.')
}

// Use implicit flow — no PKCE, no crypto.subtle.digest needed in React Native.
// Tokens are returned directly in the URL hash after Google redirects back.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:            StorageAdapter,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
    // implicit is the default (no flowType key needed) — do NOT set flowType:'pkce'
    // PKCE requires crypto.subtle.digest which React Native does not provide natively
  },
})

// ---------------------------------------------------------------------------
// Google OAuth
//
// iOS:     openAuthSessionAsync intercepts the surge://auth/callback redirect.
//          Implicit flow returns tokens in the URL hash (#access_token=...&refresh_token=...).
//          We parse them and call setSession directly — no code exchange needed.
//
// Android: Chrome opens and fires a deep link intent. App.tsx Linking listener
//          catches surge://auth/callback and calls this same token parsing logic.
// ---------------------------------------------------------------------------
export async function signInWithGoogle() {
  const redirectTo = 'surge://auth/callback'
  console.log('[Google OAuth] requesting URL')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options:  { redirectTo, skipBrowserRedirect: true },
  })

  if (error || !data?.url) {
    console.error('[Google OAuth] no URL:', error?.message)
    return { error: error ?? new Error('No OAuth URL') }
  }

  if (Platform.OS === 'android') {
    console.log('[Google OAuth] Android — opening browser')
    await WebBrowser.openBrowserAsync(data.url)
    return { error: null }
  }

  // iOS
  console.log('[Google OAuth] iOS — opening browser')
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    preferEphemeralSession: true,
  })
  console.log('[Google OAuth] result type:', result.type)

  if (result.type !== 'success') {
    return { error: null } // user cancelled — not an error
  }

  console.log('[Google OAuth] callback URL:', result.url)
  return handleOAuthCallback(result.url)
}

// ---------------------------------------------------------------------------
// Parse OAuth callback URL and set session.
// Called from iOS path above and from Android Linking listener in App.tsx.
// ---------------------------------------------------------------------------
export async function handleOAuthCallback(url: string) {
  console.log('[OAuth callback] parsing:', url)

  // Implicit flow: tokens in hash fragment
  const hash = url.split('#')[1] ?? ''
  const hashParams = new URLSearchParams(hash)
  const accessToken  = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')

  if (accessToken && refreshToken) {
    console.log('[OAuth callback] setting session from hash tokens')
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    if (error) console.error('[OAuth callback] setSession failed:', error.message)
    return { error: error ?? null }
  }

  // Fallback: check query params
  const qParams = new URLSearchParams(url.split('?')[1] ?? '')
  const at = qParams.get('access_token')
  const rt = qParams.get('refresh_token')
  if (at && rt) {
    console.log('[OAuth callback] setting session from query tokens')
    const { error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt })
    return { error: error ?? null }
  }

  // Check for error in URL
  const errCode = qParams.get('error_code') ?? hashParams.get('error_code')
  const errDesc = qParams.get('error_description') ?? hashParams.get('error_description')
  if (errCode) {
    console.error('[OAuth callback] server returned error:', errCode, errDesc)
    return { error: new Error(errDesc ?? errCode) }
  }

  console.error('[OAuth callback] no tokens found in URL')
  return { error: new Error('Sign-in failed — no tokens returned') }
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
