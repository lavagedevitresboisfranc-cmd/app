import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  ActivityIndicator, RefreshControl, Alert, Modal, KeyboardAvoidingView,
  Platform, ScrollView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const CATEGORIES: { id: string; label: string; icon: string; color: string; bg: string }[] = [
  { id: 'residentiel', label: 'Résidentiel', icon: '🏠', color: '#10B981', bg: '#ECFDF5' },
  { id: 'commercial',  label: 'Commercial',  icon: '🏢', color: '#0891B2', bg: '#ECFEFF' },
  { id: 'industriel',  label: 'Industriel',  icon: '🏭', color: '#7C3AED', bg: '#F3E8FF' },
  { id: 'saisonnier',  label: 'Saisonnier',  icon: '🍂', color: '#F59E0B', bg: '#FEF3C7' },
  { id: 'pourboire',   label: 'Pourboire',   icon: '💵', color: '#EC4899', bg: '#FCE7F3' },
  { id: 'autre',       label: 'Autre',       icon: '📝', color: '#64748B', bg: '#F1F5F9' },
];

const PAYMENTS: { id: string; label: string; icon: string }[] = [
  { id: 'cash',    label: 'Comptant', icon: '💵' },
  { id: 'cheque',  label: 'Chèque',   icon: '📝' },
  { id: 'interac', label: 'Interac',  icon: '📱' },
  { id: 'carte',   label: 'Carte',    icon: '💳' },
  { id: 'autre',   label: 'Autre',    icon: '🔹' },
];

interface Revenue {
  id: string;
  amount: number;
  category: string;
  date: string;
  description: string;
  client_name: string;
  payment_method: string;
  appointment_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Stats {
  by_category: Record<string, { total: number; count: number }>;
  by_payment: Record<string, { total: number; count: number }>;
  grand_total: number;
}

export default function RevenuesScreen() {
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Revenue | null>(null);
  const [fAmount, setFAmount] = useState('');
  const [fCategory, setFCategory] = useState<string>('residentiel');
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fDescription, setFDescription] = useState('');
  const [fClient, setFClient] = useState('');
  const [fPayment, setFPayment] = useState<string>('cash');
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = filterCategory ? `?category=${filterCategory}` : '';
      const [rRes, sRes] = await Promise.all([
        fetch(`${API_URL}/api/revenues${q}`),
        fetch(`${API_URL}/api/revenues/stats`),
      ]);
      const rData = await rRes.json();
      const sData = await sRes.json();
      setRevenues(Array.isArray(rData) ? rData : []);
      setStats(sData);
    } catch (e) {
      console.error('Load revenues failed', e);
    } finally { setLoading(false); }
  }, [filterCategory]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const resetForm = () => {
    setEditing(null);
    setFAmount('');
    setFCategory('residentiel');
    setFDate(new Date().toISOString().slice(0, 10));
    setFDescription('');
    setFClient('');
    setFPayment('cash');
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = (r: Revenue) => {
    setEditing(r);
    setFAmount(String(r.amount));
    setFCategory(r.category);
    setFDate(r.date);
    setFDescription(r.description || '');
    setFClient(r.client_name || '');
    setFPayment(r.payment_method || 'cash');
    setShowForm(true);
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
        client_name: fClient,
        payment_method: fPayment,
      };
      const url = editing ? `${API_URL}/api/revenues/${editing.id}` : `${API_URL}/api/revenues`;
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

  const confirmDelete = (r: Revenue) => {
    Alert.alert('Supprimer ce revenu ?', `${r.amount.toFixed(2)} $ — ${r.client_name || r.category}`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            await fetch(`${API_URL}/api/revenues/${r.id}`, { method: 'DELETE' });
            await load();
          } catch { Alert.alert('Erreur', 'Suppression impossible'); }
        },
      },
    ]);
  };

  const catMeta = (id: string) => CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
  const pmMeta = (id: string) => PAYMENTS.find(p => p.id === id) || PAYMENTS[0];

  const renderRevenue = ({ item }: { item: Revenue }) => {
    const meta = catMeta(item.category);
    const pm = pmMeta(item.payment_method);
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
              <Text style={styles.cardCat} numberOfLines={1}>{item.client_name || meta.label}</Text>
              <Text style={[styles.cardAmount, { color: meta.color }]}>+{item.amount.toFixed(2)} $</Text>
            </View>
            {item.description ? <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
              <Text style={styles.cardMeta}>{pm.icon} {pm.label}</Text>
              <Text style={styles.cardDate}>📅 {date}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const totalVisible = useMemo(() => revenues.reduce((s, r) => s + r.amount, 0), [revenues]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="💰 Revenus" showBack />

      {/* Grand Total + Buttons */}
      <View style={styles.header}>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>TOTAL {filterCategory ? `— ${catMeta(filterCategory).label}` : ''}</Text>
          <Text style={styles.totalAmount}>+{(filterCategory ? totalVisible : (stats?.grand_total || 0)).toFixed(2)} $</Text>
        </View>
        <View style={{ gap: 8, justifyContent: 'space-between' }}>
          <TouchableOpacity style={styles.addBtn} onPress={openNew} activeOpacity={0.85}>
            <Feather name="plus" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Ajouter</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={() => Linking.openURL(`${API_URL}/api/revenues/export/excel${filterCategory ? `?category=${filterCategory}` : ''}`)}
            activeOpacity={0.85}
          >
            <Feather name="download" size={18} color="#059669" />
            <Text style={styles.exportBtnText}>Excel</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category filter - Hamburger */}
      <TouchableOpacity style={styles.hamburgerBtn} onPress={() => setShowCategoryMenu(true)} activeOpacity={0.7}>
        <View style={styles.hamburgerLeft}>
          <Feather name="menu" size={22} color="#111" />
          <View style={styles.hamburgerCurrent}>
            {filterCategory ? (
              <>
                <Text style={{ fontSize: 20 }}>{catMeta(filterCategory).icon}</Text>
                <Text style={styles.hamburgerLabel}>{catMeta(filterCategory).label}</Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 20 }}>📋</Text>
                <Text style={styles.hamburgerLabel}>Toutes les catégories</Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.hamburgerRight}>
          <Text style={styles.hamburgerAmount}>
            +{(filterCategory
              ? (stats?.by_category[filterCategory]?.total || 0)
              : (stats?.grand_total || 0)
            ).toFixed(0)}$
          </Text>
          <Feather name="chevron-down" size={20} color="#6B7280" />
        </View>
      </TouchableOpacity>

      {/* Category modal */}
      <Modal visible={showCategoryMenu} animationType="slide" transparent onRequestClose={() => setShowCategoryMenu(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCategoryMenu(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.menuCard} onPress={() => {}}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>📂 Filtrer par catégorie</Text>
              <TouchableOpacity onPress={() => setShowCategoryMenu(false)}>
                <Feather name="x" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 12, gap: 6 }}>
              <TouchableOpacity
                style={[styles.menuItem, !filterCategory && styles.menuItemActive]}
                onPress={() => { setFilterCategory(null); setShowCategoryMenu(false); }}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconBox, { backgroundColor: '#F3F4F6' }]}>
                  <Text style={{ fontSize: 22 }}>📋</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemLabel}>Toutes les catégories</Text>
                  <Text style={styles.menuItemSub}>
                    {revenues.length} revenu{revenues.length > 1 ? 's' : ''} visibles
                  </Text>
                </View>
                <Text style={styles.menuItemAmount}>+{(stats?.grand_total || 0).toFixed(0)}$</Text>
                {!filterCategory && <Feather name="check-circle" size={20} color="#10B981" style={{ marginLeft: 8 }} />}
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              {CATEGORIES.map(cat => {
                const active = filterCategory === cat.id;
                const catStats = stats?.by_category[cat.id] || { total: 0, count: 0 };
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.menuItem, active && { backgroundColor: cat.bg, borderColor: cat.color }]}
                    onPress={() => { setFilterCategory(cat.id); setShowCategoryMenu(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.menuIconBox, { backgroundColor: cat.bg }]}>
                      <Text style={{ fontSize: 22 }}>{cat.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.menuItemLabel, active && { color: cat.color }]}>{cat.label}</Text>
                      <Text style={styles.menuItemSub}>
                        {catStats.count} revenu{catStats.count > 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Text style={[styles.menuItemAmount, active && { color: cat.color }]}>
                      +{catStats.total.toFixed(0)}$
                    </Text>
                    {active && <Feather name="check-circle" size={20} color={cat.color} style={{ marginLeft: 8 }} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* List */}
      {loading ? (
        <View style={styles.empty}><ActivityIndicator size="large" color="#10B981" /></View>
      ) : revenues.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="dollar-sign" size={48} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>Aucun revenu</Text>
          <Text style={styles.emptyText}>Tapez « + Ajouter » pour enregistrer votre premier encaissement.</Text>
        </View>
      ) : (
        <FlatList
          data={revenues}
          keyExtractor={(i) => i.id}
          renderItem={renderRevenue}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />}
        />
      )}

      {/* FORM MODAL */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{editing ? '✏️ Modifier revenu' : '💰 Nouveau revenu'}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}><Feather name="x" size={24} color="#6B7280" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <Text style={styles.label}>Montant * ($)</Text>
              <TextInput
                style={[styles.input, { fontSize: 22, fontWeight: '700', color: '#10B981', textAlign: 'center' }]}
                value={fAmount}
                onChangeText={setFAmount}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor="#9CA3AF"
              />
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
              <Text style={styles.label}>Date</Text>
              {Platform.OS === 'web' ? (
                // @ts-ignore — HTML input on web
                <input
                  type="date"
                  value={fDate}
                  onChange={(e: any) => setFDate(e.target.value)}
                  style={{ height: 48, padding: '0 14px', backgroundColor: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 15, color: '#111' }}
                />
              ) : (
                <>
                  <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[styles.input, { justifyContent: 'center' }]} activeOpacity={0.7}>
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
              <Text style={styles.label}>Client (optionnel)</Text>
              <TextInput style={styles.input} value={fClient} onChangeText={setFClient} placeholder="ex: Sophie Dubois" placeholderTextColor="#9CA3AF" />

              <Text style={styles.label}>💳 Mode de paiement</Text>
              <View style={styles.catPicker}>
                {PAYMENTS.map(pm => {
                  const active = fPayment === pm.id;
                  return (
                    <TouchableOpacity
                      key={pm.id}
                      style={[styles.catPickerItem, active && { backgroundColor: '#10B981', borderColor: '#10B981' }]}
                      onPress={() => setFPayment(pm.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 20 }}>{pm.icon}</Text>
                      <Text style={[styles.catPickerText, active && { color: '#fff' }]}>{pm.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Description (optionnel)</Text>
              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: 'top', paddingTop: 10 }]}
                value={fDescription}
                onChangeText={setFDescription}
                placeholder="ex: Lavage printanier façade complète"
                placeholderTextColor="#9CA3AF"
                multiline
              />
            </ScrollView>
            <View style={styles.formActions}>
              {editing && (
                <TouchableOpacity onPress={() => { setShowForm(false); confirmDelete(editing); }} style={[styles.formBtn, { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }]}>
                  <Feather name="trash-2" size={18} color="#DC2626" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowForm(false)} style={[styles.formBtn, { backgroundColor: '#F3F4F6', flex: 1 }]}>
                <Text style={styles.formBtnGrayText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} style={[styles.formBtn, { backgroundColor: '#10B981', flex: 1.5 }]} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <>
                  <Feather name="check" size={18} color="#fff" />
                  <Text style={styles.formBtnText}>{editing ? 'Enregistrer' : 'Ajouter'}</Text>
                </>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', padding: 16, gap: 12, alignItems: 'stretch' },
  totalBox: { flex: 1, backgroundColor: '#064E3B', padding: 14, borderRadius: 12 },
  totalLabel: { color: '#A7F3D0', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  totalAmount: { color: '#34D399', fontSize: 24, fontWeight: '800', marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  exportBtnText: { color: '#059669', fontSize: 13, fontWeight: '700' },
  hamburgerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  hamburgerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  hamburgerCurrent: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  hamburgerLabel: { fontSize: 15, fontWeight: '700', color: '#111' },
  hamburgerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hamburgerAmount: { fontSize: 15, fontWeight: '800', color: '#10B981' },
  menuCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: 'transparent', borderRadius: 12, padding: 12 },
  menuItemActive: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  menuIconBox: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  menuItemLabel: { fontSize: 15, fontWeight: '700', color: '#111' },
  menuItemSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  menuItemAmount: { fontSize: 15, fontWeight: '800', color: '#10B981' },
  menuDivider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 4 },
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
  formActions: { flexDirection: 'row', padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  formBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 10 },
  formBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  formBtnGrayText: { color: '#6B7280', fontSize: 15, fontWeight: '700' },
});
