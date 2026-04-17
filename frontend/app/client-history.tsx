import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Client {
  name: string;
  count: number;
  total_spent: number;
  last_visit: string;
  email: string;
  phone: string;
  address: string;
}

interface Appointment {
  id: string;
  title: string;
  client_name: string;
  date: string;
  time_slot: string;
  duration_minutes: number;
  price: number;
  status: string;
}

export default function ClientHistoryScreen() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name?: string }>();
  const [clients, setClients] = useState<Client[]>([]);
  const [history, setHistory] = useState<Appointment[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/clients`);
      const data = await res.json();
      setClients(data);
    } catch (e) {
      console.error('Failed to fetch clients', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async (clientName: string) => {
    setLoading(true);
    try {
      const [histRes, clientsRes] = await Promise.all([
        fetch(`${API_URL}/api/clients/${encodeURIComponent(clientName)}/history`),
        fetch(`${API_URL}/api/clients`),
      ]);
      const histData = await histRes.json();
      const clientsData = await clientsRes.json();
      setHistory(histData);
      const found = clientsData.find((c: Client) => c.name === clientName);
      if (found) setSelectedClient(found);
    } catch (e) {
      console.error('Failed to fetch history', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (name) {
        fetchHistory(name);
      } else {
        fetchClients();
      }
    }, [name])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    if (name) await fetchHistory(name);
    else await fetchClients();
    setRefreshing(false);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    if (status === 'completed') return '#0891B2';
    if (status === 'cancelled') return '#FF3B30';
    return '#34C759';
  };

  // Client list view
  if (!name) {
    return (
      <SafeAreaView style={styles.safeArea} testID="clients-screen">
        <AppHeader title="Clients" showBack />
        {loading ? (
          <ActivityIndicator size="small" color="#0891B2" style={{ marginTop: 48 }} />
        ) : (
          <FlatList
            testID="clients-list"
            data={clients}
            keyExtractor={(item) => item.name}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891B2" />}
            renderItem={({ item }) => (
              <TouchableOpacity
                testID={`client-${item.name}`}
                style={styles.clientCard}
                activeOpacity={0.7}
                onPress={() => router.push({ pathname: '/client-history', params: { name: item.name } })}
              >
                <View style={styles.clientAvatar}>
                  <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>{item.name}</Text>
                  <Text style={styles.clientSub}>
                    {item.count} rdv · Dernier: {formatDate(item.last_visit)}
                  </Text>
                </View>
                <Text style={styles.clientSpent}>{item.total_spent.toFixed(2)} $</Text>
                <Feather name="chevron-right" size={18} color="#A3A3A3" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Feather name="users" size={48} color="#E5E5E5" />
                <Text style={styles.emptyTitle}>Aucun client</Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
          />
        )}
      </SafeAreaView>
    );
  }

  // Client history view
  return (
    <SafeAreaView style={styles.safeArea} testID="client-history-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="history-back" onPress={() => router.back()} style={styles.headerBtn} activeOpacity={0.7}>
          <Feather name="arrow-left" size={24} color="#0A0A0A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historique</Text>
        <View style={styles.headerBtn} />
      </View>

      <FlatList
        testID="history-list"
        data={history}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891B2" />}
        ListHeaderComponent={
          <View style={styles.clientProfile}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{name.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.profileName}>{name}</Text>
            {selectedClient && (
              <>
                <Text style={styles.profileStats}>
                  {selectedClient.count} rendez-vous · {selectedClient.total_spent.toFixed(2)} $ total
                </Text>
                {selectedClient.phone ? (
                  <TouchableOpacity style={styles.profileChip} onPress={() => Linking.openURL(`tel:${selectedClient.phone}`)}>
                    <Feather name="phone" size={14} color="#0891B2" />
                    <Text style={styles.profileChipText}>{selectedClient.phone}</Text>
                  </TouchableOpacity>
                ) : null}
                {selectedClient.email ? (
                  <TouchableOpacity style={styles.profileChip} onPress={() => Linking.openURL(`mailto:${selectedClient.email}`)}>
                    <Feather name="mail" size={14} color="#0891B2" />
                    <Text style={styles.profileChipText}>{selectedClient.email}</Text>
                  </TouchableOpacity>
                ) : null}
                {selectedClient.address ? (
                  <TouchableOpacity
                    style={styles.profileChip}
                    onPress={() => {
                      const addr = encodeURIComponent(selectedClient.address);
                      Alert.alert('Ouvrir avec', '', [
                        { text: 'Waze', onPress: () => Linking.openURL(`https://waze.com/ul?q=${addr}&navigate=yes`) },
                        { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${addr}`) },
                        { text: 'Annuler', style: 'cancel' },
                      ]);
                    }}
                  >
                    <Feather name="map-pin" size={14} color="#0891B2" />
                    <Text style={styles.profileChipText}>{selectedClient.address}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
            <Text style={styles.historyLabel}>HISTORIQUE DES RENDEZ-VOUS</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.historyCard}
            activeOpacity={0.7}
            onPress={() => router.push({ pathname: '/detail', params: { id: item.id } })}
          >
            <View style={styles.historyLeft}>
              <Text style={styles.historyDate}>{formatDate(item.date)}</Text>
              <Text style={styles.historyTime}>{item.time_slot}</Text>
            </View>
            <View style={styles.historyRight}>
              <Text style={styles.historyTitle}>{item.title}</Text>
              <View style={styles.historyMeta}>
                <View style={[styles.miniDot, { backgroundColor: getStatusColor(item.status) }]} />
                <Text style={[styles.historyStatus, { color: getStatusColor(item.status) }]}>{item.status}</Text>
                {item.price > 0 && <Text style={styles.historyPrice}>{item.price.toFixed(2)} $</Text>}
              </View>
            </View>
            <Feather name="chevron-right" size={18} color="#A3A3A3" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="small" color="#0891B2" style={{ marginTop: 32 }} />
          ) : (
            <View style={styles.emptyState}>
              <Feather name="calendar" size={48} color="#E5E5E5" />
              <Text style={styles.emptyTitle}>Aucun rendez-vous</Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#E5E5E5',
  },
  headerBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  listContent: { paddingBottom: 24 },
  clientCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 4,
    padding: 14, marginHorizontal: 24, marginTop: 10, gap: 12,
  },
  clientAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#0891B2',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  clientInfo: { flex: 1 },
  clientName: { fontSize: 16, fontWeight: '600', color: '#0A0A0A' },
  clientSub: { fontSize: 13, color: '#A3A3A3', marginTop: 2 },
  clientSpent: { fontSize: 15, fontWeight: '700', color: '#0891B2' },
  clientProfile: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 24, borderBottomWidth: 1, borderColor: '#E5E5E5' },
  profileAvatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#0891B2',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  profileAvatarText: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  profileName: { fontSize: 24, fontWeight: '800', color: '#0A0A0A', marginBottom: 4 },
  profileStats: { fontSize: 14, color: '#737373', marginBottom: 12 },
  profileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4,
    borderWidth: 1, borderColor: '#E5E5E5', marginBottom: 6,
  },
  profileChipText: { fontSize: 14, color: '#0891B2', fontWeight: '500' },
  historyLabel: { fontSize: 13, fontWeight: '600', color: '#A3A3A3', letterSpacing: 0.5, marginTop: 20, alignSelf: 'flex-start' },
  historyCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 4,
    padding: 14, marginHorizontal: 24, marginTop: 10, gap: 12,
  },
  historyLeft: { width: 70, alignItems: 'center' },
  historyDate: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  historyTime: { fontSize: 12, color: '#A3A3A3' },
  historyRight: { flex: 1 },
  historyTitle: { fontSize: 15, fontWeight: '600', color: '#0A0A0A' },
  historyMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  miniDot: { width: 6, height: 6, borderRadius: 3 },
  historyStatus: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  historyPrice: { fontSize: 14, fontWeight: '700', color: '#0891B2', marginLeft: 'auto' },
  emptyState: { alignItems: 'center', paddingTop: 64 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#0A0A0A', marginTop: 16 },
});
