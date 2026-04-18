import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform,
  ActivityIndicator, Modal, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ClientRow {
  email: string;
  name: string;
  phone: string;
  last_visit: string;
}

const CAMPAIGNS = [
  {
    id: 'printemps',
    icon: '🌷',
    label: 'Campagne Printemps',
    color: '#10B981',
    subject: 'Offre Printemps — Lavage de vitres',
    body: `Bonjour,

Le printemps est arrivé! C'est le moment idéal pour redonner de l'éclat à vos fenêtres.

🌷 OFFRE PRINTEMPS 🌷
10% de rabais sur votre lavage de vitres
Code: PRINTEMPS10

Réservez dès maintenant avant que mon agenda se remplisse!

📞 514-570-9802
🌐 Lavagedevitre.org

Merci,
Lavage de Vitres Bois-Franc`,
  },
  {
    id: 'automne',
    icon: '🍂',
    label: 'Relance Automne',
    color: '#F59E0B',
    subject: 'Préparez vos fenêtres pour l\'hiver',
    body: `Bonjour,

Avant que l'hiver n'arrive, offrez à vos fenêtres un dernier nettoyage pour profiter pleinement de la lumière durant les mois sombres.

🍂 PROMO AUTOMNE 🍂
10% de rabais sur votre prochain lavage
Code: AUTOMNE10
Valide jusqu'au 30 novembre

Un petit geste pour des vitres éclatantes tout l'hiver!

📞 514-570-9802
🌐 Lavagedevitre.org

Merci,
Lavage de Vitres Bois-Franc`,
  },
  {
    id: 'ete',
    icon: '☀️',
    label: 'Campagne Été',
    color: '#EF4444',
    subject: 'Vitres propres pour les belles journées d\'été',
    body: `Bonjour,

L'été bat son plein! Profitez de votre cour et de votre patio avec des fenêtres parfaitement propres.

☀️ SPÉCIAL ÉTÉ ☀️
10% de rabais
Code: ETE10

Réservez votre créneau dès maintenant!

📞 514-570-9802
🌐 Lavagedevitre.org

Merci,
Lavage de Vitres Bois-Franc`,
  },
];

export default function CampaignsScreen() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ campaign: typeof CAMPAIGNS[0]; subject: string; body: string } | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/clients/emails`);
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch { } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openPreview = (campaign: typeof CAMPAIGNS[0]) => {
    setExcluded(new Set());
    setPreview({ campaign, subject: campaign.subject, body: campaign.body });
  };

  const toggleExclude = (email: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const selectedCount = clients.length - excluded.size;

  const sendCampaign = async () => {
    if (!preview) return;
    const emails = clients.map(c => c.email).filter(e => e && !excluded.has(e));
    if (emails.length === 0) {
      Alert.alert('Aucun destinataire', 'Sélectionnez au moins un client.');
      return;
    }
    const bcc = emails.join(',');
    const url = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(preview.subject)}&body=${encodeURIComponent(preview.body)}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        setPreview(null);
      } else Alert.alert('Erreur', 'Aucune app courriel disponible');
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ouvrir l\'app courriel');
    }
  };

  const copyAllEmails = async () => {
    const emails = clients.map(c => c.email).filter(Boolean).join(', ');
    if (!emails) return;
    await Clipboard.setStringAsync(emails);
    Alert.alert('Copié!', `${clients.length} courriels copiés dans le presse-papier.`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="Campagnes" showBack />
      {loading ? (
        <ActivityIndicator size="large" color="#0891B2" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Clients avec courriel</Text>
            <Text style={styles.summaryValue}>{clients.length}</Text>
            <TouchableOpacity style={styles.copyBtn} activeOpacity={0.7} onPress={copyAllEmails}>
              <Feather name="copy" size={14} color="#0891B2" />
              <Text style={styles.copyBtnText}>Copier tous les courriels</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>CAMPAGNES SAISONNIÈRES</Text>
          {CAMPAIGNS.map(c => (
            <TouchableOpacity
              key={c.id}
              testID={`campaign-${c.id}`}
              style={[styles.campaignCard, { borderLeftColor: c.color }]}
              activeOpacity={0.7}
              onPress={() => openPreview(c)}
              disabled={clients.length === 0}
            >
              <View style={styles.campaignHead}>
                <Text style={styles.campaignIcon}>{c.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.campaignLabel}>{c.label}</Text>
                  <Text style={styles.campaignSubject}>{c.subject}</Text>
                </View>
                <Feather name="eye" size={18} color={c.color} />
              </View>
              <View style={[styles.sendPill, { backgroundColor: c.color }]}>
                <Feather name="send" size={12} color="#FFF" />
                <Text style={styles.sendPillText}>Aperçu et envoi ({clients.length} clients)</Text>
              </View>
            </TouchableOpacity>
          ))}

          <View style={styles.infoCard}>
            <Feather name="info" size={16} color="#0891B2" />
            <Text style={styles.infoText}>
              Cliquez sur une campagne pour voir l'aperçu, modifier le texte, et sélectionner les destinataires avant d'envoyer.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* PREVIEW MODAL */}
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
                {preview?.campaign.icon} Aperçu
              </Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
              {/* Email preview card */}
              <View style={styles.emailPreviewCard}>
                <View style={styles.emailHeader}>
                  <View style={styles.emailRow}>
                    <Text style={styles.emailLbl}>De</Text>
                    <Text style={styles.emailVal}>Lavage de Vitres Bois-Franc</Text>
                  </View>
                  <View style={styles.emailRow}>
                    <Text style={styles.emailLbl}>À</Text>
                    <Text style={styles.emailVal}>{selectedCount} client{selectedCount > 1 ? 's' : ''} (BCC)</Text>
                  </View>
                  <View style={[styles.emailRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.emailLbl}>Objet</Text>
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

              {/* Recipients list */}
              <Text style={styles.listTitle}>
                DESTINATAIRES ({selectedCount} sélectionné{selectedCount > 1 ? 's' : ''} sur {clients.length})
              </Text>
              <Text style={styles.listHint}>Appuyez sur un client pour l'exclure de l'envoi</Text>
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

            {/* Footer actions */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.footerBtn, styles.footerBtnCancel]}
                activeOpacity={0.7}
                onPress={() => setPreview(null)}
              >
                <Text style={styles.footerBtnCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="send-campaign-confirm"
                style={[styles.footerBtn, { backgroundColor: preview?.campaign.color || '#0891B2' }]}
                activeOpacity={0.7}
                onPress={sendCampaign}
                disabled={selectedCount === 0}
              >
                <Feather name="send" size={16} color="#FFF" />
                <Text style={styles.footerBtnText}>Envoyer à {selectedCount}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
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
    overflow: 'hidden', marginBottom: 20,
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
