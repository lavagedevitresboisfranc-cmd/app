import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { useAudioRecorder, RecordingPresets, setAudioModeAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
    editDate?: string;
    editTime?: string;
    editDuration?: string;
    editNotes?: string;
    editPrice?: string;
    editStatus?: string;
  }>();

  const isEditing = !!params.editId;

  const [title, setTitle] = useState(params.editTitle || '');
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
        router.back();
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

          {/* Title */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>TITRE</Text>
            <TextInput
              testID="title-input"
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="ex. Lavage de vitres"
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
            <Text style={styles.label}>ADRESSE</Text>
            <TextInput
              testID="address-input"
              style={styles.input}
              value={clientAddress}
              onChangeText={setClientAddress}
              placeholder="ex. 123 Rue Principale, Bois-Franc"
              placeholderTextColor="#A3A3A3"
            />
          </View>

          {/* Date */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>DATE</Text>
            <Calendar
              current={date}
              onDayPress={(day: { dateString: string }) => setDate(day.dateString)}
              markedDates={{ [date]: { selected: true, selectedColor: '#0891B2' } }}
              theme={{
                backgroundColor: '#FAFAFA',
                calendarBackground: '#FFFFFF',
                textSectionTitleColor: '#737373',
                selectedDayBackgroundColor: '#0891B2',
                selectedDayTextColor: '#FFFFFF',
                todayTextColor: '#0891B2',
                todayBackgroundColor: '#E5F5F6',
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
            <Text style={styles.label}>TIME SLOT</Text>
            <View style={styles.slotsGrid}>
              {TIME_SLOTS.map((slot) => (
                <TouchableOpacity
                  key={slot}
                  testID={`time-slot-${slot}`}
                  style={[styles.slotBtn, timeSlot === slot && styles.slotBtnActive]}
                  activeOpacity={0.7}
                  onPress={() => setTimeSlot(slot)}
                >
                  <Text style={[styles.slotText, timeSlot === slot && styles.slotTextActive]}>
                    {slot}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
});
