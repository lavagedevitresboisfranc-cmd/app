import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';

export default function RootLayout() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="appointments" />
        <Stack.Screen name="create" />
        <Stack.Screen name="detail" />
        <Stack.Screen name="requests" />
        <Stack.Screen name="request-detail" />
        <Stack.Screen name="stats" />
        <Stack.Screen name="client-history" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
});
