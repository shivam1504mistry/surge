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
  id:            string
  title:         string
  description:   string | null
  image_url:     string | null
  announce_date: string | null
  emoji?:        string | null
  venue?:        string | null
  match_time?:   string | null
}

function RewardCardBanner({ reward }: { reward: Reward }) {
  const isCricket = reward.title.toLowerCase().includes('odi') ||
    reward.title.toLowerCase().includes('cricket') ||
    reward.title.toLowerCase().includes('ind vs') ||
    reward.title.toLowerCase().includes('india vs')

  if (isCricket) {
    return (
      <View style={bannerStyles.cricketBanner}>
        <View style={bannerStyles.cricketTop}>
          <View style={bannerStyles.teamBlock}>
            <Text style={bannerStyles.flag}>🇮🇳</Text>
            <Text style={bannerStyles.teamName}>India</Text>
          </View>
          <View style={bannerStyles.vsBlock}>
            <Text style={bannerStyles.vs}>VS</Text>
            <Text style={bannerStyles.matchType}>3rd ODI · Day/Night</Text>
          </View>
          <View style={bannerStyles.teamBlock}>
            <Text style={bannerStyles.flag}>🇦🇫</Text>
            <Text style={bannerStyles.teamName}>Afghanistan</Text>
          </View>
        </View>
        <View style={bannerStyles.cricketBottom}>
          <Text style={bannerStyles.venue}>🏟 M.A. Chidambaram Stadium, Chennai</Text>
          <Text style={bannerStyles.matchDate}>📅 June 20, 2026 · 1:30 PM IST</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={bannerStyles.defaultBanner}>
      <Text style={bannerStyles.defaultEmoji}>{reward.emoji ?? '⚡'}</Text>
    </View>
  )
}

const bannerStyles = StyleSheet.create({
  cricketBanner: {
    backgroundColor: '#0a1628',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
  },
  cricketTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamBlock: { alignItems: 'center', gap: 4, flex: 1 },
  flag:      { fontSize: 32 },
  teamName:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff' },
  vsBlock:   { alignItems: 'center', gap: 2, flex: 1 },
  vs:        { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: Colors.accent, letterSpacing: 2 },
  matchType: { fontSize: 9, color: '#5a8fc4', fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  cricketBottom: { borderTopWidth: 1, borderTopColor: '#1e3a5f', paddingTop: Spacing.sm, gap: 3 },
  venue:     { fontSize: FontSize.xs, color: '#8ab4d4' },
  matchDate: { fontSize: FontSize.xs, color: '#8ab4d4' },
  defaultBanner: {
    height: 100, backgroundColor: '#1a1a2e',
    alignItems: 'center', justifyContent: 'center',
  },
  defaultEmoji: { fontSize: 36 },
})

export default function ReferralsScreen() {
  const navigation = useNavigation()
  const profile    = useUserStore((s) => s.profile)
  const setProfile = useUserStore((s) => s.setProfile)

  const [rewards,   setRewards]   = useState<Reward[]>([])
  const [enrolled,  setEnrolled]  = useState<Set<string>>(new Set())
  const [enrolling, setEnrolling] = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [copied,    setCopied]    = useState(false)

  const [referralCode, setReferralCode] = useState<string | undefined>(profile?.referral_code)
  const inviteLink = referralCode ? `${BASE_LINK}/${referralCode}` : null

  useEffect(() => {
    track('screen_referrals')
    loadRewards()
    ensureReferralCode()
  }, [])

  async function ensureReferralCode() {
    if (!profile?.id) return

    // Check DB first — user may already have a code from a prior session
    const { data: existing } = await supabase
      .from('users').select('referral_code').eq('id', profile.id).single()

    if (existing?.referral_code) {
      setReferralCode(existing.referral_code)
      if (profile && !profile.referral_code) {
        setProfile({ ...profile, referral_code: existing.referral_code })
      }
      return
    }

    // Generate a new one
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = 'SURGE-'
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
    const { error } = await supabase.from('users').update({ referral_code: code }).eq('id', profile.id)
    if (!error) {
      setReferralCode(code)
      if (profile) setProfile({ ...profile, referral_code: code })
    }
  }

  const loadRewards = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    try {
      const { data: assignments } = await supabase
        .from('reward_assignments')
        .select('reward_id, referral_rewards(id, title, description, image_url, announce_date)')
        .eq('user_id', profile.id)

      const rewardList: Reward[] = (assignments ?? [])
        .map((a: any) => a.referral_rewards)
        .filter(Boolean)

      setRewards(rewardList)

      const { data: enrollments } = await supabase
        .from('reward_enrollments')
        .select('reward_id')
        .eq('user_id', profile.id)

      setEnrolled(new Set<string>((enrollments ?? []).map((e: any) => e.reward_id)))
    } catch {
      // silent — empty state shown
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>👥 Referrals</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Invite link card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Your invite link</Text>
          {referralCode !== undefined ? (
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
            <ActivityIndicator color={Colors.accent} />
          )}
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Rewards you can win</Text>

        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.xl }} />
        ) : rewards.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
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
                <RewardCardBanner reward={reward} />
                <View style={styles.rewardBody}>
                  <View style={styles.rewardTitleRow}>
                    <Text style={styles.rewardTitle}>{reward.title}</Text>
                    <View style={styles.ticketBadge}>
                      <Text style={styles.ticketBadgeText}>× 2 Tickets</Text>
                    </View>
                  </View>
                  {reward.description ? (
                    <Text style={styles.rewardDesc}>{reward.description}</Text>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.enrollBtn, isEnrolled && styles.enrollBtnDone]}
                    onPress={() => handleEnroll(reward.id)}
                    disabled={isEnrolled || isEnrolling}
                    activeOpacity={0.85}
                  >
                    {isEnrolling
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.enrollBtnText}>
                          {isEnrolled ? '✓ You\'re in the draw!' : '🏏 Enter the draw'}
                        </Text>
                    }
                  </TouchableOpacity>
                  {isEnrolled && (
                    <Text style={styles.enrolledNote}>Winner announced after the series. Best of luck! ⚡</Text>
                  )}
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
  safe:   { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn:     { padding: Spacing.xs, minWidth: 60 },
  backText:    { fontSize: FontSize.base, color: Colors.accent, fontWeight: FontWeight.semibold },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text1 },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 48 },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm,
  },
  cardLabel: { fontSize: FontSize.sm, color: Colors.text2, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },

  codePill: {
    backgroundColor: Colors.accentSoft, borderWidth: 1, borderColor: Colors.accent,
    borderRadius: Radius.md, paddingVertical: Spacing.sm, alignItems: 'center',
  },
  codeText: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: Colors.accent, letterSpacing: 3 },

  linkPill: {
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: Spacing.md,
  },
  linkText: { fontSize: FontSize.sm, color: Colors.text2 },

  btnRow:           { flexDirection: 'row', gap: Spacing.sm },
  btnPrimary:       { flex: 1, backgroundColor: Colors.accent, borderRadius: Radius.md, height: 44, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText:   { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#fff' },
  btnSecondary:     { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  btnSecondaryText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text1 },

  divider:      { height: 1, backgroundColor: Colors.border },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text1 },

  emptyState: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  emptyIcon:  { fontSize: 40 },
  emptyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text1 },
  emptySub:   { fontSize: FontSize.sm, color: Colors.text3, textAlign: 'center', lineHeight: 20 },

  rewardCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: '#1e3a5f', overflow: 'hidden',
  },
  rewardBody:     { padding: Spacing.md, gap: Spacing.sm },
  rewardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  rewardTitle:    { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text1, flex: 1 },

  ticketBadge: {
    backgroundColor: Colors.accentSoft, borderWidth: 1, borderColor: Colors.accent,
    borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  ticketBadgeText: { fontSize: FontSize.xs, color: Colors.accent, fontWeight: FontWeight.bold },

  rewardDesc: { fontSize: FontSize.sm, color: Colors.text2, lineHeight: 18 },

  enrollBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.md,
    height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  enrollBtnDone: { backgroundColor: Colors.green },
  enrollBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#fff' },

  enrolledNote: { fontSize: FontSize.xs, color: Colors.text3, textAlign: 'center', lineHeight: 16 },
})
