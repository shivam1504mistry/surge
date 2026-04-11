import React, { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme'
import { useNutritionStore } from '../stores/nutritionStore'
import { useUserStore } from '../stores/userStore'
import MacroBar from './MacroBar'

// ---------------------------------------------------------------------------
// NutritionSection
// Renders the daily macro summary card only.
// Meal slot breakdown removed — food is logged via voice (Wave 3).
// ---------------------------------------------------------------------------

const DEFAULT_TARGETS = {
  calorie_target:   2000,
  protein_target_g: 150,
  carbs_target_g:   200,
  fat_target_g:     65,
}

export default function NutritionSection() {
  const { todayEntries, getDailyTotals, loadTodayEntries } = useNutritionStore()
  const { profile, session } = useUserStore()

  const userId = profile?.id ?? session?.user?.id

  useEffect(() => {
    if (userId) loadTodayEntries(userId)
  }, [userId])

  const targets = profile
    ? {
        calorie_target:   profile.calorie_target,
        protein_target_g: profile.protein_target_g,
        carbs_target_g:   profile.carbs_target_g,
        fat_target_g:     profile.fat_target_g,
      }
    : DEFAULT_TARGETS

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const totals = getDailyTotals() // re-runs whenever todayEntries changes (subscribed above)

  return (
    <View style={styles.summaryCard}>
      {/* Calorie headline */}
      <View style={styles.calRow}>
        <View>
          <Text style={styles.calValue}>{Math.round(totals.calories)}</Text>
          <Text style={styles.calLabel}>kcal eaten</Text>
        </View>
        <View style={styles.calRemaining}>
          <Text style={styles.calRemainingValue}>
            {Math.max(0, targets.calorie_target - Math.round(totals.calories))}
          </Text>
          <Text style={styles.calRemainingLabel}>remaining</Text>
        </View>
      </View>

      <MacroBar
        label="Calories"
        current={totals.calories}
        target={targets.calorie_target}
        unit=" kcal"
        color={Colors.accent}
      />

      <View style={styles.macrosRow}>
        <View style={styles.macroCol}>
          <MacroBar label="Protein" current={totals.protein_g} target={targets.protein_target_g} color={Colors.green}   />
        </View>
        <View style={styles.macroCol}>
          <MacroBar label="Carbs"   current={totals.carbs_g}   target={targets.carbs_target_g}   color={Colors.blue}    />
        </View>
        <View style={styles.macroCol}>
          <MacroBar label="Fat"     current={totals.fat_g}     target={targets.fat_target_g}     color={Colors.warning} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    padding:         Spacing.md,
    gap:             Spacing.md,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  calRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-end',
    marginBottom:   Spacing.xs,
  },
  calValue: {
    fontSize:   FontSize.xxl,
    color:      Colors.text1,
    fontWeight: FontWeight.black,
    lineHeight: FontSize.xxl + 4,
  },
  calLabel: {
    fontSize: FontSize.sm,
    color:    Colors.text2,
  },
  calRemaining: {
    alignItems: 'flex-end',
  },
  calRemainingValue: {
    fontSize:   FontSize.xl,
    color:      Colors.accent,
    fontWeight: FontWeight.bold,
  },
  calRemainingLabel: {
    fontSize: FontSize.xs,
    color:    Colors.text3,
  },
  macrosRow: {
    flexDirection: 'row',
    gap:           Spacing.sm,
  },
  macroCol: {
    flex: 1,
  },
})
