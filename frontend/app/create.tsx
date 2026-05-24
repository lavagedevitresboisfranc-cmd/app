import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { useAudioRecorder, RecordingPresets, setAudioModeAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import * as Location from 'expo-location';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const TITLE_OPTIONS = [
  'Intérieur et extérieur',
  'Extérieur seulement',
  'Intérieur seulement',
  'Extérieur sans balcon',
];

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00',
];

const DURATIONS = [30, 90, 120, 180, 210];

export default function CreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    editId?: string;
    editTitle?: string;
    editClient?: string;
    editEmail?: string;
    editPhone?: string;
    editAddress?: string;
    propose?: string;
    editDate?: string;
    editTime?: string;
    editDuration?: string;
    editNotes?: string;
    editPrice?: string;
    editStatus?: string;
  }>();

  const isEditing = !!params.editId;

  const [title, setTitle] = useState(params.editTitle || '');
  const [gettingLocation, setGettingLocation] = useState(false);

  // Cross-platform alert: Alert.alert is silently broken on web/PWA
  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const getCurrentLocation = async () => {
    if (Platform.OS === 'web') {
      console.log('[GPS] Button tapped, checking geolocation availability...');
      console.log('[GPS] navigator.geolocation available:', typeof navigator !== 'undefined' && !!navigator.geolocation);
      console.log('[GPS] window.isSecureContext:', typeof window !== 'undefined' && window.isSecureContext);
    }
    setGettingLocation(true);
    try {
      // On web/PWA, expo-location is unreliable on iOS Safari PWA — use browser API directly
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
        if (typeof window !== 'undefined' && !window.isSecureContext) {
          showAlert('GPS bloqué', 'La géolocalisation requiert une connexion sécurisée (HTTPS). Cette page ne semble pas être servie en HTTPS.');
          setGettingLocation(false);
          return;
        }
        // Race the geolocation against a hard 20s timeout (iOS 17/18 PWA can hang silently)
        const coords: { latitude: number; longitude: number } = await Promise.race([
          new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                console.log('[GPS] Success:', pos.coords.latitude, pos.coords.longitude);
                resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
              },
              (err) => {
                console.error('[GPS] Error:', err.code, err.message);
                reject(err);
              },
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
            );
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(Object.assign(new Error('Délai dépassé (20s)'), { code: 3 })), 20000)
          ),
        ]);
        // Reverse-geocode using OpenStreetMap (no API key required)
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1&accept-language=fr&lat=${coords.latitude}&lon=${coords.longitude}`,
          { headers: { 'Accept': 'application/json' } }
        );
        if (r.ok) {
          const j = await r.json();
          const a = j.address || {};
          const street = [a.house_number, a.road].filter(Boolean).join(' ');
          const parts = [street, a.city || a.town || a.village || a.municipality, a.state, a.postcode].filter(Boolean).join(', ');
          if (parts) {
            setClientAddress(parts);
            console.log('[GPS] Address set:', parts);
          } else if (j.display_name) {
            setClientAddress(j.display_name);
          } else {
            showAlert('Introuvable', 'Adresse non trouvée pour ces coordonnées.');
          }
        } else {
          showAlert('Erreur', 'Service de géocodage indisponible (OpenStreetMap).');
        }
        setGettingLocation(false);
        return;
      }

      // Native (iOS/Android via Expo Go or built app)
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission refusée', 'Accès à la localisation requis.');
        setGettingLocation(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      const places = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      if (places && places.length > 0) {
        const p = places[0];
        const street = [p.streetNumber, p.street].filter(Boolean).join(' ');
        const parts = [street, p.city || p.subregion, p.region, p.postalCode].filter(Boolean).join(', ');
        setClientAddress(parts);
      } else {
        showAlert('Introuvable', 'Impossible de trouver votre adresse');
      }
    } catch (e: any) {
      // PositionError codes: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
      const code = e?.code;
      let title = 'Erreur GPS';
      let msg = e?.message || 'Impossible d\'obtenir votre position';
      if (Platform.OS === 'web' && code === 1) {
        title = 'Localisation refusée';
        msg = 'Pour activer la localisation sur iPhone:\n\n' +
              '1. Ouvrez Réglages iPhone\n' +
              '2. Confidentialité et sécurité → Service de localisation\n' +
              '3. Trouvez Safari (ou Gexia360 si visible) → Autoriser\n' +
              '4. Rechargez l\'app et réessayez';
      } else if (Platform.OS === 'web' && code === 2) {
        title = 'Position indisponible';
        msg = 'GPS indisponible. Vérifiez que la localisation iPhone est activée et réessayez près d\'une fenêtre ou à l\'extérieur.';
      } else if (Platform.OS === 'web' && code === 3) {
        title = 'Délai dépassé';
        msg = 'La position met trop de temps à arriver. Réessayez à l\'extérieur ou avec une meilleure connexion. Si vous êtes en PWA, essayez aussi dans Safari classique.';
      }
      console.error('[GPS] Final error:', title, msg);
      showAlert(title, msg);
    } finally {
      setGettingLocation(false);
    }
  };
  const [clientName, setClientName] = useState(params.editClient || '');
  const [clientEmail, setClientEmail] = useState(params.editEmail || '');
  const [clientPhone, setClientPhone] = useState(params.editPhone || '');
  const [clientAddress, setClientAddress] = useState(params.editAddress || '');
  const [date, setDate] = useState(params.editDate || new Date().toISOString().split('T')[0]);
  const [timeSlot, setTimeSlot] = useState(params.editTime || '');
  const [duration, setDuration] = useState(Number(params.editDuration) || 30);
  const [notes, setNotes] = useState(params.editNotes || '');
  const [price, setPrice] = useState(params.editPrice || '');
  const [saving, setSaving] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const voiceRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Fetch already-booked slots for the selected date so we can grey them out
  const [busySlots, setBusySlots] = useState<Set<string>>(new Set());
  // Full appointment objects for the selected date (to display client names)
  const [dayAppointments, setDayAppointments] = useState<any[]>([]);

  // === Fetch ALL upcoming appointments — so the calendar can show a dot
  // on every day that already has at least one booking. ===
  const [bookedDates, setBookedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const loadBookedDates = async () => {
      try {
        const r = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/appointments`);
        const items = await r.json();
        if (!Array.isArray(items) || cancelled) return;
        const dates = new Set<string>();
        for (const a of items) {
          if (a.status === 'archived' || a.status === 'cancelled') continue;
          if (params.editId && a.id === params.editId) continue;
          if (a.date) dates.add(a.date);
        }
        setBookedDates(dates);
      } catch { /* ignore */ }
    };
    loadBookedDates();
    return () => { cancelled = true; };
  }, [params.editId]);

  useEffect(() => {
    let cancelled = false;
    const loadBusy = async () => {
      if (!date) {
        setBusySlots(new Set());
        setDayAppointments([]);
        return;
      }
      try {
        const r = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/appointments?date=${date}`);
        const items = await r.json();
        if (!Array.isArray(items)) return;
        const taken = new Set<string>();
        const dayList: any[] = [];
        const slotToMin = (s: string) => {
          const [h, m] = (s || '0:0').split(':').map((n) => parseInt(n, 10) || 0);
          return h * 60 + m;
        };
        for (const a of items) {
          if (a.status === 'archived' || a.status === 'cancelled') continue;
          // Skip the current item being edited (if any)
          if (params.editId && a.id === params.editId) continue;
          if (!a.time_slot) continue;
          const t = a.time_slot.slice(0, 5);
          // Block ALL 30-min sub-slots that this appointment overlaps
          const start = slotToMin(t);
          const dur = Math.max(30, parseInt(a.duration_minutes, 10) || 60);
          const end = start + dur;
          for (let m = start; m < end; m += 30) {
            const hh = String(Math.floor(m / 60)).padStart(2, '0');
            const mm = String(m % 60).padStart(2, '0');
            taken.add(`${hh}:${mm}`);
          }
          dayList.push(a);
        }
        dayList.sort((x, y) => (x.time_slot || '').localeCompare(y.time_slot || ''));
        if (!cancelled) {
          setBusySlots(taken);
          setDayAppointments(dayList);
        }
      } catch { /* ignore */ }
    };
    loadBusy();
    return () => { cancelled = true; };
  }, [date, params.editId]);

  const startVoice = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) { Alert.alert('Permission', 'Microphone requis'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await voiceRecorder.prepareToRecordAsync();
      voiceRecorder.record();
      setVoiceRecording(true);
      setIsVoiceRecording(true);
    } catch (e) { Alert.alert('Erreur', 'Micro non disponible'); }
  };

  const stopVoice = async () => {
    if (!voiceRecording) return;
    setIsVoiceRecording(false);
    setTranscribing(true);
    try {
      await voiceRecorder.stop();
      const uri = voiceRecorder.uri;
      setVoiceRecording(false);
      if (!uri) { setTranscribing(false); return; }

      // Upload to backend for transcription
      const formData = new FormData();
      formData.append('file', { uri, name: 'voice.m4a', type: 'audio/m4a' } as any);
      const res = await fetch(`${API_URL}/api/transcribe`, { method: 'POST', body: formData });
      const data = await res.json();

      if (res.ok && data.text) {
        // Try to parse the text into fields
        const text = data.text;
        setNotes(text);
        // Try to extract name if it mentions common patterns
        const nameMatch = text.match(/(?:client|nom|name|pour|chez)\s*[:\s]+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)*)/i);
        if (nameMatch) setClientName(nameMatch[1].trim());
        Alert.alert('Transcription', data.text);
      } else {
        Alert.alert('Erreur', data.detail || 'Transcription échouée');
      }
    } catch (e) {
      Alert.alert('Erreur', 'Erreur de transcription');
    } finally {
      setTranscribing(false);
    }
  };

  // Helper: after saving, prompt to sync contact changes to the Client DB
  const maybeSyncClientDb = async () => {
    if (!isEditing) return; // only for edits
    // Only ask if at least one of address/email/phone changed
    const origEmail = (params.editEmail || '').trim();
    const origPhone = (params.editPhone || '').trim();
    const origAddress = (params.editAddress || '').trim();
    const newEmail = clientEmail.trim();
    const newPhone = clientPhone.trim();
    const newAddress = clientAddress.trim();

    const changes: Array<{ field: string; label: string; from: string; to: string; key: 'email' | 'phone' | 'address' }> = [];
    if (newEmail !== origEmail) changes.push({ field: 'email', label: 'Courriel', from: origEmail || '(vide)', to: newEmail || '(vide)', key: 'email' });
    if (newPhone !== origPhone) changes.push({ field: 'phone', label: 'Téléphone', from: origPhone || '(vide)', to: newPhone || '(vide)', key: 'phone' });
    if (newAddress !== origAddress) changes.push({ field: 'address', label: 'Adresse', from: origAddress || '(vide)', to: newAddress || '(vide)', key: 'address' });

    if (changes.length === 0) return; // nothing to sync

    // Find matching client in the CRM DB (by email → phone → name)
    try {
      const matchRes = await fetch(`${API_URL}/api/clients-db/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clientName.trim(),
          email: origEmail,       // match using ORIGINAL values first
          phone: origPhone,
        }),
      });
      if (!matchRes.ok) return;
      const match = await matchRes.json();
      if (!match.matched || !match.client) return; // no client found → skip silently

      const client = match.client;
      const summary = changes.map(c => `• ${c.label}: ${c.from} → ${c.to}`).join('\n');

      const applyUpdate = async () => {
        try {
          const body: any = {};
          if (newEmail !== origEmail) body.email = newEmail;
          if (newPhone !== origPhone) body.phone = newPhone;
          if (newAddress !== origAddress) body.address = newAddress;
          const r = await fetch(`${API_URL}/api/clients-db/${client.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!r.ok) {
            Alert.alert('Erreur', 'La mise à jour de la fiche client a échoué.');
          }
        } catch {
          Alert.alert('Erreur', "Impossible de synchroniser la fiche client.");
        }
      };

      // Ask user for permission
      const title = '🔄 Synchroniser avec la fiche client ?';
      const message = `"${client.name}" existe dans votre Base Clients.\n\nVoulez-vous aussi y appliquer ces modifications ?\n\n${summary}`;

      return await new Promise<void>((resolve) => {
        if (Platform.OS === 'web') {
          // eslint-disable-next-line no-alert
          if (window.confirm(`${title}\n\n${message}`)) {
            applyUpdate().finally(() => resolve());
          } else {
            resolve();
          }
        } else {
          Alert.alert(title, message, [
            { text: 'Non', style: 'cancel', onPress: () => resolve() },
            { text: 'Oui, synchroniser', style: 'default', onPress: () => applyUpdate().finally(() => resolve()) },
          ]);
        }
      });
    } catch (e) {
      console.error('Client sync check failed', e);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title');
      return;
    }
    if (!clientName.trim()) {
      Alert.alert('Required', 'Please enter a client name');
      return;
    }
    if (!timeSlot) {
      Alert.alert('Required', 'Please select a time slot');
      return;
    }

    Keyboard.dismiss();
    setSaving(true);

    try {
      const body = {
        title: title.trim(),
        client_name: clientName.trim(),
        client_email: clientEmail.trim(),
        client_phone: clientPhone.trim(),
        client_address: clientAddress.trim(),
        date,
        time_slot: timeSlot,
        duration_minutes: duration,
        price: price ? parseFloat(price) : 0,
        notes: notes.trim(),
        status: params.editStatus || 'upcoming',
      };

      const url = isEditing
        ? `${API_URL}/api/appointments/${params.editId}`
        : `${API_URL}/api/appointments`;

      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        // If editing and contact info changed, ask to sync the Client DB
        await maybeSyncClientDb();

        // For NEW appointments: ask if owner wants to send a confirmation
        // email + SMS to the client (with Confirm / Suggest-other buttons).
        // When opened from "Proposer un RDV" (propose=1), ask the user which
        // channel(s) to use: Courriel only, SMS only, or both.
        if (!isEditing) {
          const created = await res.json().catch(() => null);
          const newId = created?.id;
          const autoPropose = params.propose === '1';
          if (newId) {
            const askConfirm = (msg: string) =>
              Platform.OS === 'web'
                ? Promise.resolve(window.confirm(msg))
                : new Promise<boolean>((resolve) => {
                    Alert.alert(
                      'Envoyer confirmation au client?',
                      msg,
                      [
                        { text: 'Non', style: 'cancel', onPress: () => resolve(false) },
                        { text: 'Oui', style: 'default', onPress: () => resolve(true) },
                      ],
                      { cancelable: true }
                    );
                  });

            // For propose=1: ask which channel(s); for normal new RDV: single yes/no
            let sendEmail = false;
            let sendSMS = false;
            if (autoPropose) {
              sendEmail = !!clientEmail && await askConfirm(
                `📧 Envoyer COURRIEL à ${clientName.trim()} (${clientEmail}) avec boutons "Confirmer / Proposer autre créneau" ?`
              );
              sendSMS = !!clientPhone && await askConfirm(
                `📱 Envoyer SMS à ${clientName.trim()} (${clientPhone}) avec boutons "Confirmer / Proposer autre créneau" ?`
              );
              if (!sendEmail && !sendSMS) {
                // User declined both — skip send entirely
                try { router.replace('/' as any); } catch { router.push('/' as any); }
                return;
              }
            } else {
              const ok = await askConfirm(
                `Envoyer un courriel + SMS à ${clientName.trim()} avec les boutons:\n\n✅ Confirmer\n🔄 Proposer un autre créneau\n\n(Vous serez notifié de sa réponse)`
              );
              sendEmail = ok && !!clientEmail;
              sendSMS = ok && !!clientPhone;
            }

            if (sendEmail || sendSMS) {
              try {
                // Backend endpoint sends email AND returns sms_body; we conditionally
                // skip the email by passing skip_email=1 if user wants SMS-only.
                const qs = sendEmail ? '' : '?skip_email=1';
                const cr = await fetch(`${API_URL}/api/appointments/${newId}/send-client-confirmation${qs}`, { method: 'POST' });
                const data = await cr.json();
                // If SMS requested and we have a phone + body, open Messages
                const phone = (clientPhone || '').replace(/\D/g, '');
                if (sendSMS && phone && data?.sms_body) {
                  const url = `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(data.sms_body)}`;
                  if (Platform.OS === 'web') {
                    window.open(url, '_blank');
                  } else {
                    Linking.openURL(url).catch(() => {});
                  }
                }
                const parts: string[] = [];
                if (sendEmail && data?.email_sent) parts.push(`✅ Courriel envoyé à ${data.client_email}`);
                if (sendSMS && phone) parts.push('📱 SMS ouvert dans Messages');
                if (parts.length > 0) {
                  const msg = parts.join('\n');
                  if (Platform.OS === 'web') window.alert(msg);
                  else Alert.alert('Confirmation', msg);
                }
              } catch (e) {
                console.error('send-client-confirmation failed', e);
              }
            }
          }
        }

        // Robust navigation (works even with empty history stack)
        try { router.replace('/' as any); } catch { router.push('/' as any); }
      } else {
        Alert.alert('Error', 'Failed to save appointment');
      }
    } catch (e) {
      Alert.alert('Error', 'Network error');
    } finally {
      setSaving(false);
    }
  };

  // Simple date picker: prev/next day
  const changeDate = (offset: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setDate(d.toISOString().split('T')[0]);
  };

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.safeArea} testID="create-screen">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity
            testID="back-button"
            onPress={() => router.back()}
            activeOpacity={0.7}
            style={styles.headerBtn}
          >
            <Feather name="x" size={24} color="#0A0A0A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? 'Modifier' : 'Nouveau Rendez-vous'}</Text>
          <TouchableOpacity
            testID="save-button"
            onPress={handleSave}
            activeOpacity={0.7}
            style={styles.saveBtn}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {/* Voice Dictation */}
          <TouchableOpacity
            testID="voice-dictation-button"
            style={[styles.voiceDictBtn, isVoiceRecording && styles.voiceDictBtnActive]}
            activeOpacity={0.7}
            onPress={isVoiceRecording ? stopVoice : startVoice}
            disabled={transcribing}
          >
            {transcribing ? (
              <>
                <ActivityIndicator size="small" color="#0891B2" />
                <Text style={styles.voiceDictText}>Transcription en cours...</Text>
              </>
            ) : (
              <>
                <Feather name={isVoiceRecording ? 'square' : 'mic'} size={22} color={isVoiceRecording ? '#FF3B30' : '#FFFFFF'} />
                <Text style={[styles.voiceDictText, isVoiceRecording && { color: '#FF3B30' }]}>
                  {isVoiceRecording ? 'Appuyez pour arrêter...' : 'Dicter les infos du client'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Title - Type de service */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>TYPE DE SERVICE</Text>
            <View style={styles.chipsRow}>
              {TITLE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  testID={`title-chip-${opt}`}
                  style={[styles.chip, title === opt && styles.chipActive]}
                  activeOpacity={0.7}
                  onPress={() => setTitle(opt)}
                >
                  <Text style={[styles.chipText, title === opt && styles.chipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              testID="title-input"
              style={[styles.input, { marginTop: 8 }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Ou écrire un titre personnalisé..."
              placeholderTextColor="#A3A3A3"
            />
          </View>

          {/* Client */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>NOM DU CLIENT</Text>
            <TextInput
              testID="client-input"
              style={styles.input}
              value={clientName}
              onChangeText={setClientName}
              placeholder="ex. Alice Martin"
              placeholderTextColor="#A3A3A3"
            />
          </View>

          {/* Phone */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>TÉLÉPHONE</Text>
            <TextInput
              testID="phone-input"
              style={styles.input}
              value={clientPhone}
              onChangeText={setClientPhone}
              placeholder="ex. 514-555-1234"
              placeholderTextColor="#A3A3A3"
              keyboardType="phone-pad"
            />
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>COURRIEL</Text>
            <TextInput
              testID="email-input"
              style={styles.input}
              value={clientEmail}
              onChangeText={setClientEmail}
              placeholder="ex. alice@exemple.com"
              placeholderTextColor="#A3A3A3"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Address */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>ADRESSE</Text>
              <TouchableOpacity
                testID="geolocate-btn"
                style={styles.geoBtn}
                activeOpacity={0.7}
                onPress={getCurrentLocation}
                disabled={gettingLocation}
              >
                {gettingLocation ? (
                  <ActivityIndicator size="small" color="#0891B2" />
                ) : (
                  <>
                    <Feather name="map-pin" size={14} color="#0891B2" />
                    <Text style={styles.geoBtnText}>Ma position</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            <TextInput
              testID="address-input"
              style={styles.input}
              value={clientAddress}
              onChangeText={setClientAddress}
              placeholder="ex. 123 Rue Principale, Bois-Franc"
              placeholderTextColor="#A3A3A3"
              multiline
            />
          </View>

          {/* Date */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>DATE</Text>
            <Calendar
              current={date}
              onDayPress={(day: { dateString: string }) => setDate(day.dateString)}
              markingType="custom"
              markedDates={(() => {
                const marks: Record<string, any> = {};
                const todayStr = new Date().toISOString().slice(0, 10);
                bookedDates.forEach((d) => {
                  marks[d] = {
                    customStyles: {
                      container: {
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        borderWidth: 2,
                        borderColor: '#0891B2',
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                      text: { color: '#0F172A', fontWeight: '600' },
                    },
                  };
                });
                // Selected date — solid filled circle on top
                marks[date] = {
                  customStyles: {
                    container: {
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: '#0891B2',
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    text: { color: '#FFFFFF', fontWeight: '700' },
                  },
                };
                // Today indicator (only if not already booked and not selected)
                if (!marks[todayStr]) {
                  marks[todayStr] = {
                    customStyles: {
                      container: {
                        width: 34, height: 34, borderRadius: 17,
                        backgroundColor: '#E5F5F6',
                        alignItems: 'center', justifyContent: 'center',
                      },
                      text: { color: '#0891B2', fontWeight: '700' },
                    },
                  };
                }
                return marks;
              })()}
              theme={{
                backgroundColor: '#FAFAFA',
                calendarBackground: '#FFFFFF',
                textSectionTitleColor: '#737373',
                dayTextColor: '#0A0A0A',
                textDisabledColor: '#D4D4D4',
                arrowColor: '#0891B2',
                monthTextColor: '#0A0A0A',
                textMonthFontWeight: '700',
                textMonthFontSize: 16,
                textDayFontSize: 15,
                textDayHeaderFontSize: 13,
                textDayFontWeight: '500',
                textDayHeaderFontWeight: '600',
              }}
              style={{ borderRadius: 8, borderWidth: 1, borderColor: '#E5E5E5' }}
            />
          </View>

          {/* Time Slots */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>HEURE — créneau disponible</Text>
            <View style={styles.slotsGrid}>
              {TIME_SLOTS.map((slot) => {
                const isBusy = busySlots.has(slot);
                const isSelected = timeSlot === slot;
                return (
                  <TouchableOpacity
                    key={slot}
                    testID={`time-slot-${slot}`}
                    style={[
                      styles.slotBtn,
                      isSelected && styles.slotBtnActive,
                      isBusy && !isSelected && {
                        backgroundColor: '#FEE2E2',
                        borderColor: '#FCA5A5',
                        opacity: 0.6,
                      },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => setTimeSlot(slot)}
                    disabled={isBusy && !isSelected}
                  >
                    <Text style={[
                      styles.slotText,
                      isSelected && styles.slotTextActive,
                      isBusy && !isSelected && { color: '#DC2626', textDecorationLine: 'line-through' },
                    ]}>
                      {slot}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {busySlots.size > 0 && (
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                ⚠️ Les créneaux en rouge barré sont déjà pris ce jour-là.
              </Text>
            )}

            {/* List of existing appointments for the selected day */}
            {dayAppointments.length > 0 && (
              <View style={styles.dayApptList}>
                <Text style={styles.dayApptListTitle}>
                  📋 Rendez-vous du jour ({dayAppointments.length})
                </Text>
                {dayAppointments.map((a) => (
                  <View key={a.id} style={styles.dayApptRow}>
                    <Text style={styles.dayApptTime}>
                      {(a.time_slot || '').slice(0, 5)}
                    </Text>
                    <Text style={styles.dayApptName} numberOfLines={1}>
                      {a.client_name || a.title || '—'}
                    </Text>
                    <Text style={styles.dayApptDur}>
                      {a.duration_minutes || 60} min
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Duration */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>DURATION</Text>
            <View style={styles.durationRow}>
              {DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  testID={`duration-${d}`}
                  style={[styles.durationBtn, duration === d && styles.durationBtnActive]}
                  activeOpacity={0.7}
                  onPress={() => setDuration(d)}
                >
                  <Text style={[styles.durationText, duration === d && styles.durationTextActive]}>
                    {d}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Notes */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>PRIX ($)</Text>
            <TextInput
              testID="price-input"
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="ex. 150.00"
              placeholderTextColor="#A3A3A3"
              keyboardType="decimal-pad"
            />
          </View>

          {/* Notes */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>NOTES</Text>
            <TextInput
              testID="notes-input"
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes..."
              placeholderTextColor="#A3A3A3"
              multiline
              numberOfLines={3}
            />
          </View>

          <TouchableOpacity
            testID="save-button"
            onPress={handleSave}
            activeOpacity={0.7}
            style={styles.saveFullBtn}
            disabled={saving}
          >
            <Feather name="check" size={20} color="#FFFFFF" />
            <Text style={styles.saveFullBtnText}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Text>
          </TouchableOpacity>

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 24,
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
  saveBtn: {
    backgroundColor: '#0891B2',
    borderRadius: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  form: {
    padding: 24,
  },
  voiceDictBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0891B2',
    borderRadius: 12,
    paddingVertical: 18,
    gap: 10,
    marginBottom: 28,
  },
  voiceDictBtnActive: {
    backgroundColor: '#FFF5F5',
    borderWidth: 2,
    borderColor: '#FF3B30',
  },
  voiceDictText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fieldGroup: {
    marginBottom: 28,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#737373',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  geoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: '#0891B2', backgroundColor: '#F0F9FF',
    minHeight: 28,
  },
  geoBtnText: { color: '#0891B2', fontSize: 12, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#D4D4D4', backgroundColor: '#FFFFFF',
  },
  chipActive: { borderColor: '#0891B2', backgroundColor: '#0891B2' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#404040' },
  chipTextActive: { color: '#FFFFFF' },
  input: {
    height: 48,
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
    fontSize: 16,
    color: '#0A0A0A',
    paddingVertical: 8,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  saveFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0891B2',
    borderRadius: 8,
    paddingVertical: 16,
    gap: 8,
    marginTop: 8,
  },
  saveFullBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateArrow: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotBtn: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  slotBtnActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  slotText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0A0A0A',
  },
  slotTextActive: {
    color: '#FFFFFF',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationBtn: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  durationBtnActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  durationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  durationTextActive: {
    color: '#FFFFFF',
  },
  dayApptList: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  dayApptListTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#525252',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  dayApptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    marginBottom: 4,
    gap: 10,
  },
  dayApptTime: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    width: 50,
  },
  dayApptName: {
    flex: 1,
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
  },
  dayApptDur: {
    fontSize: 11,
    color: '#6B7280',
  },
});
