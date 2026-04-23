import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type ClientRow = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
};

type AppointmentRow = {
  id: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  address?: string;
  date?: string;
  time?: string;
  notes?: string;
  status?: string;
};

type RequestRow = {
  id: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  address?: string;
  preferred_date?: string;
  notes?: string;
  status?: string;
  request_type?: string;
};

type FilterType = 'all' | 'clients' | 'appointments' | 'requests';

export default function SearchScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, aRes, rRes] = await Promise.all([
        fetch(`${API_URL}/api/clients-db?limit=2000`).catch(() => null),
        fetch(`${API_URL}/api/appointments`).catch(() => null),
        fetch(`${API_URL}/api/requests`).catch(() => null),
      ]);
      if (cRes && cRes.ok) {
        const data = await cRes.json();
        setClients(Array.isArray(data) ? data : data.clients || []);
      }
      if (aRes && aRes.ok) {
        const data = await aRes.json();
        setAppointments(Array.isArray(data) ? data : []);
      }
      if (rRes && rRes.ok) {
        const data = await rRes.json();
        setRequests(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn('Search fetch error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    // autofocus the input
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [fetchAll]);

  const q = query.trim().toLowerCase();

  const matchClient = (c: ClientRow) => {
    if (!q) return false;
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q) ||
      (c.notes || '').toLowerCase().includes(q)
    );
  };

  const matchAppt = (a: AppointmentRow) => {
    if (!q) return false;
    return (
      (a.client_name || '').toLowerCase().includes(q) ||
      (a.client_email || '').toLowerCase().includes(q) ||
      (a.client_phone || '').toLowerCase().includes(q) ||
      (a.address || '').toLowerCase().includes(q) ||
      (a.notes || '').toLowerCase().includes(q) ||
      (a.date || '').toLowerCase().includes(q)
    );
  };

  const matchReq = (r: RequestRow) => {
    if (!q) return false;
    return (
      (r.client_name || '').toLowerCase().includes(q) ||
      (r.client_email || '').toLowerCase().includes(q) ||
      (r.client_phone || '').toLowerCase().includes(q) ||
      (r.address || '').toLowerCase().includes(q) ||
      (r.notes || '').toLowerCase().includes(q)
    );
  };

  const filteredClients = useMemo(
    () => (filter === 'all' || filter === 'clients' ? clients.filter(matchClient).slice(0, 40) : []),
    [clients, q, filter]
  );
  const filteredAppts = useMemo(
    () => (filter === 'all' || filter === 'appointments' ? appointments.filter(matchAppt).slice(0, 40) : []),
    [appointments, q, filter]
  );
  const filteredReqs = useMemo(
    () => (filter === 'all' || filter === 'requests' ? requests.filter(matchReq).slice(0, 40) : []),
    [requests, q, filter]
  );

  const totalResults = filteredClients.length + filteredAppts.length + filteredReqs.length;

  const clearQuery = () => setQuery('');

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
      }
    } catch {}
    return dateStr;
  };

  const statusBadge = (status?: string) => {
    const map: Record<string, { label: string; color: string; bg: string }> = {
      upcoming: { label: 'À venir', color: '#065F46', bg: '#D1FAE5' },
      completed: { label: 'Complété', color: '#1E40AF', bg: '#DBEAFE' },
      archived: { label: 'Archivé', color: '#374151', bg: '#E5E7EB' },
      pending: { label: 'En attente', color: '#92400E', bg: '#FEF3C7' },
      accepted: { label: 'Accepté', color: '#065F46', bg: '#D1FAE5' },
      declined: { label: 'Refusé', color: '#991B1B', bg: '#FEE2E2' },
      alternative_offered: { label: 'Contre-offre', color: '#6B21A8', bg: '#EDE9FE' },
      estimate_sent: { label: 'Estimation envoyée', color: '#1E40AF', bg: '#DBEAFE' },
    };
    const s = map[status || ''];
    if (!s) return null;
    return (
      <View style={[sBadge.wrap, { backgroundColor: s.bg }]}>
        <Text style={[sBadge.txt, { color: s.color }]}>{s.label}</Text>
      </View>
    );
  };

  const filterPills: Array<{ key: FilterType; label: string; icon: any }> = [
    { key: 'all', label: 'Tout', icon: 'grid' },
    { key: 'clients', label: 'Clients', icon: 'users' },
    { key: 'appointments', label: 'RDV', icon: 'calendar' },
    { key: 'requests', label: 'Requêtes', icon: 'inbox' },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
          <TouchableOpacity
            testID="search-back"
            onPress={() => router.back()}
            style={styles.iconBtn}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={[styles.searchBox, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', borderColor: colors.border }]}>
            <Feather name="search" size={18} color={colors.textMuted} />
            <TextInput
              ref={inputRef}
              testID="search-input"
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher un client, un RDV, une adresse…"
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text }]}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={clearQuery} style={styles.clearBtn} activeOpacity={0.7}>
                <Feather name="x" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsScroll}
          contentContainerStyle={styles.pillsContent}
        >
          {filterPills.map((p) => {
            const active = filter === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                testID={`pill-${p.key}`}
                onPress={() => setFilter(p.key)}
                style={[
                  styles.pill,
                  { borderColor: colors.border, backgroundColor: isDark ? '#111827' : '#FFFFFF' },
                  active && { backgroundColor: '#0891B2', borderColor: '#0891B2' },
                ]}
                activeOpacity={0.8}
              >
                <Feather name={p.icon} size={14} color={active ? '#FFFFFF' : colors.textMuted} />
                <Text style={[styles.pillTxt, { color: active ? '#FFFFFF' : colors.text }]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Results */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {loading && (
            <View style={styles.centered}>
              <ActivityIndicator size="small" color="#0891B2" />
              <Text style={[styles.muted, { color: colors.textMuted }]}>Chargement…</Text>
            </View>
          )}

          {!loading && q.length === 0 && (
            <View style={styles.centered}>
              <Feather name="search" size={44} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Recherche globale</Text>
              <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                Tapez un nom, courriel, téléphone, adresse ou mot-clé pour trouver dans vos clients, RDV et requêtes.
              </Text>
              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Feather name="users" size={14} color="#D97706" />
                  <Text style={styles.statTxt}>{clients.length} clients</Text>
                </View>
                <View style={styles.statPill}>
                  <Feather name="calendar" size={14} color="#0891B2" />
                  <Text style={styles.statTxt}>{appointments.length} RDV</Text>
                </View>
                <View style={styles.statPill}>
                  <Feather name="inbox" size={14} color="#7C3AED" />
                  <Text style={styles.statTxt}>{requests.length} requêtes</Text>
                </View>
              </View>
            </View>
          )}

          {!loading && q.length > 0 && totalResults === 0 && (
            <View style={styles.centered}>
              <Feather name="frown" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Aucun résultat</Text>
              <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                Aucun élément ne correspond à « {query} ».
              </Text>
            </View>
          )}

          {!loading && totalResults > 0 && (
            <Text style={[styles.countTxt, { color: colors.textMuted }]}>
              {totalResults} résultat{totalResults > 1 ? 's' : ''}
            </Text>
          )}

          {/* Clients */}
          {filteredClients.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Feather name="users" size={16} color="#D97706" />
                <Text style={[styles.sectionTitle, { color: '#D97706' }]}>
                  Clients ({filteredClients.length})
                </Text>
              </View>
              {filteredClients.map((c) => (
                <TouchableOpacity
                  key={`c-${c.id}`}
                  testID={`result-client-${c.id}`}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/client-db-detail?id=${c.id}` as any)}
                >
                  <View style={[styles.iconBubble, { backgroundColor: '#FEF3C7' }]}>
                    <Feather name="user" size={18} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                      {c.name || 'Sans nom'}
                    </Text>
                    {c.email ? (
                      <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
                        ✉️ {c.email}
                      </Text>
                    ) : null}
                    {c.phone ? (
                      <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
                        📞 {c.phone}
                      </Text>
                    ) : null}
                    {c.address ? (
                      <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
                        📍 {c.address}
                      </Text>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Appointments */}
          {filteredAppts.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Feather name="calendar" size={16} color="#0891B2" />
                <Text style={[styles.sectionTitle, { color: '#0891B2' }]}>
                  Rendez-vous ({filteredAppts.length})
                </Text>
              </View>
              {filteredAppts.map((a) => (
                <TouchableOpacity
                  key={`a-${a.id}`}
                  testID={`result-appt-${a.id}`}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/detail?id=${a.id}` as any)}
                >
                  <View style={[styles.iconBubble, { backgroundColor: '#CFFAFE' }]}>
                    <Feather name="calendar" size={18} color="#0891B2" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                        {a.client_name || 'Sans nom'}
                      </Text>
                      {statusBadge(a.status)}
                    </View>
                    <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
                      📅 {formatDate(a.date)} {a.time ? `• ${a.time}` : ''}
                    </Text>
                    {a.address ? (
                      <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
                        📍 {a.address}
                      </Text>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Requests */}
          {filteredReqs.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Feather name="inbox" size={16} color="#7C3AED" />
                <Text style={[styles.sectionTitle, { color: '#7C3AED' }]}>
                  Requêtes ({filteredReqs.length})
                </Text>
              </View>
              {filteredReqs.map((r) => (
                <TouchableOpacity
                  key={`r-${r.id}`}
                  testID={`result-req-${r.id}`}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/request-detail?id=${r.id}` as any)}
                >
                  <View style={[styles.iconBubble, { backgroundColor: '#EDE9FE' }]}>
                    <Feather
                      name={r.request_type === 'est' ? 'dollar-sign' : 'inbox'}
                      size={18}
                      color="#7C3AED"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                        {r.client_name || 'Sans nom'}
                      </Text>
                      {statusBadge(r.status)}
                    </View>
                    {r.preferred_date ? (
                      <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
                        📅 {formatDate(r.preferred_date)}
                      </Text>
                    ) : null}
                    {r.client_email ? (
                      <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
                        ✉️ {r.client_email}
                      </Text>
                    ) : null}
                    {r.address ? (
                      <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
                        📍 {r.address}
                      </Text>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  iconBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  clearBtn: { padding: 2 },
  pillsScroll: { maxHeight: 54 },
  pillsContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  pillTxt: { fontSize: 13, fontWeight: '700' },
  centered: { alignItems: 'center', padding: 32, gap: 10 },
  muted: { fontSize: 13 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 6 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  statTxt: { fontSize: 12, fontWeight: '700', color: '#374151' },
  countTxt: { paddingHorizontal: 16, paddingTop: 8, fontSize: 12, fontWeight: '600' },
  section: { paddingHorizontal: 12, paddingTop: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  iconBubble: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});

const sBadge = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  txt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
});
