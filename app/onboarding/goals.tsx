// Agent 1 — Onboarding: Goal selection
import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme'
import { Goal, Sex } from '../../constants/macros'
import { track } from '../../lib/analytics'

type ProfileParams = {
  name: string; age: number; sex: Sex; weight_kg: number; height_cm: number
}
type RootParamList = {
  Goals:      ProfileParams
  Experience: ProfileParams & { goal: Goal }
}

const GOALS: { value: Goal; label: string; desc: string; emoji: string }[] = [
  { value: 'fat_loss',    label: 'Lose fat',        desc: '−400 kcal/day deficit',     emoji: '🔥' },
  { value: 'muscle_gain', label: 'Build muscle',    desc: '+250 kcal/day surplus',      emoji: '💪' },
  { value: 'recomp',      label: 'Recomp',           desc: 'Lose fat + gain muscle',     emoji: '⚖️' },
  { value: 'maintain',    label: 'Maintain weight',  desc: 'Stay at current weight',     emoji: '🎯' },
  { value: 'performance', label: 'Performance',      desc: '+150 kcal — fuel training',  emoji: '⚡' },
]

export default function GoalsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>()
  const route      = useRoute<RouteProp<RootParamList, 'Goals'>>()
  const params     = route.params

  const [selected, setSelected] = useState<Goal | null>(null)

  React.useEffect(() => { track('onboarding_goals_viewed') }, [])

  function handleNext() {
    if (!selected) return
    track('onboarding_goals_selected', { goal: selected })
    navigation.navigate('Experience', { ...params, goal: selected })
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.step}>2 of 4</Text>
          <Text style={styles.title}>What's your main goal?</Text>
          <Text style={styles.subtitle}>We'll set your daily calorie and macro targets from this.</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '50%' }]} />
        </View>

        {/* Goal cards */}
        <View style={styles.goals}>
          {GOALS.map((g) => {
            const isSelected = selected === g.value
            return (
              <TouchableOpacity
                key={g.value}
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => setSelected(g.value)}
                activeOpacity={0.8}
              >
                <View style={styles.cardLeft}>
                  <Text style={styles.emoji}>{g.emoji}</Text>
                  <View style={styles.cardText}>
                    <Text style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}>
                      {g.label}
                    </Text>
                    <Text style={styles.cardDesc}>{g.desc}</Text>
                  </View>
                </View>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.cta, !selected && styles.ctaDisabled]}
          onPress={handleNext}
          disabled={!selected}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Next →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  header: { gap: Spacing.xs },
  step: { fontSize: FontSize.sm, color: Colors.text3, fontWeight: FontWeight.medium },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.text1 },
  subtitle: { fontSize: FontSize.base, color: Colors.text2, lineHeight: 20 },
  progressTrack: { height: 3, backgroundColor: Colors.surface, borderRadius: Radius.full, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: Radius.full },
  goals: { gap: Spacing.sm },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  emoji: { fontSize: 28 },
  cardText: { gap: 2, flex: 1 },
  cardLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text1 },
  cardLabelSelected: { color: Colors.accent },
  cardDesc: { fontSize: FontSize.sm, color: Colors.text2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: Radius.full, backgroundColor: Colors.accent },
  cta: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff' },
})
