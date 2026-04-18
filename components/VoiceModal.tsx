/**
 * VoiceModal — voice logging screen.
 *
 * Two phases:
 *   1. 'listening'  — mic active, real audio recording via expo-av
 *   2. 'confirming' — Whisper + GPT-4o-mini parsed results shown for review
 *
 * Falls back to stub data if edge function is not deployed (DEV_USE_STUBS = true).
 */
import React, { useEffect, useRef, useState } from 'react'
import { Audio } from 'expo-av'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme'
import { useVoiceLog } from '../hooks/useVoiceLog'
import { track } from '../lib/analytics'
import { submitAIFeedback } from '../lib/supabase'

// Set to false once parse-voice edge function is deployed and OPENAI_API_KEY is set
const DEV_USE_STUBS = false

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ParsedSet {
  weight: number
  reps:   number
}
export interface ParsedExercise {
  name:   string
  muscle: string
  sets:   ParsedSet[]
}
export interface ParsedFood {
  name:        string
  calories:    number
  protein_g:   number
  carbs_g:     number
  fat_g:       number
  serving_size: number
  serving_unit: string
  meal_slot:   'breakfast' | 'lunch' | 'dinner' | 'snacks'
}

type StubSession =
  | { type: 'workout'; transcript: string; exercises: ParsedExercise[] }
  | { type: 'food';    transcript: string; foods: ParsedFood[] }

interface Props {
  visible:       boolean
  onClose:       () => void
  onManualLog?:  () => void
  onSave?:       (exercises: ParsedExercise[]) => void
  onSaveFood?:   (foods: ParsedFood[]) => void
}

// ---------------------------------------------------------------------------
// Stub data — Wave 3 replaces with real Whisper + GPT output
// ---------------------------------------------------------------------------
const STUB_SESSIONS: StubSession[] = [
  {
    type: 'workout',
    transcript: 'I bench pressed 80kgs for 8 reps',
    exercises: [
      { name: 'BENCH PRESS', muscle: 'Chest', sets: [{ weight: 80, reps: 8 }] },
    ],
  },
  {
    type: 'workout',
    transcript: 'I did incline press 70kg for 6 reps, then cable fly 25kg for 15 reps',
    exercises: [
      { name: 'INCLINE PRESS', muscle: 'Chest', sets: [{ weight: 70, reps: 6 }] },
      { name: 'CABLE FLY',     muscle: 'Chest', sets: [{ weight: 25, reps: 15 }] },
    ],
  },
  {
    type: 'food',
    transcript: 'Maine lunch mein 2 roti aur ek katori dal khayi',
    foods: [
      { name: '2 Roti',      calories: 160, protein_g: 4,  carbs_g: 32, fat_g: 2, serving_size: 2,   serving_unit: 'piece', meal_slot: 'lunch' },
      { name: 'Dal (1 bowl)',calories: 120, protein_g: 8,  carbs_g: 18, fat_g: 3, serving_size: 1,   serving_unit: 'katori', meal_slot: 'lunch' },
    ],
  },
  {
    type: 'workout',
    transcript: 'Lat pulldown 60kg, 4 sets of 10',
    exercises: [
      {
        name:   'LAT PULLDOWN',
        muscle: 'Back',
        sets:   [
          { weight: 60, reps: 10 },
          { weight: 60, reps: 10 },
          { weight: 60, reps: 10 },
          { weight: 60, reps: 10 },
        ],
      },
    ],
  },
  {
    type: 'workout',
    transcript: 'Shoulder press 40kg, 3 sets — last set only 8 reps',
    exercises: [
      {
        name:   'SHOULDER PRESS',
        muscle: 'Shoulders',
        sets:   [{ weight: 40, reps: 10 }, { weight: 40, reps: 10 }, { weight: 40, reps: 8 }],
      },
    ],
  },
]

const BAR_COUNT = 7
const BAR_MAX_H = 36
const BAR_MIN_H = 6

// ---------------------------------------------------------------------------
const FEEDBACK_REASONS = {
  voice_workout: ['Wrong exercise', 'Wrong numbers', 'Completely off'],
  voice_food:    ['Wrong food',     'Wrong quantity', 'Completely off'],
}

export default function VoiceModal({ visible, onClose, onManualLog, onSave, onSaveFood }: Props) {
  const [phase, setPhase]           = useState<'listening' | 'confirming'>('listening')
  const [transcript, setTranscript] = useState('')
  const [hintPhase, setHintPhase]   = useState(true)
  const [parsedExercises, setParsedExercises] = useState<ParsedExercise[]>([])
  const [parsedFoods, setParsedFoods]         = useState<ParsedFood[]>([])
  const [permDenied, setPermDenied] = useState(false)
  const stubIndex = useRef(0)

  // Feedback state
  const [feedbackOpen,      setFeedbackOpen]      = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

  const { isRecording, isParsing, error: voiceError, startRecording, stopAndParse, cancelRecording } = useVoiceLog()

  // ------ Animations ------
  const micScale  = useRef(new Animated.Value(1)).current
  const micAnim   = useRef<Animated.CompositeAnimation | null>(null)
  const barAnims  = useRef<Animated.Value[]>(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))
  ).current

  // ------ Timers ------
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  function clearTimers() {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  function startListening() {
    setPhase('listening')
    setTranscript('')
    setHintPhase(true)

    // Mic pulse animation
    micAnim.current = Animated.loop(
      Animated.sequence([
        Animated.timing(micScale, { toValue: 1.08, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(micScale, { toValue: 1,    duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    micAnim.current.start()

    // Waveform bars animation
    const durations = [280, 220, 350, 190, 310, 240, 260]
    barAnims.forEach((bar, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 60),
          Animated.timing(bar, { toValue: 1,    duration: durations[i], easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(bar, { toValue: 0.15, duration: durations[i], easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      ).start()
    })

    if (DEV_USE_STUBS) {
      // Stub mode: simulate typing transcript
      const stub = STUB_SESSIONS[stubIndex.current % STUB_SESSIONS.length]
      let charIndex = 0
      let typingInterval: ReturnType<typeof setInterval>
      const t = setTimeout(() => {
        setHintPhase(false)
        typingInterval = setInterval(() => {
          charIndex++
          setTranscript(stub.transcript.slice(0, charIndex))
          if (charIndex >= stub.transcript.length) clearInterval(typingInterval)
        }, 45)
      }, 1500)
      timers.current.push(t)
    } else {
      // Real mode: start recording
      startRecording()
      // Show hint until user starts speaking (no live transcript until Whisper returns)
    }
  }

  function stopAnimations() {
    micAnim.current?.stop()
    micScale.setValue(1)
    barAnims.forEach(b => b.stopAnimation())
  }

  // Kick off listening when modal opens
  useEffect(() => {
    if (!visible) {
      clearTimers()
      stopAnimations()
      setPhase('listening')
      setTranscript('')
      setHintPhase(true)
      setParsedExercises([])
      setParsedFoods([])
      setFeedbackOpen(false)
      setFeedbackSubmitted(false)
      setPermDenied(false)
      if (!DEV_USE_STUBS) cancelRecording()
      return
    }
    track('voice_log_started')

    async function checkPermAndStart() {
      const { granted, canAskAgain } = await Audio.requestPermissionsAsync()
      console.log('[VoiceModal] mic permission — granted:', granted, 'canAskAgain:', canAskAgain)
      if (granted) {
        // Already granted — start immediately
        startListening()
      } else if (canAskAgain) {
        // Not yet asked — iOS will show system dialog automatically when recording starts
        startListening()
      } else {
        // Permanently denied — send user to Settings
        setPermDenied(true)
      }
    }
    checkPermAndStart()
  }, [visible])

  async function handleDoneTalking() {
    clearTimers()
    stopAnimations()

    if (DEV_USE_STUBS) {
      const stub = STUB_SESSIONS[stubIndex.current % STUB_SESSIONS.length]
      stubIndex.current++
      if (stub.type === 'workout') {
        setParsedExercises(prev => [...prev, ...stub.exercises])
      } else {
        setParsedFoods(prev => [...prev, ...stub.foods])
      }
      setPhase('confirming')
      return
    }

    // Real mode: stop recording + call edge function
    const result = await stopAndParse()
    if (!result) {
      track('voice_log_failed')
      return
    }

    setTranscript(result.transcript)
    if (result.type === 'workout' || result.type === 'both') {
      setParsedExercises(prev => [...prev, ...(result.exercises ?? [])])
    }
    if (result.type === 'food' || result.type === 'both') {
      setParsedFoods(prev => [...prev, ...(result.foods ?? [])])
    }
    setPhase('confirming')
  }

  function handleSayMore() {
    startListening()
  }

  function handleSave() {
    track('voice_log_saved', {
      exercise_count: parsedExercises.length,
      food_count:     parsedFoods.length,
      type:           parsedExercises.length > 0 && parsedFoods.length > 0 ? 'both'
                    : parsedExercises.length > 0 ? 'workout' : 'food',
    })
    if (parsedExercises.length > 0) onSave?.(parsedExercises)
    if (parsedFoods.length > 0)     onSaveFood?.(parsedFoods)
    onClose()
  }

  async function handleFeedback(reason: string) {
    const fbType = parsedExercises.length > 0 ? 'voice_workout' : 'voice_food'
    setFeedbackSubmitted(true)
    setFeedbackOpen(false)
    await submitAIFeedback({
      type:          fbType,
      reason,
      transcript,
      parsed_output: { exercises: parsedExercises, foods: parsedFoods },
      user_saved:    false, // updated to true if they save after flagging
    })
  }

  // ---------------------------------------------------------------------------
  // PERMISSION DENIED PHASE
  // ---------------------------------------------------------------------------
  if (!visible) return null

  if (permDenied) {
    return (
      <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
        <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
          <View style={styles.micArea}>
            <View style={[styles.micCircle, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }]}>
              <Text style={styles.micIcon}>🎤</Text>
            </View>
          </View>
          <Text style={[styles.confirmTitle, { marginTop: Spacing.xl, textAlign: 'center' }]}>
            Microphone access needed
          </Text>
          <Text style={[styles.subtitle, { marginTop: Spacing.md }]}>
            Surge needs mic access to log your workouts and food by voice.{'\n\n'}
            Go to Settings → Surge → Microphone and turn it on.
          </Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => Linking.openSettings()}
            activeOpacity={0.85}
          >
            <Text style={styles.doneBtnText}>Open Settings →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.6}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    )
  }

  // ---------------------------------------------------------------------------
  // LISTENING PHASE
  // ---------------------------------------------------------------------------

  if (phase === 'listening') {
    return (
      <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
        <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>

          <Text style={styles.listeningLabel}>LISTENING...</Text>

          <View style={styles.micArea}>
            <Animated.View style={[styles.micCircle, { transform: [{ scale: micScale }] }]}>
              <Text style={styles.micIcon}>🎤</Text>
            </Animated.View>
          </View>

          <View style={styles.waveform}>
            {barAnims.map((anim, i) => (
              <Animated.View
                key={i}
                style={[styles.bar, {
                  height: anim.interpolate({ inputRange: [0, 1], outputRange: [BAR_MIN_H, BAR_MAX_H] }),
                }]}
              />
            ))}
          </View>

          <View style={styles.heardCard}>
            <Text style={styles.heardLabel}>HEARD</Text>
            {hintPhase ? (
              <View style={styles.hintArea}>
                <Text style={styles.hintPrompt}>Try saying:</Text>
                <Text style={styles.hintExample}>"I bench pressed 50kgs for 8 reps"</Text>
                <Text style={styles.hintOr}>or</Text>
                <Text style={styles.hintExample}>"Maine paneer ke sath 2 roti khayi hai"</Text>
              </View>
            ) : (
              <Text style={styles.heardTranscript}>
                {transcript}<Text style={styles.cursor}>|</Text>
              </Text>
            )}
          </View>

          <Text style={styles.subtitle}>
            Keep talking or pause to confirm.{'\n'}Works for workouts and food.
          </Text>

          {voiceError && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>⚠ {voiceError} — try again</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={handleDoneTalking}
            activeOpacity={0.85}
          >
            {isParsing
              ? <><ActivityIndicator color="#fff" size="small" /><Text style={[styles.doneBtnText, { marginLeft: 8 }]}>Understanding…</Text></>
              : <Text style={styles.doneBtnText}>Done talking  →</Text>
            }
          </TouchableOpacity>

          {onManualLog && (
            <TouchableOpacity
              style={styles.manualBtn}
              onPress={() => { clearTimers(); stopAnimations(); onClose(); onManualLog() }}
              activeOpacity={0.7}
            >
              <Text style={styles.manualBtnText}>Log another way ↗</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.6}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

        </SafeAreaView>
      </Modal>
    )
  }

  // ---------------------------------------------------------------------------
  // CONFIRMING PHASE
  // ---------------------------------------------------------------------------
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ScrollView
          style={{ flex: 1, width: '100%' }}
          contentContainerStyle={styles.confirmContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.confirmHeader}>
            <View>
              <Text style={styles.confirmTitle}>Got it — confirm?</Text>
              <Text style={styles.confirmSub}>Review and edit before saving</Text>
            </View>
            {!feedbackSubmitted ? (
              <TouchableOpacity
                style={styles.thumbsBtn}
                onPress={() => setFeedbackOpen(o => !o)}
                hitSlop={12}
              >
                <Text style={styles.thumbsIcon}>👎</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.feedbackThanks}>✓ Noted</Text>
            )}
          </View>

          {/* Feedback reason chips */}
          {feedbackOpen && !feedbackSubmitted && (
            <View style={styles.feedbackChips}>
              <Text style={styles.feedbackPrompt}>What's wrong?</Text>
              <View style={styles.feedbackChipRow}>
                {(parsedExercises.length > 0 ? FEEDBACK_REASONS.voice_workout : FEEDBACK_REASONS.voice_food).map(reason => (
                  <TouchableOpacity
                    key={reason}
                    style={styles.feedbackChip}
                    onPress={() => handleFeedback(reason)}
                  >
                    <Text style={styles.feedbackChipText}>{reason}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Parsed exercises */}
          {parsedExercises.map((ex, ei) => (
            <View key={`ex-${ex.name}-${ei}`} style={styles.exerciseCard}>
              <View style={styles.exerciseChipRow}>
                <View style={styles.exerciseNameChip}>
                  <Text style={styles.exerciseNameChipText}>{ex.name}</Text>
                </View>
                <View style={styles.muscleChip}>
                  <Text style={styles.muscleChipText}>{ex.muscle}</Text>
                </View>
              </View>
              {ex.sets.map((s, si) => (
                <View key={si} style={[styles.setRow, si === 0 && { marginTop: Spacing.sm }]}>
                  <Text style={styles.setLabel}>S{si + 1}</Text>
                  <Text style={styles.setText}>{s.weight} kg × {s.reps} reps</Text>
                  <Text style={styles.setCheck}>✓</Text>
                </View>
              ))}
            </View>
          ))}

          {/* Parsed food */}
          {parsedFoods.map((food, fi) => (
            <View key={`food-${food.name}-${fi}`} style={styles.exerciseCard}>
              <View style={styles.exerciseChipRow}>
                <View style={styles.exerciseNameChip}>
                  <Text style={styles.exerciseNameChipText}>🥗 {food.name}</Text>
                </View>
                <View style={styles.muscleChip}>
                  <Text style={styles.muscleChipText}>{food.meal_slot}</Text>
                </View>
              </View>
              <View style={[styles.setRow, { marginTop: Spacing.sm }]}>
                <Text style={[styles.setText, { flex: 0, marginRight: Spacing.md }]}>{food.calories} kcal</Text>
                <Text style={styles.macroText}>P {food.protein_g}g</Text>
                <Text style={styles.macroText}>C {food.carbs_g}g</Text>
                <Text style={styles.macroText}>F {food.fat_g}g</Text>
                <Text style={styles.setCheck}>✓</Text>
              </View>
            </View>
          ))}


          {/* Or say more */}
          <TouchableOpacity style={styles.sayMoreRow} onPress={handleSayMore} activeOpacity={0.7}>
            <Text style={styles.sayMoreText}>Or say more — mic is still ready</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Bottom action bar */}
        <View style={styles.confirmBar}>
          <TouchableOpacity style={styles.editBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.editBtnText}>✏️  Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>💾  Save Log</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const MIC_SIZE = 80

const styles = StyleSheet.create({
  screen: {
    flex:              1,
    backgroundColor:   Colors.bg,
    alignItems:        'center',
    paddingHorizontal: Spacing.md,
    paddingBottom:     Spacing.md,
  },

  // ── Listening ──
  listeningLabel: {
    marginTop:     Spacing.xxl,
    fontSize:      FontSize.sm,
    color:         Colors.text2,
    fontWeight:    FontWeight.bold,
    letterSpacing: 3,
  },
  micArea: {
    marginTop:      Spacing.xl,
    alignItems:     'center',
    justifyContent: 'center',
  },
  micCircle: {
    width:           MIC_SIZE,
    height:          MIC_SIZE,
    borderRadius:    MIC_SIZE / 2,
    backgroundColor: Colors.accent,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     Colors.accent,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.6,
    shadowRadius:    24,
    elevation:       16,
  },
  micIcon: {
    fontSize: 32,
  },
  waveform: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            5,
    marginTop:      Spacing.lg,
    height:         BAR_MAX_H + 4,
  },
  bar: {
    width:           4,
    borderRadius:    2,
    backgroundColor: Colors.accent,
    opacity:         0.85,
  },
  heardCard: {
    marginTop:       Spacing.xl,
    width:           '100%',
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    minHeight:       80,
  },
  heardLabel: {
    fontSize:      FontSize.xs,
    color:         Colors.text3,
    fontWeight:    FontWeight.bold,
    letterSpacing: 2,
    marginBottom:  Spacing.sm,
  },
  heardTranscript: {
    fontSize:   FontSize.md,
    color:      Colors.text1,
    fontStyle:  'italic',
    lineHeight: FontSize.md * 1.5,
  },
  cursor: {
    color:     Colors.accent,
    fontStyle: 'normal',
  },
  hintArea: {
    gap: 4,
  },
  hintPrompt: {
    fontSize:     FontSize.sm,
    color:        Colors.text3,
    marginBottom: 4,
  },
  hintExample: {
    fontSize:   FontSize.sm,
    color:      Colors.text2,
    fontStyle:  'italic',
    lineHeight: FontSize.sm * 1.6,
  },
  hintOr: {
    fontSize:       FontSize.xs,
    color:          Colors.text3,
    marginVertical: 2,
  },
  subtitle: {
    marginTop:  Spacing.lg,
    fontSize:   FontSize.sm,
    color:      Colors.text2,
    textAlign:  'center',
    lineHeight: FontSize.sm * 1.6,
  },
  errorCard: {
    backgroundColor: 'rgba(255,77,0,0.1)',
    borderRadius:    Radius.md,
    padding:         Spacing.sm,
    marginTop:       Spacing.sm,
    width:           '100%',
  },
  errorText: {
    fontSize:  FontSize.sm,
    color:     Colors.accent,
    textAlign: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  doneBtn: {
    width:           '100%',
    backgroundColor: Colors.accent,
    borderRadius:    Radius.full,
    paddingVertical: Spacing.md,
    alignItems:      'center',
    marginBottom:    Spacing.sm,
  },
  doneBtnText: {
    fontSize:   FontSize.base,
    color:      '#fff',
    fontWeight: FontWeight.bold,
  },
  manualBtn: {
    paddingVertical: Spacing.sm,
    alignItems:      'center',
  },
  manualBtnText: {
    fontSize:   FontSize.sm,
    color:      Colors.accent,
    fontWeight: FontWeight.semibold,
  },
  cancelBtn: {
    paddingVertical: Spacing.sm,
    alignItems:      'center',
  },
  cancelText: {
    fontSize: FontSize.base,
    color:    Colors.text3,
  },

  // ── Confirming ──
  confirmContent: {
    padding:    Spacing.md,
    paddingTop: Spacing.lg,
    gap:        Spacing.md,
    width:      '100%',
  },
  confirmTitle: {
    fontSize:   FontSize.xxl,
    color:      Colors.text1,
    fontWeight: FontWeight.black,
  },
  confirmSub: {
    fontSize:    FontSize.sm,
    color:       Colors.text2,
    marginBottom: Spacing.xs,
  },

  exerciseCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
  },
  exerciseChipRow: {
    flexDirection: 'row',
    gap:           Spacing.sm,
    flexWrap:      'wrap',
  },
  exerciseNameChip: {
    backgroundColor:   Colors.accentSoft,
    borderRadius:      Radius.sm,
    paddingVertical:   4,
    paddingHorizontal: Spacing.sm,
  },
  exerciseNameChipText: {
    fontSize:   FontSize.sm,
    color:      Colors.accent,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  muscleChip: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.sm,
    borderWidth:     1,
    borderColor:     Colors.border,
    paddingVertical:   4,
    paddingHorizontal: Spacing.sm,
  },
  muscleChipText: {
    fontSize: FontSize.xs,
    color:    Colors.text2,
  },

  setRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 6,
    borderTopWidth:  1,
    borderTopColor:  Colors.border,
    gap:             Spacing.md,
  },
  setLabel: {
    fontSize:   FontSize.sm,
    color:      Colors.text3,
    fontWeight: FontWeight.bold,
    width:      24,
  },
  setText: {
    flex:     1,
    fontSize: FontSize.base,
    color:    Colors.text1,
  },
  setCheck: {
    fontSize: FontSize.base,
    color:    Colors.green,
  },
  macroText: {
    fontSize:  FontSize.sm,
    color:     Colors.text2,
    marginRight: 4,
  },

  surgeAsksCard: {
    backgroundColor: Colors.accentSoft,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.accent,
    padding:         Spacing.md,
    gap:             Spacing.sm,
  },
  surgeAsksLabel: {
    fontSize:      FontSize.xs,
    color:         Colors.accent,
    fontWeight:    FontWeight.bold,
    letterSpacing: 1.5,
  },
  surgeAsksText: {
    fontSize:   FontSize.sm,
    color:      Colors.text1,
    lineHeight: FontSize.sm * 1.5,
  },
  surgeAsksRow: {
    flexDirection: 'row',
    gap:           Spacing.sm,
    marginTop:     Spacing.xs,
  },
  surgeYesBtn: {
    backgroundColor:   Colors.accent,
    borderRadius:      Radius.full,
    paddingVertical:   8,
    paddingHorizontal: Spacing.md,
  },
  surgeYesBtnText: {
    fontSize:   FontSize.sm,
    color:      '#fff',
    fontWeight: FontWeight.bold,
  },
  surgeEditBtn: {
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingVertical:   8,
    paddingHorizontal: Spacing.md,
  },
  surgeEditBtnText: {
    fontSize:   FontSize.sm,
    color:      Colors.text2,
    fontWeight: FontWeight.semibold,
  },

  sayMoreRow: {
    alignItems:    'center',
    paddingVertical: Spacing.sm,
  },
  sayMoreText: {
    fontSize:  FontSize.sm,
    color:     Colors.text3,
    fontStyle: 'italic',
  },

  confirmHeader: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    width:          '100%',
  },
  thumbsBtn: {
    padding: Spacing.xs,
  },
  thumbsIcon: {
    fontSize: 22,
  },
  feedbackThanks: {
    fontSize:   FontSize.sm,
    color:      Colors.green,
    fontWeight: FontWeight.semibold,
    marginTop:  4,
  },
  feedbackChips: {
    width:           '100%',
    backgroundColor: Colors.surface,
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    gap:             Spacing.sm,
  },
  feedbackPrompt: {
    fontSize:   FontSize.sm,
    color:      Colors.text2,
    fontWeight: FontWeight.semibold,
  },
  feedbackChipRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           Spacing.sm,
  },
  feedbackChip: {
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical:   6,
    backgroundColor:   Colors.bg,
  },
  feedbackChipText: {
    fontSize:   FontSize.sm,
    color:      Colors.text1,
    fontWeight: FontWeight.medium,
  },

  confirmBar: {
    flexDirection:   'row',
    gap:             Spacing.sm,
    width:           '100%',
    paddingTop:      Spacing.sm,
    borderTopWidth:  1,
    borderTopColor:  Colors.border,
  },
  editBtn: {
    flex:              1,
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingVertical:   Spacing.md,
    alignItems:        'center',
  },
  editBtnText: {
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
  },
  saveBtn: {
    flex:              2,
    backgroundColor:   Colors.accent,
    borderRadius:      Radius.full,
    paddingVertical:   Spacing.md,
    alignItems:        'center',
  },
  saveBtnText: {
    fontSize:   FontSize.base,
    color:      '#fff',
    fontWeight: FontWeight.bold,
  },
})
