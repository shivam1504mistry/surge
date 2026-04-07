import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

// ---------------------------------------------------------------------------
// Secure storage adapter for Supabase auth tokens
// ---------------------------------------------------------------------------
const ExpoSecureStoreAdapter = {
  getItem:    (key: string) => SecureStore.getItemAsync(key),
  setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

// ---------------------------------------------------------------------------
// Environment variables
// Set these in .env and access via app.config.ts extra field
// NEVER hardcode keys here
// ---------------------------------------------------------------------------
const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? ''
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.warn('[Surge] Supabase env vars missing. Copy .env.example to .env and fill in values.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:          ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false,
  },
})

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Send OTP to an Indian phone number (+91XXXXXXXXXX) */
export async function sendOTP(phone: string) {
  return supabase.auth.signInWithOtp({ phone })
}

/** Verify the 6-digit OTP the user received via SMS */
export async function verifyOTP(phone: string, token: string) {
  return supabase.auth.verifyOtp({ phone, token, type: 'sms' })
}

/** Sign out and clear session */
export async function signOut() {
  return supabase.auth.signOut()
}

/** Get current session synchronously from cache */
export async function getSession() {
  return supabase.auth.getSession()
}
