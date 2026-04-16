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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00',
];

const DURATIONS = [15, 30, 45, 60, 90, 120];

export default function CreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    editId?: string;
    editTitle?: string;
    editClient?: string;
    editDate?: string;
    editTime?: string;
    editDuration?: string;
    editNotes?: string;
    editStatus?: string;
  }>();

  const isEditing = !!params.editId;

  const [title, setTitle] = useState(params.editTitle || '');
  const [clientName, setClientName] = useState(params.editClient || '');
  const [date, setDate] = useState(params.editDate || new Date().toISOString().split('T')[0]);
  const [timeSlot, setTimeSlot] = useState(params.editTime || '');
  const [duration, setDuration] = useState(Number(params.editDuration) || 30);
  const [notes, setNotes] = useState(params.editNotes || '');
  const [saving, setSaving] = useState(false);

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
        date,
        time_slot: timeSlot,
        duration_minutes: duration,
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
          <Text style={styles.headerTitle}>{isEditing ? 'Edit' : 'New Appointment'}</Text>
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
          {/* Title */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>TITLE</Text>
            <TextInput
              testID="title-input"
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Strategy Review"
              placeholderTextColor="#A3A3A3"
            />
          </View>

          {/* Client */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>CLIENT NAME</Text>
            <TextInput
              testID="client-input"
              style={styles.input}
              value={clientName}
              onChangeText={setClientName}
              placeholder="e.g. Alice Martin"
              placeholderTextColor="#A3A3A3"
            />
          </View>

          {/* Date */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>DATE</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                testID="date-prev"
                onPress={() => changeDate(-1)}
                activeOpacity={0.7}
                style={styles.dateArrow}
              >
                <Feather name="chevron-left" size={20} color="#0A0A0A" />
              </TouchableOpacity>
              <Text testID="date-display" style={styles.dateText}>
                {formatDisplayDate(date)}
              </Text>
              <TouchableOpacity
                testID="date-next"
                onPress={() => changeDate(1)}
                activeOpacity={0.7}
                style={styles.dateArrow}
              >
                <Feather name="chevron-right" size={20} color="#0A0A0A" />
              </TouchableOpacity>
            </View>
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
    backgroundColor: '#000000',
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
