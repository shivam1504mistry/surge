import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Share, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme'
import { supabase } from '../lib/supabase'
import { useUserStore } from '../stores/userStore'
import { track } from '../lib/analytics'

const BASE_LINK = 'surge.app.link/r'

type Reward = {
  id:           string
  title:        string
  description:  string | null
  image_url:    string | null
  announce_date: string | null
}

export default function ReferralsScreen() {
  const navigation = useNavigation()
  const profile    = useUserStore((s) => s.profile)

  const [rewards,      setRewards]      = useState<Reward[]>([])
  const [enrolled,     setEnrolled]     = useState<Set<string>>(new Set())
  const [enrolling,    setEnrolling]    = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [copied,       setCopied]       = useState(false)

  const referralCode = profile?.referral_code as string | undefined
  const inviteLink   = referralCode ? `${BASE_LINK}/${referralCode}` : null

  useEffect(() => {
    track('screen_referrals')
    loadRewards()
  }, [])

  const loadRewards = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    try {
      // Load assigned rewards for this user
      const { data: assignments } = await supabase
        .from('reward_assignments')
        .select('reward_id, referral_rewards(id, title, description, image_url, announce_date)')
        .eq('user_id', profile.id)

      const rewardList: Reward[] = (assignments ?? [])
        .map((a: any) => a.referral_rewards)
        .filter(Boolean)
        .filter((r: any) => r !== null)

      setRewards(rewardList)

      // Load enrollments
      const { data: enrollments } = await supabase
        .from('reward_enrollments')
        .select('reward_id')
        .eq('user_id', profile.id)

      const enrolledSet = new Set<string>((enrollments ?? []).map((e: any) => e.reward_id))
      setEnrolled(enrolledSet)
    } catch (err) {
      // Silent — empty state shown
    } finally {
      setLoading(false)
    }
  }, [profile?.id])

  async function handleShare() {
    if (!inviteLink) return
    track('referral_share_tapped')
    try {
      await Share.share({
        message: `I use Surge to track gym + nutrition by voice — it's free. Join here: ${inviteLink}`,
      })
    } catch {}
  }

  async function handleCopy() {
    if (!inviteLink) return
    track('referral_copy_tapped')
    try {
      await Share.share({ message: inviteLink })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  async function handleEnroll(rewardId: string) {
    if (!profile?.id || enrolled.has(rewardId)) return
    setEnrolling(rewardId)
    track('referral_reward_enrolled', { reward_id: rewardId })
    try {
      const { error } = await supabase.from('reward_enrollments').insert({
        reward_id: rewardId,
        user_id:   profile.id,
      })
      if (error) throw error
      setEnrolled(prev => new Set([...prev, rewardId]))
    } catch {
      Alert.alert('Could not enroll', 'Please try again.')
    } finally {
      setEnrolling(null)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎁 Referrals</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Your invite link card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Your invite link</Text>
          {referralCode ? (
            <>
              <View style={styles.codePill}>
                <Text style={styles.codeText}>{referralCode}</Text>
              </View>
              <View style={styles.linkPill}>
                <Text style={styles.linkText} numberOfLines={1}>{inviteLink}</Text>
              </View>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.btnSecondary} onPress={handleCopy} activeOpacity={0.8}>
                  <Text style={styles.btnSecondaryText}>{copied ? '✓ Copied' : '📋 Copy'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnPrimary} onPress={handleShare} activeOpacity={0.8}>
                  <Text style={styles.btnPrimaryText}>↑ Share</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={styles.noCodeText}>Complete your profile to get a referral code.</Text>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Rewards section */}
        <Text style={styles.sectionTitle}>Rewards you can win</Text>

        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.xl }} />
        ) : rewards.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎁</Text>
            <Text style={styles.emptyTitle}>Keep referring friends</Text>
            <Text style={styles.emptySub}>
              Rewards will appear here once you're assigned.{'\n\n'}
              The more friends join, the better your chances.
            </Text>
          </View>
        ) : (
          rewards.map(reward => {
            const isEnrolled  = enrolled.has(reward.id)
            const isEnrolling = enrolling === reward.id
            return (
              <View key={reward.id} style={styles.rewardCard}>
                <View style={styles.rewardImagePlaceholder}>
                  <Text style={styles.rewardImageEmoji}>🏆</Text>
                </View>
                <View style={styles.rewardBody}>
                  <Text style={styles.rewardTitle}>{reward.title}</Text>
                  {reward.description ? (
                    <Text style={styles.rewardDesc}>{reward.description}</Text>
                  ) : null}
                  {reward.announce_date ? (
                    <Text style={styles.rewardDate}>🗓 Announced: {reward.announce_date}</Text>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.enrollBtn, isEnrolled && styles.enrollBtnDone]}
                    onPress={() => handleEnroll(reward.id)}
                    disabled={isEnrolled || isEnrolling}
                    activeOpacity={0.85}
                  >
                    {isEnrolling
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.enrollBtnText}>{isEnrolled ? '✓ Enrolled' : 'Enroll'}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  header:  {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn:     { padding: Spacing.xs, minWidth: 60 },
  backText:    { fontSize: FontSize.base, color: Colors.accent, fontWeight: FontWeight.semibold },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text1 },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 48 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    gap:             Spacing.sm,
  },
  cardLabel: { fontSize: FontSize.sm, color: Colors.text2, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },

  codePill: {
    backgroundColor: Colors.accentSoft,
    borderWidth:     1,
    borderColor:     Colors.accent,
    borderRadius:    Radius.md,
    paddingVertical:   Spacing.sm,
    alignItems:        'center',
  },
  codeText: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: Colors.accent, letterSpacing: 3 },

  linkPill: {
    backgroundColor: Colors.bg,
    borderWidth:     1,
    borderColor:     Colors.border,
    borderRadius:    Radius.md,
    paddingVertical:   10,
    paddingHorizontal: Spacing.md,
  },
  linkText: { fontSize: FontSize.sm, color: Colors.text2 },

  btnRow:          { flexDirection: 'row', gap: Spacing.sm },
  btnPrimary:      { flex: 1, backgroundColor: Colors.accent, borderRadius: Radius.md, height: 44, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#fff' },
  btnSecondary:    { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  btnSecondaryText:{ fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text1 },

  noCodeText: { fontSize: FontSize.sm, color: Colors.text3, textAlign: 'center', paddingVertical: Spacing.sm },

  divider:      { height: 1, backgroundColor: Colors.border },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text1 },

  emptyState: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  emptyIcon:  { fontSize: 40 },
  emptyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text1 },
  emptySub:   { fontSize: FontSize.sm, color: Colors.text3, textAlign: 'center', lineHeight: 20 },

  rewardCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    borderWidth:     1,
    borderColor:     Colors.border,
    overflow:        'hidden',
  },
  rewardImagePlaceholder: {
    height:          100,
    backgroundColor: '#1a1a2e',
    alignItems:      'center',
    justifyContent:  'center',
  },
  rewardImageEmoji: { fontSize: 36 },
  rewardBody:       { padding: Spacing.md, gap: Spacing.xs },
  rewardTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text1 },
  rewardDesc:       { fontSize: FontSize.sm, color: Colors.text2, lineHeight: 18 },
  rewardDate:       { fontSize: FontSize.xs, color: Colors.text3 },

  enrollBtn: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.md,
    height:          44,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       Spacing.xs,
  },
  enrollBtnDone:  { backgroundColor: Colors.green, opacity: 0.85 },
  enrollBtnText:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#fff' },
})
