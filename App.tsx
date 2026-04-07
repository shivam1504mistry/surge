import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Text, View } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { supabase } from './lib/supabase'
import { useUserStore } from './stores/userStore'
import { Colors } from './constants/theme'

// Onboarding screens (Agent 1 builds these)
import PhoneScreen          from './app/onboarding/phone'
import OTPScreen            from './app/onboarding/otp'
import ProfileSetupScreen   from './app/onboarding/profile-setup'
import GoalsScreen          from './app/onboarding/goals'
import ExperienceScreen     from './app/onboarding/experience'
import AccountabilityScreen from './app/onboarding/accountability'

// Main tab screens
import TodayScreen   from './app/(tabs)/today'
import HistoryScreen from './app/(tabs)/history'
import ProfileScreen from './app/(tabs)/profile'

// ---------------------------------------------------------------------------
const Stack       = createNativeStackNavigator()
const Tab         = createBottomTabNavigator()
const queryClient = new QueryClient()

// ---------------------------------------------------------------------------
// Tab icon
// ---------------------------------------------------------------------------
function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <Text style={{ fontSize: 10, fontWeight: '600', color: focused ? Colors.accent : Colors.text3 }}>
        {label}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main tabs
// ---------------------------------------------------------------------------
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown:    false,
        tabBarStyle:    { backgroundColor: Colors.surface, borderTopColor: Colors.border, height: 72, paddingBottom: 8 },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen name="Today"   component={TodayScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="⚡" label="Today"   focused={focused} /> }} />
      <Tab.Screen name="History" component={HistoryScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="📅" label="History" focused={focused} /> }} />
      <Tab.Screen name="Profile" component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="👤" label="Profile" focused={focused} /> }} />
    </Tab.Navigator>
  )
}

// ---------------------------------------------------------------------------
// Root navigator
// ---------------------------------------------------------------------------
function RootNavigator() {
  const { session, profile, isLoading } = useUserStore()

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 48 }}>⚡</Text>
      </View>
    )
  }

  if (!session) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Screen name="Phone"          component={PhoneScreen} />
        <Stack.Screen name="OTP"            component={OTPScreen} />
        <Stack.Screen name="ProfileSetup"   component={ProfileSetupScreen} />
        <Stack.Screen name="Goals"          component={GoalsScreen} />
        <Stack.Screen name="Experience"     component={ExperienceScreen} />
        <Stack.Screen name="Accountability" component={AccountabilityScreen} />
      </Stack.Navigator>
    )
  }

  if (!profile) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Screen name="ProfileSetup"   component={ProfileSetupScreen} />
        <Stack.Screen name="Goals"          component={GoalsScreen} />
        <Stack.Screen name="Experience"     component={ExperienceScreen} />
        <Stack.Screen name="Accountability" component={AccountabilityScreen} />
      </Stack.Navigator>
    )
  }

  return <MainTabs />
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------
export default function App() {
  const { setSession, setLoading } = useUserStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <StatusBar style="light" />
        <RootNavigator />
      </NavigationContainer>
    </QueryClientProvider>
  )
}
