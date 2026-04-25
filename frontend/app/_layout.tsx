import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import '../src/i18n';  // Initialize i18n
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

function ThemedRoot() {
  const { colors, isDark } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="appointments" />
        <Stack.Screen name="create" />
        <Stack.Screen name="detail" />
        <Stack.Screen name="requests" />
        <Stack.Screen name="request-detail" />
        <Stack.Screen name="stats" />
        <Stack.Screen name="estimate" />
        <Stack.Screen name="employees" />
        <Stack.Screen name="client-history" />
        <Stack.Screen name="reschedule" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
