import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CAMPAIGN_TARGET_KEY = '@gexia360:campaign_target_emails';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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

export default function ClientsDbScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);

  // Multi-select mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [campaignMode, setCampaignMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/clients-db?limit=2000`);
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch clients', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchClients(); }, [fetchClients]));
  useEffect(() => { fetchClients(); }, [fetchClients]);

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
    await fetchClients();
    setRefreshing(false);
  };

  // SELECTION MODE
  const enterSelectionMode = () => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  };
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setCampaignMode(false);
  };
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map(c => c.id)));
  };
  const deselectAll = () => setSelectedIds(new Set());

  // Enter "Campaign" mode: selection mode + pre-select everyone with a valid email
  const enterCampaignMode = () => {
    const eligible = filtered.filter(c => !!c.email && c.email.includes('@'));
    if (eligible.length === 0) {
      Alert.alert(
        'Aucun courriel valide',
        "Aucun client dans la liste n'a d'adresse courriel valide. Ajoutez des courriels avant d'envoyer une campagne."
      );
      return;
    }
    setSelectionMode(true);
    setCampaignMode(true);
    setSelectedIds(new Set(eligible.map(c => c.id)));
  };

  const launchCampaignWithSelection = async () => {
    const selectedClients = clients.filter(c => selectedIds.has(c.id));
    const emails = selectedClients.map(c => c.email).filter(e => !!e && e.includes('@'));
    if (emails.length === 0) {
      Alert.alert('Aucun courriel', "Les clients sélectionnés n'ont pas d'adresse courriel valide.");
      return;
    }
    try {
      // Store the full list in AsyncStorage to bypass URL length limits (iOS Safari truncates at ~2000 chars)
      await AsyncStorage.setItem(CAMPAIGN_TARGET_KEY, JSON.stringify(emails));
    } catch (e) {
      console.error('Failed to store campaign targets', e);
    }
    // Pass only the count via params; the campaigns screen reads the full list from AsyncStorage
    router.push({
      pathname: '/campaigns',
      params: { targetFromStorage: '1', targetCount: String(emails.length) },
    } as any);
    exitSelectionMode();
  };

  const archiveSelected = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      '🗑️ Archiver les clients',
      `Voulez-vous archiver ${selectedIds.size} client${selectedIds.size > 1 ? 's' : ''} ?\n\nLes clients archivés seront déplacés vers la corbeille et pourront être restaurés ou supprimés définitivement.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Archiver',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/api/clients-db/archive-bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds) }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.detail || 'Erreur');
              Alert.alert('✅ Archivé', `${data.archived} client${data.archived > 1 ? 's' : ''} déplacé${data.archived > 1 ? 's' : ''} vers la corbeille.`);
              exitSelectionMode();
              await fetchClients();
            } catch (e: any) {
              Alert.alert('Erreur', e?.message || 'Archivage impossible');
            }
          },
        },
      ]
    );
  };

  // IMPORT CSV / XLSX
  const importFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/*', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setImporting(true);

      const formData = new FormData();
      // In React Native, we pass the file as { uri, name, type }
      formData.append('file', {
        uri: asset.uri,
        name: asset.name || 'upload.csv',
        type: asset.mimeType || 'text/csv',
      } as any);

      const res = await fetch(`${API_URL}/api/clients-db/import`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Erreur import');
      }

      Alert.alert(
        '✅ Import terminé',
        `${data.created} clients créés\n${data.updated} mis à jour\n${data.skipped_duplicates} doublons ignorés\n${data.errors_count} erreurs`,
      );
      await fetchClients();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || "Impossible d'importer le fichier");
    } finally {
      setImporting(false);
    }
  };

  // EXPORT CSV
  const exportCsv = async () => {
    try {
      const url = `${API_URL}/api/clients-db/export/csv`;
      const path = FileSystem.cacheDirectory + `clients_crystaltask_${Date.now()}.csv`;
      const dl = await FileSystem.downloadAsync(url, path);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dl.uri, { mimeType: 'text/csv', dialogTitle: 'Exporter la liste de clients' });
      } else {
        Alert.alert('Fichier téléchargé', `Enregistré à: ${dl.uri}`);
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Export impossible');
    }
  };

  // CREATE
  const createClient = async () => {
    if (!newName.trim()) {
      Alert.alert('Erreur', 'Le nom est requis');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/clients-db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim(),
          phone: newPhone.trim(),
          address: newAddress.trim(),
          notes: newNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erreur');
      // reset
      setNewName(''); setNewEmail(''); setNewPhone(''); setNewAddress(''); setNewNotes('');
      setShowCreate(false);
      await fetchClients();
      Alert.alert('✅ Client créé', data.name);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Création impossible');
    } finally {
      setCreating(false);
    }
  };

  const renderClient = ({ item }: { item: Client }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.card, selectionMode && isSelected && styles.cardSelected]}
        activeOpacity={0.7}
        onPress={() => {
          if (selectionMode) {
            toggleSelect(item.id);
          } else {
            router.push({ pathname: '/client-db-detail', params: { id: item.id } } as any);
          }
        }}
        onLongPress={() => {
          if (!selectionMode) {
            enterSelectionMode();
            toggleSelect(item.id);
          }
        }}
      >
        {selectionMode ? (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Feather name="check" size={16} color="#fff" />}
          </View>
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(item.name || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name || '(sans nom)'}</Text>
          {item.email ? <Text style={styles.meta} numberOfLines={1}>✉️ {item.email}</Text> : null}
          {item.phone ? <Text style={styles.meta} numberOfLines={1}>📞 {item.phone}</Text> : null}
          {item.tags?.length > 0 && (
            <View style={styles.tagRow}>
              {item.tags.slice(0, 3).map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {!selectionMode && <Feather name="chevron-right" size={20} color="#C4C4C4" />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="Base Clients" showBack />

      {/* Compact stat pill */}
      <View style={styles.statPillRow}>
        <View style={styles.statPill}>
          <Text style={styles.statPillNum}>{selectionMode ? selectedIds.size : clients.length}</Text>
          <Text style={styles.statPillLabel}>
            {selectionMode ? (selectedIds.size > 1 ? 'sélectionnés' : 'sélectionné') : 'clients'}
          </Text>
        </View>
      </View>

      {/* Primary actions (equal width) */}
      <View style={styles.primaryRow}>
        {selectionMode ? (
          <>
            <TouchableOpacity
              onPress={selectedIds.size === filtered.length ? deselectAll : selectAllFiltered}
              style={[styles.primaryBtn, { backgroundColor: '#0891B2' }]}
              activeOpacity={0.8}
            >
              <Feather name={selectedIds.size === filtered.length ? 'square' : 'check-square'} size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {selectedIds.size === filtered.length ? 'Aucun' : 'Tout'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={exitSelectionMode} style={[styles.primaryBtn, { backgroundColor: '#6B7280' }]} activeOpacity={0.8}>
              <Feather name="x" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Annuler</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={enterCampaignMode} style={[styles.primaryBtn, { backgroundColor: '#7C3AED' }]} activeOpacity={0.8}>
              <Feather name="send" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Campagne</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={enterSelectionMode} style={[styles.primaryBtn, { backgroundColor: '#0891B2' }]} activeOpacity={0.8}>
              <Feather name="check-square" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Sélection</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCreate(true)} style={[styles.primaryBtn, { backgroundColor: '#111' }]} activeOpacity={0.8}>
              <Feather name="user-plus" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Nouveau</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Secondary tools (icon-only on small screens) */}
      <View style={styles.toolRow}>
        <TouchableOpacity onPress={importFile} style={styles.toolBtn} activeOpacity={0.8} disabled={importing}>
          {importing ? <ActivityIndicator size="small" color="#0891B2" /> : <Feather name="upload" size={16} color="#0891B2" />}
          <Text style={styles.toolBtnText} numberOfLines={1}>{importing ? 'Import…' : 'Import'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={exportCsv} style={styles.toolBtn} activeOpacity={0.8}>
          <Feather name="download" size={16} color="#0891B2" />
          <Text style={styles.toolBtnText} numberOfLines={1}>Export</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/clients-archive' as any)}
          style={[styles.toolBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
          activeOpacity={0.8}
        >
          <Feather name="archive" size={16} color="#DC2626" />
          <Text style={[styles.toolBtnText, { color: '#DC2626' }]} numberOfLines={1}>Corbeille</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Feather name="search" size={18} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher nom, courriel, téléphone..."
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

      {/* Campaign mode banner */}
      {campaignMode && (
        <View style={styles.campaignBanner}>
          <Feather name="send" size={16} color="#7C3AED" />
          <Text style={styles.campaignBannerText}>
            Mode Campagne — {selectedIds.size} client{selectedIds.size > 1 ? 's' : ''} avec courriel sélectionné{selectedIds.size > 1 ? 's' : ''}.
            Décochez ceux à exclure, puis tapez « Campagne ».
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator size="large" color="#0891B2" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="users" size={48} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>
            {search ? 'Aucun résultat' : 'Aucun client'}
          </Text>
          <Text style={styles.emptyText}>
            {search
              ? 'Essayez un autre terme de recherche'
              : 'Importez votre liste Excel ou ajoutez un client'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderClient}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891B2" />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}

      {/* Bottom action bar — only in selection mode */}
      {selectionMode && selectedIds.size > 0 && (
        <View style={styles.bottomBar}>
          <Text style={styles.bottomBarText}>
            {selectedIds.size} client{selectedIds.size > 1 ? 's' : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={archiveSelected}
              style={[styles.bottomBarBtn, { backgroundColor: '#DC2626' }]}
              activeOpacity={0.85}
            >
              <Feather name="trash-2" size={16} color="#fff" />
              <Text style={styles.bottomBarBtnText}>Archiver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={launchCampaignWithSelection}
              style={styles.bottomBarBtn}
              activeOpacity={0.85}
            >
              <Feather name="mail" size={16} color="#fff" />
              <Text style={styles.bottomBarBtnText}>Campagne</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouveau client</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Feather name="x" size={22} color="#111" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Nom *</Text>
            <TextInput style={styles.input} placeholder="ex. Jean Tremblay" value={newName} onChangeText={setNewName} />

            <Text style={styles.label}>Courriel</Text>
            <TextInput style={styles.input} placeholder="jean@exemple.com" value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" />

            <Text style={styles.label}>Téléphone</Text>
            <TextInput style={styles.input} placeholder="514-555-1234" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />

            <Text style={styles.label}>Adresse</Text>
            <TextInput style={styles.input} placeholder="123 Rue Principale" value={newAddress} onChangeText={setNewAddress} />

            <Text style={styles.label}>Notes</Text>
            <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="Notes..." value={newNotes} onChangeText={setNewNotes} multiline />

            <TouchableOpacity onPress={createClient} style={styles.saveBtn} activeOpacity={0.8} disabled={creating}>
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Créer</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12 },
  statBox: { flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  statNum: { fontSize: 28, fontWeight: '800', color: '#0891B2' },
  statLabel: { fontSize: 12, color: '#6B7280', textTransform: 'uppercase', fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  // New compact layout
  statPillRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  statPill: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  statPillNum: { fontSize: 26, fontWeight: '800', color: '#0891B2' },
  statPillLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600', textTransform: 'lowercase' },
  primaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  actionBtns: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  toolRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  toolBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  toolBtnText: { color: '#0891B2', fontWeight: '700', fontSize: 13 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', marginHorizontal: 16, paddingHorizontal: 12, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
  campaignBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE',
    marginHorizontal: 16, marginBottom: 10, padding: 10, borderRadius: 10,
  },
  campaignBannerText: { flex: 1, fontSize: 12, color: '#5B21B6', fontWeight: '600', lineHeight: 16 },
  searchInput: { flex: 1, fontSize: 15, color: '#111' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', gap: 12 },
  cardSelected: { backgroundColor: '#ECFEFF', borderColor: '#0891B2', borderWidth: 2 },
  checkbox: {
    width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: '#CBD5E1',
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff',
  },
  checkboxSelected: { backgroundColor: '#0891B2', borderColor: '#0891B2' },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, paddingBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 10,
  },
  bottomBarText: { fontSize: 15, fontWeight: '700', color: '#111' },
  bottomBarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0891B2', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10,
  },
  bottomBarBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0891B2', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '700', color: '#111' },
  meta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tag: { backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 10, color: '#1E40AF', fontWeight: '700', textTransform: 'uppercase' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  label: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 10 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111', backgroundColor: '#FAFAFA' },
  saveBtn: { backgroundColor: '#111', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
