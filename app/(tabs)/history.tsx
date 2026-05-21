/**
 * history.tsx — History screen
 *
 * Layout:
 *   1. Month header with prev/next navigation
 *   2. Calendar grid — dots show workout (orange), food (green), both
 *   3. Day detail panel — tapping a day shows exercises + food logged that day
 *
 * Reads from: workout_sets, workout_sessions, food_entries (via Supabase)
 * Falls back to local store state for today's optimistic data.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors, FontSize, FontWeight, Radius, Spacing, BOTTOM_SAFE_PADDING } from '../../constants/theme'
import { supabase } from '../../lib/supabase'
import SupportButton from '../../components/SupportButton'
import { track } from '../../lib/analytics'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DayData {
  hasWorkout: boolean
  hasFood:    boolean
  exercises:  { exercise_name: string; sets: { set_number: number; weight_kg: number; reps: number }[] }[]
  foods:      { food_name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }[]
}

type MonthCache = Record<string, DayData> // key: 'YYYY-MM-DD'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay() // 0 = Sunday
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_LABELS  = ['Su','Mo','Tu','We','Th','Fr','Sa']

// ---------------------------------------------------------------------------
export default function HistoryScreen() {
  const today     = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState<string>(toDateStr(today.getFullYear(), today.getMonth(), today.getDate()))
  const [cache, setCache]       = useState<MonthCache>({})
  const [loading, setLoading]   = useState(false)

  // ---------------------------------------------------------------------------
  // Load month data from Supabase
  // ---------------------------------------------------------------------------
  const loadMonth = useCallback(async (y: number, m: number) => {
    setLoading(true)
    try {
      const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`
      const monthEnd   = `${y}-${String(m + 1).padStart(2, '0')}-${String(daysInMonth(y, m)).padStart(2, '0')}`

      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id

      // workout_sets has no user_id — query sessions for this user first, then sets
      const { data: sessions } = await supabase
        .from('workout_sessions')
        .select('id')
        .eq('user_id', uid)
        .gte('started_at', `${monthStart}T00:00:00`)
        .lte('started_at', `${monthEnd}T23:59:59`)

      const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id)

      const [setsRes, foodRes] = await Promise.all([
        sessionIds.length > 0
          ? supabase
              .from('workout_sets')
              .select('exercise_name, weight_kg, reps, set_number, logged_at')
              .in('session_id', sessionIds)
              .order('logged_at', { ascending: true })
          : Promise.resolve({ data: [] }),
        supabase
          .from('food_entries')
          .select('food_name, calories, protein_g, carbs_g, fat_g, logged_date')
          .gte('logged_date', monthStart)
          .lte('logged_date', monthEnd)
          .eq('user_id', uid)
          .order('logged_date', { ascending: true }),
      ])

      const newCache: MonthCache = {}

      for (const row of (setsRes.data ?? [])) {
        const dateStr = row.logged_at.slice(0, 10)
        if (!newCache[dateStr]) newCache[dateStr] = { hasWorkout: false, hasFood: false, exercises: [], foods: [] }
        newCache[dateStr].hasWorkout = true
        const ex = newCache[dateStr].exercises.find(e => e.exercise_name === row.exercise_name)
        if (ex) {
          ex.sets.push({ set_number: row.set_number, weight_kg: Number(row.weight_kg), reps: Number(row.reps) })
        } else {
          newCache[dateStr].exercises.push({
            exercise_name: row.exercise_name,
            sets: [{ set_number: row.set_number, weight_kg: Number(row.weight_kg), reps: Number(row.reps) }],
          })
        }
      }

      for (const row of (foodRes.data ?? [])) {
        const dateStr = row.logged_date
        if (!newCache[dateStr]) newCache[dateStr] = { hasWorkout: false, hasFood: false, exercises: [], foods: [] }
        newCache[dateStr].hasFood = true
        newCache[dateStr].foods.push({
          food_name: row.food_name,
          calories:  Number(row.calories),
          protein_g: Number(row.protein_g),
          carbs_g:   Number(row.carbs_g),
          fat_g:     Number(row.fat_g),
        })
      }

      setCache(prev => ({ ...prev, ...newCache }))
    } catch (err) {
      console.error('[Surge] History loadMonth failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMonth(year, month) }, [year, month])
  useEffect(() => { track('screen_history') }, [])

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  function prevMonth() {
    track('history_month_prev')
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    track('history_month_next')
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  // ---------------------------------------------------------------------------
  // Calendar grid
  // ---------------------------------------------------------------------------
  const totalDays  = daysInMonth(year, month)
  const startDay   = firstDayOfMonth(year, month)
  const todayStr   = toDateStr(today.getFullYear(), today.getMonth(), today.getDate())
  const selectedData = cache[selected]

  const cells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📅 History</Text>
          <SupportButton />
        </View>

        {/* ── Month navigator ── */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
            <Text style={styles.navArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
          <TouchableOpacity
            onPress={nextMonth}
            style={styles.navBtn}
            disabled={year === today.getFullYear() && month === today.getMonth()}
          >
            <Text style={[styles.navArrow, year === today.getFullYear() && month === today.getMonth() && styles.navArrowDisabled]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── Calendar ── */}
        <View style={styles.calendar}>
          {/* Day labels */}
          <View style={styles.dayRow}>
            {DAY_LABELS.map(d => (
              <Text key={d} style={styles.dayLabel}>{d}</Text>
            ))}
          </View>

          {/* Weeks */}
          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.accent} />
            </View>
          )}
          {!loading && Array.from({ length: cells.length / 7 }, (_, wi) => (
            <View key={wi} style={styles.weekRow}>
              {cells.slice(wi * 7, wi * 7 + 7).map((day, di) => {
                if (!day) return <View key={di} style={styles.dayCell} />
                const dateStr  = toDateStr(year, month, day)
                const data     = cache[dateStr]
                const isToday  = dateStr === todayStr
                const isSelected = dateStr === selected
                const isFuture = dateStr > todayStr

                return (
                  <TouchableOpacity
                    key={di}
                    style={[
                      styles.dayCell,
                      isSelected && styles.dayCellSelected,
                      isToday && !isSelected && styles.dayCellToday,
                    ]}
                    onPress={() => { if (!isFuture) { track('history_day_tap', { date: dateStr }); setSelected(dateStr) } }}
                    activeOpacity={isFuture ? 1 : 0.7}
                    disabled={isFuture}
                  >
                    <Text style={[
                      styles.dayNum,
                      isSelected && styles.dayNumSelected,
                      isToday && !isSelected && styles.dayNumToday,
                      isFuture && styles.dayNumFuture,
                    ]}>
                      {day}
                    </Text>
                    <View style={styles.dotRow}>
                      {data?.hasWorkout && <View style={[styles.dot, { backgroundColor: Colors.accent }]} />}
                      {data?.hasFood    && <View style={[styles.dot, { backgroundColor: Colors.green }]} />}
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          ))}
        </View>

        {/* ── Legend ── */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: Colors.accent }]} />
            <Text style={styles.legendText}>Workout</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: Colors.green }]} />
            <Text style={styles.legendText}>Food</Text>
          </View>
        </View>

        {/* ── Day detail ── */}
        <View style={styles.detailSection}>
          <Text style={styles.detailDate}>
            {new Date(selected + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>

          {!selectedData && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>{selected === todayStr ? '🏃' : '😴'}</Text>
              <Text style={styles.emptyText}>
                {selected === todayStr ? 'Nothing logged yet today' : 'Rest day'}
              </Text>
            </View>
          )}

          {/* Workout detail */}
          {selectedData?.exercises && selectedData.exercises.length > 0 && (
            <View style={styles.detailCard}>
              <Text style={styles.detailCardTitle}>🏋️ Workout</Text>
              {selectedData.exercises.map((ex, i) => {
                const topWeight = Math.max(...ex.sets.map(s => s.weight_kg))
                const topReps   = ex.sets[ex.sets.length - 1]?.reps ?? 0
                return (
                  <View key={i} style={[styles.detailRow, i > 0 && styles.detailRowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailRowName}>{ex.exercise_name}</Text>
                      <Text style={styles.detailRowMeta}>
                        {ex.sets.length} {ex.sets.length === 1 ? 'set' : 'sets'}
                        {topWeight > 0 ? ` · ${topWeight}kg` : ''}
                        {topReps > 0 ? ` × ${topReps}` : ''}
                      </Text>
                    </View>
                    <View style={styles.setBadge}>
                      <Text style={styles.setBadgeText}>{ex.sets.length}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          {/* Food detail */}
          {selectedData?.foods && selectedData.foods.length > 0 && (
            <View style={styles.detailCard}>
              <Text style={styles.detailCardTitle}>🥗 Food</Text>
              {selectedData.foods.map((food, i) => (
                <View key={i} style={[styles.detailRow, i > 0 && styles.detailRowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailRowName}>{food.food_name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.detailCalories}>{food.calories} kcal</Text>
                    <Text style={styles.detailMacros}>P{food.protein_g}g C{food.carbs_g}g F{food.fat_g}g</Text>
                  </View>
                </View>
              ))}
              <View style={styles.foodTotalsRow}>
                <Text style={styles.foodTotalsLabel}>Total</Text>
                <Text style={styles.foodTotalsValue}>
                  {selectedData.foods.reduce((s, f) => s + f.calories, 0)} kcal
                </Text>
              </View>
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const CELL_SIZE = 44

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
    gap:           Spacing.md,
  },

  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   Spacing.xs,
  },
  headerTitle: {
    fontSize:   FontSize.xxl,
    color:      Colors.text1,
    fontWeight: FontWeight.black,
  },

  // Month nav
  monthNav: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
  },
  navBtn: {
    padding: Spacing.sm,
  },
  navArrow: {
    fontSize:   28,
    color:      Colors.text1,
    fontWeight: FontWeight.bold,
  },
  navArrowDisabled: {
    color: Colors.text3,
  },
  monthLabel: {
    fontSize:   FontSize.lg,
    color:      Colors.text1,
    fontWeight: FontWeight.bold,
  },

  // Calendar
  calendar: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.sm,
  },
  loadingRow: {
    paddingVertical: Spacing.xl,
    alignItems:      'center',
  },
  dayRow: {
    flexDirection:  'row',
    marginBottom:   Spacing.xs,
  },
  dayLabel: {
    flex:      1,
    textAlign: 'center',
    fontSize:  FontSize.xs,
    color:     Colors.text3,
    fontWeight: FontWeight.semibold,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex:           1,
    height:         CELL_SIZE,
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   Radius.sm,
    gap:            2,
  },
  dayCellSelected: {
    backgroundColor: Colors.accent,
  },
  dayCellToday: {
    borderWidth:  1,
    borderColor:  Colors.accent,
  },
  dayNum: {
    fontSize:   FontSize.sm,
    color:      Colors.text1,
    fontWeight: FontWeight.medium,
  },
  dayNumSelected: {
    color:      '#fff',
    fontWeight: FontWeight.bold,
  },
  dayNumToday: {
    color:      Colors.accent,
    fontWeight: FontWeight.bold,
  },
  dayNumFuture: {
    color: Colors.text3,
  },
  dotRow: {
    flexDirection: 'row',
    gap:           3,
    height:        6,
  },
  dot: {
    width:        5,
    height:       5,
    borderRadius: 3,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    gap:           Spacing.lg,
    paddingHorizontal: Spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.xs,
  },
  legendText: {
    fontSize: FontSize.xs,
    color:    Colors.text2,
  },

  // Detail
  detailSection: {
    gap: Spacing.sm,
  },
  detailDate: {
    fontSize:   FontSize.md,
    color:      Colors.text1,
    fontWeight: FontWeight.bold,
    marginTop:  Spacing.xs,
  },
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
  },
  emptyText: {
    fontSize: FontSize.sm,
    color:    Colors.text2,
  },
  detailCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    overflow:        'hidden',
  },
  detailCardTitle: {
    fontSize:          FontSize.sm,
    color:             Colors.text2,
    fontWeight:        FontWeight.bold,
    padding:           Spacing.md,
    paddingBottom:     Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailRow: {
    flexDirection:   'row',
    alignItems:      'center',
    padding:         Spacing.md,
    gap:             Spacing.sm,
  },
  detailRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  detailRowName: {
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
  },
  detailRowMeta: {
    fontSize:  FontSize.xs,
    color:     Colors.text2,
    marginTop: 2,
  },
  setBadge: {
    backgroundColor:   Colors.accentSoft,
    borderRadius:      Radius.full,
    width:             30,
    height:            30,
    alignItems:        'center',
    justifyContent:    'center',
  },
  setBadgeText: {
    fontSize:   FontSize.sm,
    color:      Colors.accent,
    fontWeight: FontWeight.bold,
  },
  detailCalories: {
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
  },
  detailMacros: {
    fontSize:  FontSize.xs,
    color:     Colors.text2,
    marginTop: 2,
  },
  foodTotalsRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    padding:         Spacing.md,
    borderTopWidth:  1,
    borderTopColor:  Colors.border,
    backgroundColor: Colors.bg,
  },
  foodTotalsLabel: {
    fontSize:   FontSize.sm,
    color:      Colors.text2,
    fontWeight: FontWeight.semibold,
  },
  foodTotalsValue: {
    fontSize:   FontSize.sm,
    color:      Colors.accent,
    fontWeight: FontWeight.bold,
  },
})
