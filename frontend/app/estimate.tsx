import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image, TextInput, Linking, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppHeader from '../components/AppHeader';

const PRICES_STORAGE_KEY = 'brightcalendar_window_prices_v1';

const WINDOW_TYPES = [
  { key: 'standard', label: 'Standard', price: 15, icon: 'square' as const },
  { key: 'standard_coulissante', label: 'Simple coulissante', price: 20, icon: 'sidebar' as const },
  { key: 'standard_double_coulissante', label: 'Double coulissante', price: 40, icon: 'copy' as const },
  { key: 'large', label: 'Grande', price: 20, icon: 'maximize' as const },
  { key: 'skylight', label: 'Puits de lumière', price: 30, icon: 'sun' as const },
  { key: 'patio_simple', label: 'Porte patio simple', price: 40, icon: 'columns' as const },
  { key: 'patio_double', label: 'Porte patio double', price: 60, icon: 'grid' as const },
];

const DEFAULT_PRICES: Record<string, number> = WINDOW_TYPES.reduce((acc, t) => {
  acc[t.key] = t.price;
  return acc;
}, {} as Record<string, number>);

export default function EstimateScreen() {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [prices, setPrices] = useState<Record<string, number>>(DEFAULT_PRICES);
  const [editingPriceKey, setEditingPriceKey] = useState<string | null>(null);
  const [priceEditValue, setPriceEditValue] = useState('');
  const [discount, setDiscount] = useState(0);

  // Load saved prices on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(PRICES_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          // Merge with defaults in case new types were added
          setPrices({ ...DEFAULT_PRICES, ...parsed });
        }
      } catch {}
    })();
  }, []);

  // Persist prices whenever they change
  const persistPrices = async (newPrices: Record<string, number>) => {
    try {
      await AsyncStorage.setItem(PRICES_STORAGE_KEY, JSON.stringify(newPrices));
    } catch {}
  };

  const resetPrices = () => {
    Alert.alert(
      'Réinitialiser les prix',
      'Restaurer les prix par défaut ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: () => {
            setPrices(DEFAULT_PRICES);
            persistPrices(DEFAULT_PRICES);
          },
        },
      ]
    );
  };
  const [photos, setPhotos] = useState<string[]>([]);
  const [fixedPrice, setFixedPrice] = useState('');
  const [useFixed, setUseFixed] = useState(false);

  const takePhoto = async () => {
    try {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) { Alert.alert('Permission', 'Accès à la caméra requis'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotos(prev => [...prev, result.assets[0].uri]);
      }
    } catch { Alert.alert('Erreur', 'Impossible d\'ouvrir la caméra'); }
  };

  const pickPhoto = async () => {
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) { Alert.alert('Permission', 'Accès aux photos requis'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotos(prev => [...prev, result.assets[0].uri]);
      }
    } catch { Alert.alert('Erreur', 'Impossible d\'ouvrir la galerie'); }
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const updateCount = (type: string, delta: number) => {
    setCounts((prev) => ({ ...prev, [type]: Math.max(0, (prev[type] || 0) + delta) }));
  };

  const totalWindows = Object.values(counts).reduce((a, b) => a + b, 0);
  const subtotal = WINDOW_TYPES.reduce((sum, t) => sum + (counts[t.key] || 0) * (prices[t.key] || 0), 0);
  const fixedValue = parseFloat(fixedPrice) || 0;
  const baseTotal = useFixed ? fixedValue : subtotal;
  const discountAmount = baseTotal * (discount / 100);
  const totalPrice = baseTotal - discountAmount;
  const DISCOUNTS = [0, 10, 15, 20];

  const startEditPrice = (key: string) => {
    setEditingPriceKey(key);
    setPriceEditValue(String(prices[key] || 0));
  };
  const savePrice = () => {
    if (editingPriceKey) {
      const val = parseFloat(priceEditValue) || 0;
      const newPrices = { ...prices, [editingPriceKey]: val };
      setPrices(newPrices);
      persistPrices(newPrices);
    }
    setEditingPriceKey(null);
    setPriceEditValue('');
  };

  // Build estimate text (simplified: description + total only)
  const buildEstimateText = () => {
    const lines: string[] = ['📋 ESTIMATION — Lavage de Vitres Bois-Franc', ''];
    lines.push('Lavage de vitres');
    lines.push('');
    if (discount > 0) {
      lines.push(`Rabais: -${discount}%`);
    }
    lines.push(`💰 TOTAL: ${totalPrice.toFixed(2)} $`);
    lines.push('');
    lines.push('📞 514-570-9802');
    lines.push('✉ lavagedevitreboisfranc@live.com');
    lines.push('🌐 Lavagedevitre.org');
    return lines.join('\n');
  };

  const sendByEmail = async () => {
    Alert.prompt(
      'Envoyer par courriel',
      'Adresse courriel du client :',
      async (email) => {
        if (!email || !email.trim()) return;
        const subject = `Estimation — Lavage de vitres`;
        const body = buildEstimateText();
        const url = `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        try {
          const can = await Linking.canOpenURL(url);
          if (can) { await Linking.openURL(url); }
          else { Alert.alert('Erreur', 'Aucune app courriel disponible'); }
        } catch { Alert.alert('Erreur', 'Impossible d\'ouvrir l\'app courriel'); }
      },
      'plain-text'
    );
  };

  const sendBySMS = async () => {
    Alert.prompt(
      'Envoyer par SMS',
      'Numéro de téléphone du client :',
      async (phone) => {
        if (!phone) return;
        const cleaned = phone.replace(/\D/g, '');
        if (!cleaned) return;
        const body = buildEstimateText();
        const sep = Platform.OS === 'ios' ? '&' : '?';
        const url = `sms:${cleaned}${sep}body=${encodeURIComponent(body)}`;
        try {
          const can = await Linking.canOpenURL(url);
          if (can) { await Linking.openURL(url); }
          else { Alert.alert('Erreur', 'SMS non supporté sur cet appareil'); }
        } catch { Alert.alert('Erreur', 'Impossible d\'ouvrir SMS'); }
      },
      'plain-text',
      '',
      'phone-pad'
    );
  };

  const shareEstimate = async () => {
    try {
      await Share.share({
        message: buildEstimateText(),
        title: 'Estimation — Lavage de vitres',
      });
    } catch { Alert.alert('Erreur', 'Impossible de partager'); }
  };

  return (
    <SafeAreaView style={styles.safeArea} testID="estimate-screen">
      <AppHeader title="Estimation" showBack />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle}>Calculez le prix selon le nombre de fenêtres</Text>
          <TouchableOpacity testID="reset-prices" onPress={resetPrices} style={styles.resetBtn} activeOpacity={0.7}>
            <Feather name="refresh-cw" size={12} color="#737373" />
            <Text style={styles.resetBtnText}>Prix par défaut</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hintText}>💡 Tapez sur un prix pour le modifier (sauvegardé automatiquement)</Text>

        {WINDOW_TYPES.map((type) => (
          <View key={type.key} style={styles.row}>
            <View style={styles.rowInfo}>
              <Feather name={type.icon} size={20} color="#0891B2" />
              <View style={{ flexShrink: 1, flex: 1 }}>
                <Text style={styles.typeName} numberOfLines={2}>{type.label}</Text>
                {editingPriceKey === type.key ? (
                  <View style={styles.priceEditRow}>
                    <TextInput
                      testID={`price-edit-${type.key}`}
                      style={styles.priceEditInput}
                      value={priceEditValue}
                      onChangeText={setPriceEditValue}
                      keyboardType="decimal-pad"
                      autoFocus
                      onBlur={savePrice}
                      onSubmitEditing={savePrice}
                    />
                    <Text style={styles.priceEditSuffix}>$</Text>
                    <TouchableOpacity onPress={savePrice} style={styles.priceOkBtn}>
                      <Feather name="check" size={14} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => startEditPrice(type.key)} activeOpacity={0.6}>
                    <Text style={styles.typePriceEditable}>
                      {(prices[type.key] || 0).toFixed(2)} $ / fenêtre
                      <Text style={styles.editHint}>  ✎</Text>
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={styles.counter}>
              <TouchableOpacity
                testID={`minus-${type.key}`}
                style={styles.counterBtn}
                onPress={() => updateCount(type.key, -1)}
                activeOpacity={0.7}
              >
                <Feather name="minus" size={18} color="#0A0A0A" />
              </TouchableOpacity>
              <Text style={styles.counterText}>{counts[type.key] || 0}</Text>
              <TouchableOpacity
                testID={`plus-${type.key}`}
                style={styles.counterBtn}
                onPress={() => updateCount(type.key, 1)}
                activeOpacity={0.7}
              >
                <Feather name="plus" size={18} color="#0A0A0A" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Photos section */}
        <View style={styles.photoSection}>
          <Text style={styles.photoLabel}>PHOTOS DU SITE ({photos.length})</Text>
          <View style={styles.photoActions}>
            <TouchableOpacity testID="take-photo" style={styles.photoBtn} activeOpacity={0.7} onPress={takePhoto}>
              <Feather name="camera" size={18} color="#0891B2" />
              <Text style={styles.photoBtnText}>Prendre photo</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="pick-photo" style={styles.photoBtn} activeOpacity={0.7} onPress={pickPhoto}>
              <Feather name="image" size={18} color="#0891B2" />
              <Text style={styles.photoBtnText}>Galerie</Text>
            </TouchableOpacity>
          </View>
          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {photos.map((uri, idx) => (
                <View key={idx} style={styles.photoThumbWrap}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    activeOpacity={0.7}
                    onPress={() => removePhoto(idx)}
                  >
                    <Feather name="x" size={14} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Prix fixe (personnalisable) */}
        <View style={styles.fixedSection}>
          <View style={styles.fixedHeader}>
            <Text style={styles.discountLabel}>PRIX FIXE (personnalisé)</Text>
            <TouchableOpacity
              testID="toggle-fixed"
              style={[styles.toggleBtn, useFixed && styles.toggleBtnActive]}
              activeOpacity={0.7}
              onPress={() => setUseFixed(!useFixed)}
            >
              <Text style={[styles.toggleText, useFixed && styles.toggleTextActive]}>
                {useFixed ? '✓ Activé' : 'Utiliser'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.fixedInputRow}>
            <TextInput
              testID="fixed-price-input"
              style={[styles.fixedInput, !useFixed && { opacity: 0.5 }]}
              placeholder="Ex: 250"
              placeholderTextColor="#A3A3A3"
              keyboardType="decimal-pad"
              value={fixedPrice}
              onChangeText={setFixedPrice}
              editable={useFixed}
            />
            <Text style={styles.fixedCurrency}>$</Text>
          </View>
          {useFixed && (
            <Text style={styles.fixedHint}>Le prix fixe remplace le calcul par fenêtre</Text>
          )}
        </View>

        {/* Discount */}
        <View style={styles.discountSection}>
          <Text style={styles.discountLabel}>RABAIS</Text>
          <View style={styles.discountRow}>
            {DISCOUNTS.map((d) => (
              <TouchableOpacity
                key={d}
                testID={`discount-${d}`}
                style={[styles.discountBtn, discount === d && styles.discountBtnActive]}
                activeOpacity={0.7}
                onPress={() => setDiscount(d)}
              >
                <Text style={[styles.discountText, discount === d && styles.discountTextActive]}>
                  {d === 0 ? 'Aucun' : `${d}%`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Total */}
        <View style={styles.totalCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Fenêtres</Text>
            <Text style={styles.totalValue}>{totalWindows}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{useFixed ? 'Prix fixe' : 'Sous-total'}</Text>
            <Text style={styles.totalValue}>{baseTotal.toFixed(2)} $</Text>
          </View>
          {discount > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Rabais ({discount}%)</Text>
                <Text style={[styles.totalValue, { color: '#FF3B30' }]}>-{discountAmount.toFixed(2)} $</Text>
              </View>
            </>
          )}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Prix estimé</Text>
            <Text style={styles.totalPrice}>{totalPrice.toFixed(2)} $</Text>
          </View>
        </View>

        {/* Send actions */}
        <Text style={styles.sendLabel}>ENVOYER L'ESTIMATION</Text>
        <View style={styles.sendRow}>
          <TouchableOpacity testID="send-email" style={[styles.sendBtn, { borderColor: '#059669' }]} activeOpacity={0.7} onPress={sendByEmail}>
            <Feather name="mail" size={20} color="#059669" />
            <Text style={[styles.sendBtnText, { color: '#059669' }]}>Courriel</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="send-sms" style={[styles.sendBtn, { borderColor: '#0891B2' }]} activeOpacity={0.7} onPress={sendBySMS}>
            <Feather name="message-circle" size={20} color="#0891B2" />
            <Text style={[styles.sendBtnText, { color: '#0891B2' }]}>SMS</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="send-share" style={[styles.sendBtn, { borderColor: '#7C3AED' }]} activeOpacity={0.7} onPress={shareEstimate}>
            <Feather name="share-2" size={20} color="#7C3AED" />
            <Text style={[styles.sendBtnText, { color: '#7C3AED' }]}>Partager</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          testID="use-estimate"
          style={styles.useBtn}
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/create', params: { editPrice: String(totalPrice) } })}
        >
          <Feather name="arrow-right" size={18} color="#FFFFFF" />
          <Text style={styles.useBtnText}>Créer un RDV avec ce prix</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { padding: 24 },
  subtitle: { fontSize: 15, color: '#737373', marginBottom: 24 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  hintText: { fontSize: 12, color: '#0891B2', fontStyle: 'italic', marginBottom: 18 },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
    borderWidth: 1, borderColor: '#E5E5E5', backgroundColor: '#FFFFFF',
  },
  resetBtnText: { fontSize: 11, color: '#737373', fontWeight: '600' },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 8,
    padding: 14, marginBottom: 12, gap: 8,
  },
  rowInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  typeName: { fontSize: 14, fontWeight: '600', color: '#0A0A0A', flexShrink: 1 },
  typePrice: { fontSize: 12, color: '#A3A3A3', marginTop: 2 },
  typePriceEditable: { fontSize: 12, color: '#0891B2', marginTop: 2, fontWeight: '600', textDecorationLine: 'underline' },
  editHint: { fontSize: 11, color: '#A3A3A3', fontWeight: '400' },
  priceEditRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  priceEditInput: {
    borderWidth: 1, borderColor: '#0891B2', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 4, fontSize: 13, fontWeight: '700',
    color: '#0A0A0A', minWidth: 50, maxWidth: 80,
  },
  priceEditSuffix: { fontSize: 13, fontWeight: '700', color: '#0891B2' },
  priceOkBtn: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#0891B2',
    justifyContent: 'center', alignItems: 'center', marginLeft: 4,
  },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  counterBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#E5E5E5',
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFA',
  },
  counterText: { fontSize: 18, fontWeight: '700', color: '#0A0A0A', minWidth: 24, textAlign: 'center' },
  discountSection: { marginTop: 8, marginBottom: 4 },
  discountLabel: { fontSize: 12, fontWeight: '600', color: '#737373', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  discountRow: { flexDirection: 'row', gap: 8 },
  discountBtn: { flex: 1, paddingVertical: 10, borderRadius: 4, borderWidth: 1, borderColor: '#E5E5E5', backgroundColor: '#FFFFFF', alignItems: 'center' },
  discountBtnActive: { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
  discountText: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  discountTextActive: { color: '#FFFFFF' },
  totalCard: {
    backgroundColor: '#0891B2', borderRadius: 12, padding: 20, marginTop: 12,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 15, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  totalValue: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  totalPrice: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 12 },
  useBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0A0A0A', borderRadius: 8, paddingVertical: 16, gap: 8, marginTop: 16,
  },
  useBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  sendLabel: {
    fontSize: 12, fontWeight: '700', color: '#737373',
    textTransform: 'uppercase', letterSpacing: 1,
    marginTop: 20, marginBottom: 10,
  },
  sendRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  sendBtn: {
    flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 10, borderWidth: 1.5, backgroundColor: '#FFFFFF',
  },
  sendBtnText: { fontSize: 13, fontWeight: '700' },
  photoSection: { marginTop: 8, marginBottom: 16 },
  photoLabel: { fontSize: 12, fontWeight: '600', color: '#737373', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  photoActions: { flexDirection: 'row', gap: 10 },
  photoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#0891B2', backgroundColor: '#FFF',
  },
  photoBtnText: { color: '#0891B2', fontSize: 14, fontWeight: '600' },
  photoThumbWrap: { marginRight: 10, position: 'relative' },
  photoThumb: { width: 90, height: 90, borderRadius: 8, backgroundColor: '#E5E5E5' },
  photoRemove: {
    position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,59,48,0.9)', justifyContent: 'center', alignItems: 'center',
  },
  fixedSection: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E5E5E5', marginBottom: 14,
  },
  fixedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#0891B2' },
  toggleBtnActive: { backgroundColor: '#0891B2' },
  toggleText: { color: '#0891B2', fontSize: 12, fontWeight: '700' },
  toggleTextActive: { color: '#FFF' },
  fixedInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fixedInput: {
    flex: 1, borderWidth: 1, borderColor: '#D4D4D4', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 18, fontWeight: '700', color: '#0A0A0A',
  },
  fixedCurrency: { fontSize: 22, fontWeight: '800', color: '#0891B2' },
  fixedHint: { fontSize: 11, color: '#737373', marginTop: 6, fontStyle: 'italic' },
});
