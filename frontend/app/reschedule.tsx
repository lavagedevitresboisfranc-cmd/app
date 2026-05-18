import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00',
];

interface Appointment {
  id: string;
  client_name: string;
  client_email: string | null;
  client_phone?: string | null;
  date: string;
  time_slot: string;
  duration_minutes: number;
  status: string;
}

const fmtDateISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const dayNames = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

export default function RescheduleScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [allAppts, setAllAppts] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notifyClient, setNotifyClient] = useState(true);
  const [notifySMS, setNotifySMS] = useState(false);

  // Build the list of 14 days starting from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { iso: string; date: Date }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({ iso: fmtDateISO(d), date: d });
  }

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Load appointment + all appointments in the 14-day window
      const [aptRes, allRes] = await Promise.all([
        fetch(`${API_URL}/api/appointments/${id}`),
        fetch(`${API_URL}/api/appointments`),
      ]);
      if (aptRes.ok) {
        const apt = await aptRes.json();
        setAppointment(apt);
      }
      if (allRes.ok) {
        const all = await allRes.json();
        setAllAppts(Array.isArray(all) ? all.filter((a: any) => a.status !== 'archived') : []);
      }
    } catch (e) {
      console.warn('reschedule load', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Compute occupied slots per date (excluding the appointment we're rescheduling).
  // Block ALL 30-min slots overlapping the duration of an existing appointment.
  const slotToMin = (s: string) => {
    const [h, m] = (s || '0:0').split(':').map((n) => parseInt(n, 10) || 0);
    return h * 60 + m;
  };
  const occupiedByDate: Record<string, Record<string, any>> = {};
  for (const a of allAppts) {
    if (!a?.date || a.id === id) continue;
    const t = (a.time_slot || '').slice(0, 5);
    if (!t) continue;
    const start = slotToMin(t);
    const dur = Math.max(30, parseInt(a.duration_minutes, 10) || 60);
    const end = start + dur;
    if (!occupiedByDate[a.date]) occupiedByDate[a.date] = {};
    for (let m = start; m < end; m += 30) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      occupiedByDate[a.date][`${hh}:${mm}`] = a;
    }
  }

  const submitReschedule = async () => {
    if (!appointment || !selectedDate || !selectedSlot) {
      Alert.alert('Sélection requise', 'Choisis une date et un créneau.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/appointments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          time_slot: selectedSlot,
          notify_client: notifyClient,
        }),
      });
      if (!res.ok) throw new Error('Échec de la reprogrammation');

      // If SMS option is checked, open the messages app with a pre-filled message.
      // Format the date in French for the SMS body.
      if (notifySMS && appointment.client_phone) {
        try {
          const dt = new Date(selectedDate + 'T00:00:00');
          const dayName = dayNames[dt.getDay()];
          const monthName = monthNames[dt.getMonth()];
          const firstName = (appointment.client_name || '').split(' ')[0];
          const body = `Bonjour ${firstName},\n\nVotre rendez-vous Lavage de Vitres Bois-Franc a été reprogrammé:\n\n📅 ${dayName} ${dt.getDate()} ${monthName} ${dt.getFullYear()} à ${selectedSlot}\n\nMerci!`;
          const phone = (appointment.client_phone || '').replace(/[^0-9+]/g, '');
          const sep = Platform.OS === 'ios' ? '&' : '?';
          const smsUrl = `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
          await Linking.openURL(smsUrl);
        } catch (e) {
          console.warn('sms open failed', e);
        }
      }

      const summary = [
        `Nouveau créneau: ${selectedDate} à ${selectedSlot}`,
        notifyClient && appointment.client_email ? `📧 Courriel envoyé à ${appointment.client_email}` : '',
        notifySMS && appointment.client_phone ? `📱 SMS ouvert pour ${appointment.client_phone}` : '',
      ].filter(Boolean).join('\n\n');

      Alert.alert(
        '✅ Rendez-vous reprogrammé',
        summary,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert('❌ Erreur', e?.message || 'Reprogrammation impossible');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#0891B2" />
        </View>
      </SafeAreaView>
    );
  }
  if (!appointment) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader />
        <Text style={{ padding: 20 }}>Rendez-vous introuvable</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#0A0A0A" />
          </TouchableOpacity>
          <Text style={styles.title}>Reprogrammer</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={styles.currentBox}>
          <Text style={styles.currentLabel}>RENDEZ-VOUS ACTUEL</Text>
          <Text style={styles.currentClient}>{appointment.client_name}</Text>
          <Text style={styles.currentSlot}>
            📅 {appointment.date}  ⏰ {appointment.time_slot}  ({appointment.duration_minutes} min)
          </Text>
        </View>

        <Text style={styles.sectionTitle}>📅 Choisir une date</Text>

        {/* Calendar with colored ring circles showing occupancy per day */}
        {(() => {
          // Build markedDates: ring around occupied days, filled circle on selected
          const counts: Record<string, number> = {};
          Object.keys(occupiedByDate).forEach((d) => {
            counts[d] = Object.keys(occupiedByDate[d] || {}).length;
          });
          const md: Record<string, any> = {};
          Object.entries(counts).forEach(([d, n]) => {
            const ringColor = n >= 6 ? '#DC2626' : n >= 3 ? '#F59E0B' : '#10B981';
            md[d] = {
              customStyles: {
                container: {
                  width: 32, height: 32, borderRadius: 16,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2, borderColor: ringColor,
                },
                text: { fontWeight: '600', fontSize: 15, color: '#0A0A0A' },
              },
            };
          });
          if (selectedDate) {
            md[selectedDate] = {
              customStyles: {
                container: {
                  width: 32, height: 32, borderRadius: 16,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#0891B2',
                },
                text: { fontWeight: '700', fontSize: 15, color: '#FFFFFF' },
              },
            };
          }
          return (
            <Calendar
              current={selectedDate || fmtDateISO(today)}
              minDate={fmtDateISO(today)}
              markingType="custom"
              markedDates={md}
              firstDay={1}
              onDayPress={(day: { dateString: string }) => {
                setSelectedDate(day.dateString);
                setSelectedSlot(null);
              }}
              theme={{
                todayTextColor: '#0891B2',
                arrowColor: '#0891B2',
                monthTextColor: '#0A0A0A',
                textMonthFontWeight: '700',
              }}
              style={styles.calBox}
            />
          );
        })()}

        {/* Legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}><View style={[styles.legendCircle, { borderColor: '#10B981' }]} /><Text style={styles.legendText}>1–2 RDV</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendCircle, { borderColor: '#F59E0B' }]} /><Text style={styles.legendText}>3–5 RDV</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendCircle, { borderColor: '#DC2626' }]} /><Text style={styles.legendText}>6+ RDV</Text></View>
        </View>

        {/* Time slots for selected date */}
        {selectedDate ? (() => {
          const occupied = occupiedByDate[selectedDate] || {};
          const occupiedCount = Object.keys(occupied).length;
          const sel = new Date(selectedDate + 'T00:00:00');
          const dayLabel = `${dayNames[sel.getDay()]} ${sel.getDate()} ${monthNames[sel.getMonth()]}`;
          return (
            <View style={styles.slotsCard}>
              <View style={styles.slotsHeader}>
                <Text style={styles.slotsHeaderTitle}>🕐 {dayLabel}</Text>
                <View style={[styles.statusPill, occupiedCount === 0 ? styles.statusFree : styles.statusBusy]}>
                  <Text style={[styles.statusText, occupiedCount === 0 ? { color: '#065F46' } : { color: '#92400E' }]}>
                    {occupiedCount === 0 ? '✓ Libre' : `${occupiedCount} occupé${occupiedCount > 1 ? 's' : ''}`}
                  </Text>
                </View>
              </View>
              <View style={styles.slotsGrid}>
                {TIME_SLOTS.map((slot) => {
                  const isOccupied = !!occupied[slot];
                  const isSelected = selectedSlot === slot;
                  return (
                    <TouchableOpacity
                      key={slot}
                      testID={`slot-${selectedDate}-${slot}`}
                      disabled={isOccupied}
                      style={[
                        styles.slotBtn,
                        isOccupied && styles.slotOccupied,
                        isSelected && styles.slotSelected,
                      ]}
                      activeOpacity={isOccupied ? 1 : 0.7}
                      onPress={() => {
                        if (isOccupied) return;
                        setSelectedSlot(slot);
                      }}
                    >
                      <Text style={[
                        styles.slotText,
                        isOccupied && styles.slotTextOccupied,
                        isSelected && styles.slotTextSelected,
                      ]}>{slot}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })() : (
          <View style={styles.hintBox}>
            <Feather name="info" size={18} color="#0891B2" />
            <Text style={styles.hintText}>Tapez sur une date au calendrier pour voir les créneaux disponibles.</Text>
          </View>
        )}

        {/* Confirm */}
        <View style={styles.confirmBar}>
          {selectedDate && selectedSlot ? (
            <>
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.summaryTitle}>📌 Nouveau créneau choisi</Text>
                <Text style={styles.summaryValue}>{selectedDate} à {selectedSlot}</Text>
              </View>

              {!!appointment.client_email && (
                <TouchableOpacity
                  onPress={() => setNotifyClient((v) => !v)}
                  style={styles.checkboxRow}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, notifyClient && styles.checkboxOn]}>
                    {notifyClient && <Feather name="check" size={14} color="#FFFFFF" />}
                  </View>
                  <Text style={styles.checkboxLabel}>📧 Aviser par courriel ({appointment.client_email})</Text>
                </TouchableOpacity>
              )}

              {!!appointment.client_phone && (
                <TouchableOpacity
                  onPress={() => setNotifySMS((v) => !v)}
                  style={styles.checkboxRow}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, notifySMS && styles.checkboxOn]}>
                    {notifySMS && <Feather name="check" size={14} color="#FFFFFF" />}
                  </View>
                  <Text style={styles.checkboxLabel}>📱 Aviser par SMS ({appointment.client_phone})</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                testID="confirm-reschedule"
                style={[styles.confirmBtn, submitting && { opacity: 0.6 }]}
                activeOpacity={0.8}
                onPress={submitReschedule}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>Confirmer la reprogrammation</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.hintText}>👆 Tape sur un créneau libre pour le sélectionner</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  currentBox: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 16,
    borderLeftWidth: 4, borderLeftColor: '#0891B2',
  },
  currentLabel: { fontSize: 11, fontWeight: '700', color: '#737373', textTransform: 'uppercase', letterSpacing: 0.4 },
  currentClient: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginTop: 4 },
  currentSlot: { fontSize: 13, color: '#525252', marginTop: 2 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#525252', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  calBox: { borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden', marginBottom: 8 },
  legendRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendCircle: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, backgroundColor: 'transparent' },
  legendText: { fontSize: 12, color: '#525252', fontWeight: '500' },
  slotsCard: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 14,
  },
  slotsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  slotsHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  hintBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14, marginBottom: 16,
    backgroundColor: '#F0F9FF', borderRadius: 10,
    borderWidth: 1, borderColor: '#BAE6FD',
  },
  hintText: { flex: 1, fontSize: 13, color: '#0369A1' },
  dayCard: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E5E5',
  },
  dayCardActive: { borderColor: '#0891B2', borderWidth: 2 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  dayLabel: { fontSize: 13, fontWeight: '700', color: '#0A0A0A', textTransform: 'uppercase' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusFree: { backgroundColor: '#D1FAE5' },
  statusBusy: { backgroundColor: '#FEF3C7' },
  statusText: { fontSize: 11, fontWeight: '700' },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  slotBtn: {
    width: '23%', paddingVertical: 8, alignItems: 'center', borderRadius: 6,
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
  },
  slotOccupied: { backgroundColor: '#F3F4F6', opacity: 0.5 },
  slotSelected: { backgroundColor: '#0891B2', borderColor: '#0891B2' },
  slotText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  slotTextOccupied: { color: '#9CA3AF', textDecorationLine: 'line-through' },
  slotTextSelected: { color: '#FFFFFF' },
  confirmBar: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginTop: 14,
    borderTopWidth: 3, borderTopColor: '#0891B2',
  },
  summaryTitle: { fontSize: 11, fontWeight: '700', color: '#525252', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryValue: { fontSize: 16, fontWeight: '700', color: '#0891B2', marginTop: 2 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#0891B2',
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#0891B2' },
  checkboxLabel: { flex: 1, fontSize: 13, color: '#374151' },
  confirmBtn: {
    backgroundColor: '#0891B2', borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  hintText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', fontStyle: 'italic', padding: 8 },
});
