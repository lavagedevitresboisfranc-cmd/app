import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useAudioRecorder, useAudioPlayer, RecordingPresets, setAudioModeAsync, requestRecordingPermissionsAsync, AudioModule } from 'expo-audio';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Appointment {
  id: string;
  title: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_address: string;
  date: string;
  time_slot: string;
  duration_minutes: number;
  price: number;
  notes: string;
  status: string;
  created_at: string;
  assigned_to?: string;
  assigned_id?: string;
  assigned_color?: string;
}

interface Employee { id: string; name: string; color: string; }

export default function DetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioPlayer = useAudioPlayer(recordingUri);

  useFocusEffect(
    useCallback(() => {
      if (id) {
        fetchAppointment();
        fetchEmployees();
      }
    }, [id])
  );

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API_URL}/api/employees`);
      if (res.ok) setEmployees(await res.json());
    } catch {}
  };

  const handleAssignEmployee = () => {
    if (!appointment) return;
    if (employees.length === 0) {
      Alert.alert('Aucun employé', 'Créez d\'abord des employés dans le menu Employés.');
      return;
    }
    const buttons: any[] = employees.map(e => ({
      text: e.name,
      onPress: () => assignEmployee(e.id),
    }));
    if (appointment.assigned_id) {
      buttons.push({ text: 'Retirer assignation', style: 'destructive', onPress: () => assignEmployee('') });
    }
    buttons.push({ text: 'Annuler', style: 'cancel' });
    Alert.alert('Assigner à un employé', `${appointment.client_name} — ${appointment.date}`, buttons);
  };

  const assignEmployee = async (employeeId: string) => {
    if (!appointment) return;
    try {
      if (!employeeId) {
        // Unassign: use PUT with empty
        await fetch(`${API_URL}/api/appointments/${appointment.id}/assign?employee_id=none`, { method: 'PUT' });
        fetchAppointment();
        return;
      }
      const res = await fetch(`${API_URL}/api/appointments/${appointment.id}/assign?employee_id=${employeeId}`, { method: 'PUT' });
      if (res.ok) {
        Alert.alert('Assigné!', 'Employé assigné avec succès.');
        fetchAppointment();
      } else {
        Alert.alert('Erreur', 'Échec de l\'assignation');
      }
    } catch { Alert.alert('Erreur', 'Erreur réseau'); }
  };

  const handleEmailInvoice = async () => {
    if (!appointment) return;
    const email = (appointment.client_email || '').trim();
    if (!email) {
      Alert.alert('Courriel manquant', 'Ce client n\'a pas de courriel.');
      return;
    }
    const invoiceUrl = `${API_URL}/api/invoice/${appointment.id}`;
    const subject = `Facture — ${appointment.title || 'Service'} — ${appointment.date}`;
    const body = `Bonjour ${appointment.client_name || ''},\n\nVeuillez trouver votre facture ci-jointe:\n${invoiceUrl}\n\nMerci pour votre confiance!`;
    const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) { await Linking.openURL(url); }
      else { Alert.alert('Erreur', 'Aucune app courriel disponible'); }
    } catch { Alert.alert('Erreur', 'Impossible d\'ouvrir l\'app courriel'); }
  };

  const fetchAppointment = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/appointments/${id}`);
      if (res.ok) {
        const data = await res.json();
        setAppointment(data);
      }
    } catch (e) {
      console.error('Failed to fetch appointment', e);
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) { Alert.alert('Permission', 'Microphone requis'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
    } catch (e) { Alert.alert('Erreur', 'Impossible de démarrer l\'enregistrement'); }
  };

  const stopRecording = async () => {
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      setRecordingUri(uri);
      setIsRecording(false);
      Alert.alert('Note vocale enregistrée!', 'Vous pouvez la réécouter.');
    } catch (e) { Alert.alert('Erreur', 'Impossible d\'arrêter'); setIsRecording(false); }
  };

  const playRecording = async () => {
    if (!recordingUri) return;
    try {
      audioPlayer.seekTo(0);
      audioPlayer.play();
    } catch (e) { Alert.alert('Erreur', 'Impossible de lire'); }
  };

  const handleShare = async () => {
    if (!appointment) return;
    try {
      const res = await fetch(`${API_URL}/api/share/appointment/${appointment.id}`);
      const data = await res.json();
      const phone = (appointment.client_phone || '').replace(/\D/g, '');
      if (phone) {
        const sep = Platform.OS === 'ios' ? '&' : '?';
        const url = `sms:${phone}${sep}body=${encodeURIComponent(data.text)}`;
        const can = await Linking.canOpenURL(url);
        if (can) { await Linking.openURL(url); return; }
      }
      // Fallback: native share
      await Share.share({ message: data.text });
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de partager');
    }
  };

  const handleReviewRequest = async () => {
    if (!appointment) return;
    const phone = (appointment.client_phone || '').replace(/\D/g, '');
    if (!phone) {
      Alert.alert('Téléphone manquant', 'Ce client n\'a pas de numéro de téléphone.');
      return;
    }
    const clientName = appointment.client_name || 'Client';
    const reviewUrl = `${API_URL}/api/review-page/${appointment.id}`;
    const msg = `Bonjour ${clientName}, merci pour votre confiance! Nous aimerions avoir votre avis: ${reviewUrl}`;
    try {
      const sep = Platform.OS === 'ios' ? '&' : '?';
      const url = `sms:${phone}${sep}body=${encodeURIComponent(msg)}`;
      const can = await Linking.canOpenURL(url);
      if (can) { await Linking.openURL(url); }
      else { Alert.alert('Erreur', 'SMS non supporté sur cet appareil'); }
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ouvrir SMS');
    }
  };

  const handleRecurrence = () => {
    if (!appointment) return;
    Alert.alert(
      'Récurrence',
      'Créer des rendez-vous récurrents pour ce client?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Tous les 3 mois (x4)', onPress: () => createRecurrence(3, 4) },
        { text: 'Tous les 6 mois (x2)', onPress: () => createRecurrence(6, 2) },
      ]
    );
  };

  const createRecurrence = async (months: number, count: number) => {
    try {
      const res = await fetch(`${API_URL}/api/appointments/recurrence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appointment!.id, interval_months: months, occurrences: count }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Créés!', data.message);
      } else {
        Alert.alert('Erreur', data.detail || 'Échec');
      }
    } catch { Alert.alert('Erreur', 'Erreur réseau'); }
  };

  const handlePrint = () => {
    if (!appointment) return;
    Linking.openURL(`${API_URL}/api/print/appointment/${appointment.id}`);
  };

  const handleDelete = () => {
    Alert.alert('Delete Appointment', 'Are you sure you want to delete this appointment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(`${API_URL}/api/appointments/${id}`, { method: 'DELETE' });
            if (res.ok) {
              router.back();
            }
          } catch (e) {
            Alert.alert('Error', 'Failed to delete');
          }
        },
      },
    ]);
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await fetch(`${API_URL}/api/appointments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setAppointment(data);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleEdit = () => {
    if (!appointment) return;
    router.push({
      pathname: '/create',
      params: {
        editId: appointment.id,
        editTitle: appointment.title,
        editClient: appointment.client_name,
        editEmail: appointment.client_email || '',
        editPhone: appointment.client_phone || '',
        editAddress: appointment.client_address || '',
        editDate: appointment.date,
        editTime: appointment.time_slot,
        editDuration: String(appointment.duration_minutes),
        editPrice: appointment.price ? String(appointment.price) : '',
        editNotes: appointment.notes,
        editStatus: appointment.status,
      },
    });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    if (status === 'completed') return '#34C759';
    if (status === 'cancelled') return '#FF3B30';
    return '#000000';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator testID="detail-loading" size="small" color="#000" style={{ marginTop: 48 }} />
      </SafeAreaView>
    );
  }

  if (!appointment) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity testID="back-button" onPress={() => router.back()} style={styles.headerBtn}>
            <Feather name="arrow-left" size={24} color="#0A0A0A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Not Found</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.emptyState}>
          <Feather name="alert-circle" size={48} color="#E5E5E5" />
          <Text style={styles.emptyTitle}>Appointment not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} testID="detail-screen">
      <AppHeader title="Détails" showBack />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Title & Status */}
        <Text style={styles.title} testID="detail-title">{appointment.title}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { borderColor: getStatusColor(appointment.status) }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(appointment.status) }]} />
            <Text style={[styles.statusBadgeText, { color: getStatusColor(appointment.status) }]}>
              {appointment.status}
            </Text>
          </View>
        </View>

        {/* Info Cards */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Feather name="user" size={18} color="#737373" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>CLIENT</Text>
              <Text style={styles.infoValue} testID="detail-client">{appointment.client_name}</Text>
            </View>
          </View>
        </View>

        {appointment.client_email ? (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Feather name="mail" size={18} color="#737373" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>COURRIEL</Text>
                <Text style={styles.infoValue} testID="detail-email">{appointment.client_email}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {appointment.client_phone ? (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Feather name="phone" size={18} color="#737373" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>TÉLÉPHONE</Text>
                <Text style={styles.infoValue} testID="detail-phone">{appointment.client_phone}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {appointment.client_address ? (
          <TouchableOpacity
            testID="detail-address-link"
            activeOpacity={0.7}
            onPress={() => {
              const address = encodeURIComponent(appointment.client_address);
              Alert.alert('Ouvrir avec', 'Choisissez votre app de navigation', [
                { text: 'Waze', onPress: () => Linking.openURL(`https://waze.com/ul?q=${address}&navigate=yes`) },
                { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${address}`) },
                { text: 'Annuler', style: 'cancel' },
              ]);
            }}
            style={styles.infoCard}
          >
            <View style={styles.infoRow}>
              <Feather name="map-pin" size={18} color="#737373" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>ADRESSE</Text>
                <Text style={[styles.infoValue, { textDecorationLine: 'underline' }]} testID="detail-address">{appointment.client_address}</Text>
              </View>
              <Feather name="navigation" size={18} color="#000000" />
            </View>
          </TouchableOpacity>
        ) : null}

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Feather name="calendar" size={18} color="#737373" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>DATE</Text>
              <Text style={styles.infoValue} testID="detail-date">{formatDate(appointment.date)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Feather name="clock" size={18} color="#737373" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>HEURE & DURÉE</Text>
              <Text style={styles.infoValue} testID="detail-time">{appointment.time_slot} — {appointment.duration_minutes} minutes</Text>
            </View>
          </View>
        </View>

        {appointment.price > 0 ? (
          <View style={[styles.infoCard, { borderColor: '#0891B2' }]}>
            <View style={styles.infoRow}>
              <Feather name="dollar-sign" size={18} color="#0891B2" />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: '#0891B2' }]}>PRIX</Text>
                <Text style={[styles.infoValue, { fontSize: 20, fontWeight: '800', color: '#0891B2' }]} testID="detail-price">{appointment.price.toFixed(2)} $</Text>
              </View>
            </View>
          </View>
        ) : null}

        {appointment.notes ? (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Feather name="file-text" size={18} color="#737373" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>NOTES</Text>
                <Text style={styles.infoValue} testID="detail-notes">{appointment.notes}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Status Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>UPDATE STATUS</Text>
          <View style={styles.statusActions}>
            {appointment.status !== 'completed' && (
              <TouchableOpacity
                testID="mark-completed-button"
                style={[styles.actionBtn, { borderColor: '#34C759' }]}
                activeOpacity={0.7}
                onPress={() => handleStatusChange('completed')}
              >
                <Feather name="check-circle" size={18} color="#34C759" />
                <Text style={[styles.actionBtnText, { color: '#34C759' }]}>Complete</Text>
              </TouchableOpacity>
            )}
            {appointment.status !== 'cancelled' && (
              <TouchableOpacity
                testID="mark-cancelled-button"
                style={[styles.actionBtn, { borderColor: '#FF3B30' }]}
                activeOpacity={0.7}
                onPress={() => handleStatusChange('cancelled')}
              >
                <Feather name="x-circle" size={18} color="#FF3B30" />
                <Text style={[styles.actionBtnText, { color: '#FF3B30' }]}>Cancel</Text>
              </TouchableOpacity>
            )}
            {appointment.status !== 'upcoming' && (
              <TouchableOpacity
                testID="mark-upcoming-button"
                style={[styles.actionBtn, { borderColor: '#000000' }]}
                activeOpacity={0.7}
                onPress={() => handleStatusChange('upcoming')}
              >
                <Feather name="rotate-ccw" size={18} color="#000000" />
                <Text style={[styles.actionBtnText, { color: '#000000' }]}>Reopen</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>OUTILS</Text>
          <View style={styles.statusActions}>
            <TouchableOpacity
              testID="share-button"
              style={[styles.actionBtn, { borderColor: '#0891B2' }]}
              activeOpacity={0.7}
              onPress={handleShare}
            >
              <Feather name="share" size={18} color="#0891B2" />
              <Text style={[styles.actionBtnText, { color: '#0891B2' }]}>Partager</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="recurrence-button"
              style={[styles.actionBtn, { borderColor: '#0891B2' }]}
              activeOpacity={0.7}
              onPress={handleRecurrence}
            >
              <Feather name="repeat" size={18} color="#0891B2" />
              <Text style={[styles.actionBtnText, { color: '#0891B2' }]}>Récurrence</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="invoice-button"
              style={[styles.actionBtn, { borderColor: '#0891B2' }]}
              activeOpacity={0.7}
              onPress={() => Linking.openURL(`${API_URL}/api/invoice/${appointment!.id}`)}
            >
              <Feather name="file-text" size={18} color="#0891B2" />
              <Text style={[styles.actionBtnText, { color: '#0891B2' }]}>Facture</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="email-invoice-button"
              style={[styles.actionBtn, { borderColor: '#059669' }]}
              activeOpacity={0.7}
              onPress={handleEmailInvoice}
            >
              <Feather name="mail" size={18} color="#059669" />
              <Text style={[styles.actionBtnText, { color: '#059669' }]}>Envoyer facture</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="assign-button"
              style={[styles.actionBtn, { borderColor: appointment.assigned_color || '#7C3AED' }]}
              activeOpacity={0.7}
              onPress={handleAssignEmployee}
            >
              <Feather name="user-check" size={18} color={appointment.assigned_color || '#7C3AED'} />
              <Text style={[styles.actionBtnText, { color: appointment.assigned_color || '#7C3AED' }]} numberOfLines={1}>
                {appointment.assigned_to ? appointment.assigned_to : 'Assigner'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="review-request-button"
              style={[styles.actionBtn, { borderColor: '#F59E0B' }]}
              activeOpacity={0.7}
              onPress={handleReviewRequest}
            >
              <Feather name="star" size={18} color="#F59E0B" />
              <Text style={[styles.actionBtnText, { color: '#F59E0B' }]}>Demander avis</Text>
            </TouchableOpacity>
          </View>

          {/* Voice Note */}
          <View style={styles.voiceSection}>
            <TouchableOpacity
              testID="voice-record-button"
              style={[styles.voiceBtn, isRecording && styles.voiceBtnRecording]}
              activeOpacity={0.7}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <Feather name={isRecording ? 'square' : 'mic'} size={20} color={isRecording ? '#FF3B30' : '#0891B2'} />
              <Text style={[styles.voiceBtnText, isRecording && { color: '#FF3B30' }]}>
                {isRecording ? 'Arrêter l\'enregistrement' : 'Note vocale'}
              </Text>
            </TouchableOpacity>
            {recordingUri && (
              <TouchableOpacity
                testID="voice-play-button"
                style={styles.voicePlayBtn}
                activeOpacity={0.7}
                onPress={playRecording}
              >
                <Feather name="play" size={18} color="#0891B2" />
                <Text style={styles.voicePlayText}>Écouter</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Delete */}
        <TouchableOpacity
          testID="delete-button"
          style={styles.deleteBtn}
          activeOpacity={0.7}
          onPress={handleDelete}
        >
          <Feather name="trash-2" size={18} color="#FF3B30" />
          <Text style={styles.deleteBtnText}>Delete Appointment</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
  },
  headerBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0A0A0A',
    letterSpacing: -0.5,
  },
  content: {
    padding: 24,
    paddingBottom: 120,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.8,
  },
  statusRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 28,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoContent: {
    marginLeft: 14,
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A3A3A3',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#0A0A0A',
    lineHeight: 22,
  },
  section: {
    marginTop: 20,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#737373',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  statusActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 4,
    paddingVertical: 14,
    gap: 8,
    marginTop: 8,
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF3B30',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0A0A0A',
    marginTop: 16,
  },
  voiceSection: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  voiceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0891B2',
    borderRadius: 4,
    paddingVertical: 12,
    gap: 8,
  },
  voiceBtnRecording: {
    borderColor: '#FF3B30',
    backgroundColor: '#FFF5F5',
  },
  voiceBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0891B2',
  },
  voicePlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0891B2',
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  voicePlayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0891B2',
  },
});
