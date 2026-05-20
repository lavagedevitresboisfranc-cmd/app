/**
 * Catch-all route for /api/* paths inside the Expo Router (web/PWA).
 *
 * Why this exists:
 *   When the PWA is installed on iOS Home Screen (or the user is on the web
 *   build), Safari/the PWA wrapper intercepts ALL same-origin URLs and routes
 *   them through Expo Router. As a result, opening an SMS short link like
 *     https://booking-hub-406.preview.emergentagent.com/api/s/abc123
 *   never reached the backend — Expo Router showed its built-in "404 page
 *   not found" page instead.
 *
 * This component runs as soon as the route mounts and performs a hard
 * window.location.href redirect to the same path, bypassing Expo Router and
 * letting the request hit the FastAPI backend through the Kubernetes ingress.
 *
 * Note: This works only on the web build. On native iOS/Android the /api/*
 * URLs are never opened in the app router anyway.
 */
import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function ApiPassThrough() {
  const params = useLocalSearchParams<{ rest: string | string[] }>();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      const w: any = typeof window !== 'undefined' ? window : null;
      if (!w) return;
      // Use the exact current URL (preserves query string / hash) so behaviour
      // matches what a direct browser visit would do.
      const fullPath = (w.location?.pathname || '') + (w.location?.search || '') + (w.location?.hash || '');
      if (!fullPath.startsWith('/api/')) return;
      // Hard-replace so the request goes to the network and not back through
      // the client-side router.
      w.location.replace(fullPath);
    } catch (e) {
      // Best-effort — if window APIs aren't available we just render the spinner.
      // eslint-disable-next-line no-console
      console.warn('api pass-through redirect failed', e);
    }
  }, [params]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0891B2" />
      <Text style={styles.text}>Redirection…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  text: {
    fontSize: 14,
    color: '#525252',
    fontWeight: '500',
  },
});
