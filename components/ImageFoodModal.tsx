/**
 * ImageFoodModal — Food photo logging (Pro only)
 *
 * Flow:
 *   1. Check tier → show upsell if free
 *   2. Open camera → user takes photo
 *   3. Compress to <2MB → send to parse-food-image edge function
 *   4. Show editable results list with AI estimate label
 *   5. onSave(foods) → caller saves to DB
 */
import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native'
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system/legacy'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme'
import { track } from '../lib/analytics'
import { submitAIFeedback } from '../lib/supabase'
import { ParsedFood } from './VoiceModal'

// ---------------------------------------------------------------------------

interface Props {
  visible:  boolean
  isPro:    boolean
  onClose:  () => void
  onSave:   (foods: ParsedFood[]) => void
}

type Screen = 'upsell' | 'camera' | 'analysing' | 'results' | 'error'

// ---------------------------------------------------------------------------

export default function ImageFoodModal({ visible, isPro, onClose, onSave }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [screen,            setScreen]           = useState<Screen>(isPro ? 'camera' : 'upsell')
  const [foods,             setFoods]            = useState<ParsedFood[]>([])
  const [errorMsg,          setErrorMsg]         = useState('')
  const [feedbackOpen,      setFeedbackOpen]     = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const cameraRef = useRef<CameraView>(null)

  const IMAGE_FEEDBACK_REASONS = ['Wrong food', 'Wrong macros', 'Completely off']

  // Reset to correct initial screen when modal opens + track
  const handleVisible = useCallback((v: boolean) => {
    if (v) {
      track(isPro ? 'image_log_started' : 'pro_upsell_shown', { feature: 'image_food' })
      setScreen(isPro ? 'camera' : 'upsell')
      setFeedbackOpen(false)
      setFeedbackSubmitted(false)
    }
  }, [isPro])

  async function handleImageFeedback(reason: string) {
    setFeedbackSubmitted(true)
    setFeedbackOpen(false)
    await submitAIFeedback({
      type:          'image_food',
      reason,
      parsed_output: foods,
      user_saved:    false,
    })
  }

  // Ask for camera permission if not granted
  async function ensurePermission(): Promise<boolean> {
    if (permission?.granted) return true
    const res = await requestPermission()
    return res.granted
  }

  async function takePicture() {
    const ok = await ensurePermission()
    if (!ok) {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to log food photos.')
      return
    }
    if (!cameraRef.current) return

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality:  0.7,
        base64:   false,
        skipProcessing: true,
      })
      if (!photo?.uri) throw new Error('No photo captured')

      setScreen('analysing')
      await analysePhoto(photo.uri)
    } catch (err: any) {
      console.error('[ImageFoodModal] takePicture:', err)
      setErrorMsg(err.message ?? 'Failed to capture photo')
      setScreen('error')
    }
  }

  async function analysePhoto(uri: string) {
    try {
      // Read as base64
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any })

      const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
      const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

      const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-food-image`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey':        SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' }),
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data?.error ?? 'Analysis failed')
      if (!data.foods?.length) throw new Error('No food detected in image')

      // Capitalise first letter of each food name
      const capitalised = data.foods.map((f: ParsedFood) => ({
        ...f,
        name: f.name.charAt(0).toUpperCase() + f.name.slice(1),
      }))
      setFoods(capitalised)
      setScreen('results')
    } catch (err: any) {
      console.error('[ImageFoodModal] analysePhoto:', err)
      setErrorMsg(err.message ?? 'Could not analyse photo')
      setScreen('error')
    }
  }

  function updateFood(index: number, field: keyof ParsedFood, value: string) {
    setFoods(prev => prev.map((f, i) =>
      i === index ? { ...f, [field]: field === 'name' || field === 'serving_unit' || field === 'meal_slot' ? value : parseFloat(value) || 0 } : f
    ))
  }

  function removeFood(index: number) {
    setFoods(prev => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    if (!foods.length) { onClose(); return }
    track('image_log_saved', { food_count: foods.length })
    onSave(foods)
    onClose()
  }

  // ---------------------------------------------------------------------------
  // Render screens
  // ---------------------------------------------------------------------------

  function renderUpsell() {
    return (
      <View style={styles.centreContent}>
        <Text style={styles.upsellEmoji}>📸</Text>
        <Text style={styles.upsellTitle}>Food Photo AI</Text>
        <Text style={styles.upsellSub}>
          Take a photo of any meal and AI will estimate the macros instantly.
          Available on Surge Pro.
        </Text>
        <View style={styles.upsellBadge}>
          <Text style={styles.upsellBadgeText}>PRO FEATURE</Text>
        </View>
        <TouchableOpacity style={styles.upgradeBtn} onPress={onClose}>
          <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    )
  }

  function renderCamera() {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
        />
        <View style={styles.cameraOverlay}>
          <TouchableOpacity style={styles.closeBtnOverlay} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.cameraHintBox}>
            <Text style={styles.cameraHint}>Point at your meal</Text>
          </View>
          <TouchableOpacity style={styles.shutterBtn} onPress={takePicture}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  function renderAnalysing() {
    return (
      <View style={styles.centreContent}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.analysingText}>Analysing your meal…</Text>
        <Text style={styles.analysingSub}>AI is identifying food items and estimating macros</Text>
      </View>
    )
  }

  function renderResults() {
    return (
      <View style={styles.resultsContainer}>
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Found {foods.length} item{foods.length !== 1 ? 's' : ''}</Text>
          <View style={styles.resultsHeaderRight}>
            <TouchableOpacity onPress={() => setScreen('camera')}>
              <Text style={styles.retakeText}>Retake</Text>
            </TouchableOpacity>
            {!feedbackSubmitted ? (
              <TouchableOpacity onPress={() => setFeedbackOpen(o => !o)} hitSlop={12}>
                <Text style={styles.thumbsIcon}>👎</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.feedbackThanks}>✓ Noted</Text>
            )}
          </View>
        </View>

        {feedbackOpen && !feedbackSubmitted && (
          <View style={styles.feedbackChips}>
            <Text style={styles.feedbackPrompt}>What's wrong?</Text>
            <View style={styles.feedbackChipRow}>
              {IMAGE_FEEDBACK_REASONS.map(reason => (
                <TouchableOpacity
                  key={reason}
                  style={styles.feedbackChip}
                  onPress={() => handleImageFeedback(reason)}
                >
                  <Text style={styles.feedbackChipText}>{reason}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        <ScrollView style={styles.foodList} showsVerticalScrollIndicator={false}>
          {foods.map((food, i) => (
            <View key={i} style={styles.foodCard}>
              <View style={styles.foodCardHeader}>
                <TextInput
                  style={styles.foodNameInput}
                  value={food.name}
                  onChangeText={v => updateFood(i, 'name', v)}
                  placeholderTextColor={Colors.text3}
                />
                <TouchableOpacity onPress={() => removeFood(i)}>
                  <Text style={styles.removeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.aiEstBadge}>
                <Text style={styles.aiEstText}>AI estimate — tap to adjust</Text>
              </View>
              <View style={styles.macroRow}>
                <MacroInput label="Cal" value={String(food.calories)}   onChange={v => updateFood(i, 'calories',  v)} />
                <MacroInput label="P"   value={String(food.protein_g)}  onChange={v => updateFood(i, 'protein_g', v)} unit="g" />
                <MacroInput label="C"   value={String(food.carbs_g)}    onChange={v => updateFood(i, 'carbs_g',   v)} unit="g" />
                <MacroInput label="F"   value={String(food.fat_g)}      onChange={v => updateFood(i, 'fat_g',     v)} unit="g" />
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={styles.resultsFooter}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={!foods.length}>
            <Text style={styles.saveBtnText}>Save {foods.length} item{foods.length !== 1 ? 's' : ''}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Discard</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  function renderError() {
    return (
      <View style={styles.centreContent}>
        <Text style={styles.errorEmoji}>📷</Text>
        <Text style={styles.errorTitle}>Couldn't read that image</Text>
        <Text style={styles.errorSub}>{errorMsg}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => setScreen('camera')}>
          <Text style={styles.retryBtnText}>Try another photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ---------------------------------------------------------------------------

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => handleVisible(true)}
    >
      <View style={styles.container}>
        {screen === 'upsell'    && renderUpsell()}
        {screen === 'camera'    && renderCamera()}
        {screen === 'analysing' && renderAnalysing()}
        {screen === 'results'   && renderResults()}
        {screen === 'error'     && renderError()}
      </View>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Mini macro input field
// ---------------------------------------------------------------------------
function MacroInput({ label, value, onChange, unit }: { label: string; value: string; onChange: (v: string) => void; unit?: string }) {
  return (
    <View style={styles.macroInput}>
      <Text style={styles.macroLabel}>{label}</Text>
      <TextInput
        style={styles.macroValue}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        selectTextOnFocus
      />
      {unit && <Text style={styles.macroUnit}>{unit}</Text>}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.bg,
  },
  centreContent: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        Spacing.xl,
    gap:            Spacing.md,
  },

  // Upsell
  upsellEmoji: { fontSize: 52, marginBottom: Spacing.sm },
  upsellTitle: { fontSize: FontSize.xl, color: Colors.text1, fontWeight: FontWeight.black, textAlign: 'center' },
  upsellSub:   { fontSize: FontSize.base, color: Colors.text2, textAlign: 'center', lineHeight: 22 },
  upsellBadge: {
    backgroundColor: Colors.accentSoft,
    borderRadius:    Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.xs,
    marginTop:         Spacing.xs,
  },
  upsellBadgeText: { fontSize: FontSize.xs, color: Colors.accent, fontWeight: FontWeight.bold, letterSpacing: 1 },
  upgradeBtn: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.md,
    paddingVertical:   Spacing.md,
    paddingHorizontal: Spacing.xxl,
    marginTop:         Spacing.md,
    width:             '100%',
    alignItems:        'center',
  },
  upgradeBtnText: { fontSize: FontSize.base, color: '#fff', fontWeight: FontWeight.bold },

  // Camera
  cameraContainer: { flex: 1 },
  camera:          { flex: 1 },
  cameraOverlay: {
    position:       'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingTop:     Spacing.xxl,
    paddingBottom:  Spacing.xxl,
  },
  closeBtnOverlay: {
    alignSelf:         'flex-end',
    marginRight:       Spacing.md,
    backgroundColor:   'rgba(0,0,0,0.5)',
    borderRadius:      Radius.full,
    width:             36,
    height:            36,
    alignItems:        'center',
    justifyContent:    'center',
  },
  closeBtnText: { color: '#fff', fontSize: FontSize.base },
  cameraHintBox: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius:    Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
  },
  cameraHint: { color: '#fff', fontSize: FontSize.sm },
  shutterBtn: {
    width:           72,
    height:          72,
    borderRadius:    36,
    borderWidth:     3,
    borderColor:     '#fff',
    alignItems:      'center',
    justifyContent:  'center',
  },
  shutterInner: {
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: '#fff',
  },

  // Analysing
  analysingText: { fontSize: FontSize.lg, color: Colors.text1, fontWeight: FontWeight.bold, marginTop: Spacing.md },
  analysingSub:  { fontSize: FontSize.sm, color: Colors.text2, textAlign: 'center' },

  // Results
  resultsContainer: { flex: 1, paddingTop: Spacing.xxl },
  resultsHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom:     Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  resultsTitle:      { fontSize: FontSize.lg, color: Colors.text1, fontWeight: FontWeight.bold },
  resultsHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  retakeText:        { fontSize: FontSize.base, color: Colors.accent, fontWeight: FontWeight.semibold },
  thumbsIcon:        { fontSize: 20 },
  feedbackThanks:    { fontSize: FontSize.sm, color: Colors.green, fontWeight: FontWeight.semibold },
  feedbackChips: {
    marginHorizontal: Spacing.md,
    backgroundColor:  Colors.surface,
    borderRadius:     Radius.md,
    borderWidth:      1,
    borderColor:      Colors.border,
    padding:          Spacing.md,
    gap:              Spacing.sm,
  },
  feedbackPrompt:  { fontSize: FontSize.sm, color: Colors.text2, fontWeight: FontWeight.semibold },
  feedbackChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  feedbackChip: {
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical:   6,
    backgroundColor:   Colors.bg,
  },
  feedbackChipText: { fontSize: FontSize.sm, color: Colors.text1, fontWeight: FontWeight.medium },
  foodList:     { flex: 1, padding: Spacing.md },
  foodCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    marginBottom:    Spacing.sm,
    gap:             Spacing.sm,
  },
  foodCardHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  foodNameInput: {
    flex:       1,
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
    paddingVertical: 0,
  },
  removeBtn: { fontSize: FontSize.base, color: Colors.text3, paddingLeft: Spacing.sm },
  aiEstBadge: {
    alignSelf:         'flex-start',
    backgroundColor:   'rgba(255,200,0,0.12)',
    borderRadius:      Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical:   2,
  },
  aiEstText: { fontSize: FontSize.xs, color: '#FFB800' },
  macroRow: { flexDirection: 'row', gap: Spacing.sm },
  macroInput: { flex: 1, alignItems: 'center', gap: 4 },
  macroLabel: { fontSize: FontSize.xs, color: Colors.text3 },
  macroValue: {
    fontSize:          FontSize.sm,
    color:             Colors.text1,
    fontWeight:        FontWeight.semibold,
    textAlign:         'center',
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      Radius.sm,
    backgroundColor:   Colors.bg,
    paddingVertical:   6,
    paddingHorizontal: 4,
    width:             '100%',
  },
  macroUnit: { fontSize: FontSize.xs, color: Colors.text3 },
  resultsFooter: {
    padding:      Spacing.md,
    gap:          Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.md,
    alignItems:      'center',
  },
  saveBtnText: { fontSize: FontSize.base, color: '#fff', fontWeight: FontWeight.bold },

  // Error
  errorEmoji: { fontSize: 48, marginBottom: Spacing.sm },
  errorTitle: { fontSize: FontSize.lg, color: Colors.text1, fontWeight: FontWeight.bold, textAlign: 'center' },
  errorSub:   { fontSize: FontSize.sm, color: Colors.text2, textAlign: 'center' },
  retryBtn: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.md,
    paddingVertical:   Spacing.md,
    paddingHorizontal: Spacing.xxl,
    marginTop:         Spacing.md,
    width:             '100%',
    alignItems:        'center',
  },
  retryBtnText: { fontSize: FontSize.base, color: '#fff', fontWeight: FontWeight.bold },

  // Shared
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: FontSize.base, color: Colors.text3 },
})
