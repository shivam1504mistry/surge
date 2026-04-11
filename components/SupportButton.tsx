import React from 'react'
import { TouchableOpacity, Text, StyleSheet, Alert, Linking } from 'react-native'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme'
import { useUserStore } from '../stores/userStore'

export default function SupportButton() {
  const { profile } = useUserStore()

  function handleSupport() {
    const name  = profile?.name    ?? 'Unknown'
    const phone = profile?.phone   ?? 'Unknown'
    const subject = encodeURIComponent(`Surge: ${name} ${phone}`)
    const body    = encodeURIComponent(`Hi Shivam,\n\n[Describe your issue here]\n\n---\nName: ${name}\nPhone: ${phone}`)
    const url = `mailto:shivam.mistry@gmail.com?subject=${subject}&body=${body}`

    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url)
      } else {
        Alert.alert('Support', `Email us at shivam.mistry@gmail.com\n\nPlease include your name and phone number.`)
      }
    })
  }

  return (
    <TouchableOpacity style={styles.btn} onPress={handleSupport} activeOpacity={0.75}>
      <Text style={styles.icon}>?</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: {
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: Colors.surface,
    borderWidth:     1,
    borderColor:     Colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  icon: {
    fontSize:   FontSize.base,
    color:      Colors.text2,
    fontWeight: FontWeight.bold,
  },
})
