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
  receipt_pdf: string | null;
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
  const [fPdf, setFPdf] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [viewPdf, setViewPdf] = useState<string | null>(null);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  // Multi-page scan state
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanPages, setScanPages] = useState<string[]>([]); // array of base64 images
  const [scanning, setScanning] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

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
    setFPdf(null);
    setScanPages([]);
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
    setFPdf(exp.receipt_pdf || null);
    setScanPages([]);
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

  // === MULTI-PAGE SCAN (receipt / invoice -> PDF) ===
  const openScanModal = () => {
    setScanPages([]);
    setScanModalOpen(true);
  };

  const scanAddPage = async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission refusée', "L'accès à la caméra est requis pour scanner.");
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted && Platform.OS !== 'web') {
          Alert.alert('Permission refusée', "L'accès à la galerie est requis.");
          return;
        }
      }
      setScanning(true);

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.7,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            // NOTE: allowsEditing + allowsMultipleSelection are mutually exclusive.
            // We prioritize multi-selection for the scan flow.
            allowsMultipleSelection: true,
            selectionLimit: 20,
            quality: 0.7,
            base64: true,
          });

      if (result.canceled) {
        return;
      }

      if (!result.assets || result.assets.length === 0) {
        Alert.alert('Erreur', 'Aucune image sélectionnée.');
        return;
      }

      // Extract base64 from assets — handle both native (asset.base64) and web (asset.uri as data URL)
      const newPages: string[] = [];
      for (const a of result.assets) {
        let dataUrl: string | null = null;
        if (a.base64) {
          // Native returns raw base64
          dataUrl = a.base64.startsWith('data:')
            ? a.base64
            : `data:image/jpeg;base64,${a.base64}`;
        } else if (a.uri && a.uri.startsWith('data:')) {
          // Web may return data URL directly in uri
          dataUrl = a.uri;
        } else if (a.uri) {
          // Fallback: fetch the uri and convert to base64 (web blob: or http: urls)
          try {
            const res = await fetch(a.uri);
            const blob = await res.blob();
            dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (fetchErr) {
            console.warn('Unable to convert uri to base64', fetchErr);
          }
        }
        if (dataUrl) {
          newPages.push(dataUrl);
        }
      }

      if (newPages.length === 0) {
        Alert.alert(
          'Erreur',
          "Impossible de lire l'image sélectionnée. Essayez un autre format (JPG ou PNG)."
        );
        return;
      }

      setScanPages((prev) => {
        const combined = [...prev, ...newPages];
        return combined.slice(0, 20);
      });
    } catch (e: any) {
      console.error('scanAddPage error:', e);
      Alert.alert('Erreur', `Impossible d'ajouter la page: ${e?.message || 'inconnu'}`);
    } finally {
      setScanning(false);
    }
  };

  const removeScanPage = (idx: number) => {
    setScanPages((prev) => prev.filter((_, i) => i !== idx));
  };

  const movePage = (idx: number, dir: -1 | 1) => {
    setScanPages((prev) => {
      const next = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= next.length) return prev;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const generatePdfFromScan = async () => {
    if (scanPages.length === 0) {
      Alert.alert('Vide', 'Ajoutez au moins une page à scanner.');
      return;
    }
    setGeneratingPdf(true);
    try {
      // Strip data:image prefix - backend accepts both
      const imagesRaw = scanPages.map((p) => {
        const commaIdx = p.indexOf(',');
        return commaIdx >= 0 ? p.substring(commaIdx + 1) : p;
      });
      const res = await fetch(`${API_URL}/api/expenses/images-to-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: imagesRaw }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFPdf(data.pdf_base64);
      // Also set the first page as a preview thumbnail (auto-fill photo if empty)
      if (!fPhoto && scanPages[0]) {
        setFPhoto(scanPages[0]);
      }
      setScanModalOpen(false);
      setScanPages([]);
      Alert.alert(
        '✅ PDF créé',
        `${data.pages} page${data.pages > 1 ? 's' : ''} combinée${data.pages > 1 ? 's' : ''} en un seul PDF (${data.size_kb} KB).`
      );
    } catch (e: any) {
      Alert.alert('Erreur', `Impossible de générer le PDF: ${e?.message || 'inconnu'}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const openPdfPreview = (pdfDataUrl: string) => {
    if (Platform.OS === 'web') {
      // Open in new tab
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(
          `<html><head><title>Reçu PDF</title></head><body style="margin:0;"><iframe src="${pdfDataUrl}" style="border:0;width:100vw;height:100vh;"></iframe></body></html>`
        );
      } else {
        setViewPdf(pdfDataUrl);
      }
    } else {
      setViewPdf(pdfDataUrl);
    }
  };

  const openExpensePdf = async (expId: string) => {
    const url = `${API_URL}/api/expenses/${expId}/receipt-pdf`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert('Erreur', 'Impossible d\'ouvrir le PDF');
      }
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
        receipt_pdf: fPdf,
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
          {item.receipt_pdf && (
            <TouchableOpacity
              testID={`view-pdf-${item.id}`}
              onPress={(e) => { (e as any)?.stopPropagation?.(); openExpensePdf(item.id); }}
              style={styles.pdfBadgeInCard}
              activeOpacity={0.8}
            >
              <Feather name="file-text" size={18} color="#DC2626" />
              <Text style={styles.pdfBadgeInCardText}>PDF</Text>
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

      {/* Category filter - Hamburger menu */}
      <TouchableOpacity
        style={styles.hamburgerBtn}
        onPress={() => setShowCategoryMenu(true)}
        activeOpacity={0.7}
      >
        <View style={styles.hamburgerLeft}>
          <Feather name="menu" size={22} color="#111" />
          <View style={styles.hamburgerCurrent}>
            {filterCategory ? (
              <>
                <Text style={{ fontSize: 20 }}>{categoryMeta(filterCategory).icon}</Text>
                <Text style={styles.hamburgerLabel}>{categoryMeta(filterCategory).label}</Text>
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
            {(filterCategory
              ? (stats?.by_category[filterCategory]?.total || 0)
              : (stats?.grand_total || 0)
            ).toFixed(0)}$
          </Text>
          <Feather name="chevron-down" size={20} color="#6B7280" />
        </View>
      </TouchableOpacity>

      {/* CATEGORY HAMBURGER MODAL */}
      <Modal visible={showCategoryMenu} animationType="slide" transparent onRequestClose={() => setShowCategoryMenu(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCategoryMenu(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.menuCard} onPress={() => {}}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>📂 Filtrer par catégorie</Text>
              <TouchableOpacity onPress={() => setShowCategoryMenu(false)}>
                <Feather name="x" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 12, gap: 6 }}>
              {/* "Toutes" */}
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
                    {expenses.length} dépense{expenses.length > 1 ? 's' : ''} visibles
                  </Text>
                </View>
                <Text style={styles.menuItemAmount}>{(stats?.grand_total || 0).toFixed(0)}$</Text>
                {!filterCategory && <Feather name="check-circle" size={20} color="#10B981" style={{ marginLeft: 8 }} />}
              </TouchableOpacity>
              {/* Divider */}
              <View style={styles.menuDivider} />
              {/* Categories */}
              {CATEGORIES.map(cat => {
                const active = filterCategory === cat.id;
                const catStats = stats?.by_category[cat.id] || { total: 0, count: 0 };
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.menuItem,
                      active && { backgroundColor: cat.bg, borderColor: cat.color },
                    ]}
                    onPress={() => { setFilterCategory(cat.id); setShowCategoryMenu(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.menuIconBox, { backgroundColor: cat.bg }]}>
                      <Text style={{ fontSize: 22 }}>{cat.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.menuItemLabel, active && { color: cat.color }]}>{cat.label}</Text>
                      <Text style={styles.menuItemSub}>
                        {catStats.count} dépense{catStats.count > 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Text style={[styles.menuItemAmount, active && { color: cat.color }]}>
                      {catStats.total.toFixed(0)}$
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

              {/* PDF Scanner (multi-page) */}
              <Text style={[styles.label, { marginTop: 14 }]}>📄 Facture / Reçu PDF (multi-pages)</Text>
              {fPdf ? (
                <View style={styles.pdfCard}>
                  <View style={styles.pdfCardRow}>
                    <View style={styles.pdfIconBubble}>
                      <Feather name="file-text" size={22} color="#DC2626" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pdfCardTitle}>Reçu PDF attaché</Text>
                      <Text style={styles.pdfCardSub}>
                        Prêt à enregistrer ({Math.round(fPdf.length / 1024)} KB env.)
                      </Text>
                    </View>
                  </View>
                  <View style={styles.pdfCardActions}>
                    <TouchableOpacity
                      testID="view-current-pdf"
                      style={[styles.pdfSmallBtn, { backgroundColor: '#0891B2' }]}
                      onPress={() => openPdfPreview(fPdf)}
                      activeOpacity={0.8}
                    >
                      <Feather name="eye" size={14} color="#fff" />
                      <Text style={styles.pdfSmallBtnText}>Voir PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="replace-pdf"
                      style={[styles.pdfSmallBtn, { backgroundColor: '#F3F4F6' }]}
                      onPress={openScanModal}
                      activeOpacity={0.8}
                    >
                      <Feather name="refresh-cw" size={14} color="#374151" />
                      <Text style={[styles.pdfSmallBtnText, { color: '#374151' }]}>Remplacer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="remove-pdf"
                      style={[styles.pdfSmallBtn, { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }]}
                      onPress={() => setFPdf(null)}
                      activeOpacity={0.8}
                    >
                      <Feather name="trash-2" size={14} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  testID="scan-pdf-btn"
                  style={styles.scanBtn}
                  onPress={openScanModal}
                  activeOpacity={0.85}
                >
                  <Feather name="file-plus" size={20} color="#FFFFFF" />
                  <Text style={styles.scanBtnText}>📸 Scanner reçu/facture → PDF</Text>
                </TouchableOpacity>
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

            {/* === SCAN OVERLAY (absolute, inside form modal — avoids nested-Modal iOS bug) === */}
            {scanModalOpen && (
              <View style={styles.scanOverlay}>
                <View style={styles.scanHeader}>
                  <TouchableOpacity
                    testID="scan-close"
                    onPress={() => setScanModalOpen(false)}
                    style={styles.scanHeaderBtn}
                    activeOpacity={0.7}
                  >
                    <Feather name="x" size={22} color="#0A0A0A" />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scanHeaderTitle}>Scanner Reçu / Facture</Text>
                    <Text style={styles.scanHeaderSub}>
                      {scanPages.length === 0
                        ? 'Prenez une ou plusieurs photos'
                        : `${scanPages.length} page${scanPages.length > 1 ? 's' : ''} ajoutée${scanPages.length > 1 ? 's' : ''}`}
                    </Text>
                  </View>
                </View>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
                  <View style={styles.scanActionsRow}>
                    <TouchableOpacity
                      testID="scan-camera"
                      style={[styles.scanActionBtn, { backgroundColor: '#0891B2' }]}
                      onPress={() => scanAddPage(true)}
                      disabled={scanning || scanPages.length >= 20}
                      activeOpacity={0.85}
                    >
                      <Feather name="camera" size={20} color="#FFFFFF" />
                      <Text style={styles.scanActionText}>
                        {scanning ? '...' : 'Caméra'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="scan-gallery"
                      style={[styles.scanActionBtn, { backgroundColor: '#F3F4F6' }]}
                      onPress={() => scanAddPage(false)}
                      disabled={scanning || scanPages.length >= 20}
                      activeOpacity={0.85}
                    >
                      <Feather name="image" size={20} color="#374151" />
                      <Text style={[styles.scanActionText, { color: '#374151' }]}>
                        Galerie
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {scanPages.length >= 20 && (
                    <Text style={styles.scanWarn}>⚠️ Maximum 20 pages atteint</Text>
                  )}

                  {scanPages.length === 0 ? (
                    <View style={styles.scanEmpty}>
                      <Feather name="file-plus" size={48} color="#D1D5DB" />
                      <Text style={styles.scanEmptyTitle}>Aucune page ajoutée</Text>
                      <Text style={styles.scanEmptyDesc}>
                        Utilisez la caméra pour photographier chaque page du reçu/facture,
                        puis générez un PDF unique.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 10, marginTop: 14 }}>
                      {scanPages.map((page, idx) => (
                        <View key={`${idx}-${page.slice(-12)}`} style={styles.pageRow}>
                          <Image source={{ uri: page }} style={styles.pageThumb} resizeMode="cover" />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.pageNumber}>Page {idx + 1}</Text>
                            <Text style={styles.pageSize}>
                              ≈ {Math.round(page.length / 1024)} KB
                            </Text>
                          </View>
                          <View style={styles.pageControls}>
                            <TouchableOpacity
                              onPress={() => movePage(idx, -1)}
                              disabled={idx === 0}
                              style={[styles.pageCtrlBtn, idx === 0 && { opacity: 0.3 }]}
                              activeOpacity={0.7}
                            >
                              <Feather name="chevron-up" size={18} color="#374151" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => movePage(idx, 1)}
                              disabled={idx === scanPages.length - 1}
                              style={[styles.pageCtrlBtn, idx === scanPages.length - 1 && { opacity: 0.3 }]}
                              activeOpacity={0.7}
                            >
                              <Feather name="chevron-down" size={18} color="#374151" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => removeScanPage(idx)}
                              style={[styles.pageCtrlBtn, { backgroundColor: '#FEF2F2' }]}
                              activeOpacity={0.7}
                            >
                              <Feather name="trash-2" size={16} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </ScrollView>

                <View style={styles.scanFooter}>
                  <TouchableOpacity
                    testID="scan-cancel"
                    style={[styles.scanFooterBtn, { backgroundColor: '#F3F4F6' }]}
                    onPress={() => setScanModalOpen(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.scanFooterBtnText}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="scan-generate-pdf"
                    style={[
                      styles.scanFooterBtn,
                      { backgroundColor: scanPages.length === 0 ? '#A3A3A3' : '#10B981', flex: 1.8 },
                    ]}
                    onPress={generatePdfFromScan}
                    disabled={scanPages.length === 0 || generatingPdf}
                    activeOpacity={0.85}
                  >
                    {generatingPdf ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Feather name="file-text" size={18} color="#FFFFFF" />
                        <Text style={[styles.scanFooterBtnText, { color: '#FFFFFF' }]}>
                          Générer PDF ({scanPages.length})
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
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

      {/* SCAN MULTI-PAGE VIEW is rendered INSIDE the form modal (below) as an absolute overlay.
          This avoids iOS's limitation of not allowing stacked Modals. */}

      {/* PDF VIEWER (mobile fallback) */}
      <Modal visible={!!viewPdf} transparent={false} animationType="slide" onRequestClose={() => setViewPdf(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#1F2937' }}>
          <View style={styles.pdfViewerHeader}>
            <TouchableOpacity onPress={() => setViewPdf(null)} style={styles.photoCloseBtn}>
              <Feather name="x" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.pdfViewerTitle}>Aperçu du PDF</Text>
            <TouchableOpacity
              onPress={async () => {
                if (viewPdf) {
                  try { await Linking.openURL(viewPdf); } catch {
                    Alert.alert('Erreur', 'Impossible d\'ouvrir le PDF');
                  }
                }
              }}
              style={styles.photoCloseBtn}
            >
              <Feather name="external-link" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Feather name="file-text" size={80} color="#DC2626" />
            <Text style={{ color: '#fff', fontSize: 16, marginTop: 18, textAlign: 'center', fontWeight: '600' }}>
              PDF prêt
            </Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
              Appuyez sur l'icône en haut à droite pour l'ouvrir dans votre lecteur PDF ou le partager.
            </Text>
          </View>
        </SafeAreaView>
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
  // Hamburger
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
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: 'transparent',
    borderRadius: 12, padding: 12,
  },
  menuItemActive: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  menuIconBox: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  menuItemLabel: { fontSize: 15, fontWeight: '700', color: '#111' },
  menuItemSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  menuItemAmount: { fontSize: 15, fontWeight: '800', color: '#374151' },
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
  // PDF related
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#DC2626', paddingVertical: 16, borderRadius: 12 },
  scanBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  pdfCard: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FECACA' },
  pdfCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  pdfIconBubble: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
  pdfCardTitle: { fontSize: 14, fontWeight: '800', color: '#991B1B' },
  pdfCardSub: { fontSize: 12, color: '#DC2626', marginTop: 2 },
  pdfCardActions: { flexDirection: 'row', gap: 6 },
  pdfSmallBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 8 },
  pdfSmallBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  pdfBadgeInCard: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#FECACA', marginLeft: 6 },
  pdfBadgeInCardText: { fontSize: 11, fontWeight: '800', color: '#DC2626', letterSpacing: 0.5 },
  // Scan multi-page modal
  scanOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 100,
    ...Platform.select({
      web: { boxShadow: '0 -10px 40px rgba(0,0,0,0.1)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 10,
      },
    }),
  },
  scanHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  scanHeaderBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  scanHeaderTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
  scanHeaderSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  scanActionsRow: { flexDirection: 'row', gap: 10 },
  scanActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  scanActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  scanWarn: { textAlign: 'center', color: '#B45309', fontSize: 12, fontWeight: '700', marginTop: 10, backgroundColor: '#FEF3C7', paddingVertical: 6, borderRadius: 8 },
  scanEmpty: { alignItems: 'center', padding: 36, gap: 8 },
  scanEmptyTitle: { fontSize: 16, fontWeight: '800', color: '#374151', marginTop: 6 },
  scanEmptyDesc: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 8 },
  pageThumb: { width: 56, height: 72, borderRadius: 6, backgroundColor: '#000' },
  pageNumber: { fontSize: 14, fontWeight: '700', color: '#111' },
  pageSize: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  pageControls: { flexDirection: 'row', gap: 4 },
  pageCtrlBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', borderRadius: 6, backgroundColor: '#E5E7EB' },
  scanFooter: { flexDirection: 'row', padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  scanFooterBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  scanFooterBtnText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  pdfViewerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  pdfViewerTitle: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
