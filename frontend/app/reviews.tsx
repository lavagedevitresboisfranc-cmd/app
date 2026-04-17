import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Review {
  id: string;
  appointment_id: string;
  client_name: string;
  rating: number;
  comment?: string;
  created_at: string;
}

export default function ReviewsScreen() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/reviews`);
      const data = await res.json();
      setReviews(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const avg = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : 0;

  const renderStars = (rating: number, size = 16) => (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Feather
          key={i}
          name="star"
          size={size}
          color={i <= rating ? '#F59E0B' : '#E5E5E5'}
          style={{ opacity: i <= rating ? 1 : 0.6 }}
        />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="Avis clients" showBack />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#0891B2" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891B2" />}
        >
          {/* Summary */}
          <View style={styles.summary}>
            <Text style={styles.avgLabel}>Note moyenne</Text>
            <Text style={styles.avgValue}>{avg.toFixed(1)} / 5</Text>
            {renderStars(Math.round(avg), 22)}
            <Text style={styles.count}>{reviews.length} avis reçu{reviews.length > 1 ? 's' : ''}</Text>
          </View>

          {reviews.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="star" size={40} color="#A3A3A3" />
              <Text style={styles.emptyText}>Aucun avis pour l'instant</Text>
              <Text style={styles.emptyHint}>Utilisez le bouton "Demander avis" après un RDV pour envoyer un lien au client par SMS.</Text>
            </View>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.name}>{r.client_name}</Text>
                  {renderStars(r.rating)}
                </View>
                {r.comment ? <Text style={styles.comment}>{r.comment}</Text> : null}
                <Text style={styles.date}>{new Date(r.created_at).toLocaleDateString('fr-CA')}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  summary: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 24, alignItems: 'center',
    marginBottom: 16, borderWidth: 1, borderColor: '#E5E5E5',
  },
  avgLabel: { fontSize: 12, color: '#737373', textTransform: 'uppercase', fontWeight: '600', letterSpacing: 0.5 },
  avgValue: { fontSize: 42, fontWeight: '800', color: '#0891B2', marginVertical: 6 },
  count: { fontSize: 13, color: '#737373', marginTop: 8 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#737373', marginTop: 12 },
  emptyHint: { fontSize: 13, color: '#A3A3A3', textAlign: 'center', marginTop: 6, paddingHorizontal: 20 },
  card: {
    backgroundColor: '#FFF', borderRadius: 10, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E5E5',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  name: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  comment: { fontSize: 14, color: '#404040', lineHeight: 20, marginBottom: 8 },
  date: { fontSize: 11, color: '#A3A3A3' },
});
