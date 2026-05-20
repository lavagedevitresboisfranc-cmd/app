import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Alert, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Appointment {
  id: string;
  // Backend returns these field names (we keep both for safety)
  client_name?: string;
  customer_name?: string;
  date: string;
  time_slot?: string;
  time?: string;
  client_address?: string;
  address?: string;
  client_phone?: string;
  phone?: string;
  service_type?: string;
  price?: number;
  total_price?: number;
  status: string;
  archived_at?: string;
}

// Helper to read the display name regardless of which field is set
const nameOf = (a: Appointment) => a.client_name || a.customer_name || 'Sans nom';
const timeOf = (a: Appointment) => a.time_slot || a.time || '';
const addrOf = (a: Appointment) => a.client_address || a.address || '';
const phoneOf = (a: Appointment) => a.client_phone || a.phone || '';

const formatDate = (iso?: string) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

export default function AppointmentsArchiveScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchArchived = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/appointments?status=archived`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch archived appointments', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchArchived(); }, [fetchArchived]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchArchived();
    setRefreshing(false);
  }, [fetchArchived]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) =>
      nameOf(a).toLowerCase().includes(q) ||
      addrOf(a).toLowerCase().includes(q) ||
      phoneOf(a).toLowerCase().includes(q)
    );
  }, [items, search]);

  const confirmAction = (title: string, message: string, onConfirm: () => void, destructive = false) => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    } else {
      Alert.alert(title, message, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', style: destructive ? 'destructive' : 'default', onPress: onConfirm },
      ]);
    }
  };

  const handleRestore = (item: Appointment) => {
    confirmAction(
      'Restaurer le rendez-vous ?',
      `"${nameOf(item)}" sera remis dans le calendrier actif.`,
      async () => {
        setProcessing(true);
        try {
          const res = await fetch(`${API_URL}/api/appointments/${item.id}/restore`, { method: 'POST' });
          if (res.ok) {
            await fetchArchived();
          } else {
            Alert.alert('Erreur', 'La restauration a échoué.');
          }
        } catch {
          Alert.alert('Erreur', 'La restauration a échoué.');
        } finally {
          setProcessing(false);
        }
      }
    );
  };

  const handlePermanentDelete = (item: Appointment) => {
    confirmAction(
      'Suppression DÉFINITIVE ?',
      `"${nameOf(item)}" sera effacé de manière permanente. Cette action est IRRÉVERSIBLE.`,
      async () => {
        setProcessing(true);
        try {
          const res = await fetch(`${API_URL}/api/appointments/${item.id}/permanent`, { method: 'DELETE' });
          if (res.ok) {
            await fetchArchived();
          } else {
            Alert.alert('Erreur', 'La suppression définitive a échoué.');
          }
        } catch {
          Alert.alert('Erreur', 'La suppression définitive a échoué.');
        } finally {
          setProcessing(false);
        }
      },
      true
    );
  };

  const renderItem = ({ item }: { item: Appointment }) => (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardMain}
        activeOpacity={0.7}
        onPress={() => router.push(`/detail?id=${item.id}` as any)}
      >
        <View style={styles.dateBox}>
          <Text style={styles.dateText}>{formatDate(item.date)}</Text>
          <Text style={styles.timeText}>{timeOf(item) || '--:--'}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{nameOf(item)}</Text>
          {addrOf(item) ? <Text style={styles.meta} numberOfLines={1}>{addrOf(item)}</Text> : null}
          {item.service_type ? <Text style={styles.metaSmall}>{item.service_type}</Text> : null}
          {item.archived_at ? (
            <Text style={styles.archivedDate}>
              Archivé le {formatDate(item.archived_at)}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.restoreBtn]}
          onPress={() => handleRestore(item)}
          disabled={processing}
          activeOpacity={0.7}
        >
          <Feather name="rotate-ccw" size={16} color="#FFF" />
          <Text style={styles.actionText}>Restaurer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.deleteBtn]}
          onPress={() => handlePermanentDelete(item)}
          disabled={processing}
          activeOpacity={0.7}
        >
          <Feather name="trash-2" size={16} color="#FFF" />
          <Text style={styles.actionText}>Effacer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="Archives — Rendez-vous" showBack />

      <View style={styles.searchRow}>
        <Feather name="search" size={16} color="#6B7280" />
        <TextInput
          placeholder="Rechercher dans les archives…"
          placeholderTextColor="#9CA3AF"
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Feather name="x-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.countBar}>
        <Feather name="archive" size={14} color="#6B7280" />
        <Text style={styles.countText}>
          {filtered.length} rendez-vous archivé{filtered.length > 1 ? 's' : ''}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0891B2" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={48} color="#D1D5DB" />
          <Text style={styles.emptyText}>Aucun rendez-vous archivé</Text>
          <Text style={styles.emptyHint}>
            Les rendez-vous archivés apparaissent ici et peuvent être restaurés.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891B2" />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF', marginHorizontal: 12, marginTop: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },
  countBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  countText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#374151', marginTop: 12 },
  emptyHint: { fontSize: 13, color: '#9CA3AF', marginTop: 6, textAlign: 'center' },
  list: { padding: 12, paddingBottom: 40 },
  card: {
    backgroundColor: '#FFF', borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 1, overflow: 'hidden',
  },
  cardMain: { flexDirection: 'row', padding: 12, gap: 12 },
  dateBox: {
    width: 80, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F3F4F6', borderRadius: 8, paddingVertical: 8,
  },
  dateText: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase' },
  timeText: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 2 },
  info: { flex: 1, justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  meta: { fontSize: 13, color: '#4B5563' },
  metaSmall: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  archivedDate: { fontSize: 11, color: '#EF4444', marginTop: 4, fontStyle: 'italic' },
  actions: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#F3F4F6' },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  restoreBtn: { backgroundColor: '#10B981' },
  deleteBtn: { backgroundColor: '#EF4444' },
  actionText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
});
