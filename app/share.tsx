/**
 * share.tsx — Share screen
 *
 * Section 1: PDF Report
 *   - Preset date ranges (Today / Last 3 days / Last 7 days)
 *   - Optional receiver name
 *   - Generates one PDF per day → share sheet per PDF
 *
 * Section 2: Scheduled report
 *   - Store accountability phone + frequency in Supabase
 */
import React, { useState } from 'react'
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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Sharing from 'expo-sharing'
import { useNavigation } from '@react-navigation/native'
import { Colors, FontSize, FontWeight, Radius, Spacing, BOTTOM_SAFE_PADDING } from '../constants/theme'
import { useUserStore } from '../stores/userStore'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import {
  generateReports,
  GeneratedPDF,
  todayISO,
  daysAgoISO,
  formatDisplayDate,
} from '../lib/generateReport'

// ---------------------------------------------------------------------------
// Date range presets
// ---------------------------------------------------------------------------
type RangeKey = 'today' | '3days' | '7days'

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today',  label: 'Today' },
  { key: '3days',  label: 'Last 3 days' },
  { key: '7days',  label: 'Last 7 days' },
]

function rangeForKey(key: RangeKey): { startDate: string; endDate: string } {
  const end = todayISO()
  const start = key === 'today'  ? todayISO()
              : key === '3days'  ? daysAgoISO(2)
              : daysAgoISO(6)
  return { startDate: start, endDate: end }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function ShareScreen() {
  const navigation = useNavigation<any>()
  const { profile } = useUserStore()

  // ── PDF state ──
  const [rangeKey,       setRangeKey]       = useState<RangeKey>('today')
  const [receiverName,   setReceiverName]   = useState(profile?.accountability_name ?? '')
  const [generating,     setGenerating]     = useState(false)
  const [generatedPDFs,  setGeneratedPDFs]  = useState<GeneratedPDF[]>([])
  const [sharingIndex,   setSharingIndex]   = useState<number | null>(null)

  // ── Schedule state ──
  const [scheduleEnabled, setScheduleEnabled] = useState(
    !!(profile?.accountability_phone && profile?.accountability_freq)
  )
  const [schedPhone,     setSchedPhone]     = useState(profile?.accountability_phone ?? '')
  const [schedFreq,      setSchedFreq]      = useState<'daily' | 'weekly'>(
    profile?.accountability_freq ?? 'weekly'
  )
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [sendingTest,    setSendingTest]    = useState(false)

  // ---------------------------------------------------------------------------
  // Generate PDFs
  // ---------------------------------------------------------------------------
  async function handleGenerate() {
    if (!profile) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setGenerating(true)
    setGeneratedPDFs([])
    try {
      const { startDate, endDate } = rangeForKey(rangeKey)
      const pdfs = await generateReports({
        userId:       user.id,
        startDate,
        endDate,
        receiverName: receiverName.trim() || undefined,
        profile: {
          name:             profile.name,
          goal:             profile.goal,
          weight_kg:        profile.weight_kg,
          calorie_target:   profile.calorie_target,
          protein_target_g: profile.protein_target_g,
          carbs_target_g:   profile.carbs_target_g,
          fat_target_g:     profile.fat_target_g,
        },
      })
      setGeneratedPDFs(pdfs)
      track('pdf_report_generated', { range: rangeKey, days: pdfs.length })
    } catch (err: any) {
      Alert.alert('Could not generate report', err.message ?? 'Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Share a single PDF
  // ---------------------------------------------------------------------------
  async function handleShare(pdf: GeneratedPDF, index: number) {
    const available = await Sharing.isAvailableAsync()
    if (!available) {
      Alert.alert('Sharing not available on this device.')
      return
    }
    setSharingIndex(index)
    try {
      await Sharing.shareAsync(pdf.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Surge Report — ${pdf.displayDate}`,
        UTI: 'com.adobe.pdf',
      })
      track('pdf_report_shared', { range: rangeKey })
    } finally {
      setSharingIndex(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Send test report now
  // ---------------------------------------------------------------------------
  async function handleSendTestNow() {
    if (!schedPhone.trim()) { Alert.alert('Enter a phone number first'); return }
    setSendingTest(true)
    try {
      const { error } = await supabase.functions.invoke('schedule-reports', {
        body: { testPhone: schedPhone.trim(), testUserId: profile?.id },
      })
      if (error) throw error
      Alert.alert('Sent!', `Test report sent to ${schedPhone.trim()} via WhatsApp.`)
      track('whatsapp_test_sent', {})
    } catch (err: any) {
      Alert.alert('Send failed', err.message ?? 'Please try again.')
    } finally {
      setSendingTest(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Save schedule
  // ---------------------------------------------------------------------------
  async function saveSchedule() {
    if (!profile) return
    if (scheduleEnabled && !schedPhone.trim()) {
      Alert.alert('Enter a phone number')
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
      Alert.alert('Error', 'Could not save. Please try again.')
    } finally {
      setSavingSchedule(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>PDF Report</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* ── PDF Report section ── */}
        <View style={styles.card}>

          {/* Date range */}
          <Text style={styles.fieldLabel}>Date range</Text>
          <View style={styles.chipRow}>
            {RANGE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.rangeChip, rangeKey === opt.key && styles.rangeChipActive]}
                onPress={() => { setRangeKey(opt.key); setGeneratedPDFs([]) }}
              >
                <Text style={[styles.rangeChipText, rangeKey === opt.key && styles.rangeChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Receiver name */}
          <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>
            Report for (optional)
          </Text>
          <TextInput
            style={styles.input}
            value={receiverName}
            onChangeText={v => { setReceiverName(v); setGeneratedPDFs([]) }}
            placeholder="e.g. Coach Rahul"
            placeholderTextColor={Colors.text3}
            autoCorrect={false}
          />

          {/* Generate button */}
          <TouchableOpacity
            style={[styles.generateBtn, generating && styles.btnDisabled]}
            onPress={handleGenerate}
            disabled={generating}
            activeOpacity={0.85}
          >
            {generating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.generateBtnText}>Generate PDF{rangeKey !== 'today' ? 's' : ''}</Text>
            }
          </TouchableOpacity>

          {/* Generated PDFs list */}
          {generatedPDFs.length > 0 && (
            <View style={styles.pdfList}>
              <Text style={styles.pdfListTitle}>
                {generatedPDFs.length === 1 ? '1 PDF ready' : `${generatedPDFs.length} PDFs ready`}
              </Text>
              {generatedPDFs.map((pdf, i) => (
                <View key={pdf.date} style={styles.pdfRow}>
                  <View style={styles.pdfInfo}>
                    <Text style={styles.pdfEmoji}>📄</Text>
                    <Text style={styles.pdfDate}>{pdf.displayDate}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.shareBtn, sharingIndex === i && styles.btnDisabled]}
                    onPress={() => handleShare(pdf, i)}
                    disabled={sharingIndex !== null}
                    activeOpacity={0.85}
                  >
                    {sharingIndex === i
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.shareBtnText}>Share</Text>
                    }
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Scheduled report section ── */}
        <View style={styles.card}>
          <View style={styles.scheduleHeader}>
            <View style={{ flex: 1 }}>
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
            <>
              <Text style={styles.fieldLabel}>WhatsApp number</Text>
              <TextInput
                style={styles.input}
                value={schedPhone}
                onChangeText={setSchedPhone}
                placeholder="+91 98765 43210"
                placeholderTextColor={Colors.text3}
                keyboardType="phone-pad"
                autoCorrect={false}
              />

              <Text style={[styles.fieldLabel, { marginTop: Spacing.sm }]}>Frequency</Text>
              <View style={styles.chipRow}>
                {(['daily', 'weekly'] as const).map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.rangeChip, schedFreq === f && styles.rangeChipActive]}
                    onPress={() => setSchedFreq(f)}
                  >
                    <Text style={[styles.rangeChipText, schedFreq === f && styles.rangeChipTextActive]}>
                      {f === 'daily' ? 'Daily' : 'Weekly'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.generateBtn, savingSchedule && styles.btnDisabled]}
            onPress={saveSchedule}
            disabled={savingSchedule}
            activeOpacity={0.85}
          >
            {savingSchedule
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.generateBtnText}>
                  {scheduleEnabled ? 'Save schedule' : 'Turn off schedule'}
                </Text>
            }
          </TouchableOpacity>

          {/* Test send — only show when a phone is set */}
          {scheduleEnabled && schedPhone.trim().length > 0 && (
            <TouchableOpacity
              style={[styles.testBtn, sendingTest && styles.btnDisabled]}
              onPress={handleSendTestNow}
              disabled={sendingTest}
              activeOpacity={0.85}
            >
              {sendingTest
                ? <ActivityIndicator color={Colors.accent} size="small" />
                : <Text style={styles.testBtnText}>Send test report now →</Text>
              }
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  scroll:  { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: BOTTOM_SAFE_PADDING, gap: Spacing.md },

  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   Spacing.xs,
  },
  backBtn:  { padding: Spacing.sm },
  backText: { fontSize: FontSize.base, color: Colors.accent, fontWeight: FontWeight.semibold },
  title:    { fontSize: FontSize.lg, color: Colors.text1, fontWeight: FontWeight.bold },

  card: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    gap:             Spacing.sm,
  },

  sectionTitle: { fontSize: FontSize.md, color: Colors.text1, fontWeight: FontWeight.bold },
  fieldLabel: {
    fontSize:      FontSize.xs,
    color:         Colors.text2,
    fontWeight:    FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  rangeChip: {
    borderRadius:      Radius.full,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical:   8,
    backgroundColor:   Colors.bg,
  },
  rangeChipActive:     { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  rangeChipText:       { fontSize: FontSize.sm, color: Colors.text2, fontWeight: FontWeight.medium },
  rangeChipTextActive: { color: Colors.accent, fontWeight: FontWeight.semibold },

  input: {
    backgroundColor:   Colors.bg,
    borderRadius:      Radius.md,
    borderWidth:       1,
    borderColor:       Colors.border,
    height:            48,
    paddingHorizontal: Spacing.md,
    fontSize:          FontSize.base,
    color:             Colors.text1,
  },

  generateBtn: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.md,
    height:          48,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       Spacing.xs,
  },
  generateBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#fff' },
  btnDisabled:     { opacity: 0.6 },

  pdfList: {
    marginTop:       Spacing.xs,
    gap:             Spacing.sm,
    borderTopWidth:  1,
    borderTopColor:  Colors.border,
    paddingTop:      Spacing.md,
  },
  pdfListTitle: { fontSize: FontSize.sm, color: Colors.text2, fontWeight: FontWeight.semibold },
  pdfRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg,
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
  },
  pdfInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  pdfEmoji: { fontSize: 18 },
  pdfDate:  { fontSize: FontSize.sm, color: Colors.text1, fontWeight: FontWeight.medium },
  shareBtn: {
    backgroundColor:   Colors.accent,
    borderRadius:      Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical:   6,
    minWidth:          64,
    alignItems:        'center',
  },
  shareBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff' },

  testBtn: {
    alignItems:  'center',
    paddingVertical: Spacing.sm,
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     Colors.accent,
  },
  testBtnText: { fontSize: FontSize.sm, color: Colors.accent, fontWeight: FontWeight.semibold },

  scheduleHeader: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    gap:            Spacing.md,
  },
  scheduleSubtitle: { fontSize: FontSize.xs, color: Colors.text2, marginTop: 2 },
})
