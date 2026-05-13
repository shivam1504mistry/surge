// Agent 1 — Onboarding: Profile setup (name, age, sex, weight, height)
import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme'
import { Sex } from '../../constants/macros'
import { supabase } from '../../lib/supabase'
import { useUserStore } from '../../stores/userStore'
import { track } from '../../lib/analytics'

type RootParamList = {
  Goals: { name: string; age: number; sex: Sex; weight_kg: number; height_cm: number }
}

export default function ProfileSetupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>()

  const [name, setName]           = useState('')
  const [age, setAge]             = useState('')
  const [sex, setSex]             = useState<Sex | null>(null)
  const [weight, setWeight]       = useState('')
  const [height, setHeight]       = useState('')
  const [heightFt, setHeightFt]   = useState('')
  const [heightIn, setHeightIn]   = useState('')
  const [unitKg, setUnitKg]       = useState(true)   // weight unit toggle
  const [unitCm, setUnitCm]       = useState(true)   // height unit toggle

  useEffect(() => { track('onboarding_profile_viewed') }, [])

  function validate(): boolean {
    if (!name.trim())              { Alert.alert('Name required'); return false }
    const ageNum = parseInt(age)
    if (!age || ageNum < 13 || ageNum > 100) { Alert.alert('Enter a valid age (13–100)'); return false }
    if (!sex)                      { Alert.alert('Please select your biological sex'); return false }
    const wNum = parseFloat(weight)
    if (!weight || wNum < 20 || wNum > 400) { Alert.alert('Enter a valid weight'); return false }
    if (unitCm) {
      const hNum = parseFloat(height)
      if (!height || hNum < 100 || hNum > 250) { Alert.alert('Enter a valid height in cm (100–250)'); return false }
    } else {
      const ft = parseInt(heightFt)
      const inches = parseInt(heightIn || '0')
      if (!heightFt || ft < 3 || ft > 8) { Alert.alert('Enter a valid height in feet (3–8)'); return false }
      if (inches < 0 || inches > 11)      { Alert.alert('Inches must be between 0 and 11'); return false }
    }
    return true
  }

  function handleNext() {
    if (!validate()) return
    track('onboarding_profile_next')
    const weight_kg = unitKg ? parseFloat(weight) : parseFloat(weight) * 0.453592
    let height_cm: number
    if (unitCm) {
      height_cm = parseFloat(height)
    } else {
      const ft = parseInt(heightFt)
      const inches = parseInt(heightIn || '0')
      height_cm = Math.round((ft * 30.48) + (inches * 2.54))
    }
    navigation.navigate('Goals', {
      name:       name.trim(),
      age:        parseInt(age),
      sex:        sex!,
      weight_kg:  Math.round(weight_kg * 10) / 10,
      height_cm,
    })
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.step}>1 of 4</Text>
            <Text style={styles.title}>Tell us about yourself</Text>
            <Text style={styles.subtitle}>Your targets are calculated from this — be accurate.</Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '25%' }]} />
          </View>

          {/* Name */}
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Shivam"
              placeholderTextColor={Colors.text3}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          {/* Age */}
          <View style={styles.field}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={styles.input}
              value={age}
              onChangeText={setAge}
              placeholder="e.g. 28"
              placeholderTextColor={Colors.text3}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>

          {/* Sex */}
          <View style={styles.field}>
            <Text style={styles.label}>Biological sex</Text>
            <Text style={styles.fieldHint}>Used for accurate calorie calculation</Text>
            <View style={styles.chipRow}>
              {(['male', 'female', 'other'] as Sex[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, sex === s && styles.chipSelected]}
                  onPress={() => setSex(s)}
                >
                  <Text style={[styles.chipText, sex === s && styles.chipTextSelected]}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Weight */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Weight</Text>
              <View style={styles.unitToggle}>
                <TouchableOpacity
                  style={[styles.unitBtn, unitKg && styles.unitBtnActive]}
                  onPress={() => setUnitKg(true)}
                >
                  <Text style={[styles.unitText, unitKg && styles.unitTextActive]}>kg</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitBtn, !unitKg && styles.unitBtnActive]}
                  onPress={() => setUnitKg(false)}
                >
                  <Text style={[styles.unitText, !unitKg && styles.unitTextActive]}>lbs</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TextInput
              style={styles.input}
              value={weight}
              onChangeText={setWeight}
              placeholder={unitKg ? 'e.g. 78' : 'e.g. 172'}
              placeholderTextColor={Colors.text3}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Height */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Height</Text>
              <View style={styles.unitToggle}>
                <TouchableOpacity
                  style={[styles.unitBtn, unitCm && styles.unitBtnActive]}
                  onPress={() => setUnitCm(true)}
                >
                  <Text style={[styles.unitText, unitCm && styles.unitTextActive]}>cm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitBtn, !unitCm && styles.unitBtnActive]}
                  onPress={() => setUnitCm(false)}
                >
                  <Text style={[styles.unitText, !unitCm && styles.unitTextActive]}>ft/in</Text>
                </TouchableOpacity>
              </View>
            </View>
            {unitCm ? (
              <TextInput
                style={styles.input}
                value={height}
                onChangeText={setHeight}
                placeholder="e.g. 178"
                placeholderTextColor={Colors.text3}
                keyboardType="number-pad"
                maxLength={3}
              />
            ) : (
              <View style={styles.ftInRow}>
                <TextInput
                  style={[styles.input, styles.ftInput]}
                  value={heightFt}
                  onChangeText={setHeightFt}
                  placeholder="5"
                  placeholderTextColor={Colors.text3}
                  keyboardType="number-pad"
                  maxLength={1}
                />
                <Text style={styles.ftLabel}>ft</Text>
                <TextInput
                  style={[styles.input, styles.ftInput]}
                  value={heightIn}
                  onChangeText={setHeightIn}
                  placeholder="10"
                  placeholderTextColor={Colors.text3}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text style={styles.ftLabel}>in</Text>
              </View>
            )}
          </View>

          {/* CTA */}
          <TouchableOpacity style={styles.cta} onPress={handleNext} activeOpacity={0.85}>
            <Text style={styles.ctaText}>Next →</Text>
          </TouchableOpacity>

          {/* Sign out escape hatch */}
          <TouchableOpacity
            style={styles.signOutLink}
            onPress={async () => {
              await supabase.auth.signOut()
              useUserStore.getState().setSession(null)
              useUserStore.getState().setProfile(null)
            }}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  progressTrack: {
    height: 3,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
  },
  field: { gap: Spacing.xs },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text2, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldHint: { fontSize: FontSize.xs, color: Colors.text3 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    height: 52,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text1,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  chip: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontSize: FontSize.base, fontWeight: FontWeight.medium, color: Colors.text2 },
  chipTextSelected: { color: Colors.accent, fontWeight: FontWeight.semibold },
  ftInRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.xs,
  },
  ftInput: {
    flex: 1,
  },
  ftLabel: {
    fontSize:   FontSize.base,
    color:      Colors.text2,
    fontWeight: FontWeight.medium,
    minWidth:   18,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  unitBtnActive: { backgroundColor: Colors.accent },
  unitText: { fontSize: FontSize.sm, color: Colors.text2, fontWeight: FontWeight.medium },
  unitTextActive: { color: '#fff', fontWeight: FontWeight.bold },
  cta: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  ctaText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff' },
  signOutLink: { alignItems: 'center', paddingVertical: Spacing.sm },
  signOutText: { fontSize: FontSize.sm, color: Colors.text3 },
})
