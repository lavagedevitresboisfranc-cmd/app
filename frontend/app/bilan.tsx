import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Bilan {
  period: { start_date: string | null; end_date: string | null };
  total_revenues: number;
  total_expenses: number;
  net_profit: number;
  margin_pct: number;
  revenues_by_category: Record<string, { total: number; count: number }>;
  expenses_by_category: Record<string, { total: number; count: number }>;
}

const REV_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  printemps: { label: 'Saison Printemps', icon: '🌸', color: '#EC4899' },
  automne: { label: 'Saison Automne', icon: '🍂', color: '#F59E0B' },
};

const EXP_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  gas: { label: 'Essence', icon: '⛽', color: '#EF4444' },
  resto: { label: 'Resto', icon: '🍽️', color: '#F59E0B' },
  resin: { label: 'Résine', icon: '🧪', color: '#8B5CF6' },
  equipement: { label: 'Équipement', icon: '🔧', color: '#0891B2' },
  reparation: { label: 'Réparation', icon: '🛠️', color: '#059669' },
  communication: { label: 'Communication', icon: '📞', color: '#3B82F6' },
  publicite: { label: 'Publicité', icon: '📢', color: '#EC4899' },
};

const PERIODS: { id: string; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'month', label: 'Ce mois' },
  { id: 'year', label: 'Cette année' },
  { id: '30d', label: '30 jours' },
];

function periodToDates(period: string): { start?: string; end?: string } {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: toISO(start), end: toISO(today) };
  }
  if (period === 'year') {
    const start = new Date(today.getFullYear(), 0, 1);
    return { start: toISO(start), end: toISO(today) };
  }
  if (period === '30d') {
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    return { start: toISO(start), end: toISO(today) };
  }
  return {};
}

export default function BilanScreen() {
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<string>('month');

  const load = useCallback(async () => {
    try {
      const { start, end } = periodToDates(period);
      const qs: string[] = [];
      if (start) qs.push(`start_date=${start}`);
      if (end) qs.push(`end_date=${end}`);
      const url = `${API_URL}/api/finance/bilan${qs.length ? '?' + qs.join('&') : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setBilan(data);
    } catch (e) {
      console.error('Load bilan failed', e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <AppHeader title="📊 Bilan" showBack />
        <View style={styles.empty}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      </SafeAreaView>
    );
  }

  const profit = bilan?.net_profit || 0;
  const isProfit = profit >= 0;
  const totalRev = bilan?.total_revenues || 0;
  const totalExp = bilan?.total_expenses || 0;
  const margin = bilan?.margin_pct || 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="📊 Bilan" showBack />

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />}
      >
        {/* Period chips */}
        <View style={styles.periodRow}>
          {PERIODS.map(p => {
            const active = period === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.periodChip, active && styles.periodChipActive]}
                onPress={() => setPeriod(p.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.periodText, active && { color: '#fff' }]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Profit Hero */}
        <View style={[styles.profitCard, { backgroundColor: isProfit ? '#064E3B' : '#7F1D1D' }]}>
          <Text style={styles.profitLabel}>{isProfit ? '✅ PROFIT NET' : '⚠️ PERTE NETTE'}</Text>
          <Text style={[styles.profitAmount, { color: isProfit ? '#34D399' : '#FCA5A5' }]}>
            {isProfit ? '+' : ''}{profit.toFixed(2)} $
          </Text>
          <Text style={styles.profitMargin}>
            Marge: {margin.toFixed(1)}%
          </Text>
        </View>

        {/* Revenue / Expense cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: '#10B981', backgroundColor: '#ECFDF5' }]}>
            <View style={styles.statHeader}>
              <Feather name="trending-up" size={20} color="#10B981" />
              <Text style={styles.statLabel}>REVENUS</Text>
            </View>
            <Text style={[styles.statAmount, { color: '#10B981' }]}>+{totalRev.toFixed(2)} $</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#EF4444', backgroundColor: '#FEF2F2' }]}>
            <View style={styles.statHeader}>
              <Feather name="trending-down" size={20} color="#EF4444" />
              <Text style={styles.statLabel}>DÉPENSES</Text>
            </View>
            <Text style={[styles.statAmount, { color: '#EF4444' }]}>-{totalExp.toFixed(2)} $</Text>
          </View>
        </View>

        {/* Bar comparison */}
        {(totalRev > 0 || totalExp > 0) && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>⚖️ Répartition</Text>
            <View style={{ gap: 10 }}>
              <View>
                <View style={styles.barHeader}>
                  <Text style={styles.barLabel}>💰 Revenus</Text>
                  <Text style={[styles.barAmount, { color: '#10B981' }]}>+{totalRev.toFixed(0)}$</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFillRev, {
                    width: `${totalRev > 0 ? 100 : 0}%`,
                  }]} />
                </View>
              </View>
              <View>
                <View style={styles.barHeader}>
                  <Text style={styles.barLabel}>💳 Dépenses</Text>
                  <Text style={[styles.barAmount, { color: '#EF4444' }]}>-{totalExp.toFixed(0)}$</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFillExp, {
                    width: `${totalRev > 0 ? Math.min(100, (totalExp / totalRev) * 100) : (totalExp > 0 ? 100 : 0)}%`,
                  }]} />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Revenues by category */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>💰 Revenus par catégorie</Text>
          {Object.entries(bilan?.revenues_by_category || {}).filter(([, v]) => v.total > 0).length === 0 ? (
            <Text style={styles.noData}>Aucun revenu sur cette période</Text>
          ) : (
            Object.entries(bilan?.revenues_by_category || {})
              .filter(([, v]) => v.total > 0)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([key, data]) => {
                const meta = REV_LABELS[key] || { label: key, icon: '📝', color: '#64748B' };
                const pct = totalRev > 0 ? (data.total / totalRev) * 100 : 0;
                return (
                  <View key={key} style={styles.rowItem}>
                    <Text style={styles.rowIcon}>{meta.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={styles.rowHeader}>
                        <Text style={styles.rowLabel}>{meta.label}</Text>
                        <Text style={[styles.rowAmount, { color: meta.color }]}>+{data.total.toFixed(2)} $</Text>
                      </View>
                      <View style={styles.miniBar}>
                        <View style={[styles.miniBarFill, { width: `${pct}%`, backgroundColor: meta.color }]} />
                      </View>
                      <Text style={styles.rowSub}>{data.count} entrée{data.count > 1 ? 's' : ''} • {pct.toFixed(0)}%</Text>
                    </View>
                  </View>
                );
              })
          )}
        </View>

        {/* Expenses by category */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>💳 Dépenses par catégorie</Text>
          {Object.entries(bilan?.expenses_by_category || {}).filter(([, v]) => v.total > 0).length === 0 ? (
            <Text style={styles.noData}>Aucune dépense sur cette période</Text>
          ) : (
            Object.entries(bilan?.expenses_by_category || {})
              .filter(([, v]) => v.total > 0)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([key, data]) => {
                const meta = EXP_LABELS[key] || { label: key, icon: '📝', color: '#64748B' };
                const pct = totalExp > 0 ? (data.total / totalExp) * 100 : 0;
                return (
                  <View key={key} style={styles.rowItem}>
                    <Text style={styles.rowIcon}>{meta.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={styles.rowHeader}>
                        <Text style={styles.rowLabel}>{meta.label}</Text>
                        <Text style={[styles.rowAmount, { color: meta.color }]}>-{data.total.toFixed(2)} $</Text>
                      </View>
                      <View style={styles.miniBar}>
                        <View style={[styles.miniBarFill, { width: `${pct}%`, backgroundColor: meta.color }]} />
                      </View>
                      <Text style={styles.rowSub}>{data.count} entrée{data.count > 1 ? 's' : ''} • {pct.toFixed(0)}%</Text>
                    </View>
                  </View>
                );
              })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  periodRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  periodChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  periodChipActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  periodText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  profitCard: { padding: 20, borderRadius: 16, alignItems: 'center' },
  profitLabel: { color: '#A7F3D0', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  profitAmount: { fontSize: 38, fontWeight: '900', marginTop: 6 },
  profitMargin: { color: '#D1FAE5', fontSize: 13, fontWeight: '600', marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, padding: 14, borderRadius: 12, borderLeftWidth: 4 },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statLabel: { fontSize: 11, fontWeight: '800', color: '#374151', letterSpacing: 0.5 },
  statAmount: { fontSize: 20, fontWeight: '800', marginTop: 6 },
  sectionCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 10 },
  noData: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: 14 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },
  barAmount: { fontSize: 14, fontWeight: '800' },
  barTrack: { height: 10, backgroundColor: '#F3F4F6', borderRadius: 6, overflow: 'hidden' },
  barFillRev: { height: '100%', backgroundColor: '#10B981', borderRadius: 6 },
  barFillExp: { height: '100%', backgroundColor: '#EF4444', borderRadius: 6 },
  rowItem: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowIcon: { fontSize: 24, width: 28, textAlign: 'center' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '700', color: '#111' },
  rowAmount: { fontSize: 14, fontWeight: '800' },
  miniBar: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  miniBarFill: { height: '100%', borderRadius: 3 },
  rowSub: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
});
