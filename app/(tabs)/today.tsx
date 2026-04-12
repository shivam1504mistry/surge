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
import OfflineBanner from '../../components/OfflineBanner'
import VoiceModal, { ParsedFood } from '../../components/VoiceModal'
import FoodSearchModal, { FoodLogPayload } from '../../components/FoodSearchModal'
import ImageFoodModal from '../../components/ImageFoodModal'
import { useNutritionStore } from '../../stores/nutritionStore'
import { MealSlot } from '../../stores/nutritionStore'

// ---------------------------------------------------------------------------
// Exercise types + local fallback (used by manual log modal)
// ---------------------------------------------------------------------------
interface ExerciseResult {
  id: string; name: string; target: string; bodyPart: string; equipment: string
}

const LOCAL_EXERCISES: ExerciseResult[] = [
  { id: 'l_001', name: 'Barbell Bench Press',     target: 'pectorals',  bodyPart: 'chest',      equipment: 'barbell'   },
  { id: 'l_002', name: 'Incline Dumbbell Press',  target: 'pectorals',  bodyPart: 'chest',      equipment: 'dumbbell'  },
  { id: 'l_003', name: 'Cable Fly',               target: 'pectorals',  bodyPart: 'chest',      equipment: 'cable'     },
  { id: 'l_004', name: 'Push Up',                 target: 'pectorals',  bodyPart: 'chest',      equipment: 'body weight'},
  { id: 'l_005', name: 'Pull Up',                 target: 'lats',       bodyPart: 'back',       equipment: 'body weight'},
  { id: 'l_006', name: 'Barbell Row',             target: 'lats',       bodyPart: 'back',       equipment: 'barbell'   },
  { id: 'l_007', name: 'Lat Pulldown',            target: 'lats',       bodyPart: 'back',       equipment: 'cable'     },
  { id: 'l_008', name: 'Deadlift',                target: 'spine',      bodyPart: 'back',       equipment: 'barbell'   },
  { id: 'l_009', name: 'Overhead Press',          target: 'delts',      bodyPart: 'shoulders',  equipment: 'barbell'   },
  { id: 'l_010', name: 'Lateral Raise',           target: 'delts',      bodyPart: 'shoulders',  equipment: 'dumbbell'  },
  { id: 'l_011', name: 'Barbell Curl',            target: 'biceps',     bodyPart: 'upper arms', equipment: 'barbell'   },
  { id: 'l_012', name: 'Dumbbell Curl',           target: 'biceps',     bodyPart: 'upper arms', equipment: 'dumbbell'  },
  { id: 'l_013', name: 'Tricep Pushdown',         target: 'triceps',    bodyPart: 'upper arms', equipment: 'cable'     },
  { id: 'l_014', name: 'Skull Crusher',           target: 'triceps',    bodyPart: 'upper arms', equipment: 'barbell'   },
  { id: 'l_015', name: 'Barbell Squat',           target: 'quads',      bodyPart: 'upper legs', equipment: 'barbell'   },
  { id: 'l_016', name: 'Leg Press',               target: 'quads',      bodyPart: 'upper legs', equipment: 'machine'   },
  { id: 'l_017', name: 'Romanian Deadlift',       target: 'hamstrings', bodyPart: 'upper legs', equipment: 'barbell'   },
  { id: 'l_018', name: 'Hip Thrust',              target: 'glutes',     bodyPart: 'upper legs', equipment: 'barbell'   },
  { id: 'l_019', name: 'Plank',                   target: 'abs',        bodyPart: 'waist',      equipment: 'body weight'},
  { id: 'l_020', name: 'Hanging Leg Raise',       target: 'abs',        bodyPart: 'waist',      equipment: 'body weight'},
]

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

  // Load today's exercises on mount
  useEffect(() => { loadTodayExercises() }, [])

  // ------ Voice modal ------
  const [showVoice, setShowVoice] = useState(false)

  // ------ Manual log picker ------
  const [showManualPicker, setShowManualPicker] = useState(false)

  // ------ Manual workout search modal ------
  const [showExerciseSearch, setShowExerciseSearch] = useState(false)
  const [searchQuery, setSearchQuery]               = useState('')
  const searchResults = searchQuery.trim() ? searchLocal(searchQuery) : LOCAL_EXERCISES

  function handleAddExercise(ex: ExerciseResult) {
    setShowExerciseSearch(false)
    setSearchQuery('')
    loadPreviousSets(ex.id)
    initPRMap(ex.id)
  }

  // ------ Manual food modal ------
  const [showFood, setShowFood] = useState(false)

  // ------ Image food modal ------
  const [showImage, setShowImage] = useState(false)
  const isPro = true // Image AI is free for all users at launch

  async function handleSaveFood(payload: FoodLogPayload) {
    setShowFood(false)
    const userId = profile?.id ?? authSession?.user?.id
    const today  = new Date().toISOString().slice(0, 10)
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

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(heroScale, {
          toValue: 1.06,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(heroScale, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start()
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
            <TouchableOpacity style={styles.shareBtn} onPress={() => navigation.navigate('Share')}>
              <Text style={styles.shareBtnText}>Share 📤</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Offline Banner ── */}
        <OfflineBanner />

        {/* ── Hero Voice Button ── */}
        <View style={styles.heroSection}>
          <TouchableOpacity
            onPress={() => setShowVoice(true)}
            activeOpacity={0.85}
            style={styles.heroTouchable}
          >
            <Animated.View style={[styles.heroBtn, { transform: [{ scale: heroScale }] }]}>
              <Text style={styles.heroMic}>🎤</Text>
            </Animated.View>
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
                const setCount = ex.sets.length
                const topWeight = Math.max(...ex.sets.map(s => s.weight_kg))
                const topReps   = ex.sets[ex.sets.length - 1]?.reps ?? 0
                return (
                  <View
                    key={ex.exercise_name}
                    style={[styles.exerciseRow, i > 0 && styles.exerciseRowBorder]}
                  >
                    <View style={styles.exerciseInfo}>
                      <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                      <Text style={styles.exerciseMeta}>
                        {setCount} {setCount === 1 ? 'set' : 'sets'}
                        {topWeight > 0 ? ` · ${topWeight}kg` : ''}
                        {topReps > 0 ? ` × ${topReps}` : ''}
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
          <NutritionSection />
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
          const today  = new Date().toISOString().slice(0, 10)
          for (const food of foods) {
            const entry = {
              logged_date:  today,
              meal_slot:    food.meal_slot as MealSlot,
              food_name:    food.name,
              calories:     food.calories,
              protein_g:    food.protein_g,
              carbs_g:      food.carbs_g,
              fat_g:        food.fat_g,
              serving_size: food.serving_size,
              serving_unit: food.serving_unit,
              source:       'voice' as const,
            }
            if (userId) {
              try { await addAndSave(userId, entry) } catch { addEntry(entry) }
            } else {
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
              onPress={() => { setShowManualPicker(false); setShowExerciseSearch(true) }}
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
              onPress={() => { setShowManualPicker(false); setShowFood(true) }}
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
              onPress={() => { setShowManualPicker(false); setShowImage(true) }}
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

      {/* ── Food search modal ── */}
      <FoodSearchModal
        visible={showFood}
        initialSlot="breakfast"
        onClose={() => setShowFood(false)}
        onSave={handleSaveFood}
      />

      {/* ── Image food modal ── */}
      <ImageFoodModal
        visible={showImage}
        isPro={isPro}
        onClose={() => setShowImage(false)}
        onSave={async (foods: ParsedFood[]) => {
          const userId = authSession?.user?.id
          const today  = new Date().toISOString().slice(0, 10)
          for (const food of foods) {
            const entry = {
              logged_date:  today,
              meal_slot:    food.meal_slot as MealSlot,
              food_name:    food.name,
              calories:     food.calories,
              protein_g:    food.protein_g,
              carbs_g:      food.carbs_g,
              fat_g:        food.fat_g,
              serving_size: food.serving_size,
              serving_unit: food.serving_unit,
              source:       'image_ai' as const,
            }
            if (userId) {
              try { await addAndSave(userId, entry) } catch { addEntry(entry) }
            } else {
              addEntry(entry)
            }
          }
        }}
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
  heroBtn: {
    width:           HERO_SIZE,
    height:          HERO_SIZE,
    borderRadius:    HERO_SIZE / 2,
    backgroundColor: Colors.accent,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     Colors.accent,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.5,
    shadowRadius:    20,
    elevation:       12,
  },
  heroMic: {
    fontSize: 38,
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
})
