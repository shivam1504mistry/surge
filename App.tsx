import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PostHogProvider } from "posthog-react-native";
import { posthog, track, identify } from "./lib/analytics";

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
import AccountabilityScreen from "./app/onboarding/accountability";

// Main tab screens
import TodayScreen from "./app/(tabs)/today";
import HistoryScreen from "./app/(tabs)/history";
import ProfileScreen from "./app/(tabs)/profile";
import ShareScreen from "./app/share";

// ---------------------------------------------------------------------------
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

// ---------------------------------------------------------------------------
// Tab icon
// ---------------------------------------------------------------------------
function TabIcon({
  emoji,
  label,
  focused,
}: {
  emoji: string;
  label: string;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <Text
        style={{
          fontSize:       9,
          fontWeight:     "600",
          color:          focused ? Colors.accent : Colors.text3,
          letterSpacing:  0.2,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main tabs
// ---------------------------------------------------------------------------
function MainTabs() {
  const insets = useSafeAreaInsets();
  const TAB_CONTENT_HEIGHT = 58;
  const tabBarHeight = TAB_CONTENT_HEIGHT + insets.bottom;

  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: insets.bottom,
          paddingTop: 0,
          overflow: 'visible',
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📋" label="Log" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarIcon: () => (
            <View style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: Colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: -20,
              shadowColor: Colors.accent,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5,
              shadowRadius: 12,
              elevation: 8,
            }}>
              <Text style={{ fontSize: 24 }}>🎤</Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="👤" label="Me" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
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
    </Stack.Navigator>
  )

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 48 }}>⚡</Text>
      </View>
    );
  }

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
        <Stack.Screen name="Accountability" component={AccountabilityScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Share" component={ShareScreen} />
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        identify(session.user.id, { email: session.user.email })
        loadProfile(session.user.id)
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
      <PostHogProvider client={posthog}>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer>
            <StatusBar style="light" />
            <RootNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </PostHogProvider>
    </ErrorBoundary>
  );
}
