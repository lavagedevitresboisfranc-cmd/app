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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface AppointmentRequest {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  preferred_date: string;
  preferred_time: string;
  message: string;
  status: string;
  suggested_date: string | null;
  suggested_time: string | null;
  suggested_note: string | null;
  created_at: string;
  request_type?: string;
}

type FilterType = 'pending' | 'all' | 'alternative_offered' | 'accepted' | 'declined';
type TypeFilter = 'all' | 'rdv' | 'est';

export default function RequestsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const [requests, setRequests] = useState<AppointmentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('pending');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(
    params.type === 'est' ? 'est' : params.type === 'rdv' ? 'rdv' : 'all'
  );

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === 'all'
        ? `${API_URL}/api/requests`
        : `${API_URL}/api/requests?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      // Client-side filter by type
      const filtered = Array.isArray(data)
        ? data.filter((r: AppointmentRequest) => {
            if (typeFilter === 'all') return true;
            const t = r.request_type || 'rdv';
            return t === typeFilter;
          })
        : [];
      setRequests(filtered);
    } catch (e) {
      console.error('Failed to fetch requests', e);
    } finally {
      setLoading(false);
    }
  }, [filter, typeFilter]);

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [filter, typeFilter])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRequests();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    if (status === 'accepted') return '#34C759';
    if (status === 'alternative_offered') return '#FF9500';
    if (status === 'declined') return '#9CA3AF';
    return '#0891B2';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'alternative_offered') return 'Alternative';
    if (status === 'pending') return 'En attente';
    if (status === 'accepted') return 'Accepté';
    if (status === 'declined') return 'Archivé';
    return status;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' });
  };

  const timeAgo = (isoStr: string) => {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `il y a ${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `il y a ${hrs}h`;
    return `il y a ${Math.floor(hrs / 24)}j`;
  };

  const filters: { key: FilterType; label: string }[] = [
    { key: 'pending', label: 'En attente' },
    { key: 'alternative_offered', label: 'Alternative' },
    { key: 'accepted', label: 'Acceptées' },
    { key: 'declined', label: '🗂️ Archivées' },
    { key: 'all', label: 'Toutes' },
  ];

  const renderRequest = ({ item }: { item: AppointmentRequest }) => (
    <TouchableOpacity
      testID={`request-card-${item.id}`}
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => router.push({ pathname: '/request-detail', params: { id: item.id } })}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <View style={[styles.typeBadge, item.request_type === 'est' ? styles.typeEst : styles.typeRdv]}>
              <Text style={{ fontSize: 11 }}>{item.request_type === 'est' ? '💰' : '📅'}</Text>
              <Text style={[styles.typeBadgeText, { color: item.request_type === 'est' ? '#B45309' : '#0891B2' }]}>
                {item.request_type === 'est' ? 'ESTIMATION' : 'RDV'}
              </Text>
            </View>
          </View>
          <Text style={styles.cardName} numberOfLines={1}>{item.customer_name}</Text>
          <Text style={styles.cardEmail} numberOfLines={1}>{item.customer_email}</Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: getStatusColor(item.status) }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </View>

      <View style={styles.cardMiddle}>
        <View style={styles.dateTimeChip}>
          <Feather name="calendar" size={14} color="#737373" />
          <Text style={styles.chipText}>{formatDate(item.preferred_date)}</Text>
        </View>
        <View style={styles.dateTimeChip}>
          <Feather name="clock" size={14} color="#737373" />
          <Text style={styles.chipText}>{item.preferred_time}</Text>
        </View>
        <Text style={styles.agoText}>{timeAgo(item.created_at)}</Text>
      </View>

      {item.customer_phone ? (
        <View style={styles.cardExtraRow}>
          <Feather name="phone" size={13} color="#737373" />
          <Text style={styles.cardExtraText}>{item.customer_phone}</Text>
        </View>
      ) : null}

      {item.customer_address ? (
        <TouchableOpacity
          style={styles.cardExtraRow}
          activeOpacity={0.7}
          onPress={(e) => {
            e.stopPropagation();
            const address = encodeURIComponent(item.customer_address);
            Alert.alert('Ouvrir avec', 'Choisissez votre app de navigation', [
              { text: 'Waze', onPress: () => Linking.openURL(`https://waze.com/ul?q=${address}&navigate=yes`) },
              { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${address}`) },
              { text: 'Annuler', style: 'cancel' },
            ]);
          }}
        >
          <Feather name="map-pin" size={13} color="#737373" />
          <Text style={[styles.cardExtraText, { textDecorationLine: 'underline' }]} numberOfLines={1}>{item.customer_address}</Text>
          <Feather name="navigation" size={13} color="#000000" />
        </TouchableOpacity>
      ) : null}

      {item.status === 'alternative_offered' && item.suggested_date && (
        <View style={styles.suggestedRow}>
          <Feather name="arrow-right" size={14} color="#FF9500" />
          <Text style={styles.suggestedText}>
            Suggested: {formatDate(item.suggested_date)} at {item.suggested_time}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea} testID="requests-screen">
      <AppHeader title="Demandes" />

      {/* Type filter: RDV | Estimation | Toutes */}
      <View style={styles.typeFilterRow}>
        <TouchableOpacity
          style={[styles.typeFilterBtn, typeFilter === 'all' && styles.typeFilterBtnActiveAll]}
          activeOpacity={0.7}
          onPress={() => setTypeFilter('all')}
        >
          <Text style={[styles.typeFilterText, typeFilter === 'all' && { color: '#fff' }]}>📋 Toutes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeFilterBtn, typeFilter === 'rdv' && styles.typeFilterBtnActiveRdv]}
          activeOpacity={0.7}
          onPress={() => setTypeFilter('rdv')}
        >
          <Text style={[styles.typeFilterText, typeFilter === 'rdv' && { color: '#fff' }]}>📅 RDV</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeFilterBtn, typeFilter === 'est' && styles.typeFilterBtnActiveEst]}
          activeOpacity={0.7}
          onPress={() => setTypeFilter('est')}
        >
          <Text style={[styles.typeFilterText, typeFilter === 'est' && { color: '#fff' }]}>💰 Estimation</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            testID={`request-filter-${f.key}`}
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

      {loading && requests.length === 0 ? (
        <ActivityIndicator testID="requests-loading" size="small" color="#000" style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          testID="requests-list"
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderRequest}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
          }
          ListEmptyComponent={
            <View style={styles.emptyState} testID="empty-requests">
              <Feather name="inbox" size={48} color="#E5E5E5" />
              <Text style={styles.emptyTitle}>Aucune demande</Text>
              <Text style={styles.emptySubtitle}>
                {filter === 'pending' ? 'Aucune demande en attente' : 'Aucune demande trouvée'}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#FAFAFA',
    gap: 10,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
    color: '#0A0A0A',
  },
  headerBadge: {
    backgroundColor: '#000000',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  typeFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  typeFilterBtn: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
  },
  typeFilterBtnActiveAll: { backgroundColor: '#111', borderColor: '#111' },
  typeFilterBtnActiveRdv: { backgroundColor: '#0891B2', borderColor: '#0891B2' },
  typeFilterBtnActiveEst: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  typeFilterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  filterBtn: {
    paddingHorizontal: 14,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#737373',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingTop: 4,
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
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardInfo: {
    flex: 1,
    marginRight: 8,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  cardEmail: {
    fontSize: 13,
    color: '#A3A3A3',
    marginTop: 2,
  },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    alignSelf: 'flex-start',
  },
  typeRdv: { backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: '#BAE6FD' },
  typeEst: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' },
  typeBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
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
    marginRight: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cardMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
  dateTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#737373',
  },
  agoText: {
    fontSize: 12,
    color: '#A3A3A3',
    marginLeft: 'auto',
  },
  cardExtraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  cardExtraText: {
    fontSize: 14,
    color: '#737373',
    flex: 1,
  },
  suggestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
    backgroundColor: '#FFF8F0',
    padding: 8,
    borderRadius: 4,
  },
  suggestedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF9500',
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
