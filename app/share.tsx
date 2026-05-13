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
  todayISO,
  daysAgoISO,
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
  const [rangeKey,   setRangeKey]   = useState<RangeKey>('today')
  const [generating, setGenerating] = useState(false)

  React.useEffect(() => { track('screen_share') }, [])


  // ---------------------------------------------------------------------------
  // Generate + share immediately
  // ---------------------------------------------------------------------------
  async function handleShareReport() {
    if (!profile) return
    const { session } = useUserStore.getState()
    const user = session?.user
    if (!user) return

    const available = await Sharing.isAvailableAsync()
    if (!available) { Alert.alert('Sharing not available on this device.'); return }

    setGenerating(true)
    try {
      const { startDate, endDate } = rangeForKey(rangeKey)
      const pdfs = await generateReports({
        userId:    user.id,
        startDate,
        endDate,
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
      track('pdf_report_generated', { range: rangeKey, days: pdfs.length })

      // Share each PDF in sequence
      for (const pdf of pdfs) {
        await Sharing.shareAsync(pdf.uri, {
          mimeType:    'application/pdf',
          dialogTitle: `Surge Report — ${pdf.displayDate}`,
          UTI:         'com.adobe.pdf',
        })
      }
      track('pdf_report_shared', { range: rangeKey })
    } catch (err: any) {
      Alert.alert('Could not generate report', err.message ?? 'Please try again.')
    } finally {
      setGenerating(false)
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
                onPress={() => setRangeKey(opt.key)}
              >
                <Text style={[styles.rangeChipText, rangeKey === opt.key && styles.rangeChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Share button */}
          <TouchableOpacity
            style={[styles.generateBtn, generating && styles.btnDisabled]}
            onPress={handleShareReport}
            disabled={generating}
            activeOpacity={0.85}
          >
            {generating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.generateBtnText}>Share Report</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── Scheduled report — Coming Soon ── */}
        <View style={[styles.card, styles.comingSoonCard]}>
          <View style={styles.comingSoonHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Scheduled report</Text>
              <Text style={styles.scheduleSubtitle}>Auto-send to your trainer or accountability partner</Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonBadgeText}>Coming Soon</Text>
            </View>
          </View>
          <View pointerEvents="none" style={{ gap: Spacing.sm, opacity: 0.4 }}>
            <Text style={styles.fieldLabel}>WhatsApp number</Text>
            <View style={[styles.input, { justifyContent: 'center' }]}>
              <Text style={{ color: Colors.text3, fontSize: 14 }}>+91 98765 43210</Text>
            </View>
            <View style={styles.chipRow}>
              <View style={styles.rangeChip}><Text style={styles.rangeChipText}>Daily</Text></View>
              <View style={styles.rangeChip}><Text style={styles.rangeChipText}>Weekly</Text></View>
            </View>
          </View>
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

  scheduleSubtitle: { fontSize: FontSize.xs, color: Colors.text2, marginTop: 2 },

  comingSoonCard:  { opacity: 0.7 },
  comingSoonHeader: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    gap:            Spacing.md,
  },
  comingSoonBadge: {
    backgroundColor:   Colors.bg,
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical:   3,
    alignSelf:         'flex-start',
  },
  comingSoonBadgeText: { fontSize: FontSize.xs, color: Colors.text3, fontWeight: FontWeight.semibold },
})
