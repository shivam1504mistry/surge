// Agent 1 — Onboarding: Accountability person setup + save to Supabase
// This is the final onboarding step. On completion:
//   1. Calculate TDEE/macros via calculateTargets()
//   2. Upsert to users table
//   3. Send coach WhatsApp notification via send-whatsapp Edge Function
//   4. Set profile in userStore → App.tsx navigates to MainTabs automatically
import React, { useState } from 'react'
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
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRoute } from '@react-navigation/native'
import { RouteProp } from '@react-navigation/native'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme'
import { Goal, Sex, calculateTargets } from '../../constants/macros'
import { ExperienceLevel } from './experience'
import { FoodUnitPref } from './food-units'
import { supabase } from '../../lib/supabase'
import { useUserStore } from '../../stores/userStore'
import { track } from '../../lib/analytics'

type BaseParams = {
  name: string; age: number; sex: Sex; weight_kg: number; height_cm: number
  goal: Goal; experience: ExperienceLevel; food_unit_pref: FoodUnitPref
}
type RootParamList = { Accountability: BaseParams }

const APP_DOWNLOAD_LINK = 'https://expo.dev/accounts/shivam1504mistry/projects/surge/builds/ad01b2eb-7f53-4d02-b33b-e2d710fbb4dd'

const ACC_COUNTRIES = [
  { flag: '🇮🇳', name: 'India',         code: '+91',  maxLen: 10 },
  { flag: '🇺🇸', name: 'United States', code: '+1',   maxLen: 10 },
  { flag: '🇬🇧', name: 'United Kingdom',code: '+44',  maxLen: 10 },
  { flag: '🇦🇪', name: 'UAE',           code: '+971', maxLen: 9  },
  { flag: '🇸🇬', name: 'Singapore',     code: '+65',  maxLen: 8  },
  { flag: '🇦🇺', name: 'Australia',     code: '+61',  maxLen: 9  },
  { flag: '🇨🇦', name: 'Canada',        code: '+1',   maxLen: 10 },
]
type AccCountry = typeof ACC_COUNTRIES[number]

type Freq = 'daily' | 'weekly'

const FREQ_OPTIONS: { value: Freq; label: string; desc: string }[] = [
  { value: 'daily',  label: 'Daily summary',  desc: 'Every evening at 9 PM' },
  { value: 'weekly', label: 'Weekly report',  desc: 'Every Sunday at 9 PM' },
]

export default function AccountabilityScreen() {
  const route    = useRoute<RouteProp<RootParamList, 'Accountability'>>()
  const params   = route.params
  const setProfile             = useUserStore((s) => s.setProfile)
  const session                = useUserStore((s) => s.session)
  const pendingReferralCode    = useUserStore((s) => s.pendingReferralCode)
  const setPendingReferralCode = useUserStore((s) => s.setPendingReferralCode)

  const [saving, setSaving] = useState(false)
  const [accName,  setAccName]  = useState('')
  const [accPhone, setAccPhone] = useState('')

  React.useEffect(() => { track('onboarding_accountability_viewed') }, [])

  // Editable targets — pre-filled from calculation, user can override
  const defaultTargets = React.useMemo(() => calculateTargets({
    weight_kg: params.weight_kg, height_cm: params.height_cm,
    age: params.age, sex: params.sex, goal: params.goal,
  }), [])
  const [calories,  setCalories]  = useState(String(defaultTargets.calories))
  const [proteinG,  setProteinG]  = useState(String(defaultTargets.protein_g))
  const [carbsG,    setCarbsG]    = useState(String(defaultTargets.carbs_g))
  const [fatG,      setFatG]      = useState(String(defaultTargets.fat_g))

  function generateReferralCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = 'SURGE-'
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return code
  }

  async function getUniqueReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateReferralCode()
      const { data } = await supabase.from('users').select('id').eq('referral_code', code).maybeSingle()
      if (!data) return code
    }
    return generateReferralCode()
  }

  async function handleFinish() {
    setSaving(true)
    try {
      const user = session?.user
      if (!user) throw new Error('Not authenticated')

      const referralCode = await getUniqueReferralCode()

      // Validate referred_by code — look up the referrer
      let referrerId: string | null = null
      if (pendingReferralCode) {
        const { data: referrer } = await supabase
          .from('users').select('id').eq('referral_code', pendingReferralCode).maybeSingle()
        referrerId = referrer?.id ?? null
      }

      const profileData = {
        id:               user.id,
        phone:            user.phone ?? null,
        email:            user.email ?? null,
        name:             params.name,
        age:              params.age,
        sex:              params.sex,
        weight_kg:        params.weight_kg,
        height_cm:        params.height_cm,
        goal:                 params.goal,
        unit_pref:            'kg' as const,
        food_unit_pref:       params.food_unit_pref,
        accountability_name:  accName.trim() || null,
        accountability_phone: accPhone.trim() || null,
        calorie_target:   parseInt(calories)  || defaultTargets.calories,
        protein_target_g: parseInt(proteinG)  || defaultTargets.protein_g,
        carbs_target_g:   parseInt(carbsG)    || defaultTargets.carbs_g,
        fat_target_g:     parseInt(fatG)      || defaultTargets.fat_g,
        tier:             'free' as const,
        referral_code:    referralCode,
        referred_by:      pendingReferralCode ?? null,
      }

      const { error } = await supabase.from('users').upsert(profileData)
      if (error) throw error

      // Log referral if a valid referrer was found
      if (referrerId) {
        await supabase.from('referrals').insert({
          referrer_user_id: referrerId,
          referred_user_id: user.id,
        })
      }

      setPendingReferralCode(null)
      track('onboarding_complete', { goal: params.goal, experience: params.experience })
      setProfile(profileData as any)
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
            <Text style={styles.step}>5 of 5</Text>
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

          {/* Accountability partner — name + phone (functional) */}
          <View style={styles.accCard}>
            <View style={styles.accHeader}>
              <View>
                <Text style={styles.comingSoonTitle}>Accountability partner</Text>
                <Text style={styles.comingSoonSub}>Optional — skip if you prefer</Text>
              </View>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonBadgeText}>Auto-reports coming soon</Text>
              </View>
            </View>
            <View style={styles.comingSoonFields}>
              <View style={styles.field}>
                <Text style={styles.label}>Their name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Coach Rajan"
                  placeholderTextColor={Colors.text3}
                  value={accName}
                  onChangeText={setAccName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>WhatsApp number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={Colors.text3}
                  value={accPhone}
                  onChangeText={setAccPhone}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                />
              </View>
            </View>
          </View>

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
  countryChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    height:            52,
    paddingHorizontal: Spacing.sm,
    backgroundColor:   Colors.surface,
    borderRadius:      Radius.md,
    borderWidth:       1,
    borderColor:       Colors.border,
  },
  countryChipText: { fontSize: FontSize.base, color: Colors.text1, fontWeight: FontWeight.semibold },
  countryChipArrow: { fontSize: 10, color: Colors.text3, marginTop: 2 },
  phoneInput: { flex: 1 },

  // Country picker modal
  pickerOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent:  'flex-end',
  },
  pickerSheet: {
    backgroundColor:      Colors.surface,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    paddingTop:           Spacing.md,
    paddingBottom:        Spacing.xxl,
    maxHeight:            '60%',
  },
  pickerTitle: {
    fontSize:          FontSize.md,
    fontWeight:        FontWeight.bold,
    color:             Colors.text1,
    textAlign:         'center',
    paddingBottom:     Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom:      Spacing.xs,
  },
  pickerRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical:   Spacing.md,
    gap:               Spacing.md,
  },
  pickerRowSelected: { backgroundColor: Colors.accentSoft },
  pickerFlag:  { fontSize: 24 },
  pickerName:  { flex: 1, fontSize: FontSize.base, color: Colors.text1, fontWeight: FontWeight.medium },
  pickerCode:  { fontSize: FontSize.base, color: Colors.text2 },
  pickerCheck: { fontSize: FontSize.base, color: Colors.accent, fontWeight: FontWeight.bold },

  accCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    gap:             Spacing.md,
  },
  accHeader: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
  },
  comingSoonCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    gap:             Spacing.md,
    opacity:         0.6,
  },
  comingSoonHeader: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
  },
  comingSoonTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text1 },
  comingSoonSub:   { fontSize: FontSize.xs, color: Colors.text2, marginTop: 2 },
  comingSoonBadge: {
    backgroundColor:   Colors.surface,
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical:   3,
  },
  comingSoonBadgeText: { fontSize: FontSize.xs, color: Colors.text3, fontWeight: FontWeight.semibold },
  comingSoonFields:    { gap: Spacing.sm },
  comingSoonInput: {
    justifyContent: 'center',
    backgroundColor: Colors.bg,
  },
  comingSoonPlaceholder: { fontSize: FontSize.base, color: Colors.text3 },

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
