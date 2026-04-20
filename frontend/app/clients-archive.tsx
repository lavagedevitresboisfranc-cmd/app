import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  ActivityIndicator, RefreshControl, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export default function ClientsArchiveScreen() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  const fetchArchived = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/clients-db?archived=true&limit=2000`);
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch archived', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchArchived(); }, [fetchArchived]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q),
    );
  }, [clients, search]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchArchived();
    setSelectedIds(new Set());
    setRefreshing(false);
  };

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = () => setSelectedIds(new Set(filtered.map(c => c.id)));
  const deselectAll = () => setSelectedIds(new Set());

  // RESTORE
  const restoreSelected = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      '♻️ Restaurer les clients',
      `Restaurer ${selectedIds.size} client${selectedIds.size > 1 ? 's' : ''} vers la base active ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Restaurer',
          onPress: async () => {
            setProcessing(true);
            try {
              const res = await fetch(`${API_URL}/api/clients-db/restore-bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds) }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.detail || 'Erreur');
              Alert.alert('✅ Restauré', `${data.restored} client${data.restored > 1 ? 's' : ''} restauré${data.restored > 1 ? 's' : ''} dans la base active.`);
              setSelectedIds(new Set());
              await fetchArchived();
            } catch (e: any) {
              Alert.alert('Erreur', e?.message || 'Restauration impossible');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  // PERMANENT DELETE
  const deletePermanent = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      '⚠️ Suppression définitive',
      `Supprimer DÉFINITIVEMENT ${selectedIds.size} client${selectedIds.size > 1 ? 's' : ''} ?\n\nCette action est IRRÉVERSIBLE. Les clients ne pourront plus être récupérés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              const res = await fetch(`${API_URL}/api/clients-db/delete-permanent-bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds) }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.detail || 'Erreur');
              Alert.alert('🗑️ Supprimé', `${data.deleted} client${data.deleted > 1 ? 's' : ''} supprimé${data.deleted > 1 ? 's' : ''} définitivement.`);
              setSelectedIds(new Set());
              await fetchArchived();
            } catch (e: any) {
              Alert.alert('Erreur', e?.message || 'Suppression impossible');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const renderClient = ({ item }: { item: Client }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.card, isSelected && styles.cardSelected]}
        activeOpacity={0.7}
        onPress={() => toggleSelect(item.id)}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Feather name="check" size={16} color="#fff" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name || '(sans nom)'}</Text>
          {item.email ? <Text style={styles.meta} numberOfLines={1}>✉️ {item.email}</Text> : null}
          {item.phone ? <Text style={styles.meta} numberOfLines={1}>📞 {item.phone}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="🗑️ Corbeille Clients" showBack />

      {/* Header */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{clients.length}</Text>
          <Text style={styles.statLabel}>Archivés</Text>
        </View>
        <View style={styles.actionBtns}>
          <TouchableOpacity
            onPress={allSelected ? deselectAll : selectAll}
            style={[styles.actionBtn, { backgroundColor: '#0891B2' }]}
            activeOpacity={0.8}
            disabled={filtered.length === 0}
          >
            <Feather name={allSelected ? 'square' : 'check-square'} size={18} color="#fff" />
            <Text style={styles.actionBtnText}>{allSelected ? 'Aucun' : 'Tout'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Feather name="search" size={18} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher nom, courriel..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Feather name="x" size={18} color="#6B7280" />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator size="large" color="#0891B2" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="archive" size={48} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>
            {search ? 'Aucun résultat' : 'Corbeille vide'}
          </Text>
          <Text style={styles.emptyText}>
            {search
              ? 'Essayez un autre terme'
              : 'Les clients archivés apparaîtront ici. Vous pourrez les restaurer ou les supprimer définitivement.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderClient}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: selectedIds.size > 0 ? 100 : 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891B2" />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}

      {/* Bottom action bar */}
      {selectedIds.size > 0 && (
        <View style={styles.bottomBar}>
          <Text style={styles.bottomBarText}>
            {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={restoreSelected}
              style={[styles.bottomBarBtn, { backgroundColor: '#10B981' }]}
              activeOpacity={0.85}
              disabled={processing}
            >
              <Feather name="rotate-ccw" size={16} color="#fff" />
              <Text style={styles.bottomBarBtnText}>Restaurer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={deletePermanent}
              style={[styles.bottomBarBtn, { backgroundColor: '#DC2626' }]}
              activeOpacity={0.85}
              disabled={processing}
            >
              <Feather name="trash-2" size={16} color="#fff" />
              <Text style={styles.bottomBarBtnText}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12 },
  statBox: { flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  statNum: { fontSize: 28, fontWeight: '800', color: '#DC2626' },
  statLabel: { fontSize: 12, color: '#6B7280', textTransform: 'uppercase', fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  actionBtns: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', marginHorizontal: 16, paddingHorizontal: 12, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12, marginTop: 4 },
  searchInput: { flex: 1, fontSize: 15, color: '#111' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', gap: 12, opacity: 0.9 },
  cardSelected: { backgroundColor: '#FEF2F2', borderColor: '#DC2626', borderWidth: 2, opacity: 1 },
  checkbox: {
    width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: '#CBD5E1',
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff',
  },
  checkboxSelected: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  name: { fontSize: 16, fontWeight: '700', color: '#111' },
  meta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 4, lineHeight: 20 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, paddingBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 10,
  },
  bottomBarText: { fontSize: 15, fontWeight: '700', color: '#111' },
  bottomBarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10,
  },
  bottomBarBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
