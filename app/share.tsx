/**
 * share.tsx — Share Card screen
 *
 * Two features:
 * 1. One-time share — capture card as PNG → WhatsApp deep link / native share sheet / save to camera roll
 * 2. Scheduled report — store accountability phone + frequency → sends via Interakt (P0: store pref only)
 */
import React, { useRef, useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ViewShot from 'react-native-view-shot'
import * as MediaLibrary from 'expo-media-library'
import * as Sharing from 'expo-sharing'
import { useNavigation } from '@react-navigation/native'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme'
import ShareCard, { ShareCardData } from '../components/ShareCard'
import { useWorkoutStore } from '../stores/workoutStore'
import { useNutritionStore } from '../stores/nutritionStore'
import { useUserStore } from '../stores/userStore'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

// ---------------------------------------------------------------------------

export default function ShareScreen() {
  const navigation = useNavigation<any>()
  const viewShotRef = useRef<ViewShot>(null)

  const { todayExercises } = useWorkoutStore()
  const { getDailyTotals }  = useNutritionStore()
  const { profile }         = useUserStore()

  const [capturing, setCapturing] = useState(false)
  const [capturedUri, setCapturedUri] = useState<string | null>(null)

  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(
    !!(profile?.accountability_phone && profile?.accountability_freq)
  )
  const [schedPhone, setSchedPhone] = useState(profile?.accountability_phone ?? '')
  const [schedFreq,  setSchedFreq]  = useState<'daily' | 'weekly'>(
    profile?.accountability_freq ?? 'weekly'
  )
  const [savingSchedule, setSavingSchedule] = useState(false)

  // ---------------------------------------------------------------------------
  // Build card data
  // ---------------------------------------------------------------------------
  const macros  = getDailyTotals()
  const targets = {
    calories:  profile?.calorie_target    ?? 0,
    protein_g: profile?.protein_target_g  ?? 0,
    carbs_g:   profile?.carbs_target_g    ?? 0,
    fat_g:     profile?.fat_target_g      ?? 0,
  }

  const cardData: ShareCardData = {
    date:      new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }),
    userName:  profile?.name ?? 'Surge User',
    exercises: todayExercises.map(ex => ({
      name:      ex.exercise_name,
      sets:      ex.sets.length,
      topWeight: Math.max(0, ...ex.sets.map(s => s.weight_kg)),
      topReps:   ex.sets[ex.sets.length - 1]?.reps ?? 0,
    })),
    macros,
    targets,
  }

  // ---------------------------------------------------------------------------
  // Capture card as PNG
  // ---------------------------------------------------------------------------
  async function captureCard(): Promise<string | null> {
    if (!viewShotRef.current) return null
    setCapturing(true)
    try {
      const uri = await (viewShotRef.current as any).capture()
      setCapturedUri(uri)
      track('share_card_generated')
      return uri
    } catch (err: any) {
      Alert.alert('Error', 'Could not generate card. Please try again.')
      return null
    } finally {
      setCapturing(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Share actions
  // ---------------------------------------------------------------------------
  async function shareToWhatsApp() {
    const uri = capturedUri ?? await captureCard()
    if (!uri) return

    // WhatsApp deep link — opens WhatsApp with image attached
    const whatsappUrl = `whatsapp://send?text=My%20Surge%20log%20%E2%9A%A1`
    const canOpen = await Linking.canOpenURL(whatsappUrl)
    if (canOpen) {
      track('share_card_whatsapp')
      // Share image file via expo-sharing first (WhatsApp picks it up)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share to WhatsApp' })
      } else {
        await Linking.openURL(whatsappUrl)
      }
    } else {
      Alert.alert('WhatsApp not found', 'Share using another app?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Share', onPress: () => shareNative() },
      ])
    }
  }

  async function shareNative() {
    const uri = capturedUri ?? await captureCard()
    if (!uri) return
    track('share_card_native')
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Surge log' })
    }
  }

  async function saveToGallery() {
    const uri = capturedUri ?? await captureCard()
    if (!uri) return
    const { status } = await MediaLibrary.requestPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to save the card to your gallery.')
      return
    }
    track('share_card_saved')
    await MediaLibrary.saveToLibraryAsync(uri)
    Alert.alert('Saved!', 'Card saved to your gallery.')
  }

  // ---------------------------------------------------------------------------
  // Save schedule preference to Supabase
  // ---------------------------------------------------------------------------
  async function saveSchedule() {
    if (!profile) return
    if (scheduleEnabled && !schedPhone.trim()) {
      Alert.alert('Enter a phone number', 'Add the WhatsApp number to send the report to.')
      return
    }
    setSavingSchedule(true)
    try {
      const { error } = await supabase
        .from('users')
        .update({
          accountability_phone: scheduleEnabled ? schedPhone.trim() : null,
          accountability_freq:  scheduleEnabled ? schedFreq : null,
        })
        .eq('id', profile.id)
      if (error) throw error
      Alert.alert('Saved!', scheduleEnabled
        ? `Reports will be sent ${schedFreq === 'daily' ? 'daily' : 'weekly'}.`
        : 'Scheduled reports turned off.'
      )
    } catch {
      Alert.alert('Error', 'Could not save schedule. Please try again.')
    } finally {
      setSavingSchedule(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Share</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Card preview */}
        <View style={styles.cardWrapper}>
          <ViewShot
            ref={viewShotRef}
            options={{ format: 'png', quality: 1.0 }}
            style={styles.viewShot}
          >
            <ShareCard data={cardData} />
          </ViewShot>
        </View>

        {/* One-time share buttons */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Share now</Text>
          <View style={styles.shareRow}>
            <ShareButton emoji="💬" label="WhatsApp" onPress={shareToWhatsApp} loading={capturing} />
            <ShareButton emoji="📤" label="Share"    onPress={shareNative}    loading={capturing} />
            <ShareButton emoji="💾" label="Save"     onPress={saveToGallery}  loading={capturing} />
          </View>
        </View>

        {/* Scheduled report */}
        <View style={styles.section}>
          <View style={styles.scheduleHeader}>
            <View>
              <Text style={styles.sectionTitle}>Scheduled report</Text>
              <Text style={styles.scheduleSubtitle}>Auto-send to your trainer or accountability partner</Text>
            </View>
            <Switch
              value={scheduleEnabled}
              onValueChange={setScheduleEnabled}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor="#fff"
            />
          </View>

          {scheduleEnabled && (
            <View style={styles.scheduleForm}>
              <Text style={styles.fieldLabel}>WhatsApp number</Text>
              <TextInput
                style={styles.phoneInput}
                value={schedPhone}
                onChangeText={setSchedPhone}
                placeholder="+91 98765 43210"
                placeholderTextColor={Colors.text3}
                keyboardType="phone-pad"
                autoCorrect={false}
              />

              <Text style={styles.fieldLabel}>Frequency</Text>
              <View style={styles.freqRow}>
                {(['daily', 'weekly'] as const).map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.freqChip, schedFreq === f && styles.freqChipActive]}
                    onPress={() => setSchedFreq(f)}
                  >
                    <Text style={[styles.freqChipText, schedFreq === f && styles.freqChipTextActive]}>
                      {f === 'daily' ? 'Daily' : 'Weekly'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={saveSchedule} disabled={savingSchedule}>
                {savingSchedule
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>Save schedule</Text>
                }
              </TouchableOpacity>
            </View>
          )}

          {!scheduleEnabled && (
            <TouchableOpacity style={styles.saveBtn} onPress={saveSchedule} disabled={savingSchedule}>
              {savingSchedule
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>Save</Text>
              }
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Share button component
// ---------------------------------------------------------------------------
function ShareButton({ emoji, label, onPress, loading }: { emoji: string; label: string; onPress: () => void; loading: boolean }) {
  return (
    <TouchableOpacity style={btnStyles.btn} onPress={onPress} disabled={loading}>
      {loading
        ? <ActivityIndicator color={Colors.accent} />
        : <Text style={btnStyles.emoji}>{emoji}</Text>
      }
      <Text style={btnStyles.label}>{label}</Text>
    </TouchableOpacity>
  )
}

const btnStyles = StyleSheet.create({
  btn: {
    flex:           1,
    backgroundColor: Colors.surface,
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     Colors.border,
    alignItems:      'center',
    paddingVertical: Spacing.md,
    gap:             4,
  },
  emoji: { fontSize: 22 },
  label: { fontSize: FontSize.xs, color: Colors.text2, fontWeight: FontWeight.semibold },
})

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content: {
    padding:       Spacing.md,
    paddingBottom: Spacing.xxl,
    gap:           Spacing.lg,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  backBtn:  { padding: Spacing.sm },
  backText: { fontSize: FontSize.base, color: Colors.accent, fontWeight: FontWeight.semibold },
  title:    { fontSize: FontSize.lg, color: Colors.text1, fontWeight: FontWeight.bold },

  cardWrapper: {
    alignItems:    'center',
    paddingVertical: Spacing.md,
  },
  viewShot: {
    borderRadius: Radius.lg,
    overflow:     'hidden',
    shadowColor:  Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius:  20,
    elevation:     8,
  },

  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize:   FontSize.md,
    color:      Colors.text1,
    fontWeight: FontWeight.bold,
  },
  shareRow: {
    flexDirection: 'row',
    gap:           Spacing.sm,
  },

  // Schedule
  scheduleHeader: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    gap:            Spacing.md,
  },
  scheduleSubtitle: {
    fontSize:  FontSize.sm,
    color:     Colors.text2,
    marginTop: 2,
  },
  scheduleForm: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    gap:             Spacing.md,
  },
  fieldLabel: {
    fontSize:   FontSize.sm,
    color:      Colors.text2,
    fontWeight: FontWeight.semibold,
  },
  phoneInput: {
    backgroundColor:   Colors.bg,
    borderRadius:      Radius.md,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
    color:             Colors.text1,
    fontSize:          FontSize.base,
  },
  freqRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           Spacing.sm,
  },
  freqChip: {
    borderRadius:    Radius.full,
    borderWidth:     1,
    borderColor:     Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.xs,
  },
  freqChipActive: {
    backgroundColor: Colors.accentSoft,
    borderColor:     Colors.accent,
  },
  freqChipText:       { fontSize: FontSize.sm, color: Colors.text2 },
  freqChipTextActive: { color: Colors.accent, fontWeight: FontWeight.semibold },

  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.md,
    alignItems:      'center',
  },
  saveBtnText: { fontSize: FontSize.base, color: '#fff', fontWeight: FontWeight.bold },
})
