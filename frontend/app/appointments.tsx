import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Appointment {
  id: string;
  title: string;
  client_name: string;
  date: string;
  time_slot: string;
  duration_minutes: number;
  notes: string;
  status: string;
  client_confirmed?: boolean;
  client_requested_alternative?: boolean;
  client_suggested_date?: string | null;
  client_suggested_time?: string | null;
  client_suggested_note?: string | null;
}

type FilterType = 'all' | 'upcoming' | 'completed' | 'cancelled';

export default function AppointmentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  // When the user opens this screen via the "Réponse" chip on the home calendar,
  // we restrict the list to appointments where the CLIENT has responded
  // (Réservé OR Modifier) — and hide the regular All/Upcoming/Done filters.
  const isClientResponseMode = params.filter === 'client_response';
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      // In client-response mode, always fetch the full list and filter client-side
      const url = isClientResponseMode
        ? `${API_URL}/api/appointments`
        : filter === 'all'
          ? `${API_URL}/api/appointments`
          : `${API_URL}/api/appointments?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      let list: Appointment[] = Array.isArray(data) ? data : [];
      if (isClientResponseMode) {
        list = list
          .filter(
            (a) =>
              (a.client_requested_alternative === true || a.client_confirmed === true) &&
              a.status !== 'archived' &&
              a.status !== 'cancelled'
          )
          // Most recent / actionable first
          .sort((a, b) => {
            // alternatives first, then confirmed
            const ra = a.client_requested_alternative ? 0 : 1;
            const rb = b.client_requested_alternative ? 0 : 1;
            if (ra !== rb) return ra - rb;
            return (b.date || '').localeCompare(a.date || '');
          });
      }
      setAppointments(list);
    } catch (e) {
      console.error('Failed to fetch appointments', e);
    } finally {
      setLoading(false);
    }
  }, [filter, isClientResponseMode]);

  useFocusEffect(
    useCallback(() => {
      fetchAppointments();
    }, [filter, isClientResponseMode])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    if (status === 'completed') return '#34C759';
    if (status === 'cancelled') return '#FF3B30';
    if (status === 'paid') return '#0891B2';
    return '#000000';
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' });
  };

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'completed', label: 'Done' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  const renderAppointment = ({ item }: { item: Appointment }) => {
    const isClientAlt = !!item.client_requested_alternative;
    const isClientConfirmed = !!item.client_confirmed && !isClientAlt;

    // Build "client suggestion" subtitle when applicable
    let clientSuggestion = '';
    if (isClientAlt && item.client_suggested_date) {
      try {
        const d = new Date(item.client_suggested_date + 'T00:00:00');
        clientSuggestion = `Propose: ${d.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' })}${item.client_suggested_time ? ' ' + item.client_suggested_time : ''}`;
      } catch {
        clientSuggestion = `Propose: ${item.client_suggested_date} ${item.client_suggested_time || ''}`;
      }
    }

    const accent = isClientAlt ? '#F59E0B' : isClientConfirmed ? '#10B981' : getStatusColor(item.status);
    const bg = isClientAlt ? '#FFFBEB' : isClientConfirmed ? '#ECFDF5' : '#FFFFFF';

    return (
      <TouchableOpacity
        testID={`appointment-item-${item.id}`}
        style={[styles.card, isClientResponseMode && { borderLeftWidth: 4, borderLeftColor: accent, backgroundColor: bg }]}
        activeOpacity={0.7}
        onPress={() => router.push({ pathname: '/detail', params: { id: item.id } })}
      >
        <View style={styles.cardRow}>
          <View style={styles.dateBox}>
            <Text style={styles.dateBoxDay}>{formatDate(item.date)}</Text>
            <Text style={styles.dateBoxTime}>{item.time_slot}</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {isClientAlt ? '🔄 ' : isClientConfirmed ? '✅ ' : ''}{item.client_name || item.title}
            </Text>
            {isClientResponseMode ? (
              <Text style={[styles.cardClient, { color: accent, fontWeight: '700' }]} numberOfLines={1}>
                {isClientAlt ? clientSuggestion || 'Client demande modification' : 'Confirmé par le client'}
              </Text>
            ) : (
              <Text style={styles.cardClient} numberOfLines={1}>{item.client_name}</Text>
            )}
            {isClientResponseMode && isClientAlt && item.client_suggested_note ? (
              <Text style={[styles.cardClient, { fontSize: 12, fontStyle: 'italic', marginTop: 2 }]} numberOfLines={2}>
                « {item.client_suggested_note} »
              </Text>
            ) : null}
          </View>
          <View style={styles.cardEnd}>
            <View style={[styles.statusBadge, { borderColor: accent }]}>
              <View style={[styles.statusDot, { backgroundColor: accent }]} />
              <Text style={[styles.statusBadgeText, { color: accent }]}>
                {isClientAlt ? 'MODIFIER' : isClientConfirmed ? 'RÉSERVÉ' : item.status}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} testID="appointments-screen">
      <AppHeader title={isClientResponseMode ? 'Réponses des clients' : 'Tous les RDV'} />

      {!isClientResponseMode && (
        <View style={styles.filterRow}>
          {filters.map((f) => (
            <TouchableOpacity
              key={f.key}
              testID={`filter-${f.key}`}
              style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
              activeOpacity={0.7}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading && appointments.length === 0 ? (
        <ActivityIndicator testID="loading-spinner" size="small" color="#000" style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          testID="all-appointments-list"
          data={appointments}
          keyExtractor={(item) => item.id}
          renderItem={renderAppointment}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
          }
          ListEmptyComponent={
            <View style={styles.emptyState} testID="empty-appointments">
              <Feather name={isClientResponseMode ? 'inbox' : 'inbox'} size={48} color="#E5E5E5" />
              <Text style={styles.emptyTitle}>
                {isClientResponseMode ? 'Aucune réponse client' : 'No appointments found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {isClientResponseMode
                  ? 'Les réponses (Réservé / Modifier) apparaîtront ici.'
                  : filter !== 'all' ? 'Try a different filter' : 'Create your first appointment'}
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#FAFAFA',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
    color: '#0A0A0A',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#FFFFFF',
  },
  filterBtnActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#737373',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
    marginHorizontal: 24,
    marginBottom: 12,
    padding: 16,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateBox: {
    alignItems: 'center',
    width: 60,
  },
  dateBoxDay: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  dateBoxTime: {
    fontSize: 13,
    color: '#737373',
    marginTop: 2,
  },
  cardContent: {
    flex: 1,
    marginLeft: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  cardClient: {
    fontSize: 14,
    color: '#737373',
    marginTop: 2,
  },
  cardEnd: {
    marginLeft: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0A0A0A',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#A3A3A3',
    marginTop: 4,
  },
});
