import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
  Platform,
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
  client_phone?: string;
  client_email?: string;
  client_address?: string;
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

  // === Accept the client's proposed alternative date/time ===
  // mode='sms' → opens iMessage with the portal SMS body
  // mode='email' → triggers a confirmation email via the backend
  const acceptAndNotify = async (apt: Appointment, mode: 'sms' | 'email') => {
    const newDate = apt.client_suggested_date || '';
    const newTime = apt.client_suggested_time || '';
    if (!newDate || !newTime) {
      Alert.alert('Erreur', 'Pas de proposition à accepter.');
      return;
    }
    try {
      // 1) Accept the alternative — backend moves the appointment + clears flags
      const acceptRes = await fetch(`${API_URL}/api/appointments/${apt.id}/accept-alternative`, { method: 'POST' });
      if (!acceptRes.ok) {
        const txt = await acceptRes.text().catch(() => '');
        Alert.alert('Erreur', 'Acceptation échouée. ' + txt.slice(0, 120));
        return;
      }

      if (mode === 'email') {
        // Email path: backend builds + sends the confirmation email
        const r = await fetch(`${API_URL}/api/appointments/${apt.id}/send-client-confirmation`, { method: 'POST' });
        const d = await r.json().catch(() => ({}));
        const okMsg = d?.email_sent
          ? `✅ Nouvelle date acceptée et courriel envoyé à ${d.client_email || apt.client_email || 'client'}.`
          : `✅ Nouvelle date acceptée. (Pas d'adresse courriel — aucun envoi.)`;
        if (Platform.OS === 'web') { try { (window as any).alert(okMsg); } catch {} }
        else Alert.alert('Succès', okMsg);
      } else {
        // SMS path: use the backend SMS body (with short portal URL) and open iMessage
        const r = await fetch(`${API_URL}/api/appointments/${apt.id}/send-client-confirmation`, { method: 'POST' });
        const d = await r.json().catch(() => ({}));
        const phone = (apt.client_phone || d?.client_phone || '').replace(/\D/g, '');
        const body = String(d?.sms_body || '');
        if (!phone) {
          Alert.alert('Téléphone manquant', '✅ Nouvelle date acceptée, mais ce client n\'a pas de numéro pour SMS.');
        } else {
          const sep = Platform.OS === 'ios' ? '&' : '?';
          const url = `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
          if (Platform.OS === 'web') {
            try { (window as any).open(url, '_blank'); } catch { (window as any).location.href = url; }
          } else {
            try {
              const can = await Linking.canOpenURL(url);
              if (can) await Linking.openURL(url);
              else Alert.alert('SMS non disponible', body.slice(0, 200));
            } catch {
              Alert.alert('Erreur', 'Impossible d\'ouvrir l\'app SMS');
            }
          }
        }
      }

      // Refresh the list — the accepted item should disappear (no longer client_requested_alternative)
      fetchAppointments();
    } catch {
      Alert.alert('Erreur', 'Erreur réseau');
    }
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
    // Only show client response badges for upcoming appointments — once paid/completed/cancelled,
    // the final status takes priority over the client's earlier booking confirmation.
    const isActive = item.status === 'upcoming';
    const isClientAlt = !!item.client_requested_alternative && isActive;
    const isClientConfirmed = !!item.client_confirmed && !isClientAlt && isActive;

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
      <View
        testID={`appointment-row-${item.id}`}
        style={[styles.card, isClientResponseMode && { borderLeftWidth: 4, borderLeftColor: accent, backgroundColor: bg }]}
      >
        <TouchableOpacity
          testID={`appointment-item-${item.id}`}
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

        {/* Quick action buttons — only shown for client_requested_alternative items */}
        {isClientResponseMode && isClientAlt && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              testID={`accept-sms-${item.id}`}
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              activeOpacity={0.8}
              onPress={() => acceptAndNotify(item, 'sms')}
            >
              <Feather name="message-square" size={14} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Accepter + SMS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`accept-email-${item.id}`}
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              activeOpacity={0.8}
              onPress={() => acceptAndNotify(item, 'email')}
            >
              <Feather name="mail" size={14} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Accepter + Courriel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  actionBtnPrimary: {
    backgroundColor: '#10B981',
  },
  actionBtnSecondary: {
    backgroundColor: '#0B5394',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
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
