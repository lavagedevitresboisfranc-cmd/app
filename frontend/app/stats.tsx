import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Stats {
  total_appointments: number;
  month_appointments: number;
  today_appointments: number;
  total_revenue: number;
  month_revenue: number;
  pending_requests: number;
  acceptance_rate: number;
  completed: number;
  upcoming: number;
  cancelled: number;
  top_clients: { name: string; count: number; total_spent: number }[];
}

export default function StatsScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/stats`);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error('Failed to fetch stats', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  if (loading || !stats) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator size="small" color="#0891B2" style={{ marginTop: 48 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} testID="stats-screen">
      <AppHeader title="Statistiques" />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891B2" />}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.headerTitle}>Statistiques</Text>

        {/* Revenue Cards */}
        <View style={styles.row}>
          <View style={[styles.statCard, styles.cardAccent]}>
            <Feather name="dollar-sign" size={20} color="#FFFFFF" />
            <Text style={styles.statValueAccent}>{stats.total_revenue.toFixed(2)} $</Text>
            <Text style={styles.statLabelAccent}>Revenu total</Text>
          </View>
          <View style={[styles.statCard, styles.cardDark]}>
            <Feather name="trending-up" size={20} color="#FFFFFF" />
            <Text style={styles.statValueDark}>{stats.month_revenue.toFixed(2)} $</Text>
            <Text style={styles.statLabelDark}>Ce mois</Text>
          </View>
        </View>

        {/* Appointment counts */}
        <View style={styles.row}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.today_appointments}</Text>
            <Text style={styles.statLabel}>Aujourd'hui</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.month_appointments}</Text>
            <Text style={styles.statLabel}>Ce mois</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total_appointments}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        {/* Status breakdown */}
        <View style={styles.row}>
          <View style={styles.statCard}>
            <View style={[styles.statusDot, { backgroundColor: '#34C759' }]} />
            <Text style={styles.statValue}>{stats.upcoming}</Text>
            <Text style={styles.statLabel}>À venir</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statusDot, { backgroundColor: '#0891B2' }]} />
            <Text style={styles.statValue}>{stats.completed}</Text>
            <Text style={styles.statLabel}>Complétés</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statusDot, { backgroundColor: '#FF3B30' }]} />
            <Text style={styles.statValue}>{stats.cancelled}</Text>
            <Text style={styles.statLabel}>Annulés</Text>
          </View>
        </View>

        {/* Requests */}
        <View style={styles.row}>
          <View style={styles.statCard}>
            <Feather name="inbox" size={18} color="#FF9500" />
            <Text style={styles.statValue}>{stats.pending_requests}</Text>
            <Text style={styles.statLabel}>En attente</Text>
          </View>
          <View style={styles.statCard}>
            <Feather name="percent" size={18} color="#0891B2" />
            <Text style={styles.statValue}>{stats.acceptance_rate}%</Text>
            <Text style={styles.statLabel}>Taux acceptation</Text>
          </View>
        </View>

        {/* Top Clients */}
        <Text style={styles.sectionTitle}>Meilleurs clients</Text>
        {stats.top_clients.length === 0 ? (
          <Text style={styles.emptyText}>Aucun client encore</Text>
        ) : (
          stats.top_clients.map((client, idx) => (
            <TouchableOpacity
              key={client.name}
              testID={`top-client-${idx}`}
              style={styles.clientCard}
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/client-history', params: { name: client.name } })}
            >
              <View style={styles.clientRank}>
                <Text style={styles.rankText}>{idx + 1}</Text>
              </View>
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>{client.name}</Text>
                <Text style={styles.clientSub}>{client.count} rdv</Text>
              </View>
              <Text style={styles.clientSpent}>{client.total_spent.toFixed(2)} $</Text>
              <Feather name="chevron-right" size={18} color="#A3A3A3" />
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity
          testID="view-all-clients"
          style={styles.viewAllBtn}
          activeOpacity={0.7}
          onPress={() => router.push('/client-history')}
        >
          <Text style={styles.viewAllText}>Voir tous les clients</Text>
          <Feather name="arrow-right" size={16} color="#0891B2" />
        </TouchableOpacity>

        {/* Backup & Export */}
        <Text style={styles.sectionTitle}>Sauvegarde & Export</Text>

        <TouchableOpacity
          testID="export-backup"
          style={styles.exportBtn}
          activeOpacity={0.7}
          onPress={() => Linking.openURL(`${API_URL}/api/backup/export`)}
        >
          <Feather name="printer" size={18} color="#0891B2" />
          <View style={styles.exportInfo}>
            <Text style={styles.exportTitle}>Imprimer backup</Text>
            <Text style={styles.exportSub}>Tous les rdv + demandes</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          testID="email-backup"
          style={styles.exportBtn}
          activeOpacity={0.7}
          onPress={async () => {
            try {
              const res = await fetch(`${API_URL}/api/backup/email`, { method: 'POST' });
              const data = await res.json();
              if (res.ok) {
                Alert.alert('Backup envoyé!', data.message);
              } else {
                Alert.alert('Erreur', data.detail || 'Échec du backup');
              }
            } catch { Alert.alert('Erreur', 'Erreur réseau'); }
          }}
        >
          <Feather name="mail" size={18} color="#0891B2" />
          <View style={styles.exportInfo}>
            <Text style={styles.exportTitle}>Backup par courriel</Text>
            <Text style={styles.exportSub}>Recevoir une copie par email</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          testID="export-csv"
          style={styles.exportBtn}
          activeOpacity={0.7}
          onPress={() => Linking.openURL(`${API_URL}/api/backup/clients-csv`)}
        >
          <Feather name="file-text" size={18} color="#0891B2" />
          <View style={styles.exportInfo}>
            <Text style={styles.exportTitle}>Liste clients (CSV)</Text>
            <Text style={styles.exportSub}>Ouvrir dans Excel / Google Sheets</Text>
          </View>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { padding: 24 },
  headerTitle: { fontSize: 32, fontWeight: '800', letterSpacing: -1, color: '#0A0A0A', marginBottom: 20 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5E5',
    borderRadius: 8, padding: 16, alignItems: 'center', gap: 4,
  },
  cardAccent: { backgroundColor: '#0891B2', borderColor: '#0891B2' },
  cardDark: { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' },
  statValue: { fontSize: 24, fontWeight: '800', color: '#0A0A0A' },
  statValueAccent: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  statValueDark: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  statLabel: { fontSize: 12, fontWeight: '600', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: 0.3 },
  statLabelAccent: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' },
  statLabelDark: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A', marginTop: 20, marginBottom: 12 },
  clientCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 8, padding: 14, marginBottom: 8, gap: 12,
  },
  clientRank: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6',
    justifyContent: 'center', alignItems: 'center',
  },
  rankText: { fontSize: 13, fontWeight: '700', color: '#737373' },
  clientInfo: { flex: 1 },
  clientName: { fontSize: 16, fontWeight: '600', color: '#0A0A0A' },
  clientSub: { fontSize: 13, color: '#A3A3A3', marginTop: 2 },
  clientSpent: { fontSize: 16, fontWeight: '700', color: '#0891B2' },
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, marginTop: 8,
  },
  viewAllText: { fontSize: 15, fontWeight: '600', color: '#0891B2' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 8, padding: 16, marginBottom: 8, gap: 14,
  },
  exportInfo: { flex: 1 },
  exportTitle: { fontSize: 15, fontWeight: '600', color: '#0A0A0A' },
  exportSub: { fontSize: 13, color: '#A3A3A3', marginTop: 2 },
  emptyText: { fontSize: 14, color: '#A3A3A3', textAlign: 'center', paddingVertical: 20 },
});
