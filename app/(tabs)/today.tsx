/**
 * today.tsx — Today screen
 *
 * Layout:
 *   1. Header (date + streak)
 *   2. Hero voice button — primary CTA for all logging
 *   3. Today's Workout — read-only review of logged exercises
 *   4. Nutrition — macro summary card (NutritionSection)
 *
 * Voice logging is the only entry point for workouts and food.
 * Wave 3 Agent 1 will wire up Whisper API inside VoiceModal.
 */
import React, {
  useState,
  useEffect,
  useRef,
} from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Easing,
  Modal,
  TextInput,
  FlatList,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Spacing,
  BOTTOM_SAFE_PADDING,
} from '../../constants/theme'
import { useWorkoutStore } from '../../stores/workoutStore'
import { useUserStore } from '../../stores/userStore'
import NutritionSection from '../../components/NutritionSection'
import FoodDiaryModal from '../../components/FoodDiaryModal'
import OfflineBanner from '../../components/OfflineBanner'
import VoiceModal, { ParsedFood } from '../../components/VoiceModal'
import FoodSearchModal, { FoodLogPayload } from '../../components/FoodSearchModal'
import ImageFoodModal from '../../components/ImageFoodModal'
import FoodConfirmModal, { ConfirmDish, dishesToParsedFoods } from '../../components/FoodConfirmModal'
import { useNutritionStore } from '../../stores/nutritionStore'
import { track } from '../../lib/analytics'

// ---------------------------------------------------------------------------
// Exercise types + local fallback (used by manual log modal)
// ---------------------------------------------------------------------------
interface ExerciseResult {
  id: string; name: string; target: string; bodyPart: string; equipment: string
}

const LOCAL_EXERCISES: ExerciseResult[] = [
  // Chest
  { id: 'l_001', name: 'Barbell Bench Press',          target: 'pectorals',  bodyPart: 'chest',      equipment: 'barbell'    },
  { id: 'l_002', name: 'Incline Dumbbell Press',       target: 'pectorals',  bodyPart: 'chest',      equipment: 'dumbbell'   },
  { id: 'l_003', name: 'Decline Barbell Press',        target: 'pectorals',  bodyPart: 'chest',      equipment: 'barbell'    },
  { id: 'l_004', name: 'Cable Fly',                    target: 'pectorals',  bodyPart: 'chest',      equipment: 'cable'      },
  { id: 'l_005', name: 'Dumbbell Fly',                 target: 'pectorals',  bodyPart: 'chest',      equipment: 'dumbbell'   },
  { id: 'l_006', name: 'Push Up',                      target: 'pectorals',  bodyPart: 'chest',      equipment: 'body weight'},
  { id: 'l_007', name: 'Chest Dip',                    target: 'pectorals',  bodyPart: 'chest',      equipment: 'body weight'},
  // Back
  { id: 'l_008', name: 'Pull Up',                      target: 'lats',       bodyPart: 'back',       equipment: 'body weight'},
  { id: 'l_009', name: 'Chin Up',                      target: 'biceps',     bodyPart: 'back',       equipment: 'body weight'},
  { id: 'l_010', name: 'Barbell Row',                  target: 'lats',       bodyPart: 'back',       equipment: 'barbell'    },
  { id: 'l_011', name: 'Dumbbell Row',                 target: 'lats',       bodyPart: 'back',       equipment: 'dumbbell'   },
  { id: 'l_012', name: 'Lat Pulldown',                 target: 'lats',       bodyPart: 'back',       equipment: 'cable'      },
  { id: 'l_013', name: 'Seated Cable Row',             target: 'lats',       bodyPart: 'back',       equipment: 'cable'      },
  { id: 'l_014', name: 'T-Bar Row',                    target: 'lats',       bodyPart: 'back',       equipment: 'barbell'    },
  { id: 'l_015', name: 'Deadlift',                     target: 'spine',      bodyPart: 'back',       equipment: 'barbell'    },
  { id: 'l_016', name: 'Sumo Deadlift',                target: 'glutes',     bodyPart: 'back',       equipment: 'barbell'    },
  { id: 'l_017', name: 'Face Pull',                    target: 'delts',      bodyPart: 'back',       equipment: 'cable'      },
  // Shoulders
  { id: 'l_018', name: 'Overhead Press',               target: 'delts',      bodyPart: 'shoulders',  equipment: 'barbell'    },
  { id: 'l_019', name: 'Dumbbell Shoulder Press',      target: 'delts',      bodyPart: 'shoulders',  equipment: 'dumbbell'   },
  { id: 'l_020', name: 'Arnold Press',                 target: 'delts',      bodyPart: 'shoulders',  equipment: 'dumbbell'   },
  { id: 'l_021', name: 'Lateral Raise',                target: 'delts',      bodyPart: 'shoulders',  equipment: 'dumbbell'   },
  { id: 'l_022', name: 'Front Raise',                  target: 'delts',      bodyPart: 'shoulders',  equipment: 'dumbbell'   },
  { id: 'l_023', name: 'Rear Delt Fly',                target: 'delts',      bodyPart: 'shoulders',  equipment: 'dumbbell'   },
  // Biceps
  { id: 'l_024', name: 'Barbell Curl',                 target: 'biceps',     bodyPart: 'upper arms', equipment: 'barbell'    },
  { id: 'l_025', name: 'Dumbbell Curl',                target: 'biceps',     bodyPart: 'upper arms', equipment: 'dumbbell'   },
  { id: 'l_026', name: 'Hammer Curl',                  target: 'biceps',     bodyPart: 'upper arms', equipment: 'dumbbell'   },
  { id: 'l_027', name: 'Preacher Curl',                target: 'biceps',     bodyPart: 'upper arms', equipment: 'barbell'    },
  { id: 'l_028', name: 'Cable Curl',                   target: 'biceps',     bodyPart: 'upper arms', equipment: 'cable'      },
  // Triceps
  { id: 'l_029', name: 'Tricep Pushdown',              target: 'triceps',    bodyPart: 'upper arms', equipment: 'cable'      },
  { id: 'l_030', name: 'Skull Crusher',                target: 'triceps',    bodyPart: 'upper arms', equipment: 'barbell'    },
  { id: 'l_031', name: 'Overhead Tricep Extension',    target: 'triceps',    bodyPart: 'upper arms', equipment: 'dumbbell'   },
  { id: 'l_032', name: 'Tricep Dip',                   target: 'triceps',    bodyPart: 'upper arms', equipment: 'body weight'},
  { id: 'l_033', name: 'Close Grip Bench Press',       target: 'triceps',    bodyPart: 'upper arms', equipment: 'barbell'    },
  // Legs
  { id: 'l_034', name: 'Barbell Squat',                target: 'quads',      bodyPart: 'upper legs', equipment: 'barbell'    },
  { id: 'l_035', name: 'Front Squat',                  target: 'quads',      bodyPart: 'upper legs', equipment: 'barbell'    },
  { id: 'l_036', name: 'Goblet Squat',                 target: 'quads',      bodyPart: 'upper legs', equipment: 'dumbbell'   },
  { id: 'l_037', name: 'Leg Press',                    target: 'quads',      bodyPart: 'upper legs', equipment: 'machine'    },
  { id: 'l_038', name: 'Leg Extension',                target: 'quads',      bodyPart: 'upper legs', equipment: 'machine'    },
  { id: 'l_039', name: 'Leg Curl',                     target: 'hamstrings', bodyPart: 'upper legs', equipment: 'machine'    },
  { id: 'l_040', name: 'Romanian Deadlift',            target: 'hamstrings', bodyPart: 'upper legs', equipment: 'barbell'    },
  { id: 'l_041', name: 'Walking Lunge',                target: 'quads',      bodyPart: 'upper legs', equipment: 'dumbbell'   },
  { id: 'l_042', name: 'Bulgarian Split Squat',        target: 'quads',      bodyPart: 'upper legs', equipment: 'dumbbell'   },
  { id: 'l_043', name: 'Hip Thrust',                   target: 'glutes',     bodyPart: 'upper legs', equipment: 'barbell'    },
  { id: 'l_044', name: 'Glute Bridge',                 target: 'glutes',     bodyPart: 'upper legs', equipment: 'body weight'},
  { id: 'l_045', name: 'Calf Raise',                   target: 'calves',     bodyPart: 'lower legs', equipment: 'machine'    },
  { id: 'l_046', name: 'Seated Calf Raise',            target: 'calves',     bodyPart: 'lower legs', equipment: 'machine'    },
  { id: 'l_047', name: 'Box Jump',                     target: 'quads',      bodyPart: 'upper legs', equipment: 'body weight'},
  // Core
  { id: 'l_048', name: 'Plank',                        target: 'abs',        bodyPart: 'waist',      equipment: 'body weight'},
  { id: 'l_049', name: 'Hanging Leg Raise',            target: 'abs',        bodyPart: 'waist',      equipment: 'body weight'},
  { id: 'l_050', name: 'Cable Crunch',                 target: 'abs',        bodyPart: 'waist',      equipment: 'cable'      },
  { id: 'l_051', name: 'Ab Wheel Rollout',             target: 'abs',        bodyPart: 'waist',      equipment: 'body weight'},
  { id: 'l_052', name: 'Russian Twist',                target: 'abs',        bodyPart: 'waist',      equipment: 'body weight'},
  { id: 'l_053', name: 'Crunch',                       target: 'abs',        bodyPart: 'waist',      equipment: 'body weight'},
  { id: 'l_054', name: 'Bicycle Crunch',               target: 'abs',        bodyPart: 'waist',      equipment: 'body weight'},
  // Bodyweight / Cardio
  { id: 'l_055', name: 'Dip',                          target: 'triceps',    bodyPart: 'upper arms', equipment: 'body weight'},
  { id: 'l_056', name: 'Burpee',                       target: 'cardiovascular', bodyPart: 'cardio', equipment: 'body weight'},
  { id: 'l_057', name: 'Mountain Climber',             target: 'abs',        bodyPart: 'waist',      equipment: 'body weight'},
  { id: 'l_058', name: 'Jump Squat',                   target: 'quads',      bodyPart: 'upper legs', equipment: 'body weight'},
  { id: 'l_059', name: 'Running',                      target: 'cardiovascular', bodyPart: 'cardio', equipment: 'body weight'},
  { id: 'l_060', name: 'Cycling',                      target: 'cardiovascular', bodyPart: 'cardio', equipment: 'machine'    },
  { id: 'l_061', name: 'Rowing Machine',               target: 'lats',       bodyPart: 'cardio',     equipment: 'machine'    },
  { id: 'l_062', name: 'Jump Rope',                    target: 'cardiovascular', bodyPart: 'cardio', equipment: 'body weight'},
  // Good morning / accessory
  { id: 'l_063', name: 'Good Morning',                 target: 'hamstrings', bodyPart: 'back',       equipment: 'barbell'    },
  { id: 'l_064', name: 'Rack Pull',                    target: 'spine',      bodyPart: 'back',       equipment: 'barbell'    },
  { id: 'l_065', name: 'Shrug',                        target: 'traps',      bodyPart: 'back',       equipment: 'barbell'    },
  { id: 'l_066', name: 'Wrist Curl',                   target: 'forearms',   bodyPart: 'lower arms', equipment: 'barbell'    },
  { id: 'l_067', name: 'Reverse Curl',                 target: 'forearms',   bodyPart: 'lower arms', equipment: 'barbell'    },
  { id: 'l_068', name: 'Pull-over',                    target: 'lats',       bodyPart: 'back',       equipment: 'dumbbell'   },
  { id: 'l_069', name: 'Incline Curl',                 target: 'biceps',     bodyPart: 'upper arms', equipment: 'dumbbell'   },
  { id: 'l_070', name: 'Concentration Curl',           target: 'biceps',     bodyPart: 'upper arms', equipment: 'dumbbell'   },
]

function foodsToConfirmDishes(foods: ParsedFood[]): ConfirmDish[] {
  return foods.map(f => ({
    name: f.name,
    ingredients: [{
      name:        f.name,
      qty:         f.serving_size,
      unit:        f.serving_unit,
      unitOptions: [f.serving_unit, 'g', 'ml', 'piece'],
      calories:    f.calories,
      protein_g:   f.protein_g,
      carbs_g:     f.carbs_g,
      fat_g:       f.fat_g,
    }],
    calories:  f.calories,
    protein_g: f.protein_g,
    carbs_g:   f.carbs_g,
    fat_g:     f.fat_g,
  }))
}

function searchLocal(q: string): ExerciseResult[] {
  const lower = q.toLowerCase()
  return LOCAL_EXERCISES.filter(
    e => e.name.toLowerCase().includes(lower) || e.target.toLowerCase().includes(lower)
  )
}

// ---------------------------------------------------------------------------
export default function TodayScreen() {
  const navigation = useNavigation<any>()

  const {
    todayExercises,
    saveVoiceLog,
    loadTodayExercises,
    loadPreviousSets,
    initPRMap,
  } = useWorkoutStore()

  const { profile, session: authSession } = useUserStore()
  const { addAndSave, addEntry } = useNutritionStore()

  // Load today's exercises once auth session is confirmed
  useEffect(() => {
    if (!authSession?.user?.id) return
    loadTodayExercises()
  }, [authSession?.user?.id])

  useEffect(() => {
    track('screen_today')
  }, [])

  // ------ Voice modal ------
  const [showVoice, setShowVoice] = useState(false)

  // ------ Manual log picker ------
  const [showManualPicker, setShowManualPicker] = useState(false)

  // ------ Manual workout search modal ------
  const [showExerciseSearch, setShowExerciseSearch] = useState(false)
  const [searchQuery, setSearchQuery]               = useState('')
  const searchResults = searchQuery.trim() ? searchLocal(searchQuery) : LOCAL_EXERCISES

  // ------ Manual set entry ------
  const [manualExercise, setManualExercise]   = useState<ExerciseResult | null>(null)
  const [showSetEntry,   setShowSetEntry]     = useState(false)
  const [manualSets, setManualSets]           = useState<Array<{ weight: string; reps: string; distance: string }>>([])
  const unitPref = profile?.unit_pref ?? 'kg'
  const isCardio = (ex: ExerciseResult | null) => ex?.bodyPart === 'cardio'
  const isBodyweight = (ex: ExerciseResult | null) => ex?.equipment === 'body weight'

  function handleAddExercise(ex: ExerciseResult) {
    track('exercise_selected', { name: ex.name })
    setShowExerciseSearch(false)
    setSearchQuery('')
    setManualExercise(ex)
    setManualSets([{ weight: '', reps: '', distance: '' }])
    track('set_entry_open', { exercise_name: ex.name })
    setShowSetEntry(true)
    loadPreviousSets(ex.id)
    initPRMap(ex.id)
  }

  async function handleSaveManualSets() {
    if (!manualExercise) return
    const validSets = manualSets.filter(s =>
      isCardio(manualExercise) ? s.distance.trim() : s.reps.trim()
    )
    if (!validSets.length) { setShowSetEntry(false); return }

    const sets = validSets.map(s => {
      if (isCardio(manualExercise)) {
        const rawDist = parseFloat(s.distance) || 0
        // Convert miles → km for storage if user is on imperial
        const dist_km = unitPref === 'lbs' ? rawDist * 1.60934 : rawDist
        return { weight: 0, reps: 0, distance_km: dist_km }
      }
      const rawWeight = parseFloat(s.weight) || 0
      // Convert lbs → kg for storage
      const weight_kg = unitPref === 'lbs' ? rawWeight * 0.453592 : rawWeight
      return { weight: weight_kg, reps: parseInt(s.reps) || 0 }
    })

    track('set_entry_save', { exercise_name: manualExercise.name, set_count: sets.length })
    await saveVoiceLog([{ name: manualExercise.name, muscle: manualExercise.target, sets }])
    track('manual_workout_log_saved', { exercise_name: manualExercise.name, set_count: sets.length })
    setShowSetEntry(false)
    setManualExercise(null)
    setManualSets([])
  }

  // ------ Manual food modal ------
  const [showFood, setShowFood] = useState(false)

  // ------ Image food modal ------
  const [showImage, setShowImage] = useState(false)
  const isPro = true // Image AI is free for all users at launch

  // ------ Image → FoodConfirmModal bridge ------
  const [showImageConfirm, setShowImageConfirm]   = useState(false)
  const [imageConfirmDishes, setImageConfirmDishes] = useState<ConfirmDish[]>([])

  async function handleSaveFood(payload: FoodLogPayload) {
    setShowFood(false)
    const userId = profile?.id ?? authSession?.user?.id
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    try {
      if (userId) {
        await addAndSave(userId, { ...payload, logged_date: today, source: payload.source })
      }
    } catch {
      Alert.alert('Error', 'Failed to save food entry.')
    }
  }

  // ------ Hero pulse animation ------
  const heroScale = useRef(new Animated.Value(1)).current
  // Expanding ring animations (3 rings, staggered 1/3 period apart)
  const ring1 = useRef(new Animated.Value(0)).current
  const ring2 = useRef(new Animated.Value(0)).current
  const ring3 = useRef(new Animated.Value(0)).current

  // ------ Food diary modal ------
  const [showDiary, setShowDiary] = useState(false)

  useEffect(() => {
    // Hero pulse — relaxed cadence
    Animated.loop(
      Animated.sequence([
        Animated.timing(heroScale, {
          toValue: 1.06,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(heroScale, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start()

    // Rings — each loops at 1600ms, staggered by 533ms (1/3 period)
    const ringAnim = (val: Animated.Value, delay: number) => {
      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.timing(val, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          })
        ),
      ]).start()
    }
    ringAnim(ring1, 0)
    ringAnim(ring2, 533)
    ringAnim(ring3, 1067)
  }, [])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            <Text style={styles.headerDate}>⚡ Surge</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.shareBtn} onPress={() => { track('share_tap'); navigation.navigate('Share') }}>
              <Text style={styles.shareBtnText}>Share 📤</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Offline Banner ── */}
        <OfflineBanner />

        {/* ── Hero Voice Button ── */}
        <View style={styles.heroSection}>
          <TouchableOpacity
            onPress={() => { track('hero_speak_tap'); setShowVoice(true) }}
            activeOpacity={0.85}
            style={styles.heroTouchable}
          >
            <View style={styles.heroRingContainer}>
              {/* Expanding sonar rings */}
              {[ring1, ring2, ring3].map((r, i) => (
                <Animated.View
                  key={i}
                  style={[styles.heroRing, {
                    opacity:   r.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.4, 0] }),
                    transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] }) }],
                  }]}
                />
              ))}
              {/* Button */}
              <Animated.View style={[styles.heroBtn, { transform: [{ scale: heroScale }] }]}>
                <Text style={styles.heroSpeak}>SPEAK</Text>
              </Animated.View>
            </View>
          </TouchableOpacity>
          <Text style={styles.heroLabel}>Tap to log workout or food</Text>
          <Text style={styles.heroSub}>Voice, image, or text — whatever's fastest</Text>
        </View>

        {/* ── Today's Workout ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Workout</Text>

          {todayExercises.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🏋️</Text>
              <Text style={styles.emptyTitle}>No workout logged yet</Text>
              <Text style={styles.emptySub}>Tap the mic above and say what you did</Text>
            </View>
          ) : (
            <View style={styles.workoutCard}>
              {todayExercises.map((ex, i) => {
                const setCount   = ex.sets.length
                const totalDist  = ex.sets.reduce((a, s) => a + (s.distance_km ?? 0), 0)
                const totalDur   = ex.sets.reduce((a, s) => a + (s.duration_min ?? 0), 0)
                const topWeight  = Math.max(...ex.sets.map(s => s.weight_kg))
                const topReps    = ex.sets[ex.sets.length - 1]?.reps ?? 0
                const isDistance = totalDist > 0
                const isDuration = !isDistance && totalDur > 0

                let metaSuffix = ''
                if (isDistance) {
                  const dist = unitPref === 'lbs' ? totalDist * 0.621371 : totalDist
                  const unit = unitPref === 'lbs' ? 'mi' : 'km'
                  metaSuffix = ` · ${dist.toFixed(2)} ${unit}`
                } else if (isDuration) {
                  metaSuffix = ` · ${totalDur} min`
                } else {
                  if (topWeight > 0) {
                    const w = unitPref === 'lbs' ? (topWeight * 2.20462).toFixed(1) : topWeight
                    metaSuffix = ` · ${w}${unitPref === 'lbs' ? 'lbs' : 'kg'}`
                  }
                  if (topReps > 0) metaSuffix += ` × ${topReps}`
                }

                return (
                  <View
                    key={ex.exercise_name}
                    style={[styles.exerciseRow, i > 0 && styles.exerciseRowBorder]}
                  >
                    <View style={styles.exerciseInfo}>
                      <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                      <Text style={styles.exerciseMeta}>
                        {setCount} {setCount === 1 ? 'set' : 'sets'}{metaSuffix}
                      </Text>
                    </View>
                    <View style={styles.setCountBadge}>
                      <Text style={styles.setCountText}>{setCount}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* ── Nutrition ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nutrition</Text>
          <TouchableOpacity activeOpacity={0.85} onPress={() => { track('nutrition_section_tap'); setShowDiary(true) }}>
            <NutritionSection />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Voice Modal ── */}
      <VoiceModal
        visible={showVoice}
        onClose={() => setShowVoice(false)}
        onManualLog={() => setShowManualPicker(true)}
        onSave={(exercises) => saveVoiceLog(exercises)}
        onSaveFood={async (foods: ParsedFood[]) => {
          const userId = authSession?.user?.id
          const _d = new Date()
          const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`
          for (const food of foods) {
            const entry = {
              logged_date:  today,
              food_name:    food.name,
              calories:     food.calories,
              protein_g:    food.protein_g,
              carbs_g:      food.carbs_g,
              fat_g:        food.fat_g,
              serving_size: food.serving_size,
              serving_unit: food.serving_unit,
              source:       'voice' as const,
            }
            try { await addAndSave(userId ?? '', entry) } catch (err: any) {
              console.error('[Surge] food save failed:', err?.message, 'code:', err?.code)
              addEntry(entry)
            }
          }
        }}
      />

      {/* ── Manual log picker ── */}
      <Modal
        visible={showManualPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManualPicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowManualPicker(false)}>
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            <Text style={styles.pickerTitle}>Log another way</Text>
            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => { track('manual_picker_workout'); setShowManualPicker(false); setShowExerciseSearch(true) }}
            >
              <Text style={styles.pickerOptionIcon}>🏋️</Text>
              <View>
                <Text style={styles.pickerOptionLabel}>Log workout manually</Text>
                <Text style={styles.pickerOptionSub}>Search exercises, add sets</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.pickerDivider} />
            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => { track('manual_picker_food'); setShowManualPicker(false); setShowFood(true) }}
            >
              <Text style={styles.pickerOptionIcon}>🥗</Text>
              <View>
                <Text style={styles.pickerOptionLabel}>Log food manually</Text>
                <Text style={styles.pickerOptionSub}>Search foods, scan barcode</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.pickerDivider} />
            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => { track('manual_picker_image'); setShowManualPicker(false); setShowImage(true) }}
            >
              <Text style={styles.pickerOptionIcon}>📸</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.pickerOptionLabel}>Log food by photo</Text>
                  <View style={styles.testingBadge}>
                    <Text style={styles.testingBadgeText}>TESTING</Text>
                  </View>
                </View>
                <Text style={styles.pickerOptionSub}>AI estimates macros from image</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.pickerCancel}
              onPress={() => setShowManualPicker(false)}
            >
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Exercise search modal ── */}
      <Modal
        visible={showExerciseSearch}
        animationType="slide"
        onRequestClose={() => { setShowExerciseSearch(false); setSearchQuery('') }}
      >
        <SafeAreaView style={styles.searchScreen} edges={['top']}>
          <View style={styles.searchHeader}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search exercises…"
              placeholderTextColor={Colors.text3}
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            <TouchableOpacity
              onPress={() => { setShowExerciseSearch(false); setSearchQuery('') }}
              style={styles.searchCancelBtn}
            >
              <Text style={styles.searchCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={searchResults}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.listHint}>No exercises found</Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchExerciseRow}
                onPress={() => handleAddExercise(item)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchExerciseRowName}>{item.name}</Text>
                  <Text style={styles.searchExerciseRowMeta}>{item.target} · {item.equipment}</Text>
                </View>
                <Text style={styles.searchExerciseRowPlus}>+</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Manual set entry modal ── */}
      <Modal
        visible={showSetEntry}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSetEntry(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowSetEntry(false)}>
          <Pressable style={[styles.pickerSheet, { paddingBottom: 32 }]} onPress={() => {}}>
            <Text style={styles.pickerTitle}>{manualExercise?.name}</Text>
            <Text style={[styles.pickerOptionSub, { marginBottom: 12, paddingLeft: 4 }]}>
              {isCardio(manualExercise)
                ? `Distance in ${unitPref === 'lbs' ? 'miles' : 'km'}`
                : isBodyweight(manualExercise)
                  ? 'Bodyweight exercise — enter reps only'
                  : `Weight in ${unitPref === 'lbs' ? 'lbs' : 'kg'} · reps`}
            </Text>

            {manualSets.map((s, i) => (
              <View key={i} style={styles.setEntryRow}>
                <Text style={styles.setEntryNum}>Set {i + 1}</Text>
                {isCardio(manualExercise) ? (
                  <TextInput
                    style={[styles.setEntryInput, { flex: 1 }]}
                    placeholder={unitPref === 'lbs' ? 'miles' : 'km'}
                    placeholderTextColor={Colors.text3}
                    value={s.distance}
                    onChangeText={v => setManualSets(prev => prev.map((x, j) => j === i ? { ...x, distance: v } : x))}
                    keyboardType="decimal-pad"
                  />
                ) : (
                  <>
                    {!isBodyweight(manualExercise) && (
                      <TextInput
                        style={styles.setEntryInput}
                        placeholder={unitPref === 'lbs' ? 'lbs' : 'kg'}
                        placeholderTextColor={Colors.text3}
                        value={s.weight}
                        onChangeText={v => setManualSets(prev => prev.map((x, j) => j === i ? { ...x, weight: v } : x))}
                        keyboardType="decimal-pad"
                      />
                    )}
                    <TextInput
                      style={styles.setEntryInput}
                      placeholder="reps"
                      placeholderTextColor={Colors.text3}
                      value={s.reps}
                      onChangeText={v => setManualSets(prev => prev.map((x, j) => j === i ? { ...x, reps: v } : x))}
                      keyboardType="number-pad"
                    />
                  </>
                )}
                {manualSets.length > 1 && (
                  <TouchableOpacity onPress={() => setManualSets(prev => prev.filter((_, j) => j !== i))}>
                    <Text style={{ color: Colors.text3, fontSize: 18, paddingHorizontal: 4 }}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity
              style={styles.setEntryAddBtn}
              onPress={() => setManualSets(prev => [...prev, { weight: '', reps: '', distance: '' }])}
            >
              <Text style={styles.setEntryAddText}>+ Add set</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.setEntrySaveBtn} onPress={handleSaveManualSets}>
              <Text style={styles.setEntrySaveText}>Save to log</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Food search modal ── */}
      <FoodSearchModal
        visible={showFood}
        onClose={() => setShowFood(false)}
        onSave={handleSaveFood}
      />

      {/* ── Food diary modal ── */}
      <FoodDiaryModal
        visible={showDiary}
        onClose={() => setShowDiary(false)}
      />

      {/* ── Image food modal ── */}
      <ImageFoodModal
        visible={showImage}
        isPro={isPro}
        onClose={() => setShowImage(false)}
        onSave={(foods: ParsedFood[]) => {
          // Route through FoodConfirmModal for review/editing — same as voice
          setImageConfirmDishes(foodsToConfirmDishes(foods))
          setShowImage(false)
          setShowImageConfirm(true)
        }}
      />

      {/* ── FoodConfirmModal for image results ── */}
      <FoodConfirmModal
        visible={showImageConfirm}
        dishes={imageConfirmDishes}
        transcript="Food photo"
        onSave={async (dishes) => {
          const foods = dishesToParsedFoods(dishes)
          const userId = authSession?.user?.id
          const _d = new Date()
          const todayStr = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`
          for (const food of foods) {
            const entry = {
              logged_date:  todayStr,
              food_name:    food.name,
              calories:     food.calories,
              protein_g:    food.protein_g,
              carbs_g:      food.carbs_g,
              fat_g:        food.fat_g,
              serving_size: food.serving_size,
              serving_unit: food.serving_unit,
              source:       'image_ai' as const,
            }
            try { await addAndSave(userId ?? '', entry) } catch (err: any) {
              console.error('[Surge] food save failed:', err?.message, 'code:', err?.code)
              addEntry(entry)
            }
          }
          setShowImageConfirm(false)
        }}
        onClose={() => setShowImageConfirm(false)}
      />
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const HERO_SIZE = 96

const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: Colors.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding:       Spacing.md,
    paddingBottom: BOTTOM_SAFE_PADDING,
    gap:           Spacing.lg,
  },

  // Header
  header: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    marginBottom:   Spacing.xs,
  },
  headerTitle: {
    fontSize:   FontSize.xxl,
    color:      Colors.text1,
    fontWeight: FontWeight.black,
  },
  headerDate: {
    fontSize:  FontSize.sm,
    color:     Colors.text2,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.sm,
    marginTop:     4,
  },
  shareBtn: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
  },
  shareBtnText: {
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
  },

  // Hero voice button
  heroSection: {
    alignItems:    'center',
    paddingVertical: Spacing.lg,
    gap:           Spacing.sm,
  },
  heroTouchable: {
    marginBottom: Spacing.xs,
  },
  heroRingContainer: {
    width:          HERO_SIZE,
    height:         HERO_SIZE,
    alignItems:     'center',
    justifyContent: 'center',
  },
  heroRing: {
    position:     'absolute',
    width:        HERO_SIZE,
    height:       HERO_SIZE,
    borderRadius: HERO_SIZE / 2,
    borderWidth:  2,
    borderColor:  Colors.accent,
  },
  heroBtn: {
    width:           HERO_SIZE,
    height:          HERO_SIZE,
    borderRadius:    HERO_SIZE / 2,
    backgroundColor: Colors.accent,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     Colors.accent,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.6,
    shadowRadius:    24,
    elevation:       14,
    gap:             0,
  },
  heroSpeak: {
    fontSize:      17,
    color:         '#fff',
    fontWeight:    FontWeight.black,
    letterSpacing: 4,
  },
  heroLabel: {
    fontSize:   FontSize.md,
    color:      Colors.text1,
    fontWeight: FontWeight.bold,
  },
  heroSub: {
    fontSize: FontSize.sm,
    color:    Colors.text2,
  },

  // Section
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize:   FontSize.md,
    color:      Colors.text1,
    fontWeight: FontWeight.bold,
  },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.xl,
    alignItems:      'center',
    gap:             Spacing.xs,
  },
  emptyIcon: {
    fontSize: 28,
    marginBottom: Spacing.xs,
  },
  emptyTitle: {
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
  },
  emptySub: {
    fontSize:  FontSize.sm,
    color:     Colors.text2,
    textAlign: 'center',
  },

  // Workout review card
  workoutCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    overflow:        'hidden',
  },
  exerciseRow: {
    flexDirection:   'row',
    alignItems:      'center',
    padding:         Spacing.md,
    gap:             Spacing.sm,
  },
  exerciseRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
  },
  exerciseMeta: {
    fontSize:  FontSize.sm,
    color:     Colors.text2,
    marginTop: 2,
  },
  setCountBadge: {
    backgroundColor:   Colors.accentSoft,
    borderRadius:      Radius.full,
    width:             32,
    height:            32,
    alignItems:        'center',
    justifyContent:    'center',
  },
  setCountText: {
    fontSize:   FontSize.sm,
    color:      Colors.accent,
    fontWeight: FontWeight.bold,
  },

  // Manual log picker
  pickerOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent:  'flex-end',
  },
  pickerSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius:  Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingTop:        Spacing.md,
    paddingBottom:     Spacing.xl,
    gap:               Spacing.xs,
  },
  pickerTitle: {
    fontSize:     FontSize.md,
    color:        Colors.text1,
    fontWeight:   FontWeight.bold,
    marginBottom: Spacing.sm,
    paddingLeft:  Spacing.sm,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.md,
    padding:       Spacing.md,
    borderRadius:  Radius.md,
  },
  pickerOptionIcon: {
    fontSize: 24,
  },
  pickerOptionLabel: {
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
  },
  pickerOptionSub: {
    fontSize:  FontSize.sm,
    color:     Colors.text2,
    marginTop: 2,
  },
  pickerDivider: {
    height:          1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },
  pickerCancel: {
    alignItems:    'center',
    paddingVertical: Spacing.md,
    marginTop:     Spacing.xs,
  },
  pickerCancelText: {
    fontSize: FontSize.base,
    color:    Colors.text3,
  },
  proBadge: {
    backgroundColor: Colors.accentSoft,
    borderRadius:    Radius.full,
    paddingHorizontal: 6,
    paddingVertical:   2,
  },
  proBadgeText: {
    fontSize:   9,
    color:      Colors.accent,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  testingBadge: {
    backgroundColor: 'rgba(255,184,0,0.15)',
    borderRadius:    Radius.full,
    paddingHorizontal: 6,
    paddingVertical:   2,
  },
  testingBadgeText: {
    fontSize:   9,
    color:      Colors.warning,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },

  // Exercise search modal
  searchScreen: {
    flex:            1,
    backgroundColor: Colors.bg,
  },
  searchHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    padding:         Spacing.md,
    gap:             Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    flex:              1,
    backgroundColor:   Colors.surface,
    borderRadius:      Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
    color:             Colors.text1,
    fontSize:          FontSize.base,
  },
  searchCancelBtn: {
    padding: Spacing.sm,
  },
  searchCancelText: {
    color:     Colors.accent,
    fontSize:  FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  listHint: {
    color:     Colors.text3,
    fontSize:  FontSize.sm,
    textAlign: 'center',
    padding:   Spacing.xl,
  },
  searchExerciseRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   Spacing.md,
    paddingHorizontal: Spacing.md,
    gap:               Spacing.sm,
  },
  searchExerciseRowName: {
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
  },
  searchExerciseRowMeta: {
    fontSize:  FontSize.sm,
    color:     Colors.text2,
    marginTop: 2,
  },
  searchExerciseRowPlus: {
    fontSize:   FontSize.xl,
    color:      Colors.accent,
    fontWeight: FontWeight.bold,
  },
  sep: {
    height:          1,
    backgroundColor: Colors.border,
    marginLeft:      Spacing.md,
  },

  // Set entry modal
  setEntryRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing.sm,
    marginBottom:   Spacing.sm,
  },
  setEntryNum: {
    fontSize:   FontSize.sm,
    color:      Colors.text3,
    width:      42,
    fontWeight: FontWeight.semibold,
  },
  setEntryInput: {
    flex:              1,
    backgroundColor:   Colors.bg,
    borderRadius:      Radius.sm,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical:   Spacing.sm,
    color:             Colors.text1,
    fontSize:          FontSize.base,
    textAlign:         'center',
    minWidth:          64,
  },
  setEntryAddBtn: {
    alignItems:    'center',
    paddingVertical: Spacing.sm,
    marginTop:     Spacing.xs,
  },
  setEntryAddText: {
    fontSize:   FontSize.sm,
    color:      Colors.accent,
    fontWeight: FontWeight.semibold,
  },
  setEntrySaveBtn: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.md,
    alignItems:      'center',
    marginTop:       Spacing.md,
  },
  setEntrySaveText: {
    fontSize:   FontSize.base,
    color:      '#fff',
    fontWeight: FontWeight.bold,
  },
})
