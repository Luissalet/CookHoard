import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/theme';
import '../src/i18n';
import { loadStoredLanguage } from '../src/i18n';
import { StoreProvider, useStore } from '../src/store';
import { isCloud } from '../src/cloud/backend';
import { SessionProvider, useSession } from '../src/cloud/session';
import { AuthFlow } from '../src/auth/AuthFlow';

function Splash() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

// Restore language + wait for the local store before painting.
function Gate({ children }: { children: React.ReactNode }) {
  const { ready } = useStore();
  const [langReady, setLangReady] = useState(false);
  useEffect(() => { loadStoredLanguage().finally(() => setLangReady(true)); }, []);
  if (!ready || !langReady) return <Splash />;
  return <>{children}</>;
}

// Cloud mode only: require a signed-in session before the app renders.
function CloudGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  if (loading) return <Splash />;
  if (!session) return <AuthFlow />;
  return <>{children}</>;
}

function AppStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="recipe/[id]" options={{ title: '', headerBackTitle: '' }} />
      <Stack.Screen name="publish" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="make/[id]" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="cook/[id]" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="shopping" options={{ title: '' }} />
      <Stack.Screen name="menu" options={{ title: '' }} />
      <Stack.Screen name="import" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="feed" options={{ title: '' }} />
      <Stack.Screen name="reset-password" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const content = (
    <StoreProvider>
      <Gate><AppStack /></Gate>
    </StoreProvider>
  );
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {isCloud ? (
        <SessionProvider>
          <CloudGate>{content}</CloudGate>
        </SessionProvider>
      ) : (
        content
      )}
    </SafeAreaProvider>
  );
}
