import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Alert,
  Keyboard,
} from 'react-native'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme'
import { WorkoutSet } from '../stores/workoutStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface WorkoutCardProps {
  exerciseId:       string
  exerciseName:     string
  target:           string   // primary muscle group
  equipment:        string
  currentSets:      WorkoutSet[]
  previousSets:     WorkoutSet[]  // greyed out, from last session
  unitPref:         'kg' | 'lbs'
  onAddSet:         (reps: number, weightKg: number) => void
  onDeleteSet:      (setId: string) => void
  onRemoveExercise: () => void
  onSetLogged:      () => void    // called after each set → triggers rest timer
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function kgToDisplay(kg: number, pref: 'kg' | 'lbs'): string {
  if (pref === 'lbs') return (kg * 2.20462).toFixed(1)
  return kg % 1 === 0 ? kg.toString() : kg.toFixed(1)
}

function displayToKg(val: string, pref: 'kg' | 'lbs'): number {
  const n = parseFloat(val) || 0
  return pref === 'lbs' ? n * 0.453592 : n
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function MuscleChip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  )
}

interface SetRowProps {
  index:    number
  reps:     number
  weightKg: number
  isPR:     boolean
  unitPref: 'kg' | 'lbs'
  onDelete: () => void
  dimmed?:  boolean
}

function SetRow({ index, reps, weightKg, isPR, unitPref, onDelete, dimmed }: SetRowProps) {
  const weight = kgToDisplay(weightKg, unitPref)
  const unit   = unitPref

  return (
    <Pressable
      onLongPress={() => {
        if (!dimmed) {
          Alert.alert('Delete set?', `Set ${index + 1}: ${weight} ${unit} × ${reps}`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onDelete },
          ])
        }
      }}
      style={[styles.setRow, dimmed && styles.setRowDimmed]}
    >
      <Text style={[styles.setIndex, dimmed && styles.dimmedText]}>
        {index + 1}
      </Text>
      <View style={styles.setValues}>
        <Text style={[styles.setWeight, dimmed && styles.dimmedText]}>
          {weight} <Text style={[styles.setUnit, dimmed && styles.dimmedText]}>{unit}</Text>
        </Text>
        <Text style={[styles.setSep, dimmed && styles.dimmedText]}>×</Text>
        <Text style={[styles.setReps, dimmed && styles.dimmedText]}>
          {reps} <Text style={[styles.setUnit, dimmed && styles.dimmedText]}>reps</Text>
        </Text>
      </View>
      {isPR && !dimmed && (
        <View style={styles.prBadge}>
          <Text style={styles.prText}>PR</Text>
        </View>
      )}
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function WorkoutCard({
  exerciseId,
  exerciseName,
  target,
  equipment,
  currentSets,
  previousSets,
  unitPref,
  onAddSet,
  onDeleteSet,
  onRemoveExercise,
  onSetLogged,
}: WorkoutCardProps) {
  const [isAdding, setIsAdding]     = useState(false)
  const [weightVal, setWeightVal]   = useState('')
  const [repsVal, setRepsVal]       = useState('')
  const repsRef = useRef<TextInput>(null)

  // Pre-fill with last current set, or last previous set
  function openAddSet() {
    const lastCurrent  = currentSets[currentSets.length - 1]
    const lastPrevious = previousSets[previousSets.length - 1]
    const ref = lastCurrent ?? lastPrevious

    if (ref) {
      setWeightVal(kgToDisplay(ref.weight_kg, unitPref))
      setRepsVal(ref.reps.toString())
    } else {
      setWeightVal('')
      setRepsVal('')
    }
    setIsAdding(true)
  }

  function handleLogSet() {
    const kg   = displayToKg(weightVal, unitPref)
    const reps = parseInt(repsVal, 10)

    if (!reps || reps <= 0) {
      Alert.alert('Enter reps', 'Please enter a valid rep count.')
      return
    }

    onAddSet(reps, kg)
    onSetLogged()
    Keyboard.dismiss()
    setIsAdding(false)

    // Keep weight, reset reps for quick next set
    setRepsVal('')
  }

  function handleCancel() {
    Keyboard.dismiss()
    setIsAdding(false)
  }

  const hasPreviousSets = previousSets.length > 0
  const hasCurrentSets  = currentSets.length > 0

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.exerciseName}>{exerciseName}</Text>
          <View style={styles.chips}>
            {target ? <MuscleChip label={target} /> : null}
            {equipment && equipment !== 'body weight' ? (
              <MuscleChip label={equipment} />
            ) : null}
          </View>
        </View>
        <TouchableOpacity onPress={onRemoveExercise} hitSlop={12} style={styles.removeBtn}>
          <Text style={styles.removeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Previous session recall (greyed) */}
      {hasPreviousSets && !hasCurrentSets && (
        <View style={styles.previousSection}>
          <Text style={styles.previousLabel}>Last session</Text>
          {previousSets.map((s, i) => (
            <SetRow
              key={s.id}
              index={i}
              reps={s.reps}
              weightKg={s.weight_kg}
              isPR={false}
              unitPref={unitPref}
              onDelete={() => {}}
              dimmed
            />
          ))}
        </View>
      )}

      {/* Current sets */}
      {hasCurrentSets && (
        <View style={styles.currentSection}>
          {/* If we also have previous sets, show them collapsed as a mini hint */}
          {hasPreviousSets && (
            <Text style={styles.previousHint}>
              Last:{' '}
              {previousSets
                .map(s => `${kgToDisplay(s.weight_kg, unitPref)}${unitPref}×${s.reps}`)
                .join('  ')}
            </Text>
          )}
          {currentSets.map((s, i) => (
            <SetRow
              key={s.id}
              index={i}
              reps={s.reps}
              weightKg={s.weight_kg}
              isPR={s.is_pr}
              unitPref={unitPref}
              onDelete={() => onDeleteSet(s.id)}
            />
          ))}
        </View>
      )}

      {/* Inline set input */}
      {isAdding ? (
        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              value={weightVal}
              onChangeText={setWeightVal}
              placeholder="0"
              placeholderTextColor={Colors.text3}
              keyboardType="decimal-pad"
              returnKeyType="next"
              onSubmitEditing={() => repsRef.current?.focus()}
              selectTextOnFocus
            />
            <Text style={styles.inputLabel}>{unitPref}</Text>
          </View>
          <Text style={styles.inputSep}>×</Text>
          <View style={styles.inputGroup}>
            <TextInput
              ref={repsRef}
              style={styles.input}
              value={repsVal}
              onChangeText={setRepsVal}
              placeholder="0"
              placeholderTextColor={Colors.text3}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={handleLogSet}
              selectTextOnFocus
            />
            <Text style={styles.inputLabel}>reps</Text>
          </View>
          <TouchableOpacity style={styles.logBtn} onPress={handleLogSet}>
            <Text style={styles.logBtnText}>Log</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleCancel} hitSlop={12} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.addSetBtn} onPress={openAddSet}>
          <Text style={styles.addSetBtnText}>
            + {hasCurrentSets ? `Set ${currentSets.length + 1}` : 'Add Set'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  card: {
    backgroundColor:  Colors.surface,
    borderRadius:     Radius.md,
    marginBottom:     Spacing.sm,
    overflow:         'hidden',
  },

  // Header
  header: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    padding:        Spacing.md,
    paddingBottom:  Spacing.sm,
  },
  headerLeft: {
    flex: 1,
  },
  exerciseName: {
    color:       Colors.text1,
    fontSize:    FontSize.md,
    fontWeight:  FontWeight.bold,
    marginBottom: 4,
  },
  chips: {
    flexDirection: 'row',
    gap:           6,
    flexWrap:      'wrap',
  },
  chip: {
    backgroundColor: Colors.surface2,
    borderRadius:    Radius.full,
    paddingHorizontal: 8,
    paddingVertical:   2,
  },
  chipText: {
    color:      Colors.text2,
    fontSize:   FontSize.xs,
    fontWeight: FontWeight.medium,
    textTransform: 'capitalize',
  },
  removeBtn: {
    paddingLeft: Spacing.sm,
  },
  removeBtnText: {
    color:    Colors.text3,
    fontSize: FontSize.md,
  },

  // Previous sets
  previousSection: {
    paddingHorizontal: Spacing.md,
    paddingBottom:     Spacing.xs,
  },
  previousLabel: {
    color:        Colors.text3,
    fontSize:     FontSize.xs,
    fontWeight:   FontWeight.medium,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  previousHint: {
    color:        Colors.text3,
    fontSize:     FontSize.sm,
    marginBottom: Spacing.xs,
  },

  // Current sets
  currentSection: {
    paddingHorizontal: Spacing.md,
    paddingBottom:     Spacing.xs,
  },

  // Set row
  setRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  setRowDimmed: {
    opacity: 0.45,
  },
  dimmedText: {
    color: Colors.text3,
  },
  setIndex: {
    color:      Colors.text2,
    fontSize:   FontSize.sm,
    fontWeight: FontWeight.semibold,
    width:      20,
    textAlign:  'center',
    marginRight: Spacing.sm,
  },
  setValues: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
  },
  setWeight: {
    color:      Colors.text1,
    fontSize:   FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  setSep: {
    color:    Colors.text3,
    fontSize: FontSize.base,
  },
  setReps: {
    color:      Colors.text1,
    fontSize:   FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  setUnit: {
    color:      Colors.text2,
    fontSize:   FontSize.sm,
    fontWeight: FontWeight.regular,
  },
  prBadge: {
    backgroundColor: Colors.accentSoft,
    borderRadius:    Radius.full,
    paddingHorizontal: 7,
    paddingVertical:   2,
  },
  prText: {
    color:      Colors.accent,
    fontSize:   FontSize.xs,
    fontWeight: FontWeight.black,
    letterSpacing: 0.5,
  },

  // Inline input row
  inputRow: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
    backgroundColor:  Colors.surface2,
    gap:              Spacing.sm,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  input: {
    backgroundColor: Colors.border,
    borderRadius:    Radius.sm,
    color:           Colors.text1,
    fontSize:        FontSize.md,
    fontWeight:      FontWeight.semibold,
    paddingHorizontal: 10,
    paddingVertical:   8,
    minWidth:          60,
    textAlign:         'center',
  },
  inputLabel: {
    color:    Colors.text2,
    fontSize: FontSize.sm,
  },
  inputSep: {
    color:    Colors.text3,
    fontSize: FontSize.md,
  },
  logBtn: {
    flex:            1,
    backgroundColor: Colors.accent,
    borderRadius:    Radius.sm,
    paddingVertical: 10,
    alignItems:      'center',
  },
  logBtnText: {
    color:      Colors.text1,
    fontSize:   FontSize.base,
    fontWeight: FontWeight.bold,
  },
  cancelBtn: {
    paddingHorizontal: 4,
  },
  cancelBtnText: {
    color:    Colors.text3,
    fontSize: FontSize.md,
  },

  // Add Set button
  addSetBtn: {
    margin:          Spacing.md,
    marginTop:       Spacing.sm,
    borderWidth:     1,
    borderColor:     Colors.border,
    borderRadius:    Radius.sm,
    borderStyle:     'dashed',
    paddingVertical: 10,
    alignItems:      'center',
  },
  addSetBtnText: {
    color:      Colors.text2,
    fontSize:   FontSize.base,
    fontWeight: FontWeight.medium,
  },
})
