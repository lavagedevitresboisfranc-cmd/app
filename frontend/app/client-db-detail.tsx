import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Appointment {
  id: string;
  title: string;
  date: string;
  time_slot: string;
  price: number;
  status: string;
}

export default function ClientDbDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [createdAt, setCreatedAt] = useState('');
  const [history, setHistory] = useState<Appointment[]>([]);

  const fetchClient = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [clientRes, historyRes] = await Promise.all([
        fetch(`${API_URL}/api/clients-db/${id}`),
        fetch(`${API_URL}/api/clients-db/${id}/history`),
      ]);
      const c = await clientRes.json();
      if (!clientRes.ok) throw new Error(c.detail || 'Client introuvable');
      setName(c.name || '');
      setEmail(c.email || '');
      setPhone(c.phone || '');
      setAddress(c.address || '');
      setNotes(c.notes || '');
      setTags(c.tags || []);
      setCreatedAt(c.created_at || '');

      const h = await historyRes.json();
      setHistory(h.appointments || []);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Chargement impossible');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  const saveChanges = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/clients-db/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          address: address.trim(),
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Sauvegarde échouée');
      setEditing(false);
      Alert.alert('✅ Enregistré', 'Les modifications ont été sauvegardées');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Sauvegarde impossible');
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = () => {
    Alert.alert('Supprimer ce client?', 'Action irréversible', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(`${API_URL}/api/clients-db/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Erreur');
            Alert.alert('✅ Supprimé');
            router.back();
          } catch (e: any) {
            Alert.alert('Erreur', e?.message || 'Suppression impossible');
          }
        },
      },
    ]);
  };

  const call = () => phone && Linking.openURL(`tel:${phone.replace(/\D/g, '')}`);
  const sms = () => phone && Linking.openURL(`sms:${phone.replace(/\D/g, '')}`);
  const mail = () => email && Linking.openURL(`mailto:${email}`);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <AppHeader title="Client" showBack />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#0891B2" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title={name || 'Client'} showBack />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Avatar & name */}
          <View style={styles.heroCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(name || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.heroName}>{name || '(sans nom)'}</Text>
            {tags.length > 0 && (
              <View style={styles.tagRow}>
                {tags.map((t) => (
                  <View key={t} style={styles.tag}>
                    <Text style={styles.tagText}>{t}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Quick actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity onPress={call} disabled={!phone} style={[styles.qa, !phone && styles.qaDisabled]}>
              <Feather name="phone" size={18} color={phone ? '#16A34A' : '#9CA3AF'} />
              <Text style={[styles.qaText, !phone && { color: '#9CA3AF' }]}>Appeler</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={sms} disabled={!phone} style={[styles.qa, !phone && styles.qaDisabled]}>
              <Feather name="message-square" size={18} color={phone ? '#0891B2' : '#9CA3AF'} />
              <Text style={[styles.qaText, !phone && { color: '#9CA3AF' }]}>SMS</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={mail} disabled={!email} style={[styles.qa, !email && styles.qaDisabled]}>
              <Feather name="mail" size={18} color={email ? '#D97706' : '#9CA3AF'} />
              <Text style={[styles.qaText, !email && { color: '#9CA3AF' }]}>Courriel</Text>
            </TouchableOpacity>
          </View>

          {/* Info block */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Informations</Text>
              {!editing ? (
                <TouchableOpacity onPress={() => setEditing(true)} style={styles.editBtn}>
                  <Feather name="edit-2" size={14} color="#0891B2" />
                  <Text style={styles.editBtnText}>Modifier</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => { setEditing(false); fetchClient(); }} style={styles.editBtn}>
                  <Feather name="x" size={14} color="#6B7280" />
                  <Text style={[styles.editBtnText, { color: '#6B7280' }]}>Annuler</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.label}>Nom</Text>
            <TextInput style={[styles.input, !editing && styles.readOnly]} value={name} onChangeText={setName} editable={editing} />

            <Text style={styles.label}>Courriel</Text>
            <TextInput style={[styles.input, !editing && styles.readOnly]} value={email} onChangeText={setEmail} editable={editing} keyboardType="email-address" autoCapitalize="none" />

            <Text style={styles.label}>Téléphone</Text>
            <TextInput style={[styles.input, !editing && styles.readOnly]} value={phone} onChangeText={setPhone} editable={editing} keyboardType="phone-pad" />

            <Text style={styles.label}>Adresse</Text>
            <TextInput style={[styles.input, !editing && styles.readOnly]} value={address} onChangeText={setAddress} editable={editing} />

            <Text style={styles.label}>Notes</Text>
            <TextInput style={[styles.input, { minHeight: 80 }, !editing && styles.readOnly]} value={notes} onChangeText={setNotes} editable={editing} multiline />

            {editing && (
              <TouchableOpacity onPress={saveChanges} style={styles.saveBtn} activeOpacity={0.8} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Enregistrer</Text>}
              </TouchableOpacity>
            )}
          </View>

          {/* History */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Historique des RDV ({history.length})
            </Text>
            {history.length === 0 ? (
              <Text style={styles.emptyHistory}>Aucun rendez-vous trouvé</Text>
            ) : (
              history.map((h) => (
                <TouchableOpacity
                  key={h.id}
                  style={styles.historyItem}
                  onPress={() => router.push({ pathname: '/detail', params: { id: h.id } } as any)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyTitle}>{h.title}</Text>
                    <Text style={styles.historyMeta}>{h.date} • {h.time_slot}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.historyPrice}>${h.price}</Text>
                    <Text style={[styles.historyStatus, h.status === 'completed' && { color: '#16A34A' }]}>{h.status}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Delete */}
          <TouchableOpacity onPress={deleteClient} style={styles.deleteBtn} activeOpacity={0.8}>
            <Feather name="trash-2" size={18} color="#DC2626" />
            <Text style={styles.deleteBtnText}>Supprimer ce client</Text>
          </TouchableOpacity>

          {createdAt && <Text style={styles.createdText}>Ajouté le {new Date(createdAt).toLocaleDateString('fr-CA')}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroCard: { backgroundColor: '#fff', padding: 20, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0891B2', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  heroName: { fontSize: 22, fontWeight: '800', color: '#111', marginTop: 12, textAlign: 'center' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, justifyContent: 'center' },
  tag: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tagText: { fontSize: 10, color: '#1E40AF', fontWeight: '700', textTransform: 'uppercase' },
  quickActions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  qa: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  qaText: { fontSize: 14, fontWeight: '700', color: '#111' },
  qaDisabled: { opacity: 0.5 },
  section: { backgroundColor: '#fff', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 8 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#ECFEFF' },
  editBtnText: { fontSize: 12, color: '#0891B2', fontWeight: '700' },
  label: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 10 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111', backgroundColor: '#FAFAFA' },
  readOnly: { backgroundColor: '#F9FAFB', borderColor: '#F3F4F6', color: '#374151' },
  saveBtn: { backgroundColor: '#111', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  historyItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  historyTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  historyMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  historyPrice: { fontSize: 14, fontWeight: '800', color: '#0891B2' },
  historyStatus: { fontSize: 11, color: '#6B7280', marginTop: 2, textTransform: 'capitalize' },
  emptyHistory: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', padding: 20 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', marginBottom: 16 },
  deleteBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  createdText: { fontSize: 11, color: '#9CA3AF', textAlign: 'center' },
});
