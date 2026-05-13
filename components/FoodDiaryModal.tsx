/**
 * FoodDiaryModal.tsx
 *
 * Full-day food diary — same visual language as FoodConfirmModal review screen.
 * Shows all todayEntries grouped by meal slot, with inline qty +/− and
 * editable macro fields. Every change immediately syncs to Supabase via
 * nutritionStore.updateEntry / deleteEntry.
 */

import React, { useState, useEffect } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme'
import { useNutritionStore, FoodEntry } from '../stores/nutritionStore'
import { useUserStore } from '../stores/userStore'
import { track } from '../lib/analytics'

interface Props {
  visible: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
export default function FoodDiaryModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const { todayEntries, updateEntry, deleteEntry, getDailyTotals } = useNutritionStore()
  const { profile, session } = useUserStore()
  const userId = profile?.id ?? session?.user?.id ?? ''

  // Track which entry is expanded
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Local serving edits: entryId → serving_size string (before blur persist)
  const [servingDraft, setServingDraft] = useState<Record<string, string>>({})

  const totals = getDailyTotals()

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function scaleEntry(entry: FoodEntry, newServing: number) {
    if (!userId || newServing <= 0) return
    const scale = newServing / (entry.serving_size || 1)
    updateEntry(userId, entry.id, {
      serving_size: newServing,
      calories:     parseFloat((entry.calories  * scale).toFixed(1)),
      protein_g:    parseFloat((entry.protein_g * scale).toFixed(1)),
      carbs_g:      parseFloat((entry.carbs_g   * scale).toFixed(1)),
      fat_g:        parseFloat((entry.fat_g     * scale).toFixed(1)),
    })
  }

  function stepServing(entry: FoodEntry, delta: number) {
    const next = Math.max(0.5, parseFloat(((entry.serving_size || 1) + delta).toFixed(1)))
    scaleEntry(entry, next)
    setServingDraft(d => ({ ...d, [entry.id]: String(next) }))
  }

  function commitServingDraft(entry: FoodEntry) {
    const raw = servingDraft[entry.id]
    if (raw === undefined) return
    const val = parseFloat(raw)
    if (!isNaN(val) && val > 0) scaleEntry(entry, val)
  }

  function updateMacro(
    entry: FoodEntry,
    field: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g',
    raw: string
  ) {
    if (!userId) return
    const val = parseFloat(raw) || 0
    updateEntry(userId, entry.id, { [field]: val })
  }

  function handleDelete(entry: FoodEntry) {
    Alert.alert(
      'Remove from log?',
      `Remove "${entry.food_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            if (userId) deleteEntry(userId, entry.id)
            if (expandedId === entry.id) setExpandedId(null)
          },
        },
      ]
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  React.useEffect(() => { if (visible) track('food_diary_open') }, [visible])
  if (!visible) return null

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={s.screen} edges={['bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1, width: '100%' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Nav header — explicit insets.top so it clears notch/Dynamic Island */}
          <View style={[s.navHeader, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 16, bottom: 16, left: 24, right: 24 }}
            >
              <Text style={s.navBack}>← Today</Text>
            </TouchableOpacity>
            <Text style={s.navTitle}>Food diary</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Day totals strip */}
            <View style={s.totalsCard}>
              <Text style={s.totalsLabel}>TODAY'S TOTAL</Text>
              <View style={s.totalsRow}>
                {[
                  { val: Math.round(totals.calories),  lbl: 'KCAL',    color: Colors.accent },
                  { val: Math.round(totals.protein_g), lbl: 'PROTEIN', color: Colors.green  },
                  { val: Math.round(totals.carbs_g),   lbl: 'CARBS',   color: Colors.blue   },
                  { val: Math.round(totals.fat_g),     lbl: 'FAT',     color: Colors.warning },
                ].map(t => (
                  <View key={t.lbl} style={s.totalCell}>
                    <Text style={[s.totalVal, { color: t.color }]}>
                      {t.val}{t.lbl !== 'KCAL' ? 'g' : ''}
                    </Text>
                    <Text style={s.totalLbl}>{t.lbl}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Flat list of all entries */}
            {todayEntries.length === 0 ? (
              <View style={s.emptySlot}>
                <Text style={s.emptySlotText}>Nothing logged today</Text>
              </View>
            ) : (
              <View style={s.dishCard}>
                {todayEntries.map((entry, ei) => {
                  const isExpanded = expandedId === entry.id
                  const draftServing = servingDraft[entry.id] ?? String(entry.serving_size)
                  return (
                    <View key={entry.id}>
                      {/* Entry header row — tap to expand/collapse */}
                      <TouchableOpacity
                        style={[s.entryHeader, ei > 0 && s.entryBorder]}
                        onPress={() => setExpandedId(isExpanded ? null : entry.id)}
                        activeOpacity={0.7}
                      >
                        <View style={s.entryHeaderLeft}>
                          <Text style={s.entryName} numberOfLines={1}>{entry.food_name}</Text>
                          <Text style={s.entryMeta}>
                            {entry.serving_size} {entry.serving_unit}
                          </Text>
                        </View>
                        <Text style={s.entryKcal}>~{Math.round(entry.calories)} kcal</Text>
                        <Text style={[s.chevron, isExpanded && s.chevronOpen]}>▾</Text>
                      </TouchableOpacity>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <View style={s.entryDetail}>
                          {/* Serving qty controls */}
                          <View style={s.servingRow}>
                            <Text style={s.servingLabel}>Serving</Text>
                            <View style={s.servingControl}>
                              <TouchableOpacity
                                style={s.qtyBtn}
                                onPress={() => stepServing(entry, -0.5)}
                              >
                                <Text style={s.qtyBtnText}>−</Text>
                              </TouchableOpacity>
                              <TextInput
                                style={s.servingInput}
                                value={draftServing}
                                onChangeText={v => setServingDraft(d => ({ ...d, [entry.id]: v }))}
                                onBlur={() => commitServingDraft(entry)}
                                keyboardType="decimal-pad"
                                selectTextOnFocus
                              />
                              <TouchableOpacity
                                style={s.qtyBtn}
                                onPress={() => stepServing(entry, 0.5)}
                              >
                                <Text style={s.qtyBtnText}>+</Text>
                              </TouchableOpacity>
                              <Text style={s.servingUnit}>{entry.serving_unit}</Text>
                            </View>
                          </View>

                          {/* Editable macro grid */}
                          <View style={s.macroGrid}>
                            {[
                              { field: 'calories'  as const, label: 'KCAL',    color: Colors.accent  },
                              { field: 'protein_g' as const, label: 'PROTEIN', color: Colors.green   },
                              { field: 'carbs_g'   as const, label: 'CARBS',   color: Colors.blue    },
                              { field: 'fat_g'     as const, label: 'FAT',     color: Colors.warning },
                            ].map(m => (
                              <View key={m.field} style={s.macroCell}>
                                <TextInput
                                  style={[s.macroCellInput, { color: m.color }]}
                                  value={String(Math.round(entry[m.field]))}
                                  onChangeText={v => updateMacro(entry, m.field, v)}
                                  keyboardType="decimal-pad"
                                  selectTextOnFocus
                                />
                                <Text style={s.macroCellLabel}>{m.label}</Text>
                              </View>
                            ))}
                          </View>

                          {/* Remove */}
                          <TouchableOpacity
                            style={s.deleteRow}
                            onPress={() => handleDelete(entry)}
                          >
                            <Text style={s.deleteText}>Remove from log</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
            )}

            <View style={{ height: 16 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Styles — matches FoodConfirmModal review screen
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
  },

  // Nav
  navHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom:     Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  navBack:  { fontSize: FontSize.sm, color: Colors.accent, fontWeight: FontWeight.semibold },
  navTitle: { fontSize: FontSize.md, color: Colors.text1, fontWeight: FontWeight.bold },

  content: {
    padding: Spacing.md,
    gap:     Spacing.md,
  },

  // Totals strip
  totalsCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    gap:             Spacing.sm,
  },
  totalsLabel: { fontSize: 10, color: Colors.text3, fontWeight: FontWeight.bold, letterSpacing: 1 },
  totalsRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  totalCell:   { alignItems: 'center' },
  totalVal:    { fontSize: FontSize.xl, fontWeight: FontWeight.black },
  totalLbl:    { fontSize: 9, color: Colors.text3, marginTop: 2, fontWeight: FontWeight.bold, letterSpacing: 0.4 },

  // Slot
  slotHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  slotTitle: {
    fontSize:      FontSize.xs,
    color:         Colors.text3,
    fontWeight:    FontWeight.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  slotKcal: { fontSize: FontSize.xs, color: Colors.text3, fontWeight: FontWeight.semibold },

  emptySlot: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    borderStyle:     'dashed',
    padding:         Spacing.md,
    alignItems:      'center',
  },
  emptySlotText: { fontSize: FontSize.sm, color: Colors.text3 },

  // Dish card (wraps all entries in a slot)
  dishCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    overflow:        'hidden',
  },

  // Entry header
  entryBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  entryHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: Spacing.md,
    paddingVertical:   11,
    gap:            Spacing.sm,
  },
  entryHeaderLeft: { flex: 1 },
  entryName: {
    fontSize:   FontSize.base,
    fontWeight: FontWeight.bold,
    color:      Colors.text1,
  },
  entryMeta: { fontSize: FontSize.xs, color: Colors.text3, marginTop: 2 },
  entryKcal: { fontSize: FontSize.sm, color: Colors.accent, fontWeight: FontWeight.bold },
  chevron:     { fontSize: 10, color: Colors.text3, marginLeft: 4 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },

  // Expanded detail
  entryDetail: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 0,
  },

  // Serving row
  servingRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical:   10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  servingLabel:   { fontSize: FontSize.sm, color: Colors.text2 },
  servingControl: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 24, height: 24,
    backgroundColor: Colors.bg,
    borderRadius:    6,
    borderWidth:     1,
    borderColor:     Colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  qtyBtnText:   { fontSize: 16, color: Colors.text1, lineHeight: 20 },
  servingInput: {
    fontSize:          FontSize.base,
    fontWeight:        FontWeight.bold,
    color:             Colors.text1,
    minWidth:          36,
    textAlign:         'center',
    backgroundColor:   Colors.bg,
    borderRadius:      6,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingHorizontal: 6,
    paddingVertical:   3,
  },
  servingUnit: { fontSize: FontSize.xs, color: Colors.text3, fontWeight: FontWeight.semibold },

  // Macro grid
  macroGrid: {
    flexDirection:   'row',
    backgroundColor: 'rgba(255,77,0,0.03)',
  },
  macroCell: {
    flex:            1,
    alignItems:      'center',
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  macroCellInput: {
    fontSize:   FontSize.md,
    fontWeight: FontWeight.black,
    textAlign:  'center',
    width:      '100%',
    padding:    0,
  },
  macroCellLabel: {
    fontSize:      9,
    color:         Colors.text3,
    marginTop:     2,
    fontWeight:    FontWeight.bold,
    letterSpacing: 0.4,
  },

  // Delete
  deleteRow: {
    alignItems:        'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical:   8,
    borderTopWidth:    1,
    borderTopColor:    Colors.border,
  },
  deleteText: { fontSize: FontSize.xs, color: Colors.accent, fontWeight: FontWeight.semibold, opacity: 0.7 },
})
