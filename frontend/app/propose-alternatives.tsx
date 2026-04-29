import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AppHeader from '../components/AppHeader';
import { wrapSms } from '../src/utils/smsTemplate';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
];

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAYS_FR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

const slotToMin = (s: string) => {
  const [h, m] = (s || '0:0').split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
};

interface Slot { date: string; time_slot: string; duration_minutes: number; }

export default function ProposeAlternativesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id as string;

  const [appt, setAppt] = useState<any>(null);
  const [allAppts, setAllAppts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Slot[]>([]);
  const [activeDay, setActiveDay] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [a, all] = await Promise.all([
        fetch(`${API_URL}/api/appointments/${id}`).then((r) => r.ok ? r.json() : null),
        fetch(`${API_URL}/api/appointments`).then((r) => r.ok ? r.json() : []),
      ]);
      if (a) {
        setAppt(a);
        setSelected(a.proposed_alternatives || []);
      }
      setAllAppts(all || []);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build the next 14 days (today + 13)
  const days = useMemo(() => {
    const out: { iso: string; label: string; dayOfWeek: string; isToday: boolean }[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({
        iso,
        label: `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`,
        dayOfWeek: DAYS_FR[d.getDay()],
        isToday: i === 0,
      });
    }
    return out;
  }, []);

  // Build occupied slots map (excluding the current appt being rescheduled, AND its own proposed alternatives)
  const occupiedByDate = useMemo(() => {
    const map: Record<string, Record<string, any>> = {};
    for (const a of allAppts) {
      if (!a?.date || a.id === id) continue;
      const t = (a.time_slot || '').slice(0, 5);
      if (!t) continue;
      const start = slotToMin(t);
      const dur = Math.max(30, parseInt(a.duration_minutes, 10) || 60);
      const end = start + dur;
      if (!map[a.date]) map[a.date] = {};
      for (let m = start; m < end; m += 30) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        map[a.date][`${hh}:${mm}`] = a;
      }
    }
    return map;
  }, [allAppts, id]);

  const isSlotSelected = (date: string, time: string) =>
    selected.some((s) => s.date === date && s.time_slot === time);

  const toggleSlot = (date: string, time: string) => {
    if (isSlotSelected(date, time)) {
      setSelected(selected.filter((s) => !(s.date === date && s.time_slot === time)));
      return;
    }
    if (selected.length >= 3) {
      Alert.alert('Limite atteinte', 'Vous avez déjà choisi 3 alternatives. Touchez une option pour la retirer.');
      return;
    }
    const dur = parseInt(appt?.duration_minutes, 10) || 60;
    setSelected([...selected, { date, time_slot: time, duration_minutes: dur }]);
  };

  const fmtLong = (iso: string) => {
    try {
      // Parse YYYY-MM-DD as LOCAL date (not UTC) to avoid timezone shift to previous day
      const [y, m, dd] = iso.split('-').map((n) => parseInt(n, 10));
      const d = new Date(y, (m || 1) - 1, dd || 1);
      const dn = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d.getDay()];
      return `${dn} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
    } catch { return iso; }
  };

  const buildSmsBody = () => {
    const sorted = [...selected].sort((a, b) =>
      a.date === b.date ? a.time_slot.localeCompare(b.time_slot) : a.date.localeCompare(b.date)
    );
    const lines = sorted.map((s, i) => `• Option ${i + 1}: ${fmtLong(s.date)} à ${s.time_slot}`).join('\n');
    const name = appt?.client_name || '';
    const oldDate = appt?.date || '';
    const oldTime = (appt?.time_slot || '').slice(0, 5);
    return `Bonjour ${name},\n\nMalheureusement, je dois reporter notre rendez-vous prévu le ${fmtLong(oldDate)} à ${oldTime}.\n\nVoici 3 nouvelles disponibilités:\n${lines}\n\nLaquelle vous conviendrait le mieux?\n\nMerci de votre compréhension!`;
  };

  const handleSave = async (sendSms: boolean) => {
    if (selected.length === 0) {
      Alert.alert('Aucune option', 'Sélectionnez au moins 1 créneau alternatif.');
      return;
    }
    setSaving(true);
    try {
      // 1) Save the proposed alternatives in DB (so calendar shows them as tentative)
      const r = await fetch(`${API_URL}/api/appointments/${id}/proposed-alternatives`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alternatives: selected }),
      });
      if (!r.ok) throw new Error('Échec sauvegarde');

      // 2) Optionally open SMS
      if (sendSms) {
        const phone = (appt?.client_phone || '').replace(/\D/g, '');
        if (!phone) {
          Alert.alert('Téléphone manquant', 'Sauvegardé! Mais ce client n\'a pas de numéro pour envoyer un SMS.');
        } else {
          const body = wrapSms(buildSmsBody());
          const sep = Platform.OS === 'ios' ? '&' : '?';
          const url = `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
          try {
            const can = await Linking.canOpenURL(url);
            if (can) { await Linking.openURL(url); }
            else { Alert.alert('SMS non disponible', body.slice(0, 200)); }
          } catch {
            Alert.alert('Erreur', 'Impossible d\'ouvrir l\'app SMS');
          }
        }
      }

      Alert.alert(
        '✅ Alternatives enregistrées',
        `${selected.length} créneaux marqués en attente sur le calendrier (jaune).`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Sauvegarde impossible');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    const proceed = async () => {
      try {
        await fetch(`${API_URL}/api/appointments/${id}/proposed-alternatives`, { method: 'DELETE' });
        setSelected([]);
        Alert.alert('Effacé', 'Les alternatives en attente ont été retirées du calendrier.');
      } catch {
        Alert.alert('Erreur', 'Échec');
      }
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm('Retirer les 3 alternatives du calendrier ?')) proceed();
    } else {
      Alert.alert('Effacer', 'Retirer les alternatives en attente ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Effacer', style: 'destructive', onPress: () => proceed() },
      ]);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.container}><AppHeader /><ActivityIndicator size="large" color="#0891B2" style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  const focusedDay = activeDay || days[0].iso;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color="#0A0A0A" />
        </TouchableOpacity>
        <Text style={styles.title}>Proposer 3 alternatives</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Choisis jusqu'à <Text style={styles.bold}>3 créneaux libres</Text>. Ils seront marqués en{' '}
          <Text style={[styles.bold, { color: '#D97706' }]}>jaune</Text> sur le calendrier (en attente)
          jusqu'à ce que le client réponde.
        </Text>
      </View>

      {/* Selected summary */}
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>{selected.length}/3 sélectionnées</Text>
        {selected.length === 0 ? (
          <Text style={styles.summaryEmpty}>Aucune option choisie</Text>
        ) : (
          [...selected].sort((a, b) => a.date === b.date ? a.time_slot.localeCompare(b.time_slot) : a.date.localeCompare(b.date)).map((s, i) => (
            <View key={`${s.date}-${s.time_slot}`} style={styles.summaryRow}>
              <Text style={styles.summaryNum}>Option {i + 1}</Text>
              <Text style={styles.summaryText}>{fmtLong(s.date)} à {s.time_slot}</Text>
              <TouchableOpacity onPress={() => toggleSlot(s.date, s.time_slot)} style={{ padding: 4 }}>
                <Feather name="x" size={16} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Day strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayStrip} contentContainerStyle={{ paddingHorizontal: 8 }}>
        {days.map((d) => {
          const occupied = occupiedByDate[d.iso] || {};
          const occupiedCount = Object.keys(occupied).length;
          const isActive = focusedDay === d.iso;
          const selectedCount = selected.filter((s) => s.date === d.iso).length;
          return (
            <TouchableOpacity
              key={d.iso}
              onPress={() => setActiveDay(d.iso)}
              style={[styles.dayBtn, isActive && styles.dayBtnActive, d.isToday && styles.dayToday]}
            >
              <Text style={[styles.dayDow, isActive && { color: '#FFFFFF' }]}>{d.dayOfWeek}</Text>
              <Text style={[styles.dayLabel, isActive && { color: '#FFFFFF' }]}>{d.label}</Text>
              <Text style={[styles.dayMeta, isActive && { color: '#E0F2FE' }]}>
                {selectedCount > 0 ? `⭐ ${selectedCount}` : occupiedCount > 0 ? `${occupiedCount} occupés` : 'libre'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Time grid for the focused day */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
        <Text style={styles.dayTitle}>{fmtLong(focusedDay)}</Text>
        <View style={styles.slotGrid}>
          {TIME_SLOTS.map((t) => {
            const occupied = occupiedByDate[focusedDay]?.[t];
            const isSel = isSlotSelected(focusedDay, t);
            return (
              <TouchableOpacity
                key={t}
                onPress={() => !occupied && toggleSlot(focusedDay, t)}
                disabled={!!occupied}
                style={[
                  styles.slot,
                  occupied && styles.slotOccupied,
                  isSel && styles.slotSelected,
                  !occupied && !isSel && styles.slotFree,
                ]}
              >
                <Text style={[
                  styles.slotText,
                  occupied && styles.slotTextOccupied,
                  isSel && styles.slotTextSelected,
                ]}>{t}</Text>
                {occupied ? (
                  <Text style={styles.slotSub}>{(occupied.client_name || '').slice(0, 12)}</Text>
                ) : isSel ? (
                  <Text style={styles.slotSub}>★ choisi</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btnPrimary, saving && { opacity: 0.5 }]}
            disabled={saving || selected.length === 0}
            onPress={() => handleSave(true)}
          >
            <Feather name="message-square" size={16} color="#FFFFFF" />
            <Text style={styles.btnPrimaryText}>Enregistrer + envoyer SMS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnSecondary, saving && { opacity: 0.5 }]}
            disabled={saving || selected.length === 0}
            onPress={() => handleSave(false)}
          >
            <Feather name="save" size={16} color="#0891B2" />
            <Text style={styles.btnSecondaryText}>Enregistrer seulement</Text>
          </TouchableOpacity>
          {(appt?.proposed_alternatives?.length > 0) && (
            <TouchableOpacity style={styles.btnDanger} onPress={handleClear}>
              <Feather name="trash-2" size={14} color="#DC2626" />
              <Text style={styles.btnDangerText}>Effacer les alternatives en attente</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  title: { fontSize: 17, fontWeight: '700', color: '#0A0A0A' },
  infoBox: { backgroundColor: '#FEF3C7', marginHorizontal: 12, padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#D97706', marginBottom: 8 },
  infoText: { fontSize: 12, color: '#78350F', lineHeight: 18 },
  bold: { fontWeight: '700' },
  summary: { backgroundColor: '#FFFFFF', marginHorizontal: 12, padding: 12, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: '#E5E5E5' },
  summaryTitle: { fontSize: 12, fontWeight: '700', color: '#0891B2', marginBottom: 6 },
  summaryEmpty: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  summaryNum: { fontSize: 12, fontWeight: '700', color: '#D97706', minWidth: 60 },
  summaryText: { fontSize: 13, color: '#0F172A', flex: 1 },
  dayStrip: { flexGrow: 0, paddingVertical: 8 },
  dayBtn: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, marginHorizontal: 4, alignItems: 'center', minWidth: 80, borderWidth: 1, borderColor: '#E5E5E5' },
  dayBtnActive: { backgroundColor: '#0891B2', borderColor: '#0891B2' },
  dayToday: { borderColor: '#0891B2' },
  dayDow: { fontSize: 11, color: '#64748B', textTransform: 'uppercase', fontWeight: '600' },
  dayLabel: { fontSize: 14, color: '#0F172A', fontWeight: '700', marginTop: 2 },
  dayMeta: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  dayTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 10, textTransform: 'capitalize' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '23%', minWidth: 78, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  slotFree: { backgroundColor: '#D1FAE5', borderColor: '#10B981' },
  slotOccupied: { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
  slotSelected: { backgroundColor: '#FEF3C7', borderColor: '#D97706', borderWidth: 2 },
  slotText: { fontSize: 13, fontWeight: '700', color: '#065F46' },
  slotTextOccupied: { color: '#991B1B' },
  slotTextSelected: { color: '#92400E' },
  slotSub: { fontSize: 9, marginTop: 2, color: '#64748B' },
  actions: { marginTop: 16, gap: 8 },
  btnPrimary: { backgroundColor: '#0891B2', borderRadius: 10, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  btnSecondary: { backgroundColor: '#FFFFFF', borderColor: '#0891B2', borderWidth: 1, borderRadius: 10, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnSecondaryText: { color: '#0891B2', fontWeight: '700', fontSize: 14 },
  btnDanger: { backgroundColor: '#FFFFFF', borderColor: '#DC2626', borderWidth: 1, borderRadius: 10, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 },
  btnDangerText: { color: '#DC2626', fontWeight: '700', fontSize: 13 },
});
