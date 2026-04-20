import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert,
  ActivityIndicator, RefreshControl, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ScheduledCampaign {
  id: string;
  season: string;
  subject: string;
  body: string;
  recipients: string[];
  scheduled_at: string;
  status: 'pending' | 'sent' | 'ready' | 'failed' | 'cancelled';
  error?: string;
  sent_at?: string;
  created_at: string;
}

const SEASON_META: Record<string, { icon: string; color: string }> = {
  spring: { icon: '🌷', color: '#EC4899' },
  autumn: { icon: '🍂', color: '#F59E0B' },
  summer: { icon: '☀️', color: '#EAB308' },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: '⏳ En attente',    color: '#B45309', bg: '#FEF3C7' },
  ready:     { label: '📬 Prêt à envoyer', color: '#0891B2', bg: '#ECFEFF' },
  sent:      { label: '✅ Envoyé',         color: '#10B981', bg: '#ECFDF5' },
  failed:    { label: '❌ Échec',          color: '#DC2626', bg: '#FEF2F2' },
  cancelled: { label: '🚫 Annulé',         color: '#6B7280', bg: '#F3F4F6' },
};

export default function ScheduledCampaignsScreen() {
  const [items, setItems] = useState<ScheduledCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/scheduled-campaigns`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Fetch scheduled campaigns failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const cancel = (id: string) => {
    Alert.alert(
      'Annuler la campagne',
      'Êtes-vous sûr de vouloir annuler cette campagne planifiée ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/api/scheduled-campaigns/${id}`, { method: 'DELETE' });
              if (!res.ok) throw new Error('Erreur');
              await load();
            } catch {
              Alert.alert('Erreur', "Impossible d'annuler");
            }
          },
        },
      ]
    );
  };

  const sendNow = async (item: ScheduledCampaign) => {
    // Open mailto with subject/body and recipients in BCC
    const mailto = `mailto:?bcc=${encodeURIComponent(item.recipients.join(','))}&subject=${encodeURIComponent(item.subject)}&body=${encodeURIComponent(item.body)}`;
    try {
      await Linking.openURL(mailto);
      // Mark as sent
      await fetch(`${API_URL}/api/scheduled-campaigns/${item.id}/mark-sent`, { method: 'POST' });
      setTimeout(load, 1500);
    } catch {
      Alert.alert('Erreur', "Impossible d'ouvrir votre app de courriel");
    }
  };

  const renderItem = ({ item }: { item: ScheduledCampaign }) => {
    const meta = SEASON_META[item.season] || { icon: '📧', color: '#0891B2' };
    const stat = STATUS_META[item.status] || STATUS_META.pending;
    const when = new Date(item.scheduled_at);
    const dateStr = when.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = when.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    const isActive = item.status === 'pending' || item.status === 'ready';

    return (
      <View style={[styles.card, { borderLeftColor: meta.color }]}>
        <View style={styles.cardHead}>
          <Text style={styles.cardIcon}>{meta.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.subject}</Text>
            <Text style={styles.cardDate}>📅 {dateStr} • 🕐 {timeStr}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: stat.bg }]}>
            <Text style={[styles.statusText, { color: stat.color }]}>{stat.label}</Text>
          </View>
        </View>
        <Text style={styles.recipientsLabel}>
          👥 {item.recipients.length} destinataire{item.recipients.length > 1 ? 's' : ''}
        </Text>

        {item.error && (
          <Text style={styles.errorText} numberOfLines={2}>ℹ️ {item.error}</Text>
        )}

        {item.status === 'ready' && (
          <TouchableOpacity
            onPress={() => sendNow(item)}
            style={[styles.actionBtn, { backgroundColor: '#0891B2' }]}
            activeOpacity={0.85}
          >
            <Feather name="mail" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Envoyer maintenant (mailto)</Text>
          </TouchableOpacity>
        )}

        {isActive && (
          <TouchableOpacity
            onPress={() => cancel(item.id)}
            style={[styles.actionBtn, { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }]}
            activeOpacity={0.85}
          >
            <Feather name="x" size={16} color="#DC2626" />
            <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>Annuler la planification</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="📅 Campagnes Planifiées" showBack />
      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator size="large" color="#0891B2" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="clock" size={48} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>Aucune campagne planifiée</Text>
          <Text style={styles.emptyText}>
            Planifiez vos campagnes marketing depuis l'écran « Campagnes »
            pour les envoyer automatiquement à la date/heure de votre choix.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891B2" />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 8, lineHeight: 20, maxWidth: 280 },
  card: {
    backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    borderLeftWidth: 4, padding: 14, gap: 8,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { fontSize: 28 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  cardDate: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
  recipientsLabel: { fontSize: 13, color: '#374151', fontWeight: '600' },
  errorText: { fontSize: 12, color: '#6B7280', fontStyle: 'italic', lineHeight: 16 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 10, marginTop: 4,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
