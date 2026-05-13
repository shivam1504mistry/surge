import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme'
import { verifyOTP, sendOTP } from '../../lib/supabase'
import { track } from '../../lib/analytics'
import { useEffect } from 'react'

export default function OTPScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>()
  const route = useRoute<any>()
  const phone: string = route.params?.phone ?? ''

  const [otp, setOtp]         = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const inputs = useRef<(TextInput | null)[]>([])

  useEffect(() => { track('onboarding_otp_viewed') }, [])

  const code = otp.join('')

  function handleChange(text: string, index: number) {
    const digits = text.replace(/\D/g, '')
    // Full OTP pasted / autofilled — distribute across all boxes
    if (digits.length > 1) {
      const next = [...otp]
      digits.split('').slice(0, 6).forEach((d, i) => { next[i] = d })
      setOtp(next)
      inputs.current[Math.min(digits.length - 1, 5)]?.focus()
      return
    }
    const digit = digits.slice(-1)
    const next  = [...otp]
    next[index] = digit
    setOtp(next)
    if (digit && index < 5) {
      inputs.current[index + 1]?.focus()
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  async function handleVerify() {
    if (code.length < 6) {
      Alert.alert('Enter OTP', 'Please enter the 6-digit code sent to your phone.')
      return
    }
    setLoading(true)
    try {
      const { error } = await verifyOTP(phone, code)
      if (error) throw error
      track('onboarding_otp_verified')
      navigation.replace('ProfileSetup')
    } catch (err: any) {
      Alert.alert('Invalid OTP', err.message ?? 'The code is incorrect or has expired. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResending(true)
    try {
      const { error } = await sendOTP(phone)
      if (error) throw error
      Alert.alert('OTP Sent', `A new code was sent to ${phone}`)
      setOtp(['', '', '', '', '', ''])
      inputs.current[0]?.focus()
    } catch (err: any) {
      Alert.alert('Failed to resend', err.message ?? 'Please try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          <View style={styles.header}>
            <Text style={styles.title}>Enter OTP</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.phone}>{phone}</Text>
            </Text>
          </View>

          <View style={styles.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={ref => { inputs.current[i] = ref }}
                style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                value={digit}
                onChangeText={text => handleChange(text, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={6}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                autoFocus={i === 0}
                selectTextOnFocus
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.verifyBtn, (loading || code.length < 6) && styles.btnDisabled]}
            onPress={handleVerify}
            disabled={loading || code.length < 6}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.verifyText}>Verify & Continue</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={handleResend} disabled={resending} style={styles.resendBtn}>
            {resending
              ? <ActivityIndicator color={Colors.text2} size="small" />
              : <Text style={styles.resendText}>Didn't receive it? Resend OTP</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Change number</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  container: {
    flexGrow:          1,
    paddingHorizontal: Spacing.lg,
    paddingTop:        Spacing.xxl,
    paddingBottom:     Spacing.xl,
    gap:               Spacing.xl,
  },
  header: {
    gap: Spacing.sm,
  },
  title: {
    fontSize:   FontSize.hero,
    fontWeight: FontWeight.black,
    color:      Colors.text1,
  },
  subtitle: {
    fontSize:   FontSize.base,
    color:      Colors.text2,
    lineHeight: 22,
  },
  phone: {
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
  },
  otpRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    gap:            Spacing.sm,
  },
  otpBox: {
    flex:            1,
    height:          60,
    borderRadius:    Radius.md,
    borderWidth:     1.5,
    borderColor:     Colors.border,
    backgroundColor: Colors.surface,
    textAlign:       'center',
    fontSize:        FontSize.xl,
    fontWeight:      FontWeight.bold,
    color:           Colors.text1,
  },
  otpBoxFilled: {
    borderColor: Colors.accent,
  },
  verifyBtn: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.full,
    height:          56,
    alignItems:      'center',
    justifyContent:  'center',
  },
  btnDisabled: { opacity: 0.5 },
  verifyText: {
    fontSize:   FontSize.md,
    fontWeight: FontWeight.bold,
    color:      '#fff',
  },
  resendBtn: {
    alignItems: 'center',
    padding:    Spacing.sm,
  },
  resendText: {
    fontSize: FontSize.base,
    color:    Colors.text2,
  },
  backBtn: {
    alignItems: 'center',
    padding:    Spacing.sm,
  },
  backText: {
    fontSize: FontSize.base,
    color:    Colors.text3,
  },
})
