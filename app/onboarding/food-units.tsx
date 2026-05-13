// Agent 1 — Onboarding: Food unit preference
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
import { ExperienceLevel } from './experience'
import { track } from '../../lib/analytics'

export type FoodUnitPref = 'metric' | 'imperial' | 'natural'

type BaseParams = {
  name: string; age: number; sex: Sex; weight_kg: number; height_cm: number
  goal: Goal; experience: ExperienceLevel
}
type RootParamList = {
  FoodUnits:      BaseParams
  Accountability: BaseParams & { food_unit_pref: FoodUnitPref }
}

const OPTIONS: { value: FoodUnitPref; label: string; desc: string; examples: string; emoji: string }[] = [
  {
    value:    'metric',
    label:    'Grams & ml',
    desc:     'Standard metric units',
    examples: '200g tofu, 250ml milk, 30g oats',
    emoji:    '⚖️',
  },
  {
    value:    'imperial',
    label:    'Oz, cups & tbsp',
    desc:     'US imperial units',
    examples: '6oz tofu, 1 cup soy milk, 2 tbsp peanut butter',
    emoji:    '🥄',
  },
  {
    value:    'natural',
    label:    'Portions & pieces',
    desc:     'Natural language — great for Indian meals',
    examples: '2 rotis, 1 katori dal, 1 medium bowl rice',
    emoji:    '🍱',
  },
]

export default function FoodUnitsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>()
  const route      = useRoute<RouteProp<RootParamList, 'FoodUnits'>>()
  const params     = route.params

  const [selected, setSelected] = useState<FoodUnitPref>('metric')

  React.useEffect(() => { track('onboarding_food_units_viewed') }, [])

  function handleNext() {
    track('onboarding_food_units_selected', { unit_pref: selected })
    navigation.navigate('Accountability', { ...params, food_unit_pref: selected })
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.step}>4 of 5</Text>
          <Text style={styles.title}>How do you measure food?</Text>
          <Text style={styles.subtitle}>
            We'll use this when parsing your voice and image logs — you can change it anytime in settings.
          </Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '80%' }]} />
        </View>

        {/* Option cards */}
        <View style={styles.options}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.value
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => setSelected(opt.value)}
                activeOpacity={0.8}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.emoji}>{opt.emoji}</Text>
                  <View style={styles.cardText}>
                    <Text style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.cardDesc}>{opt.desc}</Text>
                  </View>
                  <View style={[styles.radio, isSelected && styles.radioSelected]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                </View>
                <View style={[styles.examplesBox, isSelected && styles.examplesBoxSelected]}>
                  <Text style={[styles.examplesText, isSelected && styles.examplesTextSelected]}>
                    e.g. {opt.examples}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.cta}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Next →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  header: { gap: Spacing.xs },
  step:   { fontSize: FontSize.sm, color: Colors.text3, fontWeight: FontWeight.medium },
  title:  { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.text1 },
  subtitle: { fontSize: FontSize.base, color: Colors.text2, lineHeight: 20 },
  progressTrack: { height: 3, backgroundColor: Colors.surface, borderRadius: Radius.full, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: Colors.accent, borderRadius: Radius.full },
  options: { gap: Spacing.sm },
  card: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.md,
    padding:         Spacing.md,
    borderWidth:     1,
    borderColor:     Colors.border,
    gap:             Spacing.sm,
  },
  cardSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  emoji:   { fontSize: 28, width: 36 },
  cardText:  { flex: 1, gap: 2 },
  cardLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text1 },
  cardLabelSelected: { color: Colors.accent },
  cardDesc: { fontSize: FontSize.sm, color: Colors.text2 },
  radio: {
    width:           22,
    height:          22,
    borderRadius:    Radius.full,
    borderWidth:     2,
    borderColor:     Colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  radioSelected: { borderColor: Colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: Radius.full, backgroundColor: Colors.accent },
  examplesBox: {
    backgroundColor: Colors.bg,
    borderRadius:    Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
  },
  examplesBoxSelected: { backgroundColor: 'rgba(255,77,0,0.08)' },
  examplesText:        { fontSize: FontSize.xs, color: Colors.text3, lineHeight: 18 },
  examplesTextSelected: { color: Colors.accent, opacity: 0.9 },
  cta: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.full,
    height:          56,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       Spacing.sm,
  },
  ctaText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff' },
})
