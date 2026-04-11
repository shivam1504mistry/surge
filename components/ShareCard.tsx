/**
 * ShareCard.tsx — Visual card rendered off-screen and captured as PNG
 *
 * Design: Dark card, Surge branding, workout summary + macro totals.
 * Captured by react-native-view-shot at 1080×1080 equivalent scale.
 */
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme'

// ---------------------------------------------------------------------------

export interface ShareCardData {
  date:       string   // e.g. "Thursday, 10 April"
  userName:   string
  exercises:  { name: string; sets: number; topWeight: number; topReps: number }[]
  macros:     { calories: number; protein_g: number; carbs_g: number; fat_g: number }
  targets:    { calories: number; protein_g: number; carbs_g: number; fat_g: number }
}

interface Props {
  data: ShareCardData
}

// ---------------------------------------------------------------------------

export default function ShareCard({ data }: Props) {
  const hasWorkout  = data.exercises.length > 0
  const hasMacros   = data.macros.calories > 0
  const displayExercises = data.exercises.slice(0, 5)
  const extraCount  = Math.max(0, data.exercises.length - 5)

  function pct(val: number, target: number) {
    if (!target) return 0
    return Math.min(100, Math.round((val / target) * 100))
  }

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandName}>⚡ Surge</Text>
          <Text style={styles.date}>{data.date}</Text>
        </View>
        <View style={styles.nameBadge}>
          <Text style={styles.nameText}>{data.userName}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Workout section */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>WORKOUT</Text>
        {hasWorkout ? (
          <View style={styles.exerciseList}>
            {displayExercises.map((ex, i) => (
              <View key={i} style={styles.exerciseRow}>
                <Text style={styles.exerciseName} numberOfLines={1}>{ex.name}</Text>
                <Text style={styles.exerciseMeta}>
                  {ex.sets}×{ex.topReps}{ex.topWeight > 0 ? ` @ ${ex.topWeight}kg` : ''}
                </Text>
              </View>
            ))}
            {extraCount > 0 && (
              <Text style={styles.extraLabel}>+ {extraCount} more exercise{extraCount > 1 ? 's' : ''}</Text>
            )}
          </View>
        ) : (
          <Text style={styles.emptyText}>Rest day 💤</Text>
        )}
      </View>

      <View style={styles.divider} />

      {/* Nutrition section */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>NUTRITION</Text>
        {hasMacros ? (
          <View style={styles.macroGrid}>
            <MacroCell label="Calories" value={data.macros.calories}   target={data.targets.calories}   unit="kcal" accent={Colors.accent} />
            <MacroCell label="Protein"  value={data.macros.protein_g}  target={data.targets.protein_g}  unit="g"    accent="#00D26A" />
            <MacroCell label="Carbs"    value={data.macros.carbs_g}    target={data.targets.carbs_g}    unit="g"    accent="#4D9FFF" />
            <MacroCell label="Fat"      value={data.macros.fat_g}      target={data.targets.fat_g}      unit="g"    accent="#FFB800" />
          </View>
        ) : (
          <Text style={styles.emptyText}>No food logged today</Text>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Logged with Surge — track workouts + nutrition in one place</Text>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------

function MacroCell({ label, value, target, unit, accent }: {
  label: string; value: number; target: number; unit: string; accent: string
}) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0
  return (
    <View style={cellStyles.container}>
      <Text style={cellStyles.label}>{label}</Text>
      <Text style={[cellStyles.value, { color: accent }]}>{Math.round(value)}</Text>
      <Text style={cellStyles.unit}>{unit}</Text>
      {/* Mini bar */}
      <View style={cellStyles.barBg}>
        <View style={[cellStyles.barFill, { width: `${pct}%` as any, backgroundColor: accent }]} />
      </View>
      {target > 0 && (
        <Text style={cellStyles.pct}>{pct}%</Text>
      )}
    </View>
  )
}

const cellStyles = StyleSheet.create({
  container: {
    flex:       1,
    alignItems: 'center',
    gap:        2,
  },
  label: {
    fontSize:   9,
    color:      Colors.text3,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  value: {
    fontSize:   20,
    fontWeight: FontWeight.black,
  },
  unit: {
    fontSize: 9,
    color:    Colors.text3,
  },
  barBg: {
    width:           '100%',
    height:          3,
    backgroundColor: Colors.border,
    borderRadius:    2,
    marginTop:       4,
    overflow:        'hidden',
  },
  barFill: {
    height:       3,
    borderRadius: 2,
  },
  pct: {
    fontSize: 9,
    color:    Colors.text2,
    marginTop: 2,
  },
})

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111111',
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     '#2A2A2A',
    padding:         Spacing.lg,
    gap:             Spacing.md,
    width:           320,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  brandName: {
    fontSize:   FontSize.lg,
    color:      Colors.accent,
    fontWeight: FontWeight.black,
  },
  date: {
    fontSize:  FontSize.xs,
    color:     Colors.text2,
    marginTop: 2,
  },
  nameBadge: {
    backgroundColor: Colors.accentSoft,
    borderRadius:    Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.xs,
  },
  nameText: {
    fontSize:   FontSize.sm,
    color:      Colors.accent,
    fontWeight: FontWeight.bold,
  },
  divider: {
    height:          1,
    backgroundColor: '#2A2A2A',
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize:      9,
    color:         Colors.text3,
    fontWeight:    FontWeight.bold,
    letterSpacing: 1.5,
  },
  exerciseList: {
    gap: 6,
  },
  exerciseRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  exerciseName: {
    fontSize:   FontSize.sm,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
    flex:       1,
  },
  exerciseMeta: {
    fontSize: FontSize.xs,
    color:    Colors.text2,
    marginLeft: Spacing.sm,
  },
  extraLabel: {
    fontSize: FontSize.xs,
    color:    Colors.text3,
    marginTop: 2,
  },
  macroGrid: {
    flexDirection: 'row',
    gap:           Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color:    Colors.text3,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    paddingTop:     Spacing.sm,
    marginTop:      Spacing.xs,
  },
  footerText: {
    fontSize:  8,
    color:     '#444',
    textAlign: 'center',
  },
})
