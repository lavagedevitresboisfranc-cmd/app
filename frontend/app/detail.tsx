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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useAudioRecorder, useAudioPlayer, RecordingPresets, setAudioModeAsync, requestRecordingPermissionsAsync, AudioModule } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import AppHeader from '../components/AppHeader';
import { wrapSms } from '../src/utils/smsTemplate';

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
  client_photo?: string;
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

  const handleCallClient = () => {
    if (!appointment) return;
    const phone = (appointment.client_phone || '').replace(/[^\d+]/g, '');
    if (!phone) { Alert.alert('Téléphone manquant', 'Ce client n\'a pas de numéro.'); return; }
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Erreur', 'Impossible d\'ouvrir l\'app téléphone'));
  };

  const handleChangeClientPhoto = async () => {
    if (!appointment) return;
    Alert.alert('Photo du client', 'Choisir une source:', [
      { text: 'Caméra', onPress: () => pickClientPhoto('camera') },
      { text: 'Galerie', onPress: () => pickClientPhoto('library') },
      ...(appointment.client_photo ? [{ text: 'Retirer', style: 'destructive' as const, onPress: () => saveClientPhoto('') }] : []),
      { text: 'Annuler', style: 'cancel' as const },
    ]);
  };

  const pickClientPhoto = async (source: 'camera' | 'library') => {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission refusée'); return; }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, allowsEditing: true, aspect: [1, 1], base64: true, mediaTypes: ImagePicker.MediaTypeOptions.Images })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, allowsEditing: true, aspect: [1, 1], base64: true, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!result.canceled && result.assets?.[0]?.base64) {
        const dataUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await saveClientPhoto(dataUri);
      }
    } catch { Alert.alert('Erreur', 'Impossible de charger la photo'); }
  };

  const saveClientPhoto = async (photoData: string) => {
    if (!appointment) return;
    try {
      const res = await fetch(`${API_URL}/api/appointments/${appointment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...appointment, client_photo: photoData }),
      });
      if (res.ok) fetchAppointment();
      else Alert.alert('Erreur', 'Échec sauvegarde photo');
    } catch { Alert.alert('Erreur', 'Erreur réseau'); }
  };

  const openInBrowser = (url: string) => {
    try {
      if (Platform.OS === 'web') {
        // On web/PWA, Linking.openURL gets intercepted by Expo Router → 404.
        // Use window.open in a new tab so the FastAPI HTML page renders properly.
        if (typeof window !== 'undefined' && window.open) {
          window.open(url, '_blank');
          return;
        }
      }
      Linking.openURL(url).catch(() => Alert.alert('Erreur', 'Impossible d\'ouvrir le lien'));
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ouvrir le lien');
    }
  };

  const handleEmailInvoice = async () => {
    if (!appointment) return;
    const email = (appointment.client_email || '').trim();
    if (!email) {
      Alert.alert('Courriel manquant', 'Ce client n\'a pas de courriel.');
      return;
    }

    // Confirmation BEFORE sending
    const confirmTitle = '📧 Envoyer la facture ?';
    const confirmMsg =
      `La facture sera envoyée à :\n` +
      `• ${email}\n\n` +
      `Une copie sera également envoyée en BCC à votre courriel professionnel.`;

    const proceed = async () => {
      try {
        const res = await fetch(`${API_URL}/api/invoice/${appointment.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.detail || 'Échec d\'envoi');
        }
        // Confirmation AFTER sending
        const bccLine = data.bcc ? `\n📬 BCC : ${data.bcc}` : '';
        Alert.alert(
          '✅ Facture envoyée',
          `📧 Destinataire : ${data.to}${bccLine}\n📄 Facture #${data.invoice_num}`
        );
      } catch (e: any) {
        Alert.alert('❌ Erreur', e?.message || 'Envoi impossible');
      }
    };

    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      const ok = window.confirm(`${confirmTitle}\n\n${confirmMsg}`);
      if (ok) await proceed();
    } else {
      Alert.alert(confirmTitle, confirmMsg, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Envoyer', onPress: () => { proceed(); } },
      ]);
    }
  };

  // --- Retard / Replanifier ---
  const _formatTimeForClient = () => {
    if (!appointment) return '';
    const { date, time_slot } = appointment;
    try {
      // Parse YYYY-MM-DD as LOCAL date (not UTC) to avoid timezone shift to previous day
      const [y, m, dd] = String(date).split('-').map((n) => parseInt(n, 10));
      const d = new Date(y, (m || 1) - 1, dd || 1);
      const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
      return `${d.getDate()} ${months[d.getMonth()]} à ${time_slot}`;
    } catch {
      return `${date} à ${time_slot}`;
    }
  };

  const _buildDelayMessage = (minutes: number): { subject: string; body: string } => {
    if (!appointment) return { subject: '', body: '' };
    const name = appointment.client_name || '';
    const when = _formatTimeForClient();
    const delayText = minutes >= 60
      ? `d'environ ${Math.round(minutes / 60)} h${minutes >= 120 ? 'eures' : 'eure'}`
      : `d'environ ${minutes} minutes`;
    const subject = `Léger retard — ${_formatTimeForClient()}`;
    const body = `Bonjour ${name},\n\nJe vous écris pour vous informer que je serai en retard ${delayText} pour notre rendez-vous prévu le ${when}.\n\nToutes mes excuses pour l'inconvénient. Je vous préviens dès que je suis en route.\n\nMerci de votre compréhension!`;
    return { subject, body };
  };

  const _buildRescheduleMessage = (): { subject: string; body: string } => {
    if (!appointment) return { subject: '', body: '' };
    const name = appointment.client_name || '';
    const when = _formatTimeForClient();
    const subject = `Reporter votre rendez-vous — ${_formatTimeForClient()}`;
    const body = `Bonjour ${name},\n\nMalheureusement, je dois reporter notre rendez-vous prévu le ${when}.\n\nQuelles sont vos disponibilités dans les prochains jours? Dites-moi votre préférence et je fais de mon mieux pour m'adapter.\n\nMerci de votre compréhension!`;
    return { subject, body };
  };

  const _sendSms = async (message: string) => {
    if (!appointment) return;
    const phone = (appointment.client_phone || '').replace(/\D/g, '');
    if (!phone) {
      Alert.alert('Téléphone manquant', 'Ce client n\'a pas de numéro de téléphone.');
      return;
    }
    const sep = Platform.OS === 'ios' ? '&' : '?';
    const wrappedMessage = wrapSms(message);
    const url = `sms:${phone}${sep}body=${encodeURIComponent(wrappedMessage)}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) { await Linking.openURL(url); }
      else {
        // Fallback on web: copy to clipboard
        Alert.alert('SMS non disponible', 'Envoyez ce message manuellement depuis votre téléphone.\n\n' + message.slice(0, 200));
      }
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ouvrir l\'app SMS.');
    }
  };

  const _sendEmail = async (subject: string, body: string) => {
    if (!appointment) return;
    const email = (appointment.client_email || '').trim();
    if (!email) {
      Alert.alert('Courriel manquant', 'Ce client n\'a pas d\'adresse courriel.');
      return;
    }
    const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) { await Linking.openURL(url); }
      else { Alert.alert('Erreur', 'Aucune app courriel disponible.'); }
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ouvrir l\'app courriel.');
    }
  };

  const handleDelay = (channel: 'sms' | 'email') => {
    // Step 1: choose delay duration
    const presets: { label: string; minutes: number }[] = [
      { label: '⏱️ 15 minutes', minutes: 15 },
      { label: '⏱️ 30 minutes', minutes: 30 },
      { label: '⏱️ 1 heure', minutes: 60 },
      { label: '⏱️ 2 heures', minutes: 120 },
    ];
    const send = (minutes: number) => {
      const { subject, body } = _buildDelayMessage(minutes);
      if (channel === 'sms') {
        _sendSms(body);
      } else {
        _sendEmail(subject, body);
      }
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      const input = window.prompt('Retard de combien de minutes ?\n(15, 30, 60, 120, ou tout autre nombre)', '30');
      if (!input) return;
      const m = parseInt(input, 10);
      if (!isNaN(m) && m > 0) send(m);
    } else {
      Alert.alert(
        'Retard — durée approximative',
        `Quel retard prévoyez-vous pour ${appointment?.client_name} ?`,
        [
          ...presets.map((p) => ({ text: p.label, onPress: () => send(p.minutes) })),
          { text: 'Annuler', style: 'cancel' as const },
        ],
        { cancelable: true }
      );
    }
  };

  const handleReschedule = (channel: 'sms' | 'email') => {
    const { subject, body } = _buildRescheduleMessage();
    if (channel === 'sms') {
      _sendSms(body);
    } else {
      _sendEmail(subject, body);
    }
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
        const url = `sms:${phone}${sep}body=${encodeURIComponent(wrapSms(data.text))}`;
        const can = await Linking.canOpenURL(url);
        if (can) { await Linking.openURL(url); return; }
      }
      // Fallback: native share
      await Share.share({ message: data.text });
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de partager');
    }
  };

  // Native share (opens iOS share sheet with AirDrop, WhatsApp, etc.)
  const handleAirDrop = async () => {
    if (!appointment) return;
    try {
      const res = await fetch(`${API_URL}/api/share/appointment/${appointment.id}`);
      const data = await res.json();
      const invoiceUrl = `${API_URL}/api/invoice/${appointment.id}`;
      await Share.share({
        message: `${data.text}\n\n📄 Facture: ${invoiceUrl}`,
        url: invoiceUrl, // iOS uses this for AirDrop link preview
        title: `Facture — ${appointment.title || 'Service'}`,
      });
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
      const url = `sms:${phone}${sep}body=${encodeURIComponent(wrapSms(msg))}`;
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
    openInBrowser(`${API_URL}/api/print/appointment/${appointment.id}`);
  };

  const handleDelete = () => {
    const doDelete = async () => {
      try {
        const res = await fetch(`${API_URL}/api/appointments/${id}`, { method: 'DELETE' });
        if (res.ok) {
          // Navigate to home page (more reliable than back() — works even with empty history stack)
          if (Platform.OS === 'web') {
            // On web, show a quick success hint via console (alerts would block navigation)
            try { router.replace('/' as any); } catch { router.push('/' as any); }
          } else {
            Alert.alert('✅ Rendez-vous archivé', 'Il est maintenant dans les Archives RDV et peut être restauré à tout moment.', [
              { text: 'OK', onPress: () => { try { router.replace('/' as any); } catch { router.push('/' as any); } } },
            ]);
          }
        } else {
          const errText = await res.text().catch(() => '');
          Alert.alert('Erreur', `L'archivage a échoué (${res.status}).\n${errText.slice(0, 120)}`);
        }
      } catch (e: any) {
        Alert.alert('Erreur réseau', e?.message || "L'archivage a échoué. Vérifiez votre connexion.");
      }
    };
    if (Platform.OS === 'web') {
      // React Native Alert buttons are not fully supported on web → fallback to native confirm
      // eslint-disable-next-line no-alert
      if (window.confirm('Archiver ce rendez-vous ?\n\nIl sera masqué du calendrier mais pourra être restauré depuis les Archives.')) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Archiver le rendez-vous',
        'Il sera masqué du calendrier mais pourra être restauré depuis les Archives.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Archiver', style: 'destructive', onPress: doDelete },
        ],
        { cancelable: true }
      );
    }
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

        {/* Client Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            testID="client-photo-btn"
            style={styles.avatarWrap}
            activeOpacity={0.8}
            onPress={handleChangeClientPhoto}
          >
            {appointment.client_photo ? (
              <Image source={{ uri: appointment.client_photo }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Feather name="camera" size={28} color="#0891B2" />
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Feather name="edit-2" size={10} color="#FFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarName}>{appointment.client_name}</Text>
          <Text style={styles.avatarHint}>Tapez pour ajouter/modifier la photo</Text>
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
          <TouchableOpacity
            testID="call-client-btn"
            style={[styles.infoCard, { borderColor: '#10B981', borderWidth: 1 }]}
            activeOpacity={0.7}
            onPress={handleCallClient}
          >
            <View style={styles.infoRow}>
              <Feather name="phone" size={18} color="#10B981" />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: '#10B981' }]}>TÉLÉPHONE — APPUYEZ POUR APPELER</Text>
                <Text style={[styles.infoValue, { color: '#10B981', fontWeight: '700' }]} testID="detail-phone">{appointment.client_phone}</Text>
              </View>
              <Feather name="phone-call" size={20} color="#10B981" />
            </View>
          </TouchableOpacity>
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

        {/* Quick Actions — Organized by category */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>OUTILS</Text>

          {/* 💰 FACTURATION */}
          <Text style={styles.toolGroupTitle}>💰 Facturation</Text>
          <View style={styles.toolGrid}>
            <TouchableOpacity
              testID="invoice-button"
              style={[styles.toolBtn, { borderColor: '#0891B2' }]}
              activeOpacity={0.7}
              onPress={() => openInBrowser(`${API_URL}/api/invoice/${appointment!.id}`)}
            >
              <Feather name="file-text" size={20} color="#0891B2" />
              <Text style={[styles.toolBtnText, { color: '#0891B2' }]}>Facture PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="email-invoice-button"
              style={[styles.toolBtn, { borderColor: '#059669' }]}
              activeOpacity={0.7}
              onPress={handleEmailInvoice}
            >
              <Feather name="mail" size={20} color="#059669" />
              <Text style={[styles.toolBtnText, { color: '#059669' }]}>Envoyer facture</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="sms-invoice-button"
              style={[styles.toolBtn, { borderColor: '#10B981' }]}
              activeOpacity={0.7}
              onPress={() => {
                if (!appointment) return;
                const phone = (appointment.client_phone || '').replace(/\D/g, '');
                if (!phone) {
                  Alert.alert('Téléphone manquant', 'Ce client n\'a pas de numéro.');
                  return;
                }
                const invoiceUrl = `${API_URL}/api/invoice/${appointment.id}`;
                const msg = `Bonjour ${appointment.client_name || ''},\n\nVoici votre facture: ${invoiceUrl}\n\nMerci pour votre confiance!`;
                _sendSms(msg);
              }}
            >
              <Feather name="message-square" size={20} color="#10B981" />
              <Text style={[styles.toolBtnText, { color: '#10B981' }]}>SMS facture</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="review-request-button"
              style={[styles.toolBtn, { borderColor: '#F59E0B' }]}
              activeOpacity={0.7}
              onPress={handleReviewRequest}
            >
              <Feather name="star" size={20} color="#F59E0B" />
              <Text style={[styles.toolBtnText, { color: '#F59E0B' }]}>Demander avis</Text>
            </TouchableOpacity>
          </View>

          {/* 🔄 PLANIFICATION */}
          <Text style={styles.toolGroupTitle}>🔄 Planification</Text>
          <View style={styles.toolGrid}>
            <TouchableOpacity
              testID="recurrence-button"
              style={[styles.toolBtn, { borderColor: '#0891B2' }]}
              activeOpacity={0.7}
              onPress={handleRecurrence}
            >
              <Feather name="repeat" size={20} color="#0891B2" />
              <Text style={[styles.toolBtnText, { color: '#0891B2' }]}>Récurrence</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="assign-button"
              style={[styles.toolBtn, { borderColor: appointment.assigned_color || '#7C3AED' }]}
              activeOpacity={0.7}
              onPress={handleAssignEmployee}
            >
              <Feather name="user-check" size={20} color={appointment.assigned_color || '#7C3AED'} />
              <Text style={[styles.toolBtnText, { color: appointment.assigned_color || '#7C3AED' }]} numberOfLines={1}>
                {appointment.assigned_to ? appointment.assigned_to : 'Assigner'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 📤 PARTAGE */}
          <Text style={styles.toolGroupTitle}>📤 Partage & Notes</Text>
          <View style={styles.toolGrid}>
            <TouchableOpacity
              testID="share-button"
              style={[styles.toolBtn, { borderColor: '#0891B2' }]}
              activeOpacity={0.7}
              onPress={handleShare}
            >
              <Feather name="share-2" size={20} color="#0891B2" />
              <Text style={[styles.toolBtnText, { color: '#0891B2' }]}>Partager</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="airdrop-button"
              style={[styles.toolBtn, { borderColor: '#000000', backgroundColor: '#F5F5F7' }]}
              activeOpacity={0.7}
              onPress={handleAirDrop}
            >
              <Feather name="send" size={20} color="#000000" />
              <Text style={[styles.toolBtnText, { color: '#000000' }]}>AirDrop</Text>
            </TouchableOpacity>
          </View>

          {/* ⏰ Retard / Replanifier */}
          <Text style={styles.toolGroupTitle}>⏰ Retard / Replanifier</Text>
          <View style={styles.toolGrid}>
            <TouchableOpacity
              testID="delay-sms-button"
              style={[styles.toolBtn, { borderColor: '#F59E0B', backgroundColor: '#FEF3C7' }]}
              activeOpacity={0.7}
              onPress={() => handleDelay('sms')}
            >
              <Feather name="message-circle" size={20} color="#B45309" />
              <Text style={[styles.toolBtnText, { color: '#B45309' }]}>SMS retard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="delay-email-button"
              style={[styles.toolBtn, { borderColor: '#F59E0B', backgroundColor: '#FEF3C7' }]}
              activeOpacity={0.7}
              onPress={() => handleDelay('email')}
            >
              <Feather name="mail" size={20} color="#B45309" />
              <Text style={[styles.toolBtnText, { color: '#B45309' }]}>Email retard</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.toolGrid}>
            <TouchableOpacity
              testID="reschedule-sms-button"
              style={[styles.toolBtn, { borderColor: '#7C3AED', backgroundColor: '#F5F3FF' }]}
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/propose-alternatives', params: { id: appointment!.id } } as any)}
            >
              <Feather name="message-circle" size={20} color="#6D28D9" />
              <Text style={[styles.toolBtnText, { color: '#6D28D9' }]}>Proposer 3 alternatives (SMS)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="reschedule-email-button"
              style={[styles.toolBtn, { borderColor: '#7C3AED', backgroundColor: '#F5F3FF' }]}
              activeOpacity={0.7}
              onPress={() => handleReschedule('email')}
            >
              <Feather name="mail" size={20} color="#6D28D9" />
              <Text style={[styles.toolBtnText, { color: '#6D28D9' }]}>Email replanifier</Text>
            </TouchableOpacity>
          </View>

          {/* 🎤 Note Vocale — full width, distinct */}
          <View style={styles.voiceSection}>
            <TouchableOpacity
              testID="voice-record-button"
              style={[styles.voiceBtn, isRecording && styles.voiceBtnRecording]}
              activeOpacity={0.7}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <Feather name={isRecording ? 'square' : 'mic'} size={20} color={isRecording ? '#FF3B30' : '#0891B2'} />
              <Text style={[styles.voiceBtnText, isRecording && { color: '#FF3B30' }]}>
                {isRecording ? 'Arrêter l\'enregistrement' : '🎤 Note vocale'}
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

        {/* Reprogrammer + Modifier + Archiver */}
        <View style={styles.editSection}>
          <TouchableOpacity
            testID="reschedule-button"
            style={[styles.editBtn, { backgroundColor: '#0891B2', marginBottom: 10 }]}
            activeOpacity={0.7}
            onPress={() => {
              if (!appointment) return;
              router.push({
                pathname: '/reschedule',
                params: { id: appointment.id },
              } as any);
            }}
          >
            <Feather name="calendar" size={18} color="#FFFFFF" />
            <Text style={styles.editBtnText}>Reprogrammer (voir créneaux libres)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="edit-button"
            style={styles.editBtn}
            activeOpacity={0.7}
            onPress={handleEdit}
          >
            <Feather name="edit-3" size={18} color="#FFFFFF" />
            <Text style={styles.editBtnText}>Modifier ce rendez-vous</Text>
          </TouchableOpacity>
        </View>

        {/* Archiver */}
        <View style={styles.deleteSection}>
          <TouchableOpacity
            testID="delete-button"
            style={styles.deleteBtn}
            activeOpacity={0.7}
            onPress={handleDelete}
          >
            <Feather name="trash-2" size={18} color="#FF3B30" />
            <Text style={styles.deleteBtnText}>Archiver ce rendez-vous</Text>
          </TouchableOpacity>
        </View>
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
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatarWrap: { position: 'relative' },
  avatarImg: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#F5F5F5' },
  avatarPlaceholder: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#F0F9FF',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#0891B2', borderStyle: 'dashed',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#0891B2',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FAFAFA',
  },
  avatarName: { fontSize: 18, fontWeight: '700', color: '#0A0A0A', marginTop: 10 },
  avatarHint: { fontSize: 11, color: '#A3A3A3', marginTop: 2 },
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
  // Professional tool organization
  toolGroupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginTop: 16,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toolBtn: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 68,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
    backgroundColor: '#FFF',
  },
  toolBtnText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  deleteSection: {
    marginTop: 12,
    paddingTop: 8,
  },
  editSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0891B2',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  editBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FF3B30',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: '700',
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
