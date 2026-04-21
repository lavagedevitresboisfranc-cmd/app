import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  ActivityIndicator, RefreshControl, Alert, Modal, KeyboardAvoidingView,
  Platform, ScrollView, Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const CATEGORIES: {
  id: string; label: string; icon: string; color: string; bg: string;
}[] = [
  { id: 'gas',           label: 'Essence',       icon: '⛽', color: '#EF4444', bg: '#FEF2F2' },
  { id: 'resto',         label: 'Resto',         icon: '🍽️', color: '#F59E0B', bg: '#FEF3C7' },
  { id: 'resin',         label: 'Résine',        icon: '🧪', color: '#8B5CF6', bg: '#F3E8FF' },
  { id: 'equipement',    label: 'Équipement',    icon: '🔧', color: '#0891B2', bg: '#ECFEFF' },
  { id: 'reparation',    label: 'Réparation',    icon: '🛠️', color: '#059669', bg: '#ECFDF5' },
  { id: 'communication', label: 'Communication', icon: '📞', color: '#3B82F6', bg: '#DBEAFE' },
  { id: 'publicite',     label: 'Publicité',     icon: '📢', color: '#EC4899', bg: '#FCE7F3' },
];

interface Expense {
  id: string;
  amount: number;
  category: string;
  date: string;
  description: string;
  vendor: string;
  receipt_photo: string | null;
  created_at: string;
  updated_at: string;
}

interface Stats {
  by_category: Record<string, { total: number; count: number }>;
  grand_total: number;
}

export default function ExpensesScreen() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [fAmount, setFAmount] = useState('');
  const [fCategory, setFCategory] = useState<string>('gas');
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fDescription, setFDescription] = useState('');
  const [fVendor, setFVendor] = useState('');
  const [fPhoto, setFPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = filterCategory ? `?category=${filterCategory}` : '';
      const [expRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/expenses${q}`),
        fetch(`${API_URL}/api/expenses/stats`),
      ]);
      const expData = await expRes.json();
      const statsData = await statsRes.json();
      setExpenses(Array.isArray(expData) ? expData : []);
      setStats(statsData);
    } catch (e) {
      console.error('Load expenses failed', e);
    } finally { setLoading(false); }
  }, [filterCategory]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const resetForm = () => {
    setEditing(null);
    setFAmount('');
    setFCategory('gas');
    setFDate(new Date().toISOString().slice(0, 10));
    setFDescription('');
    setFVendor('');
    setFPhoto(null);
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = (exp: Expense) => {
    setEditing(exp);
    setFAmount(String(exp.amount));
    setFCategory(exp.category);
    setFDate(exp.date);
    setFDescription(exp.description || '');
    setFVendor(exp.vendor || '');
    setFPhoto(exp.receipt_photo || null);
    setShowForm(true);
  };

  // TAKE PHOTO
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission refusée', "L'accès à la caméra est requis pour prendre une photo du reçu.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      setFPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      setFPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const save = async () => {
    const amt = parseFloat(fAmount.replace(',', '.'));
    if (!amt || amt <= 0) {
      Alert.alert('Montant invalide', 'Entrez un montant valide');
      return;
    }
    setSaving(true);
    try {
      const body = {
        amount: amt,
        category: fCategory,
        date: fDate,
        description: fDescription,
        vendor: fVendor,
        receipt_photo: fPhoto,
      };
      const url = editing ? `${API_URL}/api/expenses/${editing.id}` : `${API_URL}/api/expenses`;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erreur');
      }
      setShowForm(false);
      resetForm();
      await load();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Sauvegarde impossible');
    } finally { setSaving(false); }
  };

  const confirmDelete = (exp: Expense) => {
    Alert.alert('Supprimer cette dépense ?', `${exp.amount.toFixed(2)} $ — ${exp.description || exp.category}`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            await fetch(`${API_URL}/api/expenses/${exp.id}`, { method: 'DELETE' });
            await load();
          } catch { Alert.alert('Erreur', 'Suppression impossible'); }
        },
      },
    ]);
  };

  const categoryMeta = (id: string) => CATEGORIES.find(c => c.id === id) || CATEGORIES[0];

  const renderExpense = ({ item }: { item: Expense }) => {
    const meta = categoryMeta(item.category);
    const date = new Date(item.date).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
    return (
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: meta.color }]}
        activeOpacity={0.7}
        onPress={() => openEdit(item)}
        onLongPress={() => confirmDelete(item)}
      >
        <View style={styles.cardRow}>
          <View style={[styles.catIcon, { backgroundColor: meta.bg }]}>
            <Text style={{ fontSize: 22 }}>{meta.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.cardCat} numberOfLines={1}>{meta.label}</Text>
              <Text style={[styles.cardAmount, { color: meta.color }]}>{item.amount.toFixed(2)} $</Text>
            </View>
            {item.description ? <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
              <Text style={styles.cardMeta}>{item.vendor ? `🏪 ${item.vendor}` : ''}</Text>
              <Text style={styles.cardDate}>📅 {date}</Text>
            </View>
          </View>
          {item.receipt_photo && (
            <TouchableOpacity onPress={() => setViewPhoto(item.receipt_photo!)} style={styles.thumbWrap}>
              <Image source={{ uri: item.receipt_photo }} style={styles.thumb} resizeMode="cover" />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const totalVisible = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="💰 Dépenses" showBack />

      {/* Grand Total + Add / Export buttons */}
      <View style={styles.header}>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>TOTAL {filterCategory ? `— ${categoryMeta(filterCategory).label}` : ''}</Text>
          <Text style={styles.totalAmount}>{(filterCategory ? totalVisible : (stats?.grand_total || 0)).toFixed(2)} $</Text>
        </View>
        <View style={{ gap: 8, justifyContent: 'space-between' }}>
          <TouchableOpacity style={styles.addBtn} onPress={openNew} activeOpacity={0.85}>
            <Feather name="plus" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Ajouter</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={() => Linking.openURL(`${API_URL}/api/expenses/export/excel${filterCategory ? `?category=${filterCategory}` : ''}`)}
            activeOpacity={0.85}
          >
            <Feather name="download" size={18} color="#059669" />
            <Text style={styles.exportBtnText}>Excel</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ flexGrow: 0 }}>
        <TouchableOpacity
          style={[styles.chip, !filterCategory && styles.chipActive]}
          onPress={() => setFilterCategory(null)}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 16 }}>📋</Text>
          <Text style={[styles.chipText, !filterCategory && { color: '#fff' }]}>Tout</Text>
          {stats && <Text style={[styles.chipCount, !filterCategory && { color: '#fff' }]}>{stats.grand_total.toFixed(0)}$</Text>}
        </TouchableOpacity>
        {CATEGORIES.map(cat => {
          const active = filterCategory === cat.id;
          const catStats = stats?.by_category[cat.id] || { total: 0, count: 0 };
          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.chip, active && { backgroundColor: cat.color, borderColor: cat.color }]}
              onPress={() => setFilterCategory(cat.id)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 16 }}>{cat.icon}</Text>
              <Text style={[styles.chipText, active && { color: '#fff' }]}>{cat.label}</Text>
              <Text style={[styles.chipCount, active && { color: '#fff' }]}>{catStats.total.toFixed(0)}$</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={styles.empty}><ActivityIndicator size="large" color="#0891B2" /></View>
      ) : expenses.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="dollar-sign" size={48} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>Aucune dépense</Text>
          <Text style={styles.emptyText}>Tapez « + Ajouter » pour créer votre première dépense.</Text>
        </View>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(i) => i.id}
          renderItem={renderExpense}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891B2" />}
        />
      )}

      {/* FORM MODAL */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{editing ? '✏️ Modifier' : '➕ Nouvelle dépense'}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}><Feather name="x" size={24} color="#6B7280" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              {/* Amount */}
              <Text style={styles.label}>Montant * ($)</Text>
              <TextInput
                style={[styles.input, { fontSize: 22, fontWeight: '700', color: '#111', textAlign: 'center' }]}
                value={fAmount}
                onChangeText={setFAmount}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor="#9CA3AF"
              />
              {/* Category */}
              <Text style={styles.label}>Catégorie *</Text>
              <View style={styles.catPicker}>
                {CATEGORIES.map(cat => {
                  const active = fCategory === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.catPickerItem, active && { backgroundColor: cat.color, borderColor: cat.color }]}
                      onPress={() => setFCategory(cat.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 22 }}>{cat.icon}</Text>
                      <Text style={[styles.catPickerText, active && { color: '#fff' }]}>{cat.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* Date */}
              <Text style={styles.label}>Date</Text>
              {Platform.OS === 'web' ? (
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore — HTML input works on web
                <input
                  type="date"
                  value={fDate}
                  onChange={(e: any) => setFDate(e.target.value)}
                  style={{
                    height: 48, padding: '0 14px',
                    backgroundColor: '#F9FAFB', borderRadius: 10,
                    border: '1px solid #E5E7EB', fontSize: 15, color: '#111',
                  }}
                />
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    style={[styles.input, { justifyContent: 'center' }]}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 15, color: '#111', fontWeight: '600' }}>
                      📆 {new Date(fDate + 'T00:00:00').toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={new Date(fDate + 'T00:00:00')}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      maximumDate={new Date()}
                      onChange={(e, d) => {
                        setShowDatePicker(false);
                        if (d) {
                          const pad = (n: number) => String(n).padStart(2, '0');
                          setFDate(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);
                        }
                      }}
                    />
                  )}
                </>
              )}
              {/* Vendor */}
              <Text style={styles.label}>Commerce (optionnel)</Text>
              <TextInput
                style={styles.input}
                value={fVendor}
                onChangeText={setFVendor}
                placeholder="ex: Costco, Canadian Tire..."
                placeholderTextColor="#9CA3AF"
              />
              {/* Description */}
              <Text style={styles.label}>Description (optionnel)</Text>
              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: 'top', paddingTop: 10 }]}
                value={fDescription}
                onChangeText={setFDescription}
                placeholder="ex: Plein essence Shell route 132"
                placeholderTextColor="#9CA3AF"
                multiline
              />
              {/* Photo */}
              <Text style={styles.label}>📸 Photo du reçu (optionnel)</Text>
              {fPhoto ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: fPhoto }} style={styles.photoImg} resizeMode="contain" />
                  <TouchableOpacity onPress={() => setFPhoto(null)} style={styles.photoRemove} activeOpacity={0.85}>
                    <Feather name="trash-2" size={16} color="#fff" />
                    <Text style={styles.photoRemoveText}>Retirer</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.photoActions}>
                  <TouchableOpacity style={styles.photoBtn} onPress={takePhoto} activeOpacity={0.7}>
                    <Feather name="camera" size={20} color="#0891B2" />
                    <Text style={styles.photoBtnText}>Prendre photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoBtn} onPress={pickFromGallery} activeOpacity={0.7}>
                    <Feather name="image" size={20} color="#0891B2" />
                    <Text style={styles.photoBtnText}>Galerie</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
            {/* Action Row */}
            <View style={styles.formActions}>
              {editing && (
                <TouchableOpacity onPress={() => { setShowForm(false); confirmDelete(editing); }} style={[styles.formBtn, { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }]}>
                  <Feather name="trash-2" size={18} color="#DC2626" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowForm(false)} style={[styles.formBtn, { backgroundColor: '#F3F4F6', flex: 1 }]}>
                <Text style={styles.formBtnGrayText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} style={[styles.formBtn, { backgroundColor: '#0891B2', flex: 1.5 }]} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <>
                  <Feather name="check" size={18} color="#fff" />
                  <Text style={styles.formBtnText}>{editing ? 'Enregistrer' : 'Ajouter'}</Text>
                </>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* PHOTO VIEWER */}
      <Modal visible={!!viewPhoto} transparent animationType="fade" onRequestClose={() => setViewPhoto(null)}>
        <View style={styles.photoViewer}>
          <TouchableOpacity style={styles.photoCloseBtn} onPress={() => setViewPhoto(null)}>
            <Feather name="x" size={26} color="#fff" />
          </TouchableOpacity>
          {viewPhoto && (
            <Image source={{ uri: viewPhoto }} style={styles.photoViewerImg} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', padding: 16, gap: 12, alignItems: 'stretch' },
  totalBox: { flex: 1, backgroundColor: '#111', padding: 14, borderRadius: 12 },
  totalLabel: { color: '#9CA3AF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  totalAmount: { color: '#10B981', fontSize: 24, fontWeight: '800', marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0891B2', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  exportBtnText: { color: '#059669', fontSize: 13, fontWeight: '700' },
  chipRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  chipCount: { fontSize: 11, color: '#6B7280', fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 4 },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', borderLeftWidth: 4 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catIcon: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardCat: { fontSize: 15, fontWeight: '700', color: '#111' },
  cardAmount: { fontSize: 16, fontWeight: '800' },
  cardDesc: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  cardMeta: { fontSize: 11, color: '#9CA3AF' },
  cardDate: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  thumbWrap: { borderRadius: 8, overflow: 'hidden' },
  thumb: { width: 44, height: 44, borderRadius: 8 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  label: { fontSize: 13, fontWeight: '700', color: '#374151' },
  input: { backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, height: 48, fontSize: 15, color: '#111' },
  catPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, minWidth: '30%' },
  catPickerText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  photoPreview: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  photoImg: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#000' },
  photoRemove: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DC2626', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginTop: 10 },
  photoRemoveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  photoActions: { flexDirection: 'row', gap: 10 },
  photoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ECFEFF', borderWidth: 1, borderColor: '#A7F3D0', paddingVertical: 16, borderRadius: 12 },
  photoBtnText: { fontSize: 14, fontWeight: '700', color: '#0891B2' },
  formActions: { flexDirection: 'row', padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  formBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 10 },
  formBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  formBtnGrayText: { color: '#6B7280', fontSize: 15, fontWeight: '700' },
  // Photo viewer
  photoViewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  photoCloseBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.7)', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  photoViewerImg: { width: '100%', height: '80%' },
});
