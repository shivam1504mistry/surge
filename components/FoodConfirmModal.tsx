/**
 * FoodConfirmModal.tsx
 *
 * 3-screen food confirmation flow:
 *   Screen ①  — Dish Macros tab (default) + Ingredients tab (secondary)
 *   Screen ③  — Multi-dish review with editable macros inline
 *
 * Changes from v1:
 *   - Macros tab is now the default (ingredients are secondary)
 *   - Per-ingredient macros: qty changes recompute dish totals dynamically
 *   - Add ingredient: Open Food Facts search with auto-fill macros
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
  calories:    number   // total kcal for current qty+unit
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mealSlotFromNow(): 'breakfast' | 'lunch' | 'dinner' | 'snacks' {
  const h = new Date().getHours()
  if (h >= 5  && h < 11) return 'breakfast'
  if (h >= 11 && h < 16) return 'lunch'
  if (h >= 16 && h < 21) return 'dinner'
  return 'snacks'
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function FoodConfirmModal({ visible, dishes: init, transcript, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const [dishes,        setDishes]        = useState<ConfirmDish[]>(init)
  const [screen,        setScreen]        = useState<'dish' | 'review'>('dish')
  const [activeDishIdx, setActiveDishIdx] = useState(0)
  const [tab,           setTab]           = useState<'macros' | 'ingredients'>('macros')
  const [unitPickerFor,       setUnitPickerFor]       = useState<number | null>(null)
  const [unitPickerForReview, setUnitPickerForReview] = useState<{di:number,ii:number} | null>(null)

  // Add ingredient form
  const [addingIng,      setAddingIng]      = useState(false)
  const [newIngName,     setNewIngName]     = useState('')
  const [newIngQty,      setNewIngQty]      = useState('100')
  const [newIngUnit,     setNewIngUnit]     = useState('g')
  const [newIngCalories, setNewIngCalories] = useState('0')
  const [newIngProtein,  setNewIngProtein]  = useState('0')
  const [newIngCarbs,    setNewIngCarbs]    = useState('0')
  const [newIngFat,      setNewIngFat]      = useState('0')

  // OFF search
  const [searchResults,  setSearchResults]  = useState<OFFProduct[]>([])
  const [isSearching,    setIsSearching]    = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dish = dishes[activeDishIdx] ?? dishes[0]

  // Sync dishes from props each time the modal opens
  useEffect(() => {
    if (visible && init.length > 0) {
      track('food_confirm_open', { dish_count: init.length })
      setDishes(init)
      // If multiple dishes, go straight to review so user sees all of them
      setScreen(init.length > 1 ? 'review' : 'dish')
      setActiveDishIdx(0)
      setTab('macros')
      setUnitPickerFor(null)
      setAddingIng(false)
      setSearchResults([])
    }
  }, [visible])

  if (!visible) return null
  if (!dish)    return null

  // ── ingredient mutations ──────────────────────────────────────────────────

  function updateQty(ingIdx: number, delta: number) {
    setDishes(prev => prev.map((d, di) => {
      if (di !== activeDishIdx) return d
      const ings = d.ingredients.map((ing, ii) => {
        if (ii !== ingIdx) return ing
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

  function updateUnit(ingIdx: number, unit: string) {
    setDishes(prev =>
      prev.map((d, di) =>
        di !== activeDishIdx ? d : {
          ...d,
          ingredients: d.ingredients.map((ing, ii) =>
            ii === ingIdx ? { ...ing, unit } : ing
          ),
        }
      )
    )
    setUnitPickerFor(null)
  }

  function addIngredient() {
    if (!newIngName.trim()) return
    const ing: ConfirmIngredient = {
      name:        newIngName.trim(),
      qty:         parseFloat(newIngQty) || 100,
      unit:        newIngUnit.trim() || 'g',
      unitOptions: [newIngUnit.trim() || 'g', 'g', 'ml', 'piece'],
      calories:    parseFloat(newIngCalories) || 0,
      protein_g:   parseFloat(newIngProtein)  || 0,
      carbs_g:     parseFloat(newIngCarbs)    || 0,
      fat_g:       parseFloat(newIngFat)      || 0,
    }
    setDishes(prev =>
      prev.map((d, di) => {
        if (di !== activeDishIdx) return d
        const ings = [...d.ingredients, ing]
        return { ...d, ingredients: ings, ...recomputeMacros(ings) }
      })
    )
    resetAddForm()
  }

  function resetAddForm() {
    setNewIngName('')
    setNewIngQty('100')
    setNewIngUnit('g')
    setNewIngCalories('0')
    setNewIngProtein('0')
    setNewIngCarbs('0')
    setNewIngFat('0')
    setSearchResults([])
    setAddingIng(false)
  }

  // ── OFF search ────────────────────────────────────────────────────────────

  function handleIngNameChange(text: string) {
    setNewIngName(text)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (text.length < 2) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(() => searchOFF(text), 350)
  }

  async function searchOFF(q: string) {
    setIsSearching(true)
    try {
      const res  = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10`
      )
      const data = await res.json()
      // Accept any product with a name — kcal may be in different fields
      const filtered = (data.products ?? []).filter(
        (p: any) => p.product_name?.trim() && (
          (p.nutriments?.['energy-kcal_100g'] ?? 0) > 0 ||
          (p.nutriments?.['energy_100g'] ?? 0) > 0 ||
          (p.nutriments?.['energy-kcal'] ?? 0) > 0
        )
      ) as OFFProduct[]
      setSearchResults(filtered.slice(0, 5))
    } catch {
      setSearchResults([])
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
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
  }

  // ── macro mutations ───────────────────────────────────────────────────────

  function updateMacro(
    dishIdx: number,
    field: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g',
    raw: string
  ) {
    const newTotal = parseFloat(raw) || 0
    setDishes(prev => prev.map((d, di) => {
      if (di !== dishIdx) return d
      const ingTotal = d.ingredients.reduce((s, ing) => s + ing[field], 0)
      // Distribute delta proportionally across ingredients
      const ings = ingTotal > 0
        ? d.ingredients.map(ing => ({
            ...ing,
            [field]: parseFloat(((ing[field] / ingTotal) * newTotal).toFixed(1)),
          }))
        : d.ingredients // no ingredients to scale — just update dish total
      return { ...d, [field]: newTotal, ingredients: ings }
    }))
  }

  // ── navigation ────────────────────────────────────────────────────────────

  function goToReview() {
    setUnitPickerFor(null)
    setAddingIng(false)
    setSearchResults([])
    setScreen('review')
  }

  function editDish(idx: number) {
    setActiveDishIdx(idx)
    setTab('macros')
    setUnitPickerFor(null)
    setAddingIng(false)
    setSearchResults([])
    setScreen('dish')
  }

  function addNewDish() {
    const blank: ConfirmDish = {
      name:        'New dish',
      ingredients: [{ name: 'Ingredient', qty: 100, unit: 'g', unitOptions: ['g', 'ml', 'piece'], calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }],
      calories:    0,
      protein_g:   0,
      carbs_g:     0,
      fat_g:       0,
    }
    setDishes(prev => [...prev, blank])
    setActiveDishIdx(dishes.length)
    setTab('macros')
    setScreen('dish')
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

          {screen === 'dish' ? (
            // ────────────────────────────────────────────────────────────────
            // SCREEN ①/② — Single dish view
            // ────────────────────────────────────────────────────────────────
            <>
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
                    <Text style={s.sub}>Review before saving</Text>
                  </View>
                  <View style={s.badgeOrange}><Text style={s.badgeText}>AI GUESS</Text></View>
                </View>

                {/* Transcript pill */}
                <View style={s.transcriptPill}>
                  <Text style={s.transcriptIcon}>🎤</Text>
                  <Text style={s.transcriptText} numberOfLines={1}>{transcript}</Text>
                </View>

                {/* Dish card */}
                <View style={s.dishCard}>
                  {/* Dish header */}
                  <View style={s.dishHeader}>
                    <Text style={s.dishName}>{dish.name}</Text>
                    <Text style={s.dishCals}>~{Math.round(dish.calories)} kcal</Text>
                  </View>

                  {/* Tab bar — Macros first */}
                  <View style={s.tabBarWrap}>
                    <View style={s.tabBar}>
                      <TouchableOpacity
                        style={[s.tab, tab === 'macros' && s.tabActive]}
                        onPress={() => { setTab('macros'); setUnitPickerFor(null) }}
                      >
                        <Text style={[s.tabText, tab === 'macros' && s.tabTextActive]}>
                          Dish Macros
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.tab, tab === 'ingredients' && s.tabActive]}
                        onPress={() => { setTab('ingredients'); setUnitPickerFor(null) }}
                      >
                        <Text style={[s.tabText, tab === 'ingredients' && s.tabTextActive]}>
                          Ingredients
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {tab === 'macros' ? (
                    // ── Macros tab (default) ──
                    <>
                      {[
                        { label: 'Calories', field: 'calories'  as const, unit: 'kcal', color: Colors.accent },
                        { label: 'Protein',  field: 'protein_g' as const, unit: 'g',    color: Colors.green },
                        { label: 'Carbs',    field: 'carbs_g'   as const, unit: 'g',    color: Colors.blue },
                        { label: 'Fat',      field: 'fat_g'     as const, unit: 'g',    color: Colors.warning },
                      ].map(m => (
                        <View key={m.field} style={s.macroEditRow}>
                          <Text style={s.macroEditLabel}>{m.label}</Text>
                          <TextInput
                            style={[s.macroEditInput, { color: m.color }]}
                            value={String(Math.round(dish[m.field]))}
                            onChangeText={v => updateMacro(activeDishIdx, m.field, v)}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                          />
                          <Text style={s.macroEditUnit}>{m.unit}</Text>
                        </View>
                      ))}
                    </>
                  ) : (
                    // ── Ingredients tab ──
                    <>
                      {dish.ingredients.map((ing, i) => (
                        <View key={i}>
                          <View style={s.ingRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.ingName}>{ing.name}</Text>
                              {ing.calories > 0 && (
                                <Text style={s.ingMacroHint}>
                                  {Math.round(ing.calories)} kcal · P{Math.round(ing.protein_g)} C{Math.round(ing.carbs_g)} F{Math.round(ing.fat_g)}
                                </Text>
                              )}
                            </View>
                            <View style={s.qtyControl}>
                              <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(i, -0.5)}>
                                <Text style={s.qtyBtnText}>−</Text>
                              </TouchableOpacity>
                              <Text style={s.qtyVal}>{ing.qty}</Text>
                              <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(i, 0.5)}>
                                <Text style={s.qtyBtnText}>+</Text>
                              </TouchableOpacity>
                            </View>
                            <TouchableOpacity
                              style={s.unitPill}
                              onPress={() => setUnitPickerFor(unitPickerFor === i ? null : i)}
                            >
                              <Text style={s.unitPillText}>{ing.unit}</Text>
                              <Text style={s.unitPillArrow}>▾</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Inline unit picker */}
                          {unitPickerFor === i && (
                            <View style={s.unitDropdown}>
                              {ing.unitOptions.map(opt => (
                                <TouchableOpacity
                                  key={opt}
                                  style={[s.unitOpt, ing.unit === opt && s.unitOptActive]}
                                  onPress={() => updateUnit(i, opt)}
                                >
                                  <Text style={[s.unitOptText, ing.unit === opt && s.unitOptTextActive]}>
                                    {opt}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      ))}

                      {/* Add ingredient */}
                      {addingIng ? (
                        <View style={s.addIngForm}>
                          {/* Name + search */}
                          <TextInput
                            style={s.addIngInput}
                            placeholder="Search ingredient (e.g. butter)"
                            placeholderTextColor={Colors.text3}
                            value={newIngName}
                            onChangeText={handleIngNameChange}
                            autoFocus
                          />

                          {/* Search loading */}
                          {isSearching && (
                            <View style={s.searchLoadingRow}>
                              <ActivityIndicator size="small" color={Colors.accent} />
                              <Text style={s.searchLoadingText}>Searching…</Text>
                            </View>
                          )}

                          {/* Search results */}
                          {searchResults.length > 0 && (
                            <View style={s.searchDropdown}>
                              {searchResults.map((p, pi) => (
                                <TouchableOpacity
                                  key={pi}
                                  style={s.searchResult}
                                  onPress={() => selectOFFProduct(p)}
                                >
                                  <Text style={s.searchResultName} numberOfLines={1}>{p.product_name}</Text>
                                  <Text style={s.searchResultMacro}>
                                    {Math.round(p.nutriments['energy-kcal_100g'] ?? 0)} kcal/100g
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}

                          {/* Qty + Unit row */}
                          <View style={s.addIngRow2}>
                            <TextInput
                              style={[s.addIngInput, { width: 72, flex: 0 }]}
                              placeholder="Qty"
                              placeholderTextColor={Colors.text3}
                              value={newIngQty}
                              onChangeText={setNewIngQty}
                              keyboardType="decimal-pad"
                            />
                            <TextInput
                              style={[s.addIngInput, { width: 72, flex: 0 }]}
                              placeholder="Unit"
                              placeholderTextColor={Colors.text3}
                              value={newIngUnit}
                              onChangeText={setNewIngUnit}
                            />
                            <TouchableOpacity style={s.addIngConfirm} onPress={addIngredient}>
                              <Text style={s.addIngConfirmText}>Add</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={resetAddForm}>
                              <Text style={s.addIngCancelText}>Cancel</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Auto-filled macro preview */}
                          {parseFloat(newIngCalories) > 0 && (
                            <View style={s.autoMacroRow}>
                              <Text style={s.autoMacroText}>
                                Auto-filled: {newIngCalories} kcal · P{newIngProtein}g C{newIngCarbs}g F{newIngFat}g
                              </Text>
                            </View>
                          )}
                        </View>
                      ) : (
                        <TouchableOpacity style={s.addIngRowBtn} onPress={() => setAddingIng(true)}>
                          <View style={s.addIngIcon}>
                            <Text style={{ color: Colors.accent, fontSize: 14, fontWeight: '700' }}>+</Text>
                          </View>
                          <Text style={s.addIngText}>Add another ingredient</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>

                {/* Add another dish */}
                <TouchableOpacity style={s.addDishBtn} onPress={goToReview}>
                  <Text style={s.addDishPlus}>+</Text>
                  <Text style={s.addDishText}>Add another dish</Text>
                </TouchableOpacity>

                {/* Confidence hint */}
                <View style={s.confidenceRow}>
                  <View style={s.confidenceDot} />
                  <Text style={s.confidenceText}>AI estimate · tap any value to edit</Text>
                </View>
              </ScrollView>

              <View style={s.bottomBar}>
                <TouchableOpacity style={s.btnPrimary} onPress={handleSave} activeOpacity={0.85}>
                  <Text style={s.btnPrimaryText}>Save log ✓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnCancel} onPress={onClose} activeOpacity={0.6}>
                  <Text style={s.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>

          ) : (
            // ────────────────────────────────────────────────────────────────
            // SCREEN ③ — Multi-dish review (inline editable, no Edit button)
            // ────────────────────────────────────────────────────────────────
            <>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[s.content, { paddingTop: Spacing.md }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Header — no subtext */}
                <View style={s.headerRow}>
                  <Text style={s.title}>Review all dishes</Text>
                  <View style={s.badgeGreen}><Text style={[s.badgeText, { color: Colors.green }]}>READY</Text></View>
                </View>

                {dishes.map((d, di) => (
                  <View key={di} style={s.summaryDish}>
                    {/* Dish name */}
                    <View style={s.summaryDishHeader}>
                      <Text style={s.summaryDishName}>{d.name}</Text>
                      <Text style={s.dishTotalKcal}>~{Math.round(d.calories)} kcal</Text>
                    </View>

                    {/* Per-ingredient rows with inline qty + macros */}
                    {d.ingredients.map((ing, ii) => {
                      const reviewPickerOpen = unitPickerForReview?.di === di && unitPickerForReview?.ii === ii
                      return (
                      <View key={ii} style={s.reviewIngRow}>
                        {/* Name + qty controls */}
                        <View style={s.reviewIngTop}>
                          <Text style={s.reviewIngName} numberOfLines={1}>{ing.name}</Text>
                          <View style={s.qtyControl}>
                            <TouchableOpacity
                              style={s.qtyBtn}
                              onPress={() => {
                                setActiveDishIdx(di)
                                updateQty(ii, -0.5)
                              }}
                            >
                              <Text style={s.qtyBtnText}>−</Text>
                            </TouchableOpacity>
                            <Text style={s.qtyVal}>{ing.qty}</Text>
                            <TouchableOpacity
                              style={s.qtyBtn}
                              onPress={() => {
                                setActiveDishIdx(di)
                                updateQty(ii, 0.5)
                              }}
                            >
                              <Text style={s.qtyBtnText}>+</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={s.unitPill}
                              onPress={() => setUnitPickerForReview(reviewPickerOpen ? null : {di, ii})}
                            >
                              <Text style={s.unitPillText}>{ing.unit}</Text>
                              <Text style={s.unitPillArrow}>▾</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        {/* Unit dropdown for review screen */}
                        {reviewPickerOpen && (
                          <View style={s.unitDropdown}>
                            {ing.unitOptions.map(opt => (
                              <TouchableOpacity
                                key={opt}
                                style={[s.unitOpt, ing.unit === opt && s.unitOptActive]}
                                onPress={() => {
                                  setDishes(prev => prev.map((dd, ddi) =>
                                    ddi !== di ? dd : {
                                      ...dd,
                                      ingredients: dd.ingredients.map((ing2, ii2) =>
                                        ii2 !== ii ? ing2 : { ...ing2, unit: opt }
                                      ),
                                    }
                                  ))
                                  setUnitPickerForReview(null)
                                }}
                              >
                                <Text style={[s.unitOptText, ing.unit === opt && s.unitOptTextActive]}>{opt}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}

                        {/* Inline macro inputs per ingredient */}
                        {ing.calories > 0 && (
                          <View style={s.reviewIngMacros}>
                            {([
                              { field: 'calories'  as const, lbl: 'kcal', color: Colors.accent },
                              { field: 'protein_g' as const, lbl: 'P',    color: Colors.green },
                              { field: 'carbs_g'   as const, lbl: 'C',    color: Colors.blue },
                              { field: 'fat_g'     as const, lbl: 'F',    color: Colors.warning },
                            ] as const).map(m => (
                              <View key={m.field} style={s.reviewMacroCell}>
                                <TextInput
                                  style={[s.reviewMacroInput, { color: m.color }]}
                                  value={String(Math.round(ing[m.field]))}
                                  onChangeText={v => {
                                    const val = parseFloat(v) || 0
                                    setDishes(prev => prev.map((dd, ddi) => {
                                      if (ddi !== di) return dd
                                      const ings = dd.ingredients.map((ing2, ii2) =>
                                        ii2 !== ii ? ing2 : { ...ing2, [m.field]: val }
                                      )
                                      return { ...dd, ingredients: ings, ...recomputeMacros(ings) }
                                    }))
                                  }}
                                  keyboardType="decimal-pad"
                                  selectTextOnFocus
                                />
                                <Text style={s.reviewMacroLbl}>{m.lbl}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )})}

                    {/* Dish-level macro grid (editable, shown below ingredients) */}
                    <View style={s.macroGrid}>
                      {[
                        { field: 'calories'  as const, label: 'KCAL',   color: Colors.accent },
                        { field: 'protein_g' as const, label: 'PROTEIN', color: Colors.green },
                        { field: 'carbs_g'   as const, label: 'CARBS',  color: Colors.blue },
                        { field: 'fat_g'     as const, label: 'FAT',    color: Colors.warning },
                      ].map(m => (
                        <View key={m.field} style={s.macroCell}>
                          <TextInput
                            style={[s.macroCellInput, { color: m.color }]}
                            value={String(Math.round(d[m.field]))}
                            onChangeText={v => updateMacro(di, m.field, v)}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                          />
                          <Text style={s.macroCellLabel}>{m.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}

                {/* Totals */}
                <View style={s.totalsCard}>
                  <Text style={s.totalsLabel}>TOTAL FOR THIS LOG</Text>
                  <View style={s.totalsRow}>
                    {[
                      { val: Math.round(totals.calories),  lbl: 'KCAL',    color: Colors.accent },
                      { val: Math.round(totals.protein_g), lbl: 'PROTEIN', color: Colors.green  },
                      { val: Math.round(totals.carbs_g),   lbl: 'CARBS',   color: Colors.blue   },
                      { val: Math.round(totals.fat_g),     lbl: 'FAT',     color: Colors.warning },
                    ].map(t => (
                      <View key={t.lbl} style={s.totalCell}>
                        <Text style={[s.totalVal, { color: t.color }]}>{t.val}{t.lbl !== 'KCAL' ? 'g' : ''}</Text>
                        <Text style={s.totalLbl}>{t.lbl}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Add another dish */}
                <TouchableOpacity style={s.addDishBtn} onPress={addNewDish}>
                  <Text style={s.addDishPlus}>+</Text>
                  <Text style={s.addDishText}>Add another dish</Text>
                </TouchableOpacity>
              </ScrollView>

              <View style={s.bottomBar}>
                <TouchableOpacity style={s.btnGreen} onPress={handleSave} activeOpacity={0.85}>
                  <Text style={s.btnPrimaryText}>Save meal log ✓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnCancel} onPress={onClose} activeOpacity={0.6}>
                  <Text style={s.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
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

  // Badge
  badgeOrange: {
    backgroundColor: 'rgba(255,77,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,77,0,0.3)',
    borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeGreen: {
    backgroundColor: 'rgba(0,210,106,0.1)',
    borderWidth: 1, borderColor: 'rgba(0,210,106,0.25)',
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
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  dishHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dishName: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text1 },
  dishCals: { fontSize: FontSize.sm, color: Colors.accent, fontWeight: FontWeight.bold },

  // Tab bar
  tabBarWrap: { padding: Spacing.sm, paddingBottom: 0 },
  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.bg,
    borderRadius: Radius.md, padding: 3, gap: 2,
    borderWidth: 1, borderColor: Colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: Radius.sm },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text3 },
  tabTextActive: { color: '#fff' },

  // Macro edit rows (macros tab)
  macroEditRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  macroEditLabel: { flex: 1, fontSize: FontSize.base, color: Colors.text2 },
  macroEditInput: {
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    fontSize: FontSize.base, fontWeight: FontWeight.bold,
    width: 72, textAlign: 'right',
  },
  macroEditUnit: { fontSize: FontSize.sm, color: Colors.text3, marginLeft: 6, width: 32 },

  // Ingredient rows
  ingRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  ingName: { fontSize: FontSize.base, color: Colors.text1, fontWeight: FontWeight.medium },
  ingMacroHint: { fontSize: FontSize.xs, color: Colors.text3, marginTop: 2 },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 24, height: 24, backgroundColor: Colors.bg,
    borderRadius: 6, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 16, color: Colors.text1, lineHeight: 20 },
  qtyVal: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text1, minWidth: 28, textAlign: 'center' },
  unitPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 8, paddingVertical: 4,
  },
  unitPillText:  { fontSize: FontSize.xs, color: Colors.text2, fontWeight: FontWeight.semibold },
  unitPillArrow: { fontSize: 9, color: Colors.text3 },

  // Unit dropdown
  unitDropdown: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: Spacing.md, marginBottom: 4,
  },
  unitOpt:           { paddingVertical: 9, paddingHorizontal: Spacing.md },
  unitOptActive:     { backgroundColor: 'rgba(255,77,0,0.08)' },
  unitOptText:       { fontSize: FontSize.sm, color: Colors.text2 },
  unitOptTextActive: { color: Colors.accent, fontWeight: FontWeight.bold },

  // Add ingredient
  addIngRowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  addIngIcon: {
    width: 22, height: 22,
    backgroundColor: 'rgba(255,77,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,77,0,0.25)',
    borderRadius: 6, alignItems: 'center', justifyContent: 'center',
  },
  addIngText: { fontSize: FontSize.sm, color: Colors.accent, fontWeight: FontWeight.semibold },
  addIngForm: { padding: Spacing.md, gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  addIngInput: {
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, paddingVertical: 8,
    fontSize: FontSize.base, color: Colors.text1, flex: 1,
  },
  addIngRow2: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  addIngConfirm: {
    backgroundColor: Colors.accent, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
  },
  addIngConfirmText: { fontSize: FontSize.sm, color: '#fff', fontWeight: FontWeight.bold },
  addIngCancelText:  { fontSize: FontSize.sm, color: Colors.text3 },

  // OFF search
  searchLoadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 6,
  },
  searchLoadingText: { fontSize: FontSize.xs, color: Colors.text3 },
  searchDropdown: {
    backgroundColor: Colors.bg, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  searchResult: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  searchResultName:  { flex: 1, fontSize: FontSize.sm, color: Colors.text1 },
  searchResultMacro: { fontSize: FontSize.xs, color: Colors.accent, fontWeight: FontWeight.semibold, marginLeft: Spacing.sm },
  autoMacroRow: {
    backgroundColor: 'rgba(0,210,106,0.08)',
    borderRadius: Radius.sm, borderWidth: 1, borderColor: 'rgba(0,210,106,0.2)',
    padding: Spacing.sm,
  },
  autoMacroText: { fontSize: FontSize.xs, color: Colors.green },

  // Add dish
  addDishBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    borderRadius: Radius.lg, paddingVertical: 12,
  },
  addDishPlus: { fontSize: 18, color: Colors.text3 },
  addDishText: { fontSize: FontSize.sm, color: Colors.text3, fontWeight: FontWeight.semibold },

  // Confidence
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  confidenceDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green },
  confidenceText: { fontSize: FontSize.xs, color: Colors.text3 },

  // ── Review screen (③) ──
  summaryDish: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  summaryDishHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  summaryDishName:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text1, flex: 1 },
  dishTotalKcal:    { fontSize: FontSize.sm, color: Colors.accent, fontWeight: FontWeight.bold },
  editIngLink:      { fontSize: FontSize.sm, color: Colors.accent, fontWeight: FontWeight.semibold },

  // Per-ingredient row in review
  reviewIngRow: {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 6,
  },
  reviewIngTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  reviewIngName: {
    flex: 1, fontSize: FontSize.sm, color: Colors.text1,
    fontWeight: FontWeight.medium, marginRight: Spacing.sm,
  },
  reviewIngUnit: {
    fontSize: FontSize.xs, color: Colors.text3,
    fontWeight: FontWeight.semibold, marginLeft: 4,
  },
  reviewIngMacros: {
    flexDirection: 'row', gap: 4,
  },
  reviewMacroCell: {
    flex: 1, alignItems: 'center',
    backgroundColor: Colors.bg, borderRadius: 6,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 4,
  },
  reviewMacroInput: {
    fontSize: 12, fontWeight: FontWeight.bold,
    textAlign: 'center', width: '100%', padding: 0,
  },
  reviewMacroLbl: {
    fontSize: 8, color: Colors.text3,
    fontWeight: FontWeight.bold, letterSpacing: 0.3,
    marginTop: 1,
  },

  // Dish-level macro grid (below ingredients)
  macroGrid: {
    flexDirection: 'row',
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: 'rgba(255,77,0,0.03)',
  },
  macroCell: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRightWidth: 1, borderRightColor: Colors.border,
  },
  macroCellInput: {
    fontSize: FontSize.md, fontWeight: FontWeight.black,
    textAlign: 'center', width: '100%', padding: 0,
  },
  macroCellLabel: { fontSize: 9, color: Colors.text3, marginTop: 2, fontWeight: FontWeight.bold, letterSpacing: 0.4 },

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
  btnGreen: {
    backgroundColor: Colors.green, borderRadius: Radius.full, height: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  btnPrimaryText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#fff' },
  btnCancel: { alignItems: 'center', paddingVertical: Spacing.sm },
  btnCancelText: { fontSize: FontSize.base, color: Colors.text3 },
})

// ---------------------------------------------------------------------------
// Export helper — converts ConfirmDish[] → ParsedFood[] for saving
// ---------------------------------------------------------------------------
export function dishesToParsedFoods(dishes: ConfirmDish[]) {
  const slot = mealSlotFromNow()
  return dishes.map(d => ({
    name:         d.name,
    calories:     Math.round(d.calories),
    protein_g:    Math.round(d.protein_g),
    carbs_g:      Math.round(d.carbs_g),
    fat_g:        Math.round(d.fat_g),
    serving_size: 1,
    serving_unit: 'serving',
    meal_slot:    slot,
  }))
}
