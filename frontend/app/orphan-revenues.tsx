/**
 * Orphan Revenues — Cleanup screen.
 * Shows revenues that are NOT linked to a paid appointment (suspected duplicates),
 * with suggested matches on the same date. The user can:
 *   - DELETE the orphan revenue
 *   - LINK it to a same-day appointment (marks the appointment as 'paid', no new revenue)
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Revenue {
  id: string;
  amount: number;
  date: string;
  description: string;
  client_name: string;
  payment_method: string;
  appointment_id: string | null;
}

interface Appointment {
  id: string;
  client_name: string;
  date: string;
  time_slot: string;
  price?: number;
  paid_amount?: number;
  status: string;
  revenue_id?: string | null;
}

interface OrphanRow {
  revenue: Revenue;
  matches: Appointment[]; // candidate appointments on same date
}

const webConfirm = (msg: string): boolean => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.confirm(msg);
  }
  // Native fallback — not used in PWA workflow, but kept for safety
  return true;
};

const fmtDate = (iso: string): string => {
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
};

export default function OrphanRevenuesScreen() {
  const [rows, setRows] = useState<OrphanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [totalOrphan, setTotalOrphan] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, aRes] = await Promise.all([
        fetch(`${API_URL}/api/revenues`),
        fetch(`${API_URL}/api/appointments`),
      ]);
      const revs: Revenue[] = await rRes.json();
      const appts: Appointment[] = await aRes.json();

      // Linked revenue IDs (an appointment with revenue_id "owns" that revenue)
      const linkedIds = new Set(appts.map((a) => a.revenue_id).filter(Boolean) as string[]);
      const orphans = revs.filter((r) => !linkedIds.has(r.id));

      const result: OrphanRow[] = orphans.map((r) => {
        // Candidate appointments on the SAME date that are not already linked to a revenue
        const sameDate = appts
          .filter((a) => a.date === r.date && !a.revenue_id)
          .sort((x, y) => (x.time_slot || '').localeCompare(y.time_slot || ''));
        return { revenue: r, matches: sameDate };
      }).sort((a, b) => a.revenue.date.localeCompare(b.revenue.date));

      setRows(result);
      setTotalOrphan(orphans.reduce((s, r) => s + (r.amount || 0), 0));
    } catch (e) {
      console.error('Failed to load orphans', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const deleteRevenue = async (rev: Revenue) => {
    const ok = webConfirm(`Supprimer ce revenu de ${rev.amount.toFixed(0)} $ (${fmtDate(rev.date)}) ?\n\nCette action est irréversible.`);
    if (!ok) return;
    setBusyId(rev.id);
    try {
      const res = await fetch(`${API_URL}/api/revenues/${rev.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setRows((prev) => prev.filter((row) => row.revenue.id !== rev.id));
      setTotalOrphan((prev) => prev - (rev.amount || 0));
    } catch (e) {
      console.error(e);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Erreur lors de la suppression.');
      } else {
        Alert.alert('Erreur', 'Suppression échouée.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const linkToAppointment = async (rev: Revenue, appt: Appointment) => {
    const ok = webConfirm(
      `Lier ce revenu (${rev.amount.toFixed(0)} $) au rendez-vous ?\n\n` +
      `${appt.client_name} — ${fmtDate(appt.date)} ${appt.time_slot}\n\n` +
      `Le RDV passera en "Encaissé" et le revenu sera attaché.`
    );
    if (!ok) return;
    setBusyId(rev.id);
    try {
      const res = await fetch(
        `${API_URL}/api/revenues/${rev.id}/link-appointment/${appt.id}`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'link failed');
      }
      // Remove this orphan row
      setRows((prev) => prev.filter((row) => row.revenue.id !== rev.id));
      setTotalOrphan((prev) => prev - (rev.amount || 0));
    } catch (e: any) {
      console.error(e);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Erreur: ${e?.message || 'liaison échouée'}`);
      }
    } finally {
      setBusyId(null);
    }
  };

  const renderRow = ({ item }: { item: OrphanRow }) => {
    const r = item.revenue;
    const isBusy = busyId === r.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.amount}>{r.amount.toFixed(0)} $</Text>
            <Text style={styles.meta}>
              {fmtDate(r.date)} · {r.payment_method || '—'}
            </Text>
            {!!r.description && (
              <Text style={styles.desc} numberOfLines={2}>{r.description}</Text>
            )}
          </View>
          <TouchableOpacity
            disabled={isBusy}
            onPress={() => deleteRevenue(r)}
            style={[styles.btnDel, isBusy && { opacity: 0.5 }]}
            activeOpacity={0.7}
          >
            <Feather name="trash-2" size={16} color="#DC2626" />
            <Text style={styles.btnDelText}>Supprimer</Text>
          </TouchableOpacity>
        </View>

        {item.matches.length > 0 ? (
          <View style={styles.matchesBox}>
            <Text style={styles.matchesTitle}>
              {item.matches.length === 1 ? '1 RDV non encaissé ce jour' : `${item.matches.length} RDV non encaissés ce jour`}
            </Text>
            {item.matches.map((appt) => {
              const priceMatch = appt.price === r.amount;
              return (
                <View key={appt.id} style={styles.matchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchName}>
                      {priceMatch ? '✨ ' : ''}{appt.client_name}
                    </Text>
                    <Text style={styles.matchInfo}>
                      {appt.time_slot} · {appt.price ? `${appt.price.toFixed(0)} $` : 'pas de prix'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    disabled={isBusy}
                    onPress={() => linkToAppointment(r, appt)}
                    style={[styles.btnLink, isBusy && { opacity: 0.5 }]}
                    activeOpacity={0.7}
                  >
                    <Feather name="link" size={14} color="#FFFFFF" />
                    <Text style={styles.btnLinkText}>Lier</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.noMatch}>
            Aucun RDV correspondant ce jour-là. À supprimer si c'est un doublon.
          </Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <AppHeader title="🧹 Revenus orphelins" showBack />

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>
          {rows.length} revenu{rows.length > 1 ? 's' : ''} non lié{rows.length > 1 ? 's' : ''} à un RDV
        </Text>
        <Text style={styles.summaryTotal}>
          Total: {totalOrphan.toFixed(0)} $
        </Text>
        <Text style={styles.summaryHint}>
          Ces revenus existent en BD mais aucun RDV ne pointe vers eux. Souvent: doublons créés par l'ancien flow "Complété".
        </Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(it) => it.revenue.id}
        renderItem={renderRow}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#000" />
          ) : (
            <View style={styles.empty}>
              <Feather name="check-circle" size={48} color="#10B981" />
              <Text style={styles.emptyTitle}>Aucun revenu orphelin</Text>
              <Text style={styles.emptyHint}>Tous vos revenus sont liés à un rendez-vous.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  summary: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  summaryTotal: { fontSize: 14, color: '#10B981', fontWeight: '700', marginTop: 2 },
  summaryHint: { fontSize: 12, color: '#737373', marginTop: 6, lineHeight: 16 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  amount: { fontSize: 22, fontWeight: '800', color: '#0A0A0A' },
  meta: { fontSize: 13, color: '#737373', marginTop: 2 },
  desc: { fontSize: 12, color: '#525252', marginTop: 4, fontStyle: 'italic' },
  btnDel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 4,
  },
  btnDelText: { fontSize: 12, color: '#DC2626', fontWeight: '700' },

  matchesBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  matchesTitle: { fontSize: 12, color: '#737373', fontWeight: '600', marginBottom: 8 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  matchName: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  matchInfo: { fontSize: 12, color: '#737373', marginTop: 1 },
  btnLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#10B981',
    borderRadius: 8,
    gap: 4,
  },
  btnLinkText: { fontSize: 12, color: '#FFFFFF', fontWeight: '700' },

  noMatch: {
    fontSize: 12,
    color: '#A3A3A3',
    fontStyle: 'italic',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },

  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A', marginTop: 12 },
  emptyHint: { fontSize: 13, color: '#737373', marginTop: 4, textAlign: 'center' },
});
