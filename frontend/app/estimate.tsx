import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AppHeader from '../components/AppHeader';

const WINDOW_TYPES = [
  { key: 'standard', label: 'Standard', price: 15, icon: 'square' as const },
  { key: 'standard_coulissante', label: 'Standard simple coulissante', price: 20, icon: 'sidebar' as const },
  { key: 'standard_double_coulissante', label: 'Standard double coulissante', price: 40, icon: 'copy' as const },
  { key: 'large', label: 'Grande', price: 20, icon: 'maximize' as const },
  { key: 'skylight', label: 'Puits de lumière', price: 30, icon: 'sun' as const },
  { key: 'patio_simple', label: 'Porte patio simple', price: 40, icon: 'columns' as const },
  { key: 'patio_double', label: 'Porte patio double', price: 60, icon: 'grid' as const },
];

export default function EstimateScreen() {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);

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
  const subtotal = WINDOW_TYPES.reduce((sum, t) => sum + (counts[t.key] || 0) * t.price, 0);
  const discountAmount = subtotal * (discount / 100);
  const totalPrice = subtotal - discountAmount;
  const DISCOUNTS = [0, 10, 15, 20];

  return (
    <SafeAreaView style={styles.safeArea} testID="estimate-screen">
      <AppHeader title="Estimation" showBack />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Calculez le prix selon le nombre de fenêtres</Text>

        {WINDOW_TYPES.map((type) => (
          <View key={type.key} style={styles.row}>
            <View style={styles.rowInfo}>
              <Feather name={type.icon} size={20} color="#0891B2" />
              <View>
                <Text style={styles.typeName}>{type.label}</Text>
                <Text style={styles.typePrice}>{type.price.toFixed(2)} $ / fenêtre</Text>
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
              <Text style={styles.counterText}>{counts[type.key]}</Text>
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
            <Text style={styles.totalLabel}>Sous-total</Text>
            <Text style={styles.totalValue}>{subtotal.toFixed(2)} $</Text>
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
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 8,
    padding: 16, marginBottom: 12,
  },
  rowInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeName: { fontSize: 16, fontWeight: '600', color: '#0A0A0A' },
  typePrice: { fontSize: 13, color: '#A3A3A3', marginTop: 2 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  counterBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#E5E5E5',
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFA',
  },
  counterText: { fontSize: 20, fontWeight: '700', color: '#0A0A0A', minWidth: 30, textAlign: 'center' },
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
});
