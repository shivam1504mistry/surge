/**
 * profile.tsx — Profile screen
 * Shows name, goal, daily targets.
 * Edit button → change weight, goal, targets → recalculates + saves to Supabase.
 */
import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors, FontSize, FontWeight, Radius, Spacing, BOTTOM_SAFE_PADDING } from '../../constants/theme'
import { useUserStore } from '../../stores/userStore'
import { supabase } from '../../lib/supabase'
import SupportButton from '../../components/SupportButton'
import { Goal, Sex, calculateTargets } from '../../constants/macros'

const GOAL_LABELS: Record<Goal, string> = {
  fat_loss:    'Fat Loss',
  muscle_gain: 'Muscle Gain',
  recomp:      'Body Recomp',
  maintain:    'Maintain',
  performance: 'Performance',
}

const GOAL_OPTIONS: Goal[] = ['fat_loss', 'muscle_gain', 'recomp', 'maintain', 'performance']

export default function ProfileScreen() {
  const { profile, setProfile } = useUserStore()
  const insets = useSafeAreaInsets()

  const [showEdit, setShowEdit]   = useState(false)
  const [saving,   setSaving]     = useState(false)

  // Edit state — pre-filled from profile
  const [weight,   setWeight]   = useState(String(profile?.weight_kg   ?? ''))
  const [goal,     setGoal]     = useState<Goal>((profile?.goal as Goal) ?? 'maintain')
  const [calories, setCalories] = useState(String(profile?.calorie_target   ?? ''))
  const [proteinG, setProteinG] = useState(String(profile?.protein_target_g ?? ''))
  const [carbsG,   setCarbsG]   = useState(String(profile?.carbs_target_g   ?? ''))
  const [fatG,     setFatG]     = useState(String(profile?.fat_target_g     ?? ''))

  function recalculate(newWeight?: string, newGoal?: Goal) {
    if (!profile) return
    const w = parseFloat(newWeight ?? weight)
    const g = newGoal ?? goal
    if (!w || w < 20) return
    const t = calculateTargets({
      weight_kg: w,
      height_cm: profile.height_cm,
      age:       profile.age,
      sex:       profile.sex as Sex,
      goal:      g,
    })
    setCalories(String(t.calories))
    setProteinG(String(t.protein_g))
    setCarbsG(String(t.carbs_g))
    setFatG(String(t.fat_g))
  }

  function openEdit() {
    // Reset to current profile values
    setWeight(String(profile?.weight_kg   ?? ''))
    setGoal((profile?.goal as Goal)       ?? 'maintain')
    setCalories(String(profile?.calorie_target   ?? ''))
    setProteinG(String(profile?.protein_target_g ?? ''))
    setCarbsG(String(profile?.carbs_target_g     ?? ''))
    setFatG(String(profile?.fat_target_g         ?? ''))
    setShowEdit(true)
  }

  async function handleSave() {
    if (!profile) return
    const w = parseFloat(weight)
    if (!w || w < 20 || w > 400) { Alert.alert('Enter a valid weight'); return }

    setSaving(true)
    try {
      const updates = {
        weight_kg:        w,
        goal:             goal,
        calorie_target:   parseInt(calories)  || profile.calorie_target,
        protein_target_g: parseInt(proteinG)  || profile.protein_target_g,
        carbs_target_g:   parseInt(carbsG)    || profile.carbs_target_g,
        fat_target_g:     parseInt(fatG)      || profile.fat_target_g,
      }
      const { error } = await supabase.from('users').update(updates).eq('id', profile.id)
      if (error) throw error
      setProfile({ ...profile, ...updates })
      setShowEdit(false)
    } catch (err: any) {
      Alert.alert('Could not save', err.message ?? 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>👤 Profile</Text>
          <SupportButton />
        </View>

        {/* ── Profile card ── */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarEmoji}>⚡</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{profile?.name ?? 'Athlete'}</Text>
            <Text style={styles.profileGoal}>
              {profile?.goal ? GOAL_LABELS[profile.goal as Goal] : '—'}
              {profile?.weight_kg ? `  ·  ${profile.weight_kg} kg` : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={openEdit} activeOpacity={0.8}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* ── Daily targets ── */}
        {profile && (
          <View style={styles.targetsCard}>
            <Text style={styles.sectionTitle}>Daily Targets</Text>
            <Text style={styles.targetsHint}>Tap Edit to update weight, goal, or targets</Text>
            <View style={styles.targetsRow}>
              {[
                { label: 'Calories', value: `${profile.calorie_target}`,    unit: 'kcal', color: Colors.accent },
                { label: 'Protein',  value: `${profile.protein_target_g}`,  unit: 'g',    color: Colors.green },
                { label: 'Carbs',    value: `${profile.carbs_target_g}`,    unit: 'g',    color: Colors.blue },
                { label: 'Fat',      value: `${profile.fat_target_g}`,      unit: 'g',    color: Colors.warning },
              ].map(t => (
                <View key={t.label} style={styles.targetItem}>
                  <Text style={[styles.targetValue, { color: t.color }]}>{t.value}</Text>
                  <Text style={styles.targetUnit}>{t.unit}</Text>
                  <Text style={styles.targetLabel}>{t.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Account ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={() => Alert.alert('Sign out', 'Are you sure?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: async () => {
                await supabase.auth.signOut()
                useUserStore.getState().setSession(null)
                useUserStore.getState().setProfile(null)
              }},
            ])}
            activeOpacity={0.8}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ── Edit modal ── */}
      <Modal visible={showEdit} animationType="slide" onRequestClose={() => setShowEdit(false)}>
        <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
          <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, Spacing.md) }]}>
            <TouchableOpacity onPress={() => setShowEdit(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator color={Colors.accent} />
                : <Text style={styles.modalSave}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">

            {/* Weight */}
            <Text style={styles.fieldLabel}>Weight (kg)</Text>
            <TextInput
              style={styles.input}
              value={weight}
              onChangeText={(v) => {
                setWeight(v)
                recalculate(v, undefined)
              }}
              placeholder="e.g. 78"
              placeholderTextColor={Colors.text3}
              keyboardType="decimal-pad"
            />

            {/* Goal */}
            <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Goal</Text>
            <View style={styles.goalGrid}>
              {GOAL_OPTIONS.map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.goalChip, goal === g && styles.goalChipSelected]}
                  onPress={() => {
                    setGoal(g)
                    recalculate(undefined, g)
                  }}
                >
                  <Text style={[styles.goalChipText, goal === g && styles.goalChipTextSelected]}>
                    {GOAL_LABELS[g]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Targets — editable, auto-filled from recalculate */}
            <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Daily Targets</Text>
            <Text style={styles.targetsHint}>Auto-calculated from your weight + goal. Tap any value to override.</Text>

            <View style={styles.targetsEditRow}>
              {[
                { label: 'Calories', value: calories, setter: setCalories, unit: 'kcal', color: Colors.accent },
                { label: 'Protein',  value: proteinG, setter: setProteinG, unit: 'g',    color: Colors.green },
                { label: 'Carbs',    value: carbsG,   setter: setCarbsG,   unit: 'g',    color: Colors.blue },
                { label: 'Fat',      value: fatG,     setter: setFatG,     unit: 'g',    color: Colors.warning },
              ].map(t => (
                <View key={t.label} style={styles.targetEditCell}>
                  <TextInput
                    style={[styles.targetEditInput, { color: t.color }]}
                    value={t.value}
                    onChangeText={t.setter}
                    keyboardType="number-pad"
                    maxLength={4}
                    selectTextOnFocus
                  />
                  <Text style={styles.targetUnit}>{t.unit}</Text>
                  <Text style={styles.targetLabel}>{t.label}</Text>
                </View>
              ))}
            </View>

          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  scroll:  { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: BOTTOM_SAFE_PADDING, gap: Spacing.md },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  headerTitle: { fontSize: FontSize.xxl, color: Colors.text1, fontWeight: FontWeight.black },

  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing.md,
  },
  avatarCircle: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: Colors.accentSoft,
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarEmoji:  { fontSize: 24 },
  profileName:  { fontSize: FontSize.md, color: Colors.text1, fontWeight: FontWeight.bold },
  profileGoal:  { fontSize: FontSize.sm, color: Colors.text2, marginTop: 2 },
  editBtn: {
    backgroundColor:   Colors.surface,
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical:   6,
  },
  editBtnText: { fontSize: FontSize.sm, color: Colors.text1, fontWeight: FontWeight.semibold },

  targetsCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    gap:             Spacing.sm,
  },
  sectionTitle: { fontSize: FontSize.md, color: Colors.text1, fontWeight: FontWeight.bold },
  targetsHint:  { fontSize: FontSize.xs, color: Colors.text3 },
  targetsRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  targetItem:   { alignItems: 'center', gap: 2 },
  targetValue:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  targetUnit:   { fontSize: FontSize.xs, color: Colors.text3 },
  targetLabel:  { fontSize: FontSize.xs, color: Colors.text3 },

  section: { gap: Spacing.sm },
  signOutBtn: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     Colors.border,
    height:          48,
    alignItems:      'center',
    justifyContent:  'center',
  },
  signOutText: { fontSize: FontSize.base, color: Colors.text2, fontWeight: FontWeight.medium },

  // Modal
  modalSafe: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    padding:           Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle:  { fontSize: FontSize.md, color: Colors.text1, fontWeight: FontWeight.bold },
  modalCancel: { fontSize: FontSize.base, color: Colors.text3 },
  modalSave:   { fontSize: FontSize.base, color: Colors.accent, fontWeight: FontWeight.bold },
  modalContent: { padding: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.sm },

  fieldLabel: { fontSize: FontSize.sm, color: Colors.text2, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor:   Colors.surface,
    borderRadius:      Radius.md,
    borderWidth:       1,
    borderColor:       Colors.border,
    height:            52,
    paddingHorizontal: Spacing.md,
    fontSize:          FontSize.md,
    color:             Colors.text1,
  },

  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  goalChip: {
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical:   8,
    backgroundColor:   Colors.surface,
  },
  goalChipSelected:     { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  goalChipText:         { fontSize: FontSize.sm, color: Colors.text2, fontWeight: FontWeight.medium },
  goalChipTextSelected: { color: Colors.accent, fontWeight: FontWeight.semibold },

  targetsEditRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  targetEditCell: { alignItems: 'center', gap: 2, flex: 1 },
  targetEditInput: {
    fontSize:   FontSize.xl,
    fontWeight: FontWeight.bold,
    textAlign:  'center',
    padding:    0,
    minWidth:   60,
  },
})
