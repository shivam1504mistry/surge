// PLACEHOLDER — Agent 1 (Wave 2) owns this file
import React from 'react'
import { View, Text } from 'react-native'
import { Colors } from '../../constants/theme'

export default function TodayScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 48 }}>⚡</Text>
      <Text style={{ color: Colors.text1, fontSize: 24, fontWeight: '800', marginTop: 12 }}>Today</Text>
      <Text style={{ color: Colors.text2, fontSize: 13, marginTop: 8 }}>Wave 2 — Agent 1 builds this</Text>
    </View>
  )
}
