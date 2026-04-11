import React, { useState, useCallback, useRef } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme'
import { MealSlot } from '../stores/nutritionStore'

// ---------------------------------------------------------------------------
// expo-camera is an optional peer dep for barcode scanning.
// Gracefully degrade if it's not installed yet.
// Install with: npx expo install expo-camera
// ---------------------------------------------------------------------------
let CameraView: any   = null
let useCameraPermissions: any = () => [null, async () => {}]
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cam = require('expo-camera')
  CameraView            = cam.CameraView
  useCameraPermissions  = cam.useCameraPermissions
} catch {
  // expo-camera not installed — barcode scanner will show an install prompt
}

// ---------------------------------------------------------------------------
// Open Food Facts helpers
// ---------------------------------------------------------------------------
const OFF_BASE = 'https://world.openfoodfacts.org'

interface OFFProduct {
  code:         string
  product_name: string
  serving_size?: string
  nutriments: {
    'energy-kcal_100g'?:    number
    'proteins_100g'?:       number
    'carbohydrates_100g'?:  number
    'fat_100g'?:            number
  }
}

interface NormalisedFood {
  off_food_id:  string
  food_name:    string
  kcal_per_100: number
  protein_per_100: number
  carbs_per_100:   number
  fat_per_100:     number
  default_serving: number
  serving_unit:    string
}

function normalise(p: OFFProduct): NormalisedFood {
  const n = p.nutriments
  return {
    off_food_id:      p.code,
    food_name:        p.product_name || 'Unknown food',
    kcal_per_100:     n['energy-kcal_100g']   ?? 0,
    protein_per_100:  n['proteins_100g']       ?? 0,
    carbs_per_100:    n['carbohydrates_100g']  ?? 0,
    fat_per_100:      n['fat_100g']            ?? 0,
    default_serving:  100,
    serving_unit:     'g',
  }
}

async function searchOFF(query: string): Promise<NormalisedFood[]> {
  const url =
    `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
    `&json=1&page_size=20&fields=code,product_name,serving_size,nutriments`
  const res  = await fetch(url)
  const data = await res.json()
  return ((data.products ?? []) as OFFProduct[])
    .filter((p) => p.product_name)
    .map(normalise)
}

async function lookupBarcode(barcode: string): Promise<NormalisedFood | null> {
  const url  = `${OFF_BASE}/api/v0/product/${barcode}.json`
  const res  = await fetch(url)
  const data = await res.json()
  if (data.status !== 1 || !data.product) return null
  return normalise(data.product as OFFProduct)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface FoodLogPayload {
  food_name:    string
  calories:     number
  protein_g:    number
  carbs_g:      number
  fat_g:        number
  serving_size: number
  serving_unit: string
  meal_slot:    MealSlot
  off_food_id?: string
  source:       'search' | 'barcode'
}

interface Props {
  visible:     boolean
  initialSlot: MealSlot
  onClose:     () => void
  onSave:      (payload: FoodLogPayload) => void
}

// ---------------------------------------------------------------------------
// Serving units
// ---------------------------------------------------------------------------
const UNITS = ['g', 'ml', 'piece', 'katori', 'roti', 'cup', 'tbsp', 'tsp']
const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snacks']
const SLOT_EMOJI: Record<MealSlot, string> = {
  breakfast: '🌅',
  lunch:     '☀️',
  dinner:    '🌙',
  snacks:    '🍎',
}

// ---------------------------------------------------------------------------
// Sub-screens
// ---------------------------------------------------------------------------
type Screen = 'search' | 'barcode' | 'form'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function FoodSearchModal({ visible, initialSlot, onClose, onSave }: Props) {
  const [screen, setScreen]           = useState<Screen>('search')
  const [query, setQuery]             = useState('')
  const [results, setResults]         = useState<NormalisedFood[]>([])
  const [searching, setSearching]     = useState(false)
  const [selected, setSelected]       = useState<NormalisedFood | null>(null)
  const [servingSize, setServingSize] = useState('100')
  const [servingUnit, setServingUnit] = useState('g')
  const [mealSlot, setMealSlot]       = useState<MealSlot>(initialSlot)
  const searchTimeout                 = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Camera permissions (only used if expo-camera is installed)
  const [camPermission, requestCamPermission] = useCameraPermissions()

  // -------------------------------------------------------------------------
  // Reset when opening
  // -------------------------------------------------------------------------
  React.useEffect(() => {
    if (visible) {
      setScreen('search')
      setQuery('')
      setResults([])
      setSelected(null)
      setServingSize('100')
      setServingUnit('g')
      setMealSlot(initialSlot)
    }
  }, [visible, initialSlot])

  // -------------------------------------------------------------------------
  // Search with 500ms debounce
  // -------------------------------------------------------------------------
  const handleQueryChange = useCallback((text: string) => {
    setQuery(text)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (text.trim().length < 2) { setResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const found = await searchOFF(text.trim())
        setResults(found)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 500)
  }, [])

  // -------------------------------------------------------------------------
  // Select a food → go to form
  // -------------------------------------------------------------------------
  const selectFood = (food: NormalisedFood) => {
    setSelected(food)
    setServingSize(String(food.default_serving))
    setServingUnit(food.serving_unit)
    setScreen('form')
  }

  // -------------------------------------------------------------------------
  // Barcode scanned
  // -------------------------------------------------------------------------
  const handleBarcode = useCallback(async ({ data: barcode }: { data: string }) => {
    setScreen('search') // exit camera view
    setSearching(true)
    try {
      const food = await lookupBarcode(barcode)
      if (!food) {
        Alert.alert('Not found', "This barcode isn't in Open Food Facts. Try searching by name.")
        return
      }
      selectFood(food)
    } catch {
      Alert.alert('Error', 'Failed to look up barcode. Check your connection.')
    } finally {
      setSearching(false)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Computed macros for current serving
  // -------------------------------------------------------------------------
  const computedMacros = (() => {
    if (!selected) return null
    const factor = (parseFloat(servingSize) || 0) / 100
    return {
      calories:  Math.round(selected.kcal_per_100    * factor),
      protein_g: Math.round(selected.protein_per_100 * factor * 10) / 10,
      carbs_g:   Math.round(selected.carbs_per_100   * factor * 10) / 10,
      fat_g:     Math.round(selected.fat_per_100     * factor * 10) / 10,
    }
  })()

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  const handleSave = () => {
    if (!selected || !computedMacros) return
    const size = parseFloat(servingSize)
    if (!size || size <= 0) {
      Alert.alert('Invalid serving', 'Enter a valid serving size.')
      return
    }
    onSave({
      food_name:    selected.food_name,
      calories:     computedMacros.calories,
      protein_g:    computedMacros.protein_g,
      carbs_g:      computedMacros.carbs_g,
      fat_g:        computedMacros.fat_g,
      serving_size: size,
      serving_unit: servingUnit,
      meal_slot:    mealSlot,
      off_food_id:  selected.off_food_id,
      source:       screen === 'barcode' ? 'barcode' : 'search',
    })
  }

  // -------------------------------------------------------------------------
  // Barcode screen
  // -------------------------------------------------------------------------
  const renderBarcodeScreen = () => {
    if (!CameraView) {
      return (
        <View style={styles.centred}>
          <Text style={styles.emptyIcon}>📷</Text>
          <Text style={styles.emptyTitle}>Barcode Scanner</Text>
          <Text style={styles.emptyBody}>
            Install expo-camera to enable barcode scanning:{'\n'}
            {'npx expo install expo-camera'}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={() => setScreen('search')}>
            <Text style={styles.btnText}>Back to Search</Text>
          </TouchableOpacity>
        </View>
      )
    }

    if (!camPermission?.granted) {
      return (
        <View style={styles.centred}>
          <Text style={styles.emptyIcon}>🔐</Text>
          <Text style={styles.emptyTitle}>Camera Permission</Text>
          <Text style={styles.emptyBody}>Surge needs camera access to scan barcodes.</Text>
          <TouchableOpacity style={styles.btn} onPress={requestCamPermission}>
            <Text style={styles.btnText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setScreen('search')}>
            <Text style={styles.btnGhostText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )
    }

    return (
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          onBarcodeScanned={handleBarcode}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
        />
        <View style={styles.barcodeOverlay}>
          <View style={styles.barcodeFrame} />
          <Text style={styles.barcodeHint}>Point at a barcode</Text>
          <TouchableOpacity style={[styles.btn, styles.btnGhost, { marginTop: Spacing.md }]}
            onPress={() => setScreen('search')}>
            <Text style={styles.btnGhostText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // -------------------------------------------------------------------------
  // Form screen (serving size + meal slot + save)
  // -------------------------------------------------------------------------
  const renderFormScreen = () => (
    <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
      {/* Food name */}
      <Text style={styles.formFoodName}>{selected?.food_name}</Text>

      {/* Macro preview */}
      {computedMacros && (
        <View style={styles.macroPreview}>
          <MacroChip label="Cal"     value={computedMacros.calories}   unit="kcal" color={Colors.accent} />
          <MacroChip label="Protein" value={computedMacros.protein_g}  unit="g"    color={Colors.green}  />
          <MacroChip label="Carbs"   value={computedMacros.carbs_g}    unit="g"    color={Colors.blue}   />
          <MacroChip label="Fat"     value={computedMacros.fat_g}      unit="g"    color={Colors.warning} />
        </View>
      )}

      {/* Serving size */}
      <Text style={styles.fieldLabel}>Serving size</Text>
      <View style={styles.servingRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={servingSize}
          onChangeText={setServingSize}
          keyboardType="decimal-pad"
          placeholder="100"
          placeholderTextColor={Colors.text3}
          selectTextOnFocus
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: 220 }}>
          <View style={styles.unitChips}>
            {UNITS.map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.unitChip, servingUnit === u && styles.unitChipActive]}
                onPress={() => setServingUnit(u)}
              >
                <Text style={[styles.unitChipText, servingUnit === u && styles.unitChipTextActive]}>
                  {u}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Meal slot */}
      <Text style={styles.fieldLabel}>Meal</Text>
      <View style={styles.slotRow}>
        {MEAL_SLOTS.map((slot) => (
          <TouchableOpacity
            key={slot}
            style={[styles.slotChip, mealSlot === slot && styles.slotChipActive]}
            onPress={() => setMealSlot(slot)}
          >
            <Text style={styles.slotEmoji}>{SLOT_EMOJI[slot]}</Text>
            <Text style={[styles.slotText, mealSlot === slot && styles.slotTextActive]}>
              {slot.charAt(0).toUpperCase() + slot.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Actions */}
      <TouchableOpacity style={styles.btn} onPress={handleSave}>
        <Text style={styles.btnText}>Add to Log</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, styles.btnGhost, { marginTop: Spacing.sm }]}
        onPress={() => setScreen('search')}>
        <Text style={styles.btnGhostText}>← Back to Search</Text>
      </TouchableOpacity>
    </ScrollView>
  )

  // -------------------------------------------------------------------------
  // Search screen
  // -------------------------------------------------------------------------
  const renderSearchScreen = () => (
    <View style={{ flex: 1 }}>
      {/* Search bar + barcode button */}
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Search foods…"
          placeholderTextColor={Colors.text3}
          autoFocus
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <TouchableOpacity
          style={styles.barcodeBtn}
          onPress={() => setScreen('barcode')}
          accessibilityLabel="Scan barcode"
        >
          <Text style={{ fontSize: 22 }}>〔〕</Text>
        </TouchableOpacity>
      </View>

      {/* Loading */}
      {searching && (
        <View style={styles.centredRow}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={[styles.emptyBody, { marginLeft: Spacing.sm }]}>Searching…</Text>
        </View>
      )}

      {/* Results */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.off_food_id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.resultRow} onPress={() => selectFood(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultName} numberOfLines={1}>{item.food_name}</Text>
              <Text style={styles.resultMacros}>
                {Math.round(item.kcal_per_100)} kcal · {Math.round(item.protein_per_100)}g P ·{' '}
                {Math.round(item.carbs_per_100)}g C · {Math.round(item.fat_per_100)}g F
                {'  '}
                <Text style={styles.resultPer}>(per 100g)</Text>
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          !searching && query.length >= 2 ? (
            <View style={styles.centred}>
              <Text style={styles.emptyBody}>No results. Try a different search term.</Text>
            </View>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
      />
    </View>
  )

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.handle} />
          <Text style={styles.headerTitle}>
            {screen === 'search' ? 'Add Food' : screen === 'barcode' ? 'Scan Barcode' : 'Serving Size'}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Screens */}
        {screen === 'search'  && renderSearchScreen()}
        {screen === 'barcode' && renderBarcodeScreen()}
        {screen === 'form'    && renderFormScreen()}
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Tiny helper: macro chip in form preview
// ---------------------------------------------------------------------------
function MacroChip({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <View style={[chipStyles.chip, { borderColor: color + '40' }]}>
      <Text style={[chipStyles.value, { color }]}>{value}</Text>
      <Text style={chipStyles.unit}>{unit}</Text>
      <Text style={chipStyles.label}>{label}</Text>
    </View>
  )
}

const chipStyles = StyleSheet.create({
  chip: {
    alignItems:      'center',
    borderWidth:     1,
    borderRadius:    Radius.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    minWidth:        60,
  },
  value: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  unit:  { fontSize: FontSize.xs, color: Colors.text2 },
  label: { fontSize: FontSize.xs, color: Colors.text3 },
})

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.bg,
  },
  header: {
    alignItems:     'center',
    paddingTop:     Spacing.sm,
    paddingBottom:  Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  handle: {
    width:           40,
    height:          4,
    borderRadius:    Radius.full,
    backgroundColor: Colors.border,
    marginBottom:    Spacing.sm,
  },
  headerTitle: {
    fontSize:   FontSize.lg,
    fontWeight: FontWeight.bold,
    color:      Colors.text1,
  },
  closeBtn: {
    position: 'absolute',
    right:    Spacing.md,
    top:      Spacing.md + 4,
    padding:  Spacing.xs,
  },
  closeBtnText: {
    fontSize: FontSize.md,
    color:    Colors.text2,
  },

  // Search screen
  searchRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.sm,
    padding:       Spacing.md,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Platform.OS === 'ios' ? 12 : 8,
    fontSize:        FontSize.base,
    color:           Colors.text1,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  barcodeBtn: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.sm,
    padding:         Spacing.sm,
    borderWidth:     1,
    borderColor:     Colors.border,
    alignItems:      'center',
    justifyContent:  'center',
    width:           48,
    height:          48,
  },
  resultRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  resultName: {
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: '500',
    marginBottom: 2,
  },
  resultMacros: {
    fontSize: FontSize.xs,
    color:    Colors.text2,
  },
  resultPer: {
    color: Colors.text3,
  },
  chevron: {
    fontSize: FontSize.xl,
    color:    Colors.text3,
    marginLeft: Spacing.sm,
  },
  separator: {
    height:          1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },
  centred: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        Spacing.xl,
  },
  centredRow: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       Spacing.md,
  },
  emptyIcon:  { fontSize: 40, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: FontSize.md, color: Colors.text1, fontWeight: '600', marginBottom: Spacing.xs },
  emptyBody:  { fontSize: FontSize.sm, color: Colors.text2, textAlign: 'center', lineHeight: 20 },

  // Form screen
  formScroll: {
    padding: Spacing.md,
    gap:     Spacing.md,
  },
  formFoodName: {
    fontSize:   FontSize.xl,
    color:      Colors.text1,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  macroPreview: {
    flexDirection:  'row',
    gap:            Spacing.sm,
    flexWrap:       'wrap',
    marginBottom:   Spacing.sm,
  },
  fieldLabel: {
    fontSize:   FontSize.sm,
    color:      Colors.text2,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  servingRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.sm,
  },
  unitChips: {
    flexDirection: 'row',
    gap:           Spacing.xs,
  },
  unitChip: {
    paddingVertical:   6,
    paddingHorizontal: Spacing.sm,
    borderRadius:      Radius.full,
    backgroundColor:   Colors.surface,
    borderWidth:       1,
    borderColor:       Colors.border,
  },
  unitChipActive: {
    backgroundColor: Colors.accentSoft,
    borderColor:     Colors.accent,
  },
  unitChipText: {
    fontSize: FontSize.sm,
    color:    Colors.text2,
  },
  unitChipTextActive: {
    color:      Colors.accent,
    fontWeight: '600',
  },
  slotRow: {
    flexDirection: 'row',
    gap:           Spacing.sm,
    flexWrap:      'wrap',
  },
  slotChip: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius:    Radius.md,
    backgroundColor: Colors.surface,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  slotChipActive: {
    backgroundColor: Colors.accentSoft,
    borderColor:     Colors.accent,
  },
  slotEmoji: { fontSize: 16 },
  slotText: {
    fontSize: FontSize.sm,
    color:    Colors.text2,
    fontWeight: '500',
  },
  slotTextActive: {
    color: Colors.accent,
    fontWeight: '700',
  },

  // Barcode screen
  barcodeOverlay: {
    position:       'absolute',
    bottom:         0,
    left:           0,
    right:          0,
    alignItems:     'center',
    paddingBottom:  Spacing.xxl,
    padding:        Spacing.lg,
  },
  barcodeFrame: {
    width:       220,
    height:      140,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
  },
  barcodeHint: {
    fontSize: FontSize.sm,
    color:    Colors.text1,
    fontWeight: '600',
  },

  // Shared buttons
  btn: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.md,
    alignItems:      'center',
    marginTop:       Spacing.sm,
  },
  btnText: {
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: FontWeight.bold,
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  btnGhostText: {
    fontSize:   FontSize.base,
    color:      Colors.text2,
    fontWeight: '600',
  },
})
