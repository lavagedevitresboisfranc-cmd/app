import React, { useCallback, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform,
  ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ClientRow {
  email: string;
  name: string;
  phone: string;
  last_visit: string;
}

type SeasonKey = 'spring' | 'autumn' | 'summer';
const SEASONS: { id: SeasonKey; icon: string; color: string }[] = [
  { id: 'spring', icon: '🌷', color: '#10B981' },
  { id: 'autumn', icon: '🍂', color: '#F59E0B' },
  { id: 'summer', icon: '☀️', color: '#EF4444' },
];

export default function CampaignsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ targetEmails?: string; targetCount?: string }>();
  const [allClients, setAllClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ season: SeasonKey; icon: string; color: string; subject: string; body: string } | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [showRandomModal, setShowRandomModal] = useState(false);
  const [randomCount, setRandomCount] = useState('25');

  // Target emails (from clients-db selection) — only those emails will be used as recipients
  const targetEmailSet = useMemo(() => {
    if (!params?.targetEmails) return null;
    const list = String(params.targetEmails).split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    return list.length ? new Set(list) : null;
  }, [params?.targetEmails]);

  // Effective client list: filtered by targetEmails if present
  const clients = useMemo(() => {
    if (!targetEmailSet) return allClients;
    return allClients.filter(c => c.email && targetEmailSet.has(c.email.toLowerCase()));
  }, [allClients, targetEmailSet]);

  const clearTarget = () => {
    router.setParams({ targetEmails: '', targetCount: '' } as any);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/clients/emails`);
      const data = await res.json();
      setAllClients(Array.isArray(data) ? data : []);
    } catch { } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openPreview = (s: typeof SEASONS[0]) => {
    setExcluded(new Set());
    const bookingUrl = `${API_URL}/api/booking`;
    const subject = t(`campaigns.${s.id}.subject`);
    const body = t(`campaigns.${s.id}.body`, { BOOKING_URL: bookingUrl });
    setPreview({ season: s.id, icon: s.icon, color: s.color, subject, body });
  };

  const toggleExclude = (email: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  /** Fisher-Yates shuffle + sélection de N clients aléatoires */
  const applyRandomSelection = (nTarget: number) => {
    const emails = clients.map(c => c.email).filter(Boolean);
    const n = Math.max(1, Math.min(nTarget, emails.length));
    // Shuffle
    const shuffled = [...emails];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const keep = new Set(shuffled.slice(0, n));
    // Exclure tous sauf les N sélectionnés
    const toExclude = new Set(emails.filter(e => !keep.has(e)));
    setExcluded(toExclude);
    setShowRandomModal(false);
  };

  const openRandomModal = () => {
    // Préremplit une valeur raisonnable (ex: 25 ou la moitié)
    const half = Math.max(10, Math.floor(clients.length / 2));
    setRandomCount(String(Math.min(25, half)));
    setShowRandomModal(true);
  };

  const selectedCount = clients.length - excluded.size;

  const sendCampaign = async () => {
    if (!preview) return;
    const emails = clients.map(c => c.email).filter(e => e && !excluded.has(e));
    if (emails.length === 0) {
      Alert.alert(t('campaigns.noRecipients'), t('campaigns.selectAtLeastOne'));
      return;
    }
    const bcc = emails.join(',');
    const url = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(preview.subject)}&body=${encodeURIComponent(preview.body)}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        setPreview(null);
      } else Alert.alert(t('campaigns.errorTitle'), t('campaigns.noMailApp'));
    } catch {
      Alert.alert(t('campaigns.errorTitle'), t('campaigns.cantOpenMail'));
    }
  };

  const copyAllEmails = async () => {
    const emails = clients.map(c => c.email).filter(Boolean).join(', ');
    if (!emails) return;
    await Clipboard.setStringAsync(emails);
    Alert.alert(t('campaigns.copied'), t('campaigns.emailsCopied', { count: clients.length }));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title={t('campaigns.title')} showBack />
      {loading ? (
        <ActivityIndicator size="large" color="#0891B2" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {targetEmailSet && (
            <View style={styles.targetBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.targetBannerTitle}>🎯 Campagne ciblée</Text>
                <Text style={styles.targetBannerText}>
                  {clients.length} client{clients.length > 1 ? 's' : ''} sélectionné{clients.length > 1 ? 's' : ''} depuis la base de clients
                </Text>
              </View>
              <TouchableOpacity onPress={clearTarget} style={styles.targetBannerClear} activeOpacity={0.7}>
                <Feather name="x" size={18} color="#0891B2" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('campaigns.clientsWithEmail')}</Text>
            <Text style={styles.summaryValue}>{clients.length}</Text>
            <TouchableOpacity style={styles.copyBtn} activeOpacity={0.7} onPress={copyAllEmails}>
              <Feather name="copy" size={14} color="#0891B2" />
              <Text style={styles.copyBtnText}>{t('campaigns.copyAllEmails')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>{t('campaigns.seasonalCampaigns')}</Text>
          {SEASONS.map(s => (
            <TouchableOpacity
              key={s.id}
              testID={`campaign-${s.id}`}
              style={[styles.campaignCard, { borderLeftColor: s.color }]}
              activeOpacity={0.7}
              onPress={() => openPreview(s)}
              disabled={clients.length === 0}
            >
              <View style={styles.campaignHead}>
                <Text style={styles.campaignIcon}>{s.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.campaignLabel}>{t(`campaigns.${s.id}.label`)}</Text>
                  <Text style={styles.campaignSubject}>{t(`campaigns.${s.id}.subject`)}</Text>
                </View>
                <Feather name="eye" size={18} color={s.color} />
              </View>
              <View style={[styles.sendPill, { backgroundColor: s.color }]}>
                <Feather name="send" size={12} color="#FFF" />
                <Text style={styles.sendPillText}>{t('campaigns.previewAndSend', { count: clients.length })}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <View style={styles.infoCard}>
            <Feather name="info" size={16} color="#0891B2" />
            <Text style={styles.infoText}>{t('campaigns.infoText')}</Text>
          </View>
        </ScrollView>
      )}

      <Modal
        visible={preview !== null}
        animationType="slide"
        onRequestClose={() => setPreview(null)}
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setPreview(null)} style={styles.modalClose}>
                <Feather name="x" size={24} color="#0A0A0A" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {preview?.icon} {t('campaigns.preview')}
              </Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
              <View style={styles.emailPreviewCard}>
                <View pointerEvents="none" style={styles.logoWatermarkWrap}>
                  <Image
                    source={{ uri: `${API_URL}/api/company-logo` }}
                    style={styles.logoWatermark}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.emailHeader}>
                  <View style={styles.emailRow}>
                    <Text style={styles.emailLbl}>{t('campaigns.from')}</Text>
                    <Text style={styles.emailVal}>{t('campaigns.companyName')}</Text>
                  </View>
                  <View style={styles.emailRow}>
                    <Text style={styles.emailLbl}>{t('campaigns.to')}</Text>
                    <Text style={styles.emailVal}>{t('campaigns.bccClients', { count: selectedCount })}</Text>
                  </View>
                  <View style={[styles.emailRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.emailLbl}>{t('campaigns.subject')}</Text>
                    <TextInput
                      style={styles.subjectInput}
                      value={preview?.subject || ''}
                      onChangeText={(t) => preview && setPreview({ ...preview, subject: t })}
                      multiline
                    />
                  </View>
                </View>
                <View style={styles.emailBody}>
                  <TextInput
                    testID="campaign-body-input"
                    style={styles.bodyInput}
                    value={preview?.body || ''}
                    onChangeText={(t) => preview && setPreview({ ...preview, body: t })}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              </View>

              <Text style={styles.listTitle}>
                {t('campaigns.recipients', { selected: selectedCount, total: clients.length })}
              </Text>
              <Text style={styles.listHint}>{t('campaigns.tapToExclude')}</Text>

              {/* Select all / none / random quick actions */}
              <View style={styles.recipientActions}>
                <TouchableOpacity
                  onPress={() => setExcluded(new Set())}
                  style={[styles.recipientActionBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                  activeOpacity={0.7}
                >
                  <Feather name="check-square" size={16} color="#10B981" />
                  <Text style={[styles.recipientActionText, { color: '#10B981' }]}>Tout</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setExcluded(new Set(clients.map(c => c.email).filter(Boolean)))}
                  style={[styles.recipientActionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                  activeOpacity={0.7}
                >
                  <Feather name="square" size={16} color="#EF4444" />
                  <Text style={[styles.recipientActionText, { color: '#EF4444' }]}>Aucun</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openRandomModal}
                  style={[styles.recipientActionBtn, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}
                  activeOpacity={0.7}
                  disabled={clients.length === 0}
                >
                  <Text style={{ fontSize: 16 }}>🎲</Text>
                  <Text style={[styles.recipientActionText, { color: '#B45309' }]}>Aléatoire</Text>
                </TouchableOpacity>
              </View>

              {clients.map((c) => {
                const isExcluded = excluded.has(c.email);
                return (
                  <TouchableOpacity
                    key={c.email}
                    style={[styles.clientRow, isExcluded && styles.clientRowExcluded]}
                    activeOpacity={0.7}
                    onPress={() => toggleExclude(c.email)}
                  >
                    <View style={[styles.checkbox, !isExcluded && styles.checkboxActive]}>
                      {!isExcluded && <Feather name="check" size={14} color="#FFF" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.clientName, isExcluded && styles.excludedText]} numberOfLines={1}>
                        {c.name || c.email}
                      </Text>
                      <Text style={[styles.clientEmail, isExcluded && styles.excludedText]} numberOfLines={1}>{c.email}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.footerBtn, styles.footerBtnCancel]}
                activeOpacity={0.7}
                onPress={() => setPreview(null)}
              >
                <Text style={styles.footerBtnCancelText}>{t('campaigns.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="send-campaign-confirm"
                style={[styles.footerBtn, { backgroundColor: preview?.color || '#0891B2' }]}
                activeOpacity={0.7}
                onPress={sendCampaign}
                disabled={selectedCount === 0}
              >
                <Feather name="send" size={16} color="#FFF" />
                <Text style={styles.footerBtnText}>{t('campaigns.sendTo', { count: selectedCount })}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Random Selection Modal */}
      <Modal
        visible={showRandomModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowRandomModal(false)}
      >
        <View style={styles.randomOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%', alignItems: 'center' }}
          >
            <View style={styles.randomCard}>
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 40 }}>🎲</Text>
                <Text style={styles.randomTitle}>Sélection aléatoire</Text>
                <Text style={styles.randomSubtitle}>
                  Choisir X clients au hasard parmi {clients.length}
                </Text>
              </View>

              <Text style={styles.randomLabel}>Préréglages rapides :</Text>
              <View style={styles.randomPresets}>
                {[10, 25, 50, 100].filter(n => n <= clients.length).map(n => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => applyRandomSelection(n)}
                    style={styles.randomPresetBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.randomPresetText}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ height: 12 }} />

              <Text style={styles.randomLabel}>Ou nombre personnalisé :</Text>
              <View style={styles.randomInputRow}>
                <TextInput
                  style={styles.randomInput}
                  keyboardType="number-pad"
                  value={randomCount}
                  onChangeText={(v) => setRandomCount(v.replace(/[^0-9]/g, ''))}
                  maxLength={5}
                  placeholder="25"
                  placeholderTextColor="#9CA3AF"
                />
                <TouchableOpacity
                  onPress={() => {
                    const n = parseInt(randomCount, 10);
                    if (!n || n < 1) {
                      Alert.alert('Nombre invalide', 'Entrez un nombre supérieur à 0.');
                      return;
                    }
                    applyRandomSelection(n);
                  }}
                  style={styles.randomApplyBtn}
                  activeOpacity={0.85}
                >
                  <Feather name="shuffle" size={16} color="#fff" />
                  <Text style={styles.randomApplyText}>Sélectionner</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => setShowRandomModal(false)}
                style={styles.randomCancelBtn}
              >
                <Text style={styles.randomCancelText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  targetBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ECFEFF', borderWidth: 1, borderColor: '#0891B2',
    borderRadius: 12, padding: 14, marginBottom: 14, gap: 10,
  },
  targetBannerTitle: { fontSize: 15, fontWeight: '800', color: '#0891B2', marginBottom: 2 },
  targetBannerText: { fontSize: 13, color: '#0E7490' },
  targetBannerClear: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF',
    justifyContent: 'center', alignItems: 'center',
  },
  recipientActions: {
    flexDirection: 'row', gap: 8, marginBottom: 10, marginTop: 4,
  },
  recipientActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1,
  },
  recipientActionText: { fontSize: 13, fontWeight: '700' },

  // Random selection modal
  randomOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  randomCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 420,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 20,
  },
  randomTitle: { fontSize: 22, fontWeight: '800', color: '#111', marginTop: 6 },
  randomSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 4, textAlign: 'center' },
  randomLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 4 },
  randomPresets: { flexDirection: 'row', gap: 8 },
  randomPresetBtn: {
    flex: 1, paddingVertical: 14, backgroundColor: '#F3F4F6',
    borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  randomPresetText: { fontSize: 18, fontWeight: '800', color: '#0891B2' },
  randomInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  randomInput: {
    flex: 1, height: 48, paddingHorizontal: 16,
    backgroundColor: '#F9FAFB', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center',
  },
  randomApplyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0891B2', paddingHorizontal: 16, height: 48, borderRadius: 10,
  },
  randomApplyText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  randomCancelBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  randomCancelText: { fontSize: 14, color: '#6B7280', fontWeight: '600' },

  summaryCard: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 20, alignItems: 'center',
    marginBottom: 20, borderWidth: 1, borderColor: '#E5E5E5',
  },
  summaryLabel: { fontSize: 12, color: '#737373', textTransform: 'uppercase', fontWeight: '600', letterSpacing: 0.5 },
  summaryValue: { fontSize: 44, fontWeight: '800', color: '#0891B2', marginTop: 4 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#F0F9FF', marginTop: 10,
  },
  copyBtnText: { color: '#0891B2', fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#737373', letterSpacing: 1, marginBottom: 10 },
  campaignCard: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#E5E5E5', borderLeftWidth: 4,
  },
  campaignHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  campaignIcon: { fontSize: 28 },
  campaignLabel: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  campaignSubject: { fontSize: 12, color: '#737373', marginTop: 2 },
  sendPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
  },
  sendPillText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  infoCard: {
    flexDirection: 'row', gap: 10, backgroundColor: '#F0F9FF', padding: 12,
    borderRadius: 10, marginTop: 10,
  },
  infoText: { flex: 1, fontSize: 12, color: '#0C4A6E', lineHeight: 18 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: '#FAFAFA' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#E5E5E5',
  },
  modalClose: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0A0A0A' },
  emailPreviewCard: {
    backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E5E5',
    overflow: 'hidden', marginBottom: 20, position: 'relative',
  },
  logoWatermarkWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 10,
    zIndex: 0,
  },
  logoWatermark: {
    width: 160,
    height: 100,
    opacity: 0.25,
  },
  emailHeader: { padding: 14, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  emailRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E5E5',
  },
  emailLbl: { width: 50, fontSize: 12, fontWeight: '700', color: '#737373', textTransform: 'uppercase', paddingTop: 4 },
  emailVal: { flex: 1, fontSize: 14, color: '#0A0A0A', paddingVertical: 4 },
  subjectInput: { flex: 1, fontSize: 14, color: '#0A0A0A', padding: 4, fontWeight: '600' },
  emailBody: { padding: 14, minHeight: 200 },
  bodyInput: {
    fontSize: 14, color: '#0A0A0A', lineHeight: 22, minHeight: 220,
    textAlignVertical: 'top',
  },
  listTitle: { fontSize: 11, fontWeight: '700', color: '#737373', letterSpacing: 1, marginBottom: 4 },
  listHint: { fontSize: 11, color: '#A3A3A3', marginBottom: 12 },
  clientRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF', padding: 12, borderRadius: 10, marginBottom: 6,
    borderWidth: 1, borderColor: '#E5E5E5',
  },
  clientRowExcluded: { backgroundColor: '#F5F5F5', borderColor: '#E5E5E5' },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D4D4D4',
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF',
  },
  checkboxActive: { backgroundColor: '#0891B2', borderColor: '#0891B2' },
  clientName: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  clientEmail: { fontSize: 12, color: '#737373' },
  excludedText: { textDecorationLine: 'line-through', color: '#A3A3A3' },
  modalFooter: {
    flexDirection: 'row', gap: 10, padding: 14,
    borderTopWidth: 1, borderTopColor: '#E5E5E5', backgroundColor: '#FFF',
  },
  footerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 10,
  },
  footerBtnCancel: { backgroundColor: '#F5F5F5' },
  footerBtnCancelText: { color: '#404040', fontSize: 15, fontWeight: '600' },
  footerBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
