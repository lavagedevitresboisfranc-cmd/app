import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  Alert, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Employee { id: string; name: string; phone: string; email: string; color: string; active: boolean; }

const COLORS = ['#0891B2', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5856D6', '#FF2D55', '#007AFF'];

export default function EmployeesScreen() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [color, setColor] = useState('#0891B2');

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/employees`);
      setEmployees(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { fetchEmployees(); }, []));

  const onRefresh = async () => { setRefreshing(true); await fetchEmployees(); setRefreshing(false); };

  const handleAdd = async () => {
    if (!name.trim()) { Alert.alert('Requis', 'Entrez un nom'); return; }
    try {
      const res = await fetch(`${API_URL}/api/employees`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim(), color }),
      });
      if (res.ok) {
        setName(''); setPhone(''); setEmail(''); setShowAdd(false);
        fetchEmployees();
      }
    } catch { Alert.alert('Erreur', 'Erreur réseau'); }
  };

  const handleDelete = (emp: Employee) => {
    Alert.alert('Supprimer', `Retirer ${emp.name}?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        await fetch(`${API_URL}/api/employees/${emp.id}`, { method: 'DELETE' });
        fetchEmployees();
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} testID="employees-screen">
      <AppHeader title="Employés" showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {showAdd && (
          <View style={styles.addForm}>
            <Text style={styles.addTitle}>Nouvel employé</Text>
            <TextInput testID="emp-name" style={styles.input} value={name} onChangeText={setName} placeholder="Nom" placeholderTextColor="#A3A3A3" />
            <TextInput testID="emp-phone" style={styles.input} value={phone} onChangeText={setPhone} placeholder="Téléphone" placeholderTextColor="#A3A3A3" keyboardType="phone-pad" />
            <TextInput testID="emp-email" style={styles.input} value={email} onChangeText={setEmail} placeholder="Courriel" placeholderTextColor="#A3A3A3" keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.colorLabel}>COULEUR</Text>
            <View style={styles.colorRow}>
              {COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]} />
              ))}
            </View>
            <View style={styles.addActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}><Text style={styles.cancelText}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity testID="save-employee" style={styles.saveBtn} onPress={handleAdd}><Text style={styles.saveText}>Ajouter</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {loading ? <ActivityIndicator size="small" color="#0891B2" style={{ marginTop: 48 }} /> : (
          <FlatList
            testID="employees-list"
            data={employees}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891B2" />}
            ListHeaderComponent={!showAdd ? (
              <TouchableOpacity testID="add-employee-btn" style={styles.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.7}>
                <Feather name="user-plus" size={20} color="#0891B2" />
                <Text style={styles.addBtnText}>Ajouter un employé</Text>
              </TouchableOpacity>
            ) : null}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={[styles.avatar, { backgroundColor: item.color }]}>
                  <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  {item.phone ? <Text style={styles.cardSub}>{item.phone}</Text> : null}
                  {item.email ? <Text style={styles.cardSub}>{item.email}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteIcon}>
                  <Feather name="trash-2" size={18} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="users" size={48} color="#E5E5E5" />
                <Text style={styles.emptyTitle}>Aucun employé</Text>
                <Text style={styles.emptySub}>Ajoutez votre équipe</Text>
              </View>
            }
            contentContainerStyle={styles.list}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  list: { padding: 24, paddingBottom: 48 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 2, borderColor: '#0891B2', borderStyle: 'dashed', borderRadius: 8,
    paddingVertical: 16, marginBottom: 16,
  },
  addBtnText: { fontSize: 16, fontWeight: '600', color: '#0891B2' },
  addForm: { padding: 24, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#E5E5E5' },
  addTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A', marginBottom: 16 },
  input: { borderBottomWidth: 1, borderColor: '#E5E5E5', fontSize: 16, paddingVertical: 10, marginBottom: 12, color: '#0A0A0A' },
  colorLabel: { fontSize: 12, fontWeight: '600', color: '#737373', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotActive: { borderWidth: 3, borderColor: '#0A0A0A' },
  addActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 4, borderWidth: 1, borderColor: '#E5E5E5', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#737373' },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 4, backgroundColor: '#0891B2', alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 8, padding: 14, marginBottom: 10, gap: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '600', color: '#0A0A0A' },
  cardSub: { fontSize: 13, color: '#A3A3A3', marginTop: 1 },
  deleteIcon: { padding: 8 },
  empty: { alignItems: 'center', paddingTop: 64 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#0A0A0A', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#A3A3A3', marginTop: 4 },
});
