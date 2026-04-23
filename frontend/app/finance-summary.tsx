import React, { useCallback, useState, useMemo } from 'react';
import {
  SafeAreaView, View, Text, StyleSheet, ScrollView,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type Entry = { id: string; amount: number; date: string; category?: string };
type Period = { revenues: number; expenses: number; net: number; revCount: number; expCount: number };

export default function FinanceSummaryScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revenues, setRevenues] = useState<Entry[]>([]);
  const [expenses, setExpenses] = useState<Entry[]>([]);

  const load = useCallback(async () => {
    try {
      const [r, e] = await Promise.all([
        fetch(`${API_URL}/api/revenues`),
        fetch(`${API_URL}/api/expenses`),
      ]);
      const rData = await r.json();
      const eData = await e.json();
      setRevenues(Array.isArray(rData) ? rData : []);
      setExpenses(Array.isArray(eData) ? eData : []);
    } catch (err) {
      console.error('Load finance-summary', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const { week, month, year, allTime } = useMemo(() => {
    const now = new Date();
    const d = new Date(now);
    const dow = d.getDay();
    d.setDate(d.getDate() - ((dow + 6) % 7));
    d.setHours(0, 0, 0, 0);
    const weekStart = d;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const blank = (): Period => ({ revenues: 0, expenses: 0, net: 0, revCount: 0, expCount: 0 });
    const wk = blank(), mo = blank(), yr = blank(), all = blank();

    const process = (items: Entry[], key: 'revenues' | 'expenses') => {
      const countKey = key === 'revenues' ? 'revCount' : 'expCount';
      for (const it of items) {
        if (!it.date) continue;
        const dt = new Date(it.date + 'T00:00:00');
        if (isNaN(dt.getTime())) continue;
        all[key] += it.amount; (all as any)[countKey]++;
        if (dt >= yearStart) { yr[key] += it.amount; (yr as any)[countKey]++; }
        if (dt >= monthStart) { mo[key] += it.amount; (mo as any)[countKey]++; }
        if (dt >= weekStart) { wk[key] += it.amount; (wk as any)[countKey]++; }
      }
    };
    process(revenues, 'revenues');
    process(expenses, 'expenses');

    [wk, mo, yr, all].forEach((p) => { p.net = p.revenues - p.expenses; });
    return { week: wk, month: mo, year: yr, allTime: all };
  }, [revenues, expenses]);

  const renderPeriodCard = (
    label: string,
    emoji: string,
    p: Period,
    accent: string,
  ) => (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{emoji}  {label}</Text>
        <Text style={[styles.netAmount, { color: p.net >= 0 ? '#059669' : '#DC2626' }]}>
          {p.net >= 0 ? '+' : ''}{p.net.toFixed(2)} $
        </Text>
      </View>
      <View style={styles.row}>
        <View style={[styles.pill, { backgroundColor: '#DCFCE7' }]}>
          <Feather name="arrow-up-right" size={13} color="#059669" />
          <View>
            <Text style={styles.pillLabel}>Revenus</Text>
            <Text style={[styles.pillAmount, { color: '#047857' }]}>
              +{p.revenues.toFixed(2)} $
            </Text>
            <Text style={styles.pillCount}>{p.revCount} entrée{p.revCount > 1 ? 's' : ''}</Text>
          </View>
        </View>
        <View style={[styles.pill, { backgroundColor: '#FEE2E2' }]}>
          <Feather name="arrow-down-right" size={13} color="#DC2626" />
          <View>
            <Text style={styles.pillLabel}>Dépenses</Text>
            <Text style={[styles.pillAmount, { color: '#B91C1C' }]}>
              -{p.expenses.toFixed(2)} $
            </Text>
            <Text style={styles.pillCount}>{p.expCount} entrée{p.expCount > 1 ? 's' : ''}</Text>
          </View>
        </View>
      </View>
      {/* Mini bar to visualize ratio */}
      {(p.revenues + p.expenses) > 0 ? (
        <View style={styles.barOuter}>
          <View
            style={[
              styles.barRev,
              {
                flex: p.revenues || 0.001,
                backgroundColor: '#10B981',
              },
            ]}
          />
          <View
            style={[
              styles.barExp,
              {
                flex: p.expenses || 0.001,
                backgroundColor: '#EF4444',
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="📊 Sommaire Finance" showBack />
      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color="#0891B2" /></View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891B2" />
          }
        >
          {/* Hero: Net total all-time */}
          <View
            style={[
              styles.hero,
              { backgroundColor: allTime.net >= 0 ? '#064E3B' : '#7F1D1D' },
            ]}
          >
            <Text style={styles.heroLabel}>BILAN NET GLOBAL</Text>
            <Text style={styles.heroAmount}>
              {allTime.net >= 0 ? '+' : ''}{allTime.net.toFixed(2)} $
            </Text>
            <View style={styles.heroMini}>
              <Text style={styles.heroMiniText}>
                💰 {allTime.revenues.toFixed(2)} $ revenus
              </Text>
              <Text style={styles.heroMiniText}>
                💸 {allTime.expenses.toFixed(2)} $ dépenses
              </Text>
            </View>
          </View>

          <Text style={styles.sectionHead}>📅 Par période</Text>

          {renderPeriodCard('Cette semaine', '🗓️', week, '#0891B2')}
          {renderPeriodCard('Ce mois-ci', '📅', month, '#059669')}
          {renderPeriodCard('Cette année', '📆', year, '#D97706')}

          {allTime.revCount === 0 && allTime.expCount === 0 && (
            <View style={styles.empty}>
              <Feather name="inbox" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>Aucune donnée</Text>
              <Text style={styles.emptyDesc}>
                Ajoutez des revenus et des dépenses pour voir votre sommaire financier.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  heroAmount: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', marginTop: 4 },
  heroMini: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  heroMiniText: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '600' },
  sectionHead: { fontSize: 13, fontWeight: '800', color: '#374151', marginBottom: 10, marginLeft: 4, letterSpacing: 0.3, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  netAmount: { fontSize: 16, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10 },
  pillLabel: { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 0.3, textTransform: 'uppercase' },
  pillAmount: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  pillCount: { fontSize: 10, color: '#6B7280', marginTop: 1 },
  barOuter: { flexDirection: 'row', height: 6, marginTop: 10, borderRadius: 3, overflow: 'hidden', backgroundColor: '#F3F4F6' },
  barRev: { height: '100%' },
  barExp: { height: '100%' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#6B7280', marginTop: 10 },
  emptyDesc: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },
});
