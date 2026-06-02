import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets, SafeAreaProvider } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PostHogProvider } from "posthog-react-native";
import { Feather } from "@expo/vector-icons";
import { posthog, track, identify } from "./lib/analytics";
import NetInfo from "@react-native-community/netinfo";

// ---------------------------------------------------------------------------
// Animated splash screen (pure JS — no native changes)
// ---------------------------------------------------------------------------
function SurgeSplash() {
  return (
    <View style={splash.safe}>
      <Text style={splash.bolt}>⚡</Text>
      <Text style={splash.surge}>SURGE</Text>
    </View>
  )
}

const splash = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bolt:  { fontSize: 52 },
  surge: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: 6 },
})

// ---------------------------------------------------------------------------
// Offline banner
// ---------------------------------------------------------------------------
function OfflineBanner() {
  const [isOffline, setIsOffline] = React.useState(false)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOffline(state.isConnected === false)
    })
    return unsub
  }, [])

  if (!isOffline) return null

  return (
    <View style={[offlineStyles.banner, { paddingTop: insets.top > 0 ? insets.top : 8 }]}>
      <Feather name="wifi-off" size={13} color="#fff" />
      <Text style={offlineStyles.text}>You're offline — changes will sync when reconnected</Text>
    </View>
  )
}

const offlineStyles = StyleSheet.create({
  banner: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    zIndex:          999,
    backgroundColor: '#1A1A1A',
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    paddingBottom:   8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2E2E2E',
  },
  text: {
    color:      '#A0A0A0',
    fontSize:   11,
    fontWeight: '500',
  },
})

// ---------------------------------------------------------------------------
// Error boundary — shows crash details on screen instead of blank crash
// ---------------------------------------------------------------------------
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#0D0D0D', padding: 20, paddingTop: 60 }}>
          <Text style={{ color: '#FF4D00', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
            Crash — tap to copy error
          </Text>
          <Text style={{ color: '#fff', fontSize: 13, lineHeight: 20 }}>
            {this.state.error.toString()}
          </Text>
          <Text style={{ color: '#888', fontSize: 11, marginTop: 16, lineHeight: 18 }}>
            {this.state.error.stack}
          </Text>
          <TouchableOpacity
            style={{ marginTop: 24, backgroundColor: '#FF4D00', padding: 14, borderRadius: 8 }}
            onPress={() => this.setState({ error: null })}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: 'bold' }}>Retry</Text>
          </TouchableOpacity>
        </ScrollView>
      )
    }
    return this.props.children
  }
}

import { supabase, handleOAuthCallback } from "./lib/supabase";
import { useUserStore } from "./stores/userStore";
import { Linking } from "react-native";
import { Colors } from "./constants/theme";

// Onboarding screens (Agent 1 builds these)
import PhoneScreen from "./app/onboarding/phone";
import OTPScreen from "./app/onboarding/otp";
import ProfileSetupScreen from "./app/onboarding/profile-setup";
import GoalsScreen from "./app/onboarding/goals";
import ExperienceScreen from "./app/onboarding/experience";
import FoodUnitsScreen from "./app/onboarding/food-units";
import AccountabilityScreen from "./app/onboarding/accountability";

// Main tab screens
import TodayScreen from "./app/(tabs)/today";
import HistoryScreen from "./app/(tabs)/history";
import ProfileScreen from "./app/(tabs)/profile";
import ShareScreen from "./app/share";
import ReferralsScreen from "./app/referrals";

// ---------------------------------------------------------------------------
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

// ---------------------------------------------------------------------------
// Floating island tab bar — Option C
// ---------------------------------------------------------------------------
const ROUTE_ICONS: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  History: 'calendar',
  Profile: 'user',
}

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()

  return (
    <View
      pointerEvents="box-none"
      style={[
        tab.wrapper,
        {
          bottom:         Math.max(insets.bottom, 16) + 8,
          left:           20,
          right:          20,
        },
      ]}
    >
      <View style={tab.pill}>
        {state.routes.map((route, index) => {
          const focused  = state.index === index
          const isCenter = route.name === 'Today'

          const onPress = () => {
            const event = navigation.emit({
              type:             'tabPress',
              target:           route.key,
              canPreventDefault: true,
            })
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name)
            }
          }

          if (isCenter) {
            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                activeOpacity={0.85}
                style={tab.centerWrap}
              >
                <View style={tab.centerBtn}>
                  <Feather name="home" size={22} color="#fff" />
                </View>
              </TouchableOpacity>
            )
          }

          const iconName = ROUTE_ICONS[route.name]
          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.7}
              style={tab.sideBtn}
            >
              <Feather
                name={iconName}
                size={21}
                color={focused ? Colors.accent : Colors.text3}
              />
              <View style={[tab.dot, { opacity: focused ? 1 : 0 }]} />
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const tab = StyleSheet.create({
  wrapper: {
    position:  'absolute',
    alignItems: 'stretch',
  },
  pill: {
    height:          54,
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#1A1A1A',
    borderRadius:    27,
    borderWidth:     1,
    borderColor:     '#2E2E2E',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 8 },
    shadowOpacity:   0.45,
    shadowRadius:    20,
    elevation:       14,
    overflow:        'visible',
  },
  sideBtn: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            5,
    paddingVertical: 6,
  },
  dot: {
    width:        4,
    height:       4,
    borderRadius: 2,
    backgroundColor: Colors.accent,
  },
  centerWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  centerBtn: {
    width:           46,
    height:          46,
    borderRadius:    23,
    backgroundColor: Colors.accent,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     Colors.accent,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.55,
    shadowRadius:    12,
    elevation:       10,
  },
})

// ---------------------------------------------------------------------------
// Main tabs
// ---------------------------------------------------------------------------
function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={{
        headerShown:    false,
        tabBarStyle:    { display: 'none' },  // hidden — FloatingTabBar renders instead
        tabBarShowLabel: false,
      }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Today"   component={TodayScreen}   />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  )
}

// ---------------------------------------------------------------------------
// Root navigator
// ---------------------------------------------------------------------------
// Set to false when you want to test auth flow
const DEV_BYPASS_AUTH = __DEV__

function RootNavigator() {
  const { session, profile, isLoading } = useUserStore()

  if (DEV_BYPASS_AUTH) return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Share" component={ShareScreen} />
      <Stack.Screen name="Referrals" component={ReferralsScreen} />
    </Stack.Navigator>
  )

  if (isLoading) return <SurgeSplash />

  if (!session) {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      >
        <Stack.Screen name="Phone" component={PhoneScreen} />
        <Stack.Screen name="OTP" component={OTPScreen} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        <Stack.Screen name="Goals" component={GoalsScreen} />
        <Stack.Screen name="Experience" component={ExperienceScreen} />
        <Stack.Screen name="FoodUnits" component={FoodUnitsScreen} />
        <Stack.Screen name="Accountability" component={AccountabilityScreen} />
      </Stack.Navigator>
    );
  }

  if (!profile) {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      >
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        <Stack.Screen name="Goals" component={GoalsScreen} />
        <Stack.Screen name="Experience" component={ExperienceScreen} />
        <Stack.Screen name="FoodUnits" component={FoodUnitsScreen} />
        <Stack.Screen name="Accountability" component={AccountabilityScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Share" component={ShareScreen} />
      <Stack.Screen name="Referrals" component={ReferralsScreen} />
    </Stack.Navigator>
  );
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------
export default function App() {
  const { setSession, setLoading, setProfile } = useUserStore();

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('users').select('*').eq('id', userId).single()
    if (data) setProfile(data)
  }

  useEffect(() => {
    track('app_open')
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        identify(session.user.id, { email: session.user.email })
        await loadProfile(session.user.id)  // wait for profile before hiding splash
      }
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        identify(session.user.id, { email: session.user.email })
        loadProfile(session.user.id)
      }
    });

    // Handle Google OAuth callback deep link on Android.
    // When Chrome redirects to surge://auth/callback?code=xxx, Android fires
    // an Intent that brings the app to the foreground. We catch it here and
    // exchange the code for a session. onAuthStateChange above then fires and
    // updates the navigator automatically.
    const handleOAuthDeepLink = async (url: string | null) => {
      if (!url) return
      if (!url.startsWith('surge://auth/callback')) return
      console.log('[OAuth deep link] handling:', url)
      const { error } = await handleOAuthCallback(url)
      if (error) console.error('[OAuth deep link] failed:', error.message)
    }

    // Cold-start: app was opened directly via the deep link
    Linking.getInitialURL().then(handleOAuthDeepLink)

    // Warm-start: app was already running / backgrounded
    const linkingSub = Linking.addEventListener('url', ({ url }) => handleOAuthDeepLink(url))

    return () => {
      subscription.unsubscribe()
      linkingSub.remove()
    }
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <PostHogProvider client={posthog}>
          <QueryClientProvider client={queryClient}>
            <NavigationContainer>
              <StatusBar style="light" />
              <RootNavigator />
              <OfflineBanner />
            </NavigationContainer>
          </QueryClientProvider>
        </PostHogProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
