import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Colors, FontSize, Spacing, Radius } from '../constants/theme'

// ---------------------------------------------------------------------------
// MacroBar — horizontal progress bar for a single macro (cal / protein / carbs / fat).
// Turns warning-yellow when current exceeds target.
// Agent 3 (Nutrition) owns this file.
// ---------------------------------------------------------------------------

interface Props {
  label:   string
  current: number
  target:  number
  unit?:   string   // default 'g'; pass 'kcal' for calories
  color?:  string   // defaults to Colors.accent
}

export default function MacroBar({
  label,
  current,
  target,
  unit  = 'g',
  color = Colors.accent,
}: Props) {
  const pct    = target > 0 ? Math.min(current / target, 1) : 0
  const isOver = target > 0 && current > target

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.values, isOver && styles.overText]}>
          {Math.round(current)}
          <Text style={styles.unit}>{unit}</Text>
          {'  '}
          <Text style={styles.dim}>/ {target}{unit}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width:           `${Math.round(pct * 100)}%` as any,
              backgroundColor: isOver ? Colors.warning : color,
            },
          ]}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  row: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  label: {
    fontSize:   FontSize.sm,
    color:      Colors.text2,
    fontWeight: '500',
  },
  values: {
    fontSize:   FontSize.sm,
    color:      Colors.text1,
    fontWeight: '600',
  },
  overText: {
    color: Colors.warning,
  },
  unit: {
    fontSize:   FontSize.xs,
    color:      Colors.text2,
    fontWeight: '400',
  },
  dim: {
    color:      Colors.text3,
    fontWeight: '400',
  },
  track: {
    height:          6,
    borderRadius:    Radius.full,
    backgroundColor: Colors.border,
    overflow:        'hidden',
  },
  fill: {
    height:       '100%',
    borderRadius: Radius.full,
  },
})
