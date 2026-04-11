// Welcome / Sign-in screen — Option D design
// Top: animated orange orb with ⚡ Surge
// Bottom: sliding card with voice-first value props + auth buttons
import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme'
import { signInWithGoogle, sendOTP } from '../../lib/supabase'
import { useNavigation } from '@react-navigation/native'

const { height: SCREEN_H } = Dimensions.get('window')
const CARD_HEIGHT = SCREEN_H * 0.52

type Mode = 'landing' | 'phone'

const CVP_ITEMS = [
  { icon: '🎤', line1: '"Bench press 4x8 at 80kg"', line2: 'Logged in 3 seconds.' },
  { icon: '🥗', line1: '"Had dal rice for lunch"',   line2: 'Macros tracked instantly.' },
  { icon: '📈', line1: 'Gym + diet. One app.',       line2: 'Finally.' },
]

export default function WelcomeScreen() {
  const navigation = useNavigation<any>()
  const [mode,     setMode]    = useState<Mode>('landing')
  const [phone,    setPhone]   = useState('')
  const [loading,  setLoading] = useState(false)
  const [cvpIndex, setCvpIndex] = useState(0)

  // Orb breathe animation
  const orbScale   = useRef(new Animated.Value(1)).current
  const orbOpacity = useRef(new Animated.Value(0.7)).current

  // Card slide-up animation
  const cardY = useRef(new Animated.Value(CARD_HEIGHT)).current

  // Content fade-in sequence
  const logoOpacity = useRef(new Animated.Value(0)).current
  const cardOpacity = useRef(new Animated.Value(0)).current

  // CVP ticker fade
  const cvpOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    // Logo fades in first
    Animated.timing(logoOpacity, {
      toValue:         1,
      duration:        600,
      useNativeDriver: true,
    }).start()

    // Card slides up after short delay
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.spring(cardY, {
          toValue:         0,
          tension:         60,
          friction:        12,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue:         1,
          duration:        400,
          useNativeDriver: true,
        }),
      ]),
    ]).start()

    // Orb breathe loop — subtle pulse
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(orbScale, {
            toValue:         1.04,
            duration:        1400,
            useNativeDriver: true,
          }),
          Animated.timing(orbOpacity, {
            toValue:         0.9,
            duration:        1400,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(orbScale, {
            toValue:         1,
            duration:        1400,
            useNativeDriver: true,
          }),
          Animated.timing(orbOpacity, {
            toValue:         0.65,
            duration:        1400,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start()

    // CVP ticker — fade out → swap → fade in every 3s
    const ticker = setInterval(() => {
      Animated.timing(cvpOpacity, {
        toValue:         0,
        duration:        300,
        useNativeDriver: true,
      }).start(() => {
        setCvpIndex(i => (i + 1) % CVP_ITEMS.length)
        Animated.timing(cvpOpacity, {
          toValue:         1,
          duration:        400,
          useNativeDriver: true,
        }).start()
      })
    }, 3000)

    return () => clearInterval(ticker)
  }, [])

  // ---------------------------------------------------------------------------
  // Google OAuth
  // ---------------------------------------------------------------------------
  async function handleGoogleSignIn() {
    setLoading(true)
    try {
      const { error } = await signInWithGoogle()
      if (error) throw error
    } catch (err: any) {
      Alert.alert('Sign-in failed', err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Phone OTP
  // ---------------------------------------------------------------------------
  async function handleSendOTP() {
    const cleaned = phone.replace(/\s/g, '')
    if (!cleaned || cleaned.length < 10) {
      Alert.alert('Enter your phone number', 'Please enter a valid mobile number.')
      return
    }
    const formatted = cleaned.startsWith('+') ? cleaned : `+91${cleaned}`
    setLoading(true)
    try {
      const { error } = await sendOTP(formatted)
      if (error) throw error
      navigation.navigate('OTP', { phone: formatted })
    } catch (err: any) {
      Alert.alert('Failed to send OTP', err.message ?? 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* ── Top: Orb zone ── */}
        <View style={styles.orbZone}>
          {/* Outer glow ring */}
          <Animated.View style={[
            styles.orbRingOuter,
            { transform: [{ scale: orbScale }], opacity: orbOpacity },
          ]} />
          {/* Middle ring */}
          <Animated.View style={[
            styles.orbRingMiddle,
            { transform: [{ scale: orbScale }] },
          ]} />
          {/* Core orb */}
          <Animated.View style={[
            styles.orbCore,
            { transform: [{ scale: orbScale }] },
          ]} />

          {/* Logo centred over orb */}
          <Animated.View style={[styles.logoContainer, { opacity: logoOpacity }]}>
            <Text style={styles.logoEmoji}>⚡</Text>
            <Text style={styles.appName}>SURGE</Text>
            <Text style={styles.tagline}>Just say it. Surge logs it.</Text>
          </Animated.View>
        </View>

        {/* ── Bottom: Sliding card ── */}
        <Animated.View style={[
          styles.card,
          { transform: [{ translateY: cardY }], opacity: cardOpacity },
        ]}>

          {mode === 'landing' && (
            <>
              {/* Voice feature callout */}
              <View style={styles.voiceBadge}>
                <Text style={styles.voiceBadgeIcon}>🎤</Text>
                <Text style={styles.voiceBadgeText}>Voice-first · Free for everyone</Text>
              </View>

              {/* Rotating CVP ticker */}
              <Animated.View style={[styles.ticker, { opacity: cvpOpacity }]}>
                <Text style={styles.tickerIcon}>{CVP_ITEMS[cvpIndex].icon}</Text>
                <Text style={styles.tickerLine1}>{CVP_ITEMS[cvpIndex].line1}</Text>
                <Text style={styles.tickerLine2}>{CVP_ITEMS[cvpIndex].line2}</Text>
              </Animated.View>

              {/* Dot indicators */}
              <View style={styles.dots}>
                {CVP_ITEMS.map((_, i) => (
                  <View key={i} style={[styles.dot, i === cvpIndex && styles.dotActive]} />
                ))}
              </View>

              {/* Auth buttons */}
              <View style={styles.authButtons}>
                <TouchableOpacity
                  style={[styles.googleBtn, loading && styles.btnDisabled]}
                  onPress={handleGoogleSignIn}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color={Colors.bg} />
                  ) : (
                    <>
                      <Text style={styles.googleIcon}>G</Text>
                      <Text style={styles.googleLabel}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={styles.phoneBtn}
                  onPress={() => setMode('phone')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.phoneBtnText}>📱 Continue with phone number</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {mode === 'phone' && (
            <>
              <Text style={styles.phoneLabel}>Enter your mobile number</Text>
              <View style={styles.phoneInputRow}>
                <View style={styles.countryCode}>
                  <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="98765 43210"
                  placeholderTextColor={Colors.text3}
                  keyboardType="phone-pad"
                  maxLength={10}
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={[styles.sendOTPBtn, loading && styles.btnDisabled]}
                onPress={handleSendOTP}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.sendOTPText}>Send OTP</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setMode('landing')} style={styles.backBtn}>
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.legal}>
            By continuing you agree to our Terms of Service and Privacy Policy.
          </Text>
        </Animated.View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: Colors.bg,
  },

  // ── Orb zone ──
  orbZone: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
  },
  orbRingOuter: {
    position:        'absolute',
    width:           260,
    height:          260,
    borderRadius:    130,
    backgroundColor: 'rgba(255,77,0,0.08)',
  },
  orbRingMiddle: {
    position:        'absolute',
    width:           190,
    height:          190,
    borderRadius:    95,
    backgroundColor: 'rgba(255,77,0,0.14)',
  },
  orbCore: {
    position:        'absolute',
    width:           130,
    height:          130,
    borderRadius:    65,
    backgroundColor: 'rgba(255,77,0,0.28)',
  },
  logoContainer: {
    alignItems: 'center',
    gap:        4,
  },
  logoEmoji: {
    fontSize:   56,
    lineHeight: 64,
  },
  appName: {
    fontSize:      36,
    fontWeight:    FontWeight.black,
    color:         Colors.text1,
    letterSpacing: 6,
  },
  tagline: {
    fontSize:      FontSize.base,
    color:         Colors.text2,
    fontWeight:    FontWeight.medium,
    letterSpacing: 0.3,
    marginTop:     4,
  },

  // ── Bottom card ──
  card: {
    backgroundColor:  '#141414',
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.lg,
    paddingTop:        Spacing.lg,
    paddingBottom:     Spacing.md,
    gap:               Spacing.md,
    // subtle top border glow
    borderTopWidth:    1,
    borderTopColor:    'rgba(255,77,0,0.25)',
  },

  // Voice badge
  voiceBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing.xs,
    alignSelf:       'flex-start',
    backgroundColor: Colors.accentSoft,
    borderRadius:    Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical:   6,
  },
  voiceBadgeIcon: { fontSize: 14 },
  voiceBadgeText: {
    fontSize:   FontSize.xs,
    color:      Colors.accent,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },

  // Rotating CVP ticker
  ticker: {
    alignItems:  'center',
    paddingVertical: Spacing.sm,
    minHeight:   84,
    justifyContent: 'center',
    gap:         6,
  },
  tickerIcon: {
    fontSize:   36,
    lineHeight: 44,
  },
  tickerLine1: {
    fontSize:   FontSize.md,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
    textAlign:  'center',
    fontStyle:  'italic',
  },
  tickerLine2: {
    fontSize:   FontSize.base,
    color:      Colors.accent,
    fontWeight: FontWeight.medium,
    textAlign:  'center',
  },

  // Dot indicators
  dots: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            6,
    marginTop:      -4,
  },
  dot: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.accent,
    width:           16,
  },

  // Auth
  authButtons: { gap: Spacing.sm },
  googleBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius:    Radius.full,
    height:          52,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             Spacing.sm,
  },
  btnDisabled: { opacity: 0.6 },
  googleIcon: {
    fontSize:   FontSize.lg,
    fontWeight: FontWeight.bold,
    color:      '#4285F4',
  },
  googleLabel: {
    fontSize:   FontSize.base,
    fontWeight: FontWeight.semibold,
    color:      '#1A1A1A',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.md,
  },
  dividerLine: {
    flex:            1,
    height:          1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: FontSize.sm,
    color:    Colors.text3,
  },
  phoneBtn: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.full,
    height:          52,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  phoneBtnText: {
    fontSize:   FontSize.base,
    fontWeight: FontWeight.semibold,
    color:      Colors.text1,
  },

  // Phone input mode
  phoneLabel: {
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
  },
  phoneInputRow: {
    flexDirection: 'row',
    gap:           Spacing.sm,
  },
  countryCode: {
    backgroundColor:   Colors.surface,
    borderRadius:      Radius.md,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingHorizontal: Spacing.md,
    justifyContent:    'center',
    height:            56,
  },
  countryCodeText: {
    fontSize:   FontSize.base,
    color:      Colors.text1,
    fontWeight: FontWeight.semibold,
  },
  phoneInput: {
    flex:              1,
    backgroundColor:   Colors.surface,
    borderRadius:      Radius.md,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingHorizontal: Spacing.md,
    color:             Colors.text1,
    fontSize:          FontSize.lg,
    height:            56,
  },
  sendOTPBtn: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.full,
    height:          56,
    alignItems:      'center',
    justifyContent:  'center',
  },
  sendOTPText: {
    fontSize:   FontSize.md,
    fontWeight: FontWeight.bold,
    color:      '#fff',
  },
  backBtn: {
    alignItems: 'center',
    padding:    Spacing.sm,
  },
  backText: {
    fontSize: FontSize.base,
    color:    Colors.text2,
  },
  legal: {
    fontSize:  FontSize.xs,
    color:     Colors.text3,
    textAlign: 'center',
    lineHeight: 16,
  },
})
