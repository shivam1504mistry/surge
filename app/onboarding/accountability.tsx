// Agent 1 — Onboarding: Accountability person setup + save to Supabase
// This is the final onboarding step. On completion:
//   1. Calculate TDEE/macros via calculateTargets()
//   2. Upsert to users table
//   3. Set profile in userStore → App.tsx navigates to MainTabs automatically
import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useRoute } from '@react-navigation/native'
import { RouteProp } from '@react-navigation/native'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme'
import { Goal, Sex, calculateTargets } from '../../constants/macros'
import { ExperienceLevel } from './experience'
import { supabase } from '../../lib/supabase'
import { useUserStore } from '../../stores/userStore'

type BaseParams = {
  name: string; age: number; sex: Sex; weight_kg: number; height_cm: number
  goal: Goal; experience: ExperienceLevel
}
type RootParamList = { Accountability: BaseParams }

type Freq = 'daily' | 'weekly'

const FREQ_OPTIONS: { value: Freq; label: string; desc: string }[] = [
  { value: 'daily',  label: 'Daily summary',  desc: 'Every evening at 9 PM' },
  { value: 'weekly', label: 'Weekly report',  desc: 'Every Sunday at 9 PM' },
]

export default function AccountabilityScreen() {
  const route    = useRoute<RouteProp<RootParamList, 'Accountability'>>()
  const params   = route.params
  const setProfile = useUserStore((s) => s.setProfile)
  const session    = useUserStore((s) => s.session)

  const [accName,  setAccName]  = useState('')
  const [accPhone, setAccPhone] = useState('')
  const [accFreq,  setAccFreq]  = useState<Freq>('weekly')
  const [skip,     setSkip]     = useState(false)
  const [saving,   setSaving]   = useState(false)

  // Editable targets — pre-filled from calculation, user can override
  const defaultTargets = React.useMemo(() => calculateTargets({
    weight_kg: params.weight_kg, height_cm: params.height_cm,
    age: params.age, sex: params.sex, goal: params.goal,
  }), [])
  const [calories,  setCalories]  = useState(String(defaultTargets.calories))
  const [proteinG,  setProteinG]  = useState(String(defaultTargets.protein_g))
  const [carbsG,    setCarbsG]    = useState(String(defaultTargets.carbs_g))
  const [fatG,      setFatG]      = useState(String(defaultTargets.fat_g))

  async function handleFinish() {
    if (!skip && accPhone && accPhone.length < 10) {
      Alert.alert('Enter a valid phone number for your accountability partner')
      return
    }

    setSaving(true)
    try {
      const user = session?.user
      if (!user) throw new Error('Not authenticated')

      const profileData = {
        id:                   user.id,
        phone:                user.phone ?? null,
        email:                user.email ?? null,
        name:                 params.name,
        age:                  params.age,
        sex:                  params.sex,
        weight_kg:            params.weight_kg,
        height_cm:            params.height_cm,
        goal:                 params.goal,
        unit_pref:            'kg' as const,
        calorie_target:       parseInt(calories)  || defaultTargets.calories,
        protein_target_g:     parseInt(proteinG)  || defaultTargets.protein_g,
        carbs_target_g:       parseInt(carbsG)    || defaultTargets.carbs_g,
        fat_target_g:         parseInt(fatG)      || defaultTargets.fat_g,
        tier:                 'free' as const,
        accountability_name:  skip ? undefined : accName.trim() || undefined,
        accountability_phone: skip ? undefined : accPhone.trim() || undefined,
        accountability_freq:  skip ? undefined : accFreq,
      }

      const { error } = await supabase.from('users').upsert(profileData)
      if (error) throw error

      setProfile(profileData)
      // App.tsx detects profile != null → navigates to MainTabs
    } catch (err: any) {
      Alert.alert('Could not save profile', err.message ?? 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.step}>4 of 4</Text>
            <Text style={styles.title}>Who keeps you honest?</Text>
            <Text style={styles.subtitle}>
              People who share their progress with someone are{' '}
              <Text style={styles.subtitleHighlight}>65% more likely to reach their goals.</Text>
              {' '}Add a coach, friend, or family member — they'll get a weekly snapshot automatically.
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '100%' }]} />
          </View>

          {/* Editable targets card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Your daily targets — tap to adjust</Text>
            <Text style={styles.summaryHint}>These are calculated from your profile. You can change them anytime from the Profile tab.</Text>
            <View style={styles.macroRow}>
              {[
                { label: 'Calories', value: calories, setValue: setCalories, unit: 'kcal', color: Colors.accent },
                { label: 'Protein',  value: proteinG, setValue: setProteinG, unit: 'g',    color: Colors.green },
                { label: 'Carbs',    value: carbsG,   setValue: setCarbsG,   unit: 'g',    color: Colors.blue },
                { label: 'Fat',      value: fatG,     setValue: setFatG,     unit: 'g',    color: Colors.warning },
              ].map((m) => (
                <View key={m.label} style={styles.macroCell}>
                  <TextInput
                    style={[styles.macroInput, { color: m.color }]}
                    value={m.value}
                    onChangeText={m.setValue}
                    keyboardType="number-pad"
                    maxLength={4}
                    selectTextOnFocus
                  />
                  <Text style={styles.macroUnit}>{m.unit}</Text>
                  <Text style={styles.macroLabel}>{m.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {!skip && (
            <>
              {/* Name */}
              <View style={styles.field}>
                <Text style={styles.label}>Their name</Text>
                <TextInput
                  style={styles.input}
                  value={accName}
                  onChangeText={setAccName}
                  placeholder="e.g. Coach Rajan"
                  placeholderTextColor={Colors.text3}
                  autoCapitalize="words"
                />
              </View>

              {/* Phone */}
              <View style={styles.field}>
                <Text style={styles.label}>WhatsApp number</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.flag}>
                    <Text style={styles.flagText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.phoneInput]}
                    value={accPhone}
                    onChangeText={(v) => setAccPhone(v.replace(/\D/g, '').slice(0, 10))}
                    placeholder="98765 43210"
                    placeholderTextColor={Colors.text3}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                </View>
              </View>

              {/* Frequency */}
              <View style={styles.field}>
                <Text style={styles.label}>Send reports</Text>
                <View style={styles.freqRow}>
                  {FREQ_OPTIONS.map((f) => (
                    <TouchableOpacity
                      key={f.value}
                      style={[styles.freqBtn, accFreq === f.value && styles.freqBtnSelected]}
                      onPress={() => setAccFreq(f.value)}
                    >
                      <Text style={[styles.freqText, accFreq === f.value && styles.freqTextSelected]}>
                        {f.label}
                      </Text>
                      <Text style={[styles.freqDesc, accFreq === f.value && styles.freqDescSelected]}>
                        {f.desc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}

          {/* Skip button */}
          <TouchableOpacity style={[styles.skipBtn, skip && styles.skipBtnActive]} onPress={() => setSkip((s) => !s)}>
            <Text style={[styles.skipBtnText, skip && styles.skipBtnTextActive]}>
              {skip ? '✓ Skipping accountability' : 'Skip for now — add later in Profile'}
            </Text>
          </TouchableOpacity>

          {/* CTA */}
          <TouchableOpacity
            style={[styles.cta, saving && styles.ctaDisabled]}
            onPress={handleFinish}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.ctaText}>Let's go ⚡</Text>
            }
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
  progressTrack: { height: 3, backgroundColor: Colors.surface, borderRadius: Radius.full, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: Radius.full },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subtitleHighlight: { color: Colors.accent, fontWeight: FontWeight.semibold },
  summaryTitle: { fontSize: FontSize.sm, color: Colors.text2, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryHint: { fontSize: FontSize.xs, color: Colors.text3, lineHeight: 16 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between' },
  macroCell: { alignItems: 'center', gap: 2, flex: 1 },
  macroInput: {
    fontSize:  FontSize.xl,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    padding:   0,
    minWidth:  60,
  },
  macroUnit: { fontSize: FontSize.xs, color: Colors.text3 },
  macroLabel: { fontSize: FontSize.xs, color: Colors.text2 },

  field: { gap: Spacing.xs },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text2, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    height: 52,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text1,
    borderWidth: 1,
    borderColor: Colors.border,
    flex: 1,
  },
  phoneRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  flag: {
    height: 52,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: { fontSize: FontSize.base, color: Colors.text1, fontWeight: FontWeight.medium },
  phoneInput: { flex: 1 },

  freqRow: { gap: Spacing.xs },
  freqBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  freqBtnSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  freqText: { fontSize: FontSize.base, color: Colors.text2, fontWeight: FontWeight.medium },
  freqTextSelected: { color: Colors.accent, fontWeight: FontWeight.semibold },
  freqDesc: { fontSize: FontSize.xs, color: Colors.text3, marginTop: 2 },
  freqDescSelected: { color: Colors.accent, opacity: 0.8 },

  skipBtn: {
    borderWidth:     1.5,
    borderColor:     Colors.border,
    borderRadius:    Radius.full,
    height:          52,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: Spacing.lg,
  },
  skipBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  skipBtnText: { fontSize: FontSize.base, color: Colors.text2, fontWeight: FontWeight.semibold },
  skipBtnTextActive: { color: Colors.accent },

  cta: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff' },
})
