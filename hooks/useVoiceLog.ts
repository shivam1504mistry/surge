import { useRef, useState } from 'react'
import { Audio } from 'expo-av'
import { Camera } from 'expo-camera'
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native'
// @ts-ignore — legacy import path for readAsStringAsync (new API doesn't support base64 on Android yet)
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '../lib/supabase'
import { ParsedExercise, ParsedFood } from '../components/VoiceModal'

export type VoiceParseResult =
  | { type: 'workout'; transcript: string; exercises: ParsedExercise[]; foods: ParsedFood[] }
  | { type: 'food';    transcript: string; exercises: ParsedExercise[]; foods: ParsedFood[] }
  | { type: 'both';    transcript: string; exercises: ParsedExercise[]; foods: ParsedFood[] }

export function useVoiceLog() {
  const recording  = useRef<Audio.Recording | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isParsing,   setIsParsing]   = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  async function startRecording() {
    setError(null)

    // Clean up any existing recording first
    if (recording.current) {
      try { await recording.current.stopAndUnloadAsync() } catch {}
      recording.current = null
    }

    try {
      // Request microphone permission via expo-camera (uses ExpoModulesCore — works on iOS + Android)
      // We avoid Audio.requestPermissionsAsync() because expo-av's old ObjC module goes through
      // EXPermissionsInterface (unimodule) which is not linked and throws "Permissions module not found".
      if (Platform.OS === 'android') {
        // Android fallback: RN built-in PermissionsAndroid (always available)
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title:   'Microphone access needed',
            message: 'Surge uses your microphone to log workouts and food by voice.',
            buttonPositive: 'Allow',
            buttonNegative: 'Not now',
          }
        )
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
            Alert.alert(
              'Microphone access needed',
              'Please enable microphone access for Surge in your device Settings.',
              [
                { text: 'Not now', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
            )
          }
          setError('Microphone permission not granted — please try again')
          return
        }
      } else {
        // iOS: use expo-camera's mic permission API — this goes through ExpoModulesCore,
        // NOT the broken EXPermissionsInterface, so it correctly shows the system dialog.
        const { granted, canAskAgain } = await Camera.requestMicrophonePermissionsAsync()
        console.log('[useVoiceLog] iOS mic permission via expo-camera — granted:', granted, 'canAskAgain:', canAskAgain)
        if (!granted) {
          if (!canAskAgain) {
            Alert.alert(
              'Microphone access needed',
              'Please enable microphone access for Surge in Settings → Privacy & Security → Microphone.',
              [
                { text: 'Not now', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
            )
            setError('Microphone access denied — open Settings to enable it')
          } else {
            setError('Microphone permission not granted — please try again')
          }
          return
        }
      }

      // Configure audio session for recording (required on iOS)
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS:   true,
          playsInSilentModeIOS: true,
        })
        console.log('[useVoiceLog] setAudioModeAsync OK')
      } catch (modeErr: any) {
        console.error('[useVoiceLog] setAudioModeAsync FAILED:', modeErr?.message)
        setError(`Audio session error: ${modeErr?.message ?? 'unknown'}`)
        return
      }

      try {
        const { recording: rec } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        )
        recording.current = rec
        setIsRecording(true)
        console.log('[useVoiceLog] recording started OK')
      } catch (recErr: any) {
        console.error('[useVoiceLog] createAsync FAILED:', recErr?.message, recErr?.code)
        setError(`Mic error: ${recErr?.message ?? 'unknown'}`)
      }
    } catch (err: any) {
      console.error('[useVoiceLog] startRecording unexpected error:', err)
      setError(`Unexpected error: ${err?.message ?? 'unknown'}`)
    }
  }

  async function stopAndParse(): Promise<VoiceParseResult | null> {
    if (!recording.current) {
      setError('Recording did not start — check microphone permission')
      return null
    }
    setIsRecording(false)
    setIsParsing(true)
    setError(null)

    try {
      try {
        await recording.current.stopAndUnloadAsync()
      } catch (stopErr: any) {
        console.warn('[useVoiceLog] stopAndUnload warning:', stopErr.message)
        // Continue anyway — URI may still be valid
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {})

      const uri = recording.current.getURI()
      recording.current = null

      if (!uri) throw new Error('No audio recorded — try speaking closer to the mic')

      // Read audio file as base64 string — legacy API with string literal bypasses deprecation warning
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any })

      const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
      const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

      const fnResponse = await fetch(`${SUPABASE_URL}/functions/v1/parse-voice`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey':        SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ audio: base64, mimeType: 'audio/m4a' }),
      })

      const data = await fnResponse.json()

      if (!fnResponse.ok) {
        throw new Error(data?.error ?? 'Function error')
      }

      const exercises = data.exercises ?? []
      const foods     = data.foods     ?? []
      const type      = data.type === 'both' ? 'both'
                      : data.type === 'workout' ? 'workout'
                      : 'food'
      return { type, transcript: data.transcript, exercises, foods }

    } catch (err: any) {
      console.error('[useVoiceLog] stopAndParse:', err)
      setError(err.message ?? 'Something went wrong')
      return null
    } finally {
      setIsParsing(false)
    }
  }

  async function cancelRecording() {
    if (!recording.current) return
    try { await recording.current.stopAndUnloadAsync() } catch {}
    recording.current = null
    setIsRecording(false)
    setIsParsing(false)
  }

  return { isRecording, isParsing, error, startRecording, stopAndParse, cancelRecording }
}
