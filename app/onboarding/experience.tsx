// Agent 1 — Onboarding: Gym experience level
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

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'

type BaseParams = { name: string; age: number; sex: Sex; weight_kg: number; height_cm: number; goal: Goal }
type RootParamList = {
  Experience: BaseParams
  FoodUnits:  BaseParams & { experience: ExperienceLevel }
}

const LEVELS: { value: ExperienceLevel; label: string; desc: string; emoji: string }[] = [
  {
    value: 'beginner',
    label: 'Beginner',
    desc: 'Less than 1 year of consistent training',
    emoji: '🌱',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    desc: '1–3 years, following a structured programme',
    emoji: '🏃',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    desc: '3+ years, tracking lifts and periodising',
    emoji: '🏆',
  },
]

export default function ExperienceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList, 'Experience'>>()
  const route      = useRoute<RouteProp<RootParamList, 'Experience'>>()
  const params     = route.params

  const [selected, setSelected] = useState<ExperienceLevel | null>(null)

  React.useEffect(() => { track('onboarding_experience_viewed') }, [])

  function handleNext() {
    if (!selected) return
    track('onboarding_experience_selected', { level: selected })
    navigation.navigate('FoodUnits', { ...params, experience: selected })
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.step}>3 of 5</Text>
          <Text style={styles.title}>Training experience</Text>
          <Text style={styles.subtitle}>This helps us recommend sensible exercise defaults and volume.</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '75%' }]} />
        </View>

        {/* Level cards */}
        <View style={styles.levels}>
          {LEVELS.map((l) => {
            const isSelected = selected === l.value
            return (
              <TouchableOpacity
                key={l.value}
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => setSelected(l.value)}
                activeOpacity={0.8}
              >
                <Text style={styles.emoji}>{l.emoji}</Text>
                <View style={styles.cardText}>
                  <Text style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}>
                    {l.label}
                  </Text>
                  <Text style={styles.cardDesc}>{l.desc}</Text>
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
  levels: { gap: Spacing.sm },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  emoji: { fontSize: 32, width: 40 },
  cardText: { flex: 1, gap: 2 },
  cardLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text1 },
  cardLabelSelected: { color: Colors.accent },
  cardDesc: { fontSize: FontSize.sm, color: Colors.text2, lineHeight: 18 },
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
