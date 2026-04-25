import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, RefreshControl, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AppHeader from '../components/AppHeader';
import { wrapSms } from '../src/utils/smsTemplate';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Reminder {
  id: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  date: string;
  time_slot: string;
  duration_minutes: number;
  title: string;
  reminder_email_sent_at?: string | null;
  reminder_sms_sent_at?: string | null;
}

const fmtTime = (s: string) => (s || '').slice(0, 5);

export default function RemindersScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [data, setData] = useState<{ date: string; date_label: string; count: number; appointments: Reminder[] }>({
    date: '', date_label: '', count: 0, appointments: [],
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/reminders/tomorrow`);
      if (res.ok) {
        const j = await res.json();
        setData(j);
      }
    } catch (e) {
      console.warn('reminders fetch', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const handleRunNow = async () => {
    const proceed = async () => {
      setRunning(true);
      try {
        const res = await fetch(`${API_URL}/api/reminders/run-now`, { method: 'POST' });
        const j = await res.json();
        Alert.alert(
          '✅ Rappels envoyés',
          `📧 ${j.emails_sent} courriels envoyés\n⏭️ ${j.emails_skipped} ignorés (déjà envoyés ou pas de courriel)\n📬 Récap: ${j.summary_sent ? 'envoyé' : 'non envoyé'}`
        );
        await fetchData();
      } catch (e: any) {
        Alert.alert('Erreur', e?.message || 'Échec');
      } finally {
        setRunning(false);
      }
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      const ok = window.confirm('Envoyer maintenant les courriels de rappel pour tous les RDV de demain ?\n\n(Les RDV qui ont déjà reçu un rappel seront ignorés.)');
      if (ok) proceed();
    } else {
      Alert.alert('Envoyer les rappels ?', 'Envoyer maintenant les courriels pour tous les RDV de demain ? Les RDV déjà notifiés seront ignorés.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Envoyer', onPress: () => proceed() },
      ]);
    }
  };

  const buildSmsBody = (r: Reminder) => {
    const time = fmtTime(r.time_slot);
    const msg = `Bonjour ${r.client_name},\n\nPetit rappel: nous avons rendez-vous DEMAIN à ${time} pour votre service de lavage de vitres.\n\nSi cela ne vous convient plus, répondez à ce SMS ou appelez-nous au 514-570-9802.\n\nÀ demain!`;
    return wrapSms(msg);
  };

  const handleSendSms = async (r: Reminder) => {
    const phone = (r.client_phone || '').replace(/\D/g, '');
    if (!phone) {
      Alert.alert('Téléphone manquant', 'Pas de numéro pour ce client.');
      return;
    }
    const sep = Platform.OS === 'ios' ? '&' : '?';
    const body = buildSmsBody(r);
    const url = `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert('SMS non disponible', 'Envoyez ce message manuellement:\n\n' + body.slice(0, 200));
        return;
      }
      await Linking.openURL(url);
      // Mark as sent (assume user pressed Send in iMessage)
      try {
        await fetch(`${API_URL}/api/reminders/${r.id}/mark-sms-sent`, { method: 'POST' });
        await fetchData();
      } catch {}
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ouvrir l\'app SMS');
    }
  };

  const handleResetSms = async (r: Reminder) => {
    try {
      await fetch(`${API_URL}/api/reminders/${r.id}/mark-sms-unsent`, { method: 'POST' });
      await fetchData();
    } catch {}
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader />
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891B2" />}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#0A0A0A" />
          </TouchableOpacity>
          <Text style={styles.title}>🔔 Rappels — Demain</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={styles.dateBox}>
          <Text style={styles.dateLabel}>RENDEZ-VOUS DE</Text>
          <Text style={styles.dateValue}>{data.date_label}</Text>
          <Text style={styles.dateCount}>
            {data.count === 0 ? 'Aucun RDV planifié' : `${data.count} RDV planifié${data.count > 1 ? 's' : ''}`}
          </Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Comment ça marche</Text>
          <Text style={styles.infoText}>
            • Chaque jour à <Text style={styles.bold}>9h00</Text>, l'app envoie automatiquement un courriel de rappel aux clients qui ont une adresse courriel.{'\n'}
            • Pour les clients <Text style={styles.bold}>sans courriel</Text>, tape sur le bouton 📱 SMS pour ouvrir Messages avec un message pré-rempli.{'\n'}
            • Tu reçois aussi un récap par courriel à 9h00 chaque matin.
          </Text>
        </View>

        {data.count > 0 && (
          <TouchableOpacity
            testID="run-reminders-now"
            style={[styles.runBtn, running && { opacity: 0.6 }]}
            activeOpacity={0.8}
            onPress={handleRunNow}
            disabled={running}
          >
            {running ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Feather name="send" size={18} color="#FFFFFF" />
                <Text style={styles.runBtnText}>Envoyer les courriels maintenant</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {data.appointments.map((r) => {
          const emailSent = !!r.reminder_email_sent_at;
          const smsSent = !!r.reminder_sms_sent_at;
          const hasEmail = !!(r.client_email || '').trim();
          const hasPhone = !!(r.client_phone || '').replace(/\D/g, '');

          return (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.timePill}>
                  <Text style={styles.timeText}>⏰ {fmtTime(r.time_slot)}</Text>
                </View>
                <Text style={styles.duration}>{r.duration_minutes} min</Text>
              </View>

              <Text style={styles.clientName}>{r.client_name}</Text>
              <Text style={styles.serviceTitle}>{r.title}</Text>

              {!!r.client_address && (
                <View style={styles.metaRow}>
                  <Feather name="map-pin" size={13} color="#64748B" />
                  <Text style={styles.metaText}>{r.client_address}</Text>
                </View>
              )}
              {!!r.client_phone && (
                <View style={styles.metaRow}>
                  <Feather name="phone" size={13} color="#64748B" />
                  <Text style={styles.metaText}>{r.client_phone}</Text>
                </View>
              )}
              {!!r.client_email && (
                <View style={styles.metaRow}>
                  <Feather name="mail" size={13} color="#64748B" />
                  <Text style={styles.metaText}>{r.client_email}</Text>
                </View>
              )}

              {/* Status badges */}
              <View style={styles.badgesRow}>
                <View style={[styles.badge, emailSent ? styles.badgeOk : styles.badgePending]}>
                  <Text style={[styles.badgeText, emailSent ? styles.badgeTextOk : styles.badgeTextPending]}>
                    {hasEmail ? (emailSent ? '✅ Courriel envoyé' : '⏳ Courriel à envoyer') : '— Pas de courriel'}
                  </Text>
                </View>
                <View style={[styles.badge, smsSent ? styles.badgeOk : styles.badgePending]}>
                  <Text style={[styles.badgeText, smsSent ? styles.badgeTextOk : styles.badgeTextPending]}>
                    {hasPhone ? (smsSent ? '✅ SMS envoyé' : '⏳ SMS à envoyer') : '— Pas de téléphone'}
                  </Text>
                </View>
              </View>

              {/* Action buttons */}
              <View style={styles.actionsRow}>
                {hasPhone && (
                  <TouchableOpacity
                    style={[styles.smsBtn, smsSent && styles.smsBtnSent]}
                    activeOpacity={0.8}
                    onPress={() => smsSent ? handleResetSms(r) : handleSendSms(r)}
                  >
                    <Feather name={smsSent ? 'check-circle' : 'message-square'} size={16} color="#FFFFFF" />
                    <Text style={styles.smsBtnText}>
                      {smsSent ? 'SMS envoyé (annuler)' : 'Envoyer SMS'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.detailBtn}
                  activeOpacity={0.8}
                  onPress={() => router.push({ pathname: '/detail', params: { id: r.id } } as any)}
                >
                  <Feather name="external-link" size={16} color="#0891B2" />
                  <Text style={styles.detailBtnText}>Détail</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {data.count === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>🌟</Text>
            <Text style={styles.emptyTitle}>Aucun RDV demain</Text>
            <Text style={styles.emptyText}>Profitez de votre journée libre !</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  dateBox: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#0891B2' },
  dateLabel: { fontSize: 11, fontWeight: '700', color: '#737373', textTransform: 'uppercase', letterSpacing: 0.4 },
  dateValue: { fontSize: 18, fontWeight: '700', color: '#0A0A0A', marginTop: 4, textTransform: 'capitalize' },
  dateCount: { fontSize: 13, color: '#0891B2', fontWeight: '600', marginTop: 4 },
  infoBox: { backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#3B82F6' },
  infoTitle: { fontSize: 12, fontWeight: '700', color: '#1E40AF', marginBottom: 4 },
  infoText: { fontSize: 12, color: '#1E3A8A', lineHeight: 18 },
  bold: { fontWeight: '700' },
  runBtn: { backgroundColor: '#0891B2', borderRadius: 10, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14 },
  runBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E5E5' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  timePill: { backgroundColor: '#0891B2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  timeText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  duration: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  clientName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  serviceTitle: { fontSize: 12, color: '#64748B', marginTop: 2, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaText: { fontSize: 12, color: '#475569', flex: 1 },
  badgesRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeOk: { backgroundColor: '#D1FAE5' },
  badgePending: { backgroundColor: '#FEF3C7' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextOk: { color: '#065F46' },
  badgeTextPending: { color: '#92400E' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smsBtn: { flex: 1, backgroundColor: '#059669', borderRadius: 8, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  smsBtnSent: { backgroundColor: '#9CA3AF' },
  smsBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  detailBtn: { backgroundColor: '#FFFFFF', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#0891B2' },
  detailBtnText: { fontSize: 13, fontWeight: '700', color: '#0891B2' },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  emptyText: { fontSize: 14, color: '#64748B' },
});
