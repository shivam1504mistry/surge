// PLACEHOLDER — Agent 1 (Onboarding) owns this file
import React from 'react'
import { View, Text } from 'react-native'
import { Colors } from '../../constants/theme'

export default function PhoneScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: Colors.text1, fontSize: 18 }}>📱 Phone Entry</Text>
      <Text style={{ color: Colors.text2, fontSize: 13, marginTop: 8 }}>Agent 1 builds this</Text>
    </View>
  )
}
