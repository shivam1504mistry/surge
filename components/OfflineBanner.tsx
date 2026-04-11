import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { FontSize, FontWeight, Spacing } from '../constants/theme'

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = React.useState(false)
  const slideAnim = useRef(new Animated.Value(-40)).current

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = state.isConnected === false
      setIsOffline(offline)
      Animated.timing(slideAnim, {
        toValue:         offline ? 0 : -40,
        duration:        300,
        useNativeDriver: true,
      }).start()
    })
    return () => unsubscribe()
  }, [])

  if (!isOffline) return null

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <Text style={styles.text}>⚠️ You're offline — entries will sync when back online</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#7A5C00',
    paddingVertical:   Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems:        'center',
  },
  text: {
    fontSize:   FontSize.xs,
    color:      '#FFD60A',
    fontWeight: FontWeight.semibold,
    textAlign:  'center',
  },
})
