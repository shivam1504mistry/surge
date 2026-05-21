/**
 * FoodConfirmModal.tsx
 *
 * Single-screen confirm view for voice + image food logs.
 * Every dish renders as a card with dish-total cells on top + ingredients below.
 * Nothing drills into a sub-screen — everything is editable in place.
 *
 * Cascade rules:
 *   - Qty +/− on ingredient        → ingredient macros recalc by scale; dish total = live sum.
 *   - Direct ingredient macro edit → only that field on that ingredient; dish total = live sum.
 *   - Direct dish total edit       → only that field on dish; ingredients untouched.
 */

import React, { useState, useEffect, useRef } from 'react'
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
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme'
import { track } from '../lib/analytics'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ConfirmIngredient {
  name:        string
  qty:         number
  unit:        string
  unitOptions: string[]
  calories:    number
  protein_g:   number
  carbs_g:     number
  fat_g:       number
}

export interface ConfirmDish {
  name:        string
  ingredients: ConfirmIngredient[]
  calories:    number
  protein_g:   number
  carbs_g:     number
  fat_g:       number
}

interface Props {
  visible:    boolean
  dishes:     ConfirmDish[]
  transcript: string
  onSave:     (dishes: ConfirmDish[]) => void
  onClose:    () => void
}

interface OFFProduct {
  product_name: string
  nutriments: {
    'energy-kcal_100g'?: number
    proteins_100g?:      number
    carbohydrates_100g?: number
    fat_100g?:           number
  }
}

type MacroField = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function recomputeMacros(ings: ConfirmIngredient[]) {
  return ings.reduce(
    (acc, ing) => ({
      calories:  acc.calories  + ing.calories,
      protein_g: acc.protein_g + ing.protein_g,
      carbs_g:   acc.carbs_g   + ing.carbs_g,
      fat_g:     acc.fat_g     + ing.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
}

/** Smart qty step by unit. piece=1, g/ml=5, otherwise 1. */
function qtyStep(unit: string): number {
  const u = unit.toLowerCase()
  if (u === 'g' || u === 'ml') return 5
  return 1
}

const MACRO_FIELDS: { field: MacroField; lbl: string; color: string }[] = [
  { field: 'calories',  lbl: 'kcal', color: Colors.accent  },
  { field: 'protein_g', lbl: 'P g',  color: Colors.green   },
  { field: 'carbs_g',   lbl: 'C g',  color: Colors.blue    },
  { field: 'fat_g',     lbl: 'F g',  color: Colors.warning },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function FoodConfirmModal({ visible, dishes: init, transcript, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const [dishes,         setDishes]         = useState<ConfirmDish[]>(init)
  const [unitPickerFor,  setUnitPickerFor]  = useState<{ di: number; ii: number } | null>(null)
  const [addingIngFor,   setAddingIngFor]   = useState<number | null>(null) // dish index
  const [renamingDish,   setRenamingDish]   = useState<number | null>(null)

  // Add-ingredient form state (for whichever dish has the form open)
  const [newIngName,     setNewIngName]     = useState('')
  const [newIngQty,      setNewIngQty]      = useState('100')
  const [newIngUnit,     setNewIngUnit]     = useState('g')
  const [newIngCalories, setNewIngCalories] = useState('')
  const [newIngProtein,  setNewIngProtein]  = useState('')
  const [newIngCarbs,    setNewIngCarbs]    = useState('')
  const [newIngFat,      setNewIngFat]      = useState('')
  const [manualMode,     setManualMode]     = useState(false)

  // OFF search
  const [searchResults,  setSearchResults]  = useState<OFFProduct[]>([])
  const [isSearching,    setIsSearching]    = useState(false)
  const [hasSearched,    setHasSearched]    = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync dishes from props each time the modal opens
  useEffect(() => {
    if (visible && init.length > 0) {
      track('food_confirm_open', { dish_count: init.length })
      setDishes(init)
      resetAddForm()
      setAddingIngFor(null)
      setRenamingDish(null)
      setUnitPickerFor(null)
    }
  }, [visible])

  if (!visible) return null
  if (dishes.length === 0) return null

  // ── ingredient mutations ──────────────────────────────────────────────────

  function updateQty(di: number, ii: number, delta: number) {
    setDishes(prev => prev.map((d, dx) => {
      if (dx !== di) return d
      const ings = d.ingredients.map((ing, ix) => {
        if (ix !== ii) return ing
        const newQty = Math.max(0.5, parseFloat((ing.qty + delta).toFixed(1)))
        const scale  = newQty / (ing.qty || 1)
        return {
          ...ing,
          qty:       newQty,
          calories:  parseFloat((ing.calories  * scale).toFixed(1)),
          protein_g: parseFloat((ing.protein_g * scale).toFixed(1)),
          carbs_g:   parseFloat((ing.carbs_g   * scale).toFixed(1)),
          fat_g:     parseFloat((ing.fat_g     * scale).toFixed(1)),
        }
      })
      return { ...d, ingredients: ings, ...recomputeMacros(ings) }
    }))
  }

  function setQtyDirect(di: number, ii: number, raw: string) {
    const newQty = Math.max(0.5, parseFloat(raw) || 0.5)
    setDishes(prev => prev.map((d, dx) => {
      if (dx !== di) return d
      const ings = d.ingredients.map((ing, ix) => {
        if (ix !== ii) return ing
        const scale = newQty / (ing.qty || 1)
        return {
          ...ing,
          qty:       newQty,
          calories:  parseFloat((ing.calories  * scale).toFixed(1)),
          protein_g: parseFloat((ing.protein_g * scale).toFixed(1)),
          carbs_g:   parseFloat((ing.carbs_g   * scale).toFixed(1)),
          fat_g:     parseFloat((ing.fat_g     * scale).toFixed(1)),
        }
      })
      return { ...d, ingredients: ings, ...recomputeMacros(ings) }
    }))
  }

  function updateUnit(di: number, ii: number, unit: string) {
    setDishes(prev => prev.map((d, dx) =>
      dx !== di ? d : {
        ...d,
        ingredients: d.ingredients.map((ing, ix) =>
          ix === ii ? { ...ing, unit } : ing
        ),
      }
    ))
    setUnitPickerFor(null)
  }

  /** Update an ingredient macro field directly. Dish total = live sum (no cascade across ingredients). */
  function updateIngMacro(di: number, ii: number, field: MacroField, raw: string) {
    const val = parseFloat(raw) || 0
    track('food_confirm_macro_edit', { level: 'ingredient', field })
    setDishes(prev => prev.map((d, dx) => {
      if (dx !== di) return d
      const ings = d.ingredients.map((ing, ix) =>
        ix !== ii ? ing : { ...ing, [field]: val }
      )
      return { ...d, ingredients: ings, ...recomputeMacros(ings) }
    }))
  }

  /** Update a dish total field directly. Ingredients untouched. No cascade. */
  function updateDishMacro(di: number, field: MacroField, raw: string) {
    const val = parseFloat(raw) || 0
    track('food_confirm_macro_edit', { level: 'dish', field })
    setDishes(prev => prev.map((d, dx) =>
      dx !== di ? d : { ...d, [field]: val }
    ))
  }

  function deleteIngredient(di: number, ii: number) {
    setDishes(prev => prev.map((d, dx) => {
      if (dx !== di) return d
      const ings = d.ingredients.filter((_, ix) => ix !== ii)
      return { ...d, ingredients: ings, ...recomputeMacros(ings) }
    }))
  }

  function renameDish(di: number, name: string) {
    setDishes(prev => prev.map((d, dx) => dx === di ? { ...d, name } : d))
  }

  function deleteDish(di: number) {
    setDishes(prev => prev.filter((_, dx) => dx !== di))
  }

  // ── add ingredient form ───────────────────────────────────────────────────

  function resetAddForm() {
    setNewIngName('')
    setNewIngQty('100')
    setNewIngUnit('g')
    setNewIngCalories('')
    setNewIngProtein('')
    setNewIngCarbs('')
    setNewIngFat('')
    setSearchResults([])
    setHasSearched(false)
    setManualMode(false)
  }

  function openAddForm(di: number) {
    resetAddForm()
    setAddingIngFor(di)
  }

  function closeAddForm() {
    setAddingIngFor(null)
    resetAddForm()
  }

  function addIngredient(di: number) {
    if (!newIngName.trim()) return
    const ing: ConfirmIngredient = {
      name:        newIngName.trim(),
      qty:         parseFloat(newIngQty) || 100,
      unit:        newIngUnit.trim() || 'g',
      unitOptions: Array.from(new Set([newIngUnit.trim() || 'g', 'g', 'ml', 'piece'])),
      calories:    parseFloat(newIngCalories) || 0,
      protein_g:   parseFloat(newIngProtein)  || 0,
      carbs_g:     parseFloat(newIngCarbs)    || 0,
      fat_g:       parseFloat(newIngFat)      || 0,
    }
    setDishes(prev => prev.map((d, dx) => {
      if (dx !== di) return d
      const ings = [...d.ingredients, ing]
      return { ...d, ingredients: ings, ...recomputeMacros(ings) }
    }))
    closeAddForm()
  }

  // ── OFF search ────────────────────────────────────────────────────────────

  function handleIngNameChange(text: string) {
    setNewIngName(text)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (text.length < 2) {
      setSearchResults([])
      setHasSearched(false)
      return
    }
    searchTimeout.current = setTimeout(() => searchOFF(text), 350)
  }

  async function searchOFF(q: string) {
    setIsSearching(true)
    try {
      const res  = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10`
      )
      const data = await res.json()
      const filtered = (data.products ?? []).filter(
        (p: any) => p.product_name?.trim() && (
          (p.nutriments?.['energy-kcal_100g'] ?? 0) > 0 ||
          (p.nutriments?.['energy_100g'] ?? 0) > 0 ||
          (p.nutriments?.['energy-kcal'] ?? 0) > 0
        )
      ) as OFFProduct[]
      setSearchResults(filtered.slice(0, 5))
      setHasSearched(true)
    } catch {
      setSearchResults([])
      setHasSearched(true)
    } finally {
      setIsSearching(false)
    }
  }

  function selectOFFProduct(p: OFFProduct) {
    const n    = p.nutriments as any
    const kcal = Math.round(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? (n['energy_100g'] || 0) / 4.184)
    const pro  = Math.round(n.proteins_100g      ?? n.proteins      ?? 0)
    const carb = Math.round(n.carbohydrates_100g ?? n.carbohydrates ?? 0)
    const fat  = Math.round(n.fat_100g           ?? n.fat           ?? 0)
    setNewIngName(p.product_name)
    setNewIngQty('100')
    setNewIngUnit('g')
    setNewIngCalories(String(kcal))
    setNewIngProtein(String(pro))
    setNewIngCarbs(String(carb))
    setNewIngFat(String(fat))
    setSearchResults([])
    setManualMode(true)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
  }

  function enableManualMode() {
    setManualMode(true)
    if (!newIngCalories) setNewIngCalories('0')
    if (!newIngProtein)  setNewIngProtein('0')
    if (!newIngCarbs)    setNewIngCarbs('0')
    if (!newIngFat)      setNewIngFat('0')
  }

  // ── save ──────────────────────────────────────────────────────────────────

  function handleSave() {
    track('food_confirm_save', { dish_count: dishes.length })
    onSave(dishes)
    onClose()
  }

  // ── totals ────────────────────────────────────────────────────────────────

  const totals = dishes.reduce(
    (acc, d) => ({
      calories:  acc.calories  + d.calories,
      protein_g: acc.protein_g + d.protein_g,
      carbs_g:   acc.carbs_g   + d.carbs_g,
      fat_g:     acc.fat_g     + d.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={[s.screen, { paddingTop: insets.top + 8 }]} edges={['bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1, width: '100%' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={s.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>Got it — confirm?</Text>
                <Text style={s.sub}>Review before saving · everything is editable</Text>
              </View>
              <View style={s.badgeOrange}><Text style={s.badgeText}>AI GUESS</Text></View>
            </View>

            {/* Transcript pill */}
            {transcript ? (
              <View style={s.transcriptPill}>
                <Text style={s.transcriptIcon}>🎤</Text>
                <Text style={s.transcriptText} numberOfLines={2}>{transcript}</Text>
              </View>
            ) : null}

            {/* Dishes */}
            {dishes.map((dish, di) => (
              <View key={di} style={s.dishCard}>

                {/* Dish name (tap to rename) */}
                <View style={s.dishNameRow}>
                  {renamingDish === di ? (
                    <TextInput
                      style={s.dishNameInput}
                      value={dish.name}
                      onChangeText={text => renameDish(di, text)}
                      onBlur={() => setRenamingDish(null)}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => setRenamingDish(null)}
                    />
                  ) : (
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                      onPress={() => setRenamingDish(di)}
                      activeOpacity={0.6}
                    >
                      <Text style={s.dishName}>{dish.name}</Text>
                      <Text style={s.dishNamePen}>  ✎</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => deleteDish(di)} hitSlop={8}>
                    <Text style={s.dishDelete}>×</Text>
                  </TouchableOpacity>
                </View>

                {/* Dish total cells (top, large, no cascade on edit) */}
                <View style={s.dishTotalTop}>
                  <View style={s.macroRow}>
                    {MACRO_FIELDS.map(m => (
                      <View key={m.field} style={[s.macroCell, s.macroCellLarge]}>
                        <TextInput
                          style={[s.macroCellInput, s.macroCellInputLarge, { color: m.color }]}
                          value={String(Math.round(dish[m.field]))}
                          onChangeText={v => updateDishMacro(di, m.field, v)}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                        />
                        <Text style={s.macroCellLbl}>{m.lbl}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Ingredients */}
                {dish.ingredients.map((ing, ii) => {
                  const pickerOpen = unitPickerFor?.di === di && unitPickerFor?.ii === ii
                  return (
                    <View key={ii} style={s.ing}>
                      <View style={s.ingTop}>
                        <Text style={s.ingName} numberOfLines={1}>{ing.name}</Text>
                        <View style={s.qtyControl}>
                          <TouchableOpacity
                            style={s.qtyBtn}
                            onPress={() => updateQty(di, ii, -qtyStep(ing.unit))}
                          >
                            <Text style={s.qtyBtnText}>−</Text>
                          </TouchableOpacity>
                          <TextInput
                            style={s.qtyValInput}
                            value={String(ing.qty)}
                            onChangeText={v => setQtyDirect(di, ii, v)}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                          />
                          <TouchableOpacity
                            style={s.qtyBtn}
                            onPress={() => updateQty(di, ii, qtyStep(ing.unit))}
                          >
                            <Text style={s.qtyBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          style={s.unitPill}
                          onPress={() => setUnitPickerFor(pickerOpen ? null : { di, ii })}
                        >
                          <Text style={s.unitPillText}>{ing.unit}</Text>
                          <Text style={s.unitPillArrow}>▾</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => deleteIngredient(di, ii)}
                          hitSlop={8}
                          style={s.ingDeleteBtn}
                        >
                          <Text style={s.ingDeleteText}>×</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Unit dropdown */}
                      {pickerOpen && (
                        <View style={s.unitDropdown}>
                          {ing.unitOptions.map(opt => (
                            <TouchableOpacity
                              key={opt}
                              style={[s.unitOpt, ing.unit === opt && s.unitOptActive]}
                              onPress={() => updateUnit(di, ii, opt)}
                            >
                              <Text style={[s.unitOptText, ing.unit === opt && s.unitOptTextActive]}>{opt}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      {/* Editable macro cells */}
                      <View style={s.macroRow}>
                        {MACRO_FIELDS.map(m => (
                          <View key={m.field} style={s.macroCell}>
                            <TextInput
                              style={[s.macroCellInput, { color: m.color }]}
                              value={String(Math.round(ing[m.field]))}
                              onChangeText={v => updateIngMacro(di, ii, m.field, v)}
                              keyboardType="decimal-pad"
                              selectTextOnFocus
                            />
                            <Text style={s.macroCellLbl}>{m.lbl}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )
                })}

                {/* Add ingredient — inline form or ghost button */}
                {addingIngFor === di ? (
                  <View style={s.addForm}>
                    <TextInput
                      style={s.addFormInput}
                      placeholder="Search ingredient (e.g. jam)"
                      placeholderTextColor={Colors.text3}
                      value={newIngName}
                      onChangeText={handleIngNameChange}
                      autoFocus
                    />

                    {isSearching && (
                      <View style={s.searchLoadingRow}>
                        <ActivityIndicator size="small" color={Colors.accent} />
                        <Text style={s.searchLoadingText}>Searching…</Text>
                      </View>
                    )}

                    {searchResults.length > 0 && (
                      <View style={s.searchResults}>
                        {searchResults.map((p, pi) => {
                          const n = p.nutriments as any
                          const kcal = Math.round(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? (n['energy_100g'] || 0) / 4.184)
                          return (
                            <TouchableOpacity
                              key={pi}
                              style={s.searchResult}
                              onPress={() => selectOFFProduct(p)}
                            >
                              <Text style={s.searchResultName} numberOfLines={1}>{p.product_name}</Text>
                              <Text style={s.searchResultMacro}>{kcal} kcal/100g</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    )}

                    {/* Empty results — show Add manually */}
                    {hasSearched && !isSearching && searchResults.length === 0 && !manualMode && (
                      <View style={s.emptyResults}>
                        <Text style={s.emptyResultsText}>No matches in food database</Text>
                        <TouchableOpacity style={s.manualBtn} onPress={enableManualMode}>
                          <Text style={s.manualBtnText}>+ Add manually</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Qty + Unit */}
                    <View style={s.addFormRow}>
                      <View style={s.addFormCell}>
                        <Text style={s.addFormLabel}>QTY</Text>
                        <TextInput
                          style={s.addFormNum}
                          value={newIngQty}
                          onChangeText={setNewIngQty}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                        />
                      </View>
                      <View style={s.addFormCell}>
                        <Text style={s.addFormLabel}>UNIT</Text>
                        <TextInput
                          style={s.addFormNum}
                          value={newIngUnit}
                          onChangeText={setNewIngUnit}
                        />
                      </View>
                    </View>

                    {/* Manual macro inputs */}
                    {manualMode && (
                      <View style={s.addFormRow4}>
                        {[
                          { lbl: 'KCAL', val: newIngCalories, set: setNewIngCalories, color: Colors.accent },
                          { lbl: 'P g',  val: newIngProtein,  set: setNewIngProtein,  color: Colors.green },
                          { lbl: 'C g',  val: newIngCarbs,    set: setNewIngCarbs,    color: Colors.blue },
                          { lbl: 'F g',  val: newIngFat,      set: setNewIngFat,      color: Colors.warning },
                        ].map(c => (
                          <View key={c.lbl} style={s.addFormCell}>
                            <Text style={s.addFormLabel}>{c.lbl}</Text>
                            <TextInput
                              style={[s.addFormNum, { color: c.color }]}
                              value={c.val}
                              onChangeText={c.set}
                              keyboardType="decimal-pad"
                              selectTextOnFocus
                            />
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={s.addFormActions}>
                      <TouchableOpacity style={s.btnSecondarySmall} onPress={closeAddForm}>
                        <Text style={s.btnSecondaryText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.btnPrimarySmall, !newIngName.trim() && { opacity: 0.4 }]}
                        onPress={() => addIngredient(di)}
                        disabled={!newIngName.trim()}
                      >
                        <Text style={s.btnPrimaryText}>Add ingredient</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={s.ghostBtn} onPress={() => openAddForm(di)}>
                    <Text style={s.ghostBtnText}>+ Add ingredient</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {/* Footer totals */}
            <View style={s.totalsCard}>
              <Text style={s.totalsLabel}>TOTAL FOR THIS LOG</Text>
              <View style={s.totalsRow}>
                {[
                  { val: Math.round(totals.calories),  lbl: 'KCAL',    color: Colors.accent  },
                  { val: Math.round(totals.protein_g), lbl: 'PROTEIN', color: Colors.green   },
                  { val: Math.round(totals.carbs_g),   lbl: 'CARBS',   color: Colors.blue    },
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
          </ScrollView>

          {/* Bottom action bar */}
          <View style={s.bottomBar}>
            <TouchableOpacity style={s.btnPrimary} onPress={handleSave} activeOpacity={0.85}>
              <Text style={s.btnPrimaryText}>
                Save {dishes.length} {dishes.length === 1 ? 'dish' : 'dishes'} ✓
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnCancel} onPress={onClose} activeOpacity={0.6}>
              <Text style={s.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Export helper — converts ConfirmDish[] → ParsedFood[] for saving
// ---------------------------------------------------------------------------
export function dishesToParsedFoods(dishes: ConfirmDish[]) {
  return dishes.map(d => ({
    name:         d.name,
    calories:     Math.round(d.calories),
    protein_g:    Math.round(d.protein_g),
    carbs_g:      Math.round(d.carbs_g),
    fat_g:        Math.round(d.fat_g),
    serving_size: 1,
    serving_unit: 'serving',
  }))
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  screen: {
    flex: 1, backgroundColor: Colors.bg,
    alignItems: 'center',
  },
  content: {
    padding: Spacing.md, paddingTop: Spacing.lg,
    gap: Spacing.md, width: '100%',
  },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title:     { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.text1 },
  sub:       { fontSize: FontSize.sm, color: Colors.text2, marginTop: 2 },

  badgeOrange: {
    backgroundColor: 'rgba(255,77,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,77,0,0.3)',
    borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.accent, letterSpacing: 0.5 },

  // Transcript
  transcriptPill: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm,
  },
  transcriptIcon: { fontSize: 14 },
  transcriptText: { flex: 1, fontSize: FontSize.sm, color: Colors.text2, fontStyle: 'italic' },

  // Dish card
  dishCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: Spacing.sm,
  },
  dishNameRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  dishName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text1, flexShrink: 1 },
  dishNamePen: { fontSize: 11, color: Colors.text3 },
  dishNameInput: {
    flex: 1,
    fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text1,
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.accent,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
  },
  dishDelete: { fontSize: 22, color: Colors.text3, paddingHorizontal: 6, lineHeight: 22 },

  // Dish total (top)
  dishTotalTop: {
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    borderStyle: 'dashed',
  },

  // Ingredient row
  ing: {
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    padding: Spacing.sm, gap: Spacing.sm,
  },
  ingTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ingName: { flex: 1, fontSize: FontSize.sm, color: Colors.text1, fontWeight: FontWeight.semibold },

  qtyControl: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.bg, borderRadius: Radius.full,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  qtyBtn: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 14, color: Colors.text1, lineHeight: 16 },
  qtyValInput: {
    fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text1,
    minWidth: 30, textAlign: 'center', padding: 0,
  },

  unitPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.bg, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 8, paddingVertical: 4,
  },
  unitPillText:  { fontSize: FontSize.xs, color: Colors.text2, fontWeight: FontWeight.semibold },
  unitPillArrow: { fontSize: 9, color: Colors.text3 },

  ingDeleteBtn: { padding: 2 },
  ingDeleteText: { fontSize: 16, color: Colors.text3, lineHeight: 16 },

  // Unit dropdown
  unitDropdown: {
    backgroundColor: Colors.bg, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  unitOpt:           { paddingVertical: 8, paddingHorizontal: Spacing.md },
  unitOptActive:     { backgroundColor: 'rgba(255,77,0,0.1)' },
  unitOptText:       { fontSize: FontSize.sm, color: Colors.text2 },
  unitOptTextActive: { color: Colors.accent, fontWeight: FontWeight.bold },

  // Macro cells
  macroRow: { flexDirection: 'row', gap: 4 },
  macroCell: {
    flex: 1, alignItems: 'center',
    backgroundColor: Colors.bg, borderRadius: 6,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 5, paddingHorizontal: 2,
  },
  macroCellLarge: { paddingVertical: 9 },
  macroCellInput: {
    fontSize: 13, fontWeight: FontWeight.bold,
    textAlign: 'center', width: '100%', padding: 0,
  },
  macroCellInputLarge: { fontSize: 16 },
  macroCellLbl: {
    fontSize: 9, color: Colors.text3,
    fontWeight: FontWeight.bold, letterSpacing: 0.4,
    marginTop: 1,
  },

  // Ghost add button
  ghostBtn: {
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    borderRadius: Radius.md, paddingVertical: 9,
    alignItems: 'center',
  },
  ghostBtnText: { fontSize: FontSize.sm, color: Colors.text3, fontWeight: FontWeight.medium },

  // Add-ingredient inline form
  addForm: {
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.accent,
    padding: Spacing.sm, gap: Spacing.sm,
  },
  addFormInput: {
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, paddingVertical: 8,
    fontSize: FontSize.base, color: Colors.text1,
  },
  addFormRow:  { flexDirection: 'row', gap: Spacing.sm },
  addFormRow4: { flexDirection: 'row', gap: 4 },
  addFormCell: { flex: 1 },
  addFormLabel: {
    fontSize: 9, color: Colors.text3, fontWeight: FontWeight.bold,
    letterSpacing: 0.6, marginBottom: 3,
  },
  addFormNum: {
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 6, paddingVertical: 6,
    fontSize: FontSize.sm, color: Colors.text1,
    textAlign: 'center',
  },
  addFormActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 2 },

  searchLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  searchLoadingText: { fontSize: FontSize.xs, color: Colors.text3 },

  searchResults: {
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  searchResult: {
    paddingHorizontal: Spacing.sm, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  searchResultName:  { fontSize: FontSize.sm, color: Colors.text1, fontWeight: FontWeight.semibold },
  searchResultMacro: { fontSize: FontSize.xs, color: Colors.text3, marginTop: 2 },

  emptyResults: {
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, alignItems: 'center', gap: Spacing.sm,
  },
  emptyResultsText: { fontSize: FontSize.sm, color: Colors.text3 },
  manualBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
  },
  manualBtnText: { fontSize: FontSize.sm, color: Colors.accent, fontWeight: FontWeight.bold },

  // Totals
  totalsCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm,
  },
  totalsLabel: { fontSize: 10, color: Colors.text3, fontWeight: FontWeight.bold, letterSpacing: 1 },
  totalsRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  totalCell:   { alignItems: 'center' },
  totalVal:    { fontSize: FontSize.xl, fontWeight: FontWeight.black },
  totalLbl:    { fontSize: 9, color: Colors.text3, marginTop: 2, fontWeight: FontWeight.bold, letterSpacing: 0.4 },

  // Bottom bar
  bottomBar: {
    width: '100%', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border,
    paddingBottom: Spacing.sm,
  },
  btnPrimary: {
    backgroundColor: Colors.accent, borderRadius: Radius.full, height: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  btnPrimarySmall: {
    flex: 1,
    backgroundColor: Colors.accent, borderRadius: Radius.full,
    paddingVertical: 9, alignItems: 'center', justifyContent: 'center',
  },
  btnSecondarySmall: {
    flex: 1,
    backgroundColor: Colors.bg, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 9, alignItems: 'center', justifyContent: 'center',
  },
  btnPrimaryText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#fff' },
  btnSecondaryText: { fontSize: FontSize.sm, color: Colors.text2, fontWeight: FontWeight.semibold },
  btnCancel: { alignItems: 'center', paddingVertical: Spacing.sm },
  btnCancelText: { fontSize: FontSize.base, color: Colors.text3 },
})
