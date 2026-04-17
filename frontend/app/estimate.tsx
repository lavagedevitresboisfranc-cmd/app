import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
});
