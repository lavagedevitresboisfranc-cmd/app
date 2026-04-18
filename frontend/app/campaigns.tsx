import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform, ActivityIndicator } from 'react-native';
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
    subject: 'Offre spéciale Printemps - Lavage de vitres',
    body: (count: number) => `Bonjour,\n\nLe printemps est arrivé! C'est le moment idéal pour redonner de l'éclat à vos fenêtres.\n\n🌷 OFFRE SPÉCIALE PRINTEMPS 🌷\n10% de rabais sur votre lavage de vitres\nCode: PRINTEMPS10\n\nRéservez dès maintenant avant que mon agenda se remplisse!\n\n📞 514-570-9802\n🌐 Lavagedevitre.org\n\nMerci,\nLavage de Vitres Bois-Franc`,
  },
  {
    id: 'automne',
    icon: '🍂',
    label: 'Relance Automne',
    color: '#F59E0B',
    subject: 'Préparez vos fenêtres pour l\'hiver',
    body: (count: number) => `Bonjour,\n\nAvant que l'hiver n'arrive, offrez à vos fenêtres un dernier nettoyage pour profiter pleinement de la lumière durant les mois sombres.\n\n🍂 PROMO AUTOMNE 🍂\n10% de rabais sur votre prochain lavage\nCode: AUTOMNE10\nValide jusqu'au 30 novembre\n\nUn petit geste pour des vitres éclatantes tout l'hiver!\n\n📞 514-570-9802\n🌐 Lavagedevitre.org\n\nMerci,\nLavage de Vitres Bois-Franc`,
  },
  {
    id: 'ete',
    icon: '☀️',
    label: 'Campagne Été',
    color: '#EF4444',
    subject: 'Vitres propres pour les belles journées d\'été',
    body: (count: number) => `Bonjour,\n\nL'été bat son plein! Profitez de votre cour et de votre patio avec des fenêtres parfaitement propres.\n\n☀️ SPÉCIAL ÉTÉ ☀️\n10% de rabais\nCode: ETE10\n\nRéservez votre créneau dès maintenant!\n\n📞 514-570-9802\n🌐 Lavagedevitre.org\n\nMerci,\nLavage de Vitres Bois-Franc`,
  },
];

export default function CampaignsScreen() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/clients/emails`);
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch { } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sendCampaignByEmail = async (campaign: typeof CAMPAIGNS[0]) => {
    const emails = clients.map(c => c.email).filter(Boolean);
    if (emails.length === 0) {
      Alert.alert('Aucun client', 'Aucune adresse courriel trouvée.');
      return;
    }
    const subject = campaign.subject;
    const body = campaign.body(emails.length);
    // Use BCC to protect privacy
    const bcc = emails.join(',');
    const url = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else Alert.alert('Erreur', 'Aucune app courriel disponible');
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

  const openConfirmAlert = (campaign: typeof CAMPAIGNS[0]) => {
    Alert.alert(
      `Envoyer "${campaign.label}"`,
      `Envoyer à ${clients.length} client(s)?\n\nL'app courriel va s'ouvrir avec tous les clients en copie cachée (BCC) et le message pré-rempli. Vous n'aurez qu'à appuyer sur Envoyer.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Continuer', onPress: () => sendCampaignByEmail(campaign) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="Campagnes" showBack />
      {loading ? (
        <ActivityIndicator size="large" color="#0891B2" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Summary */}
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
              onPress={() => openConfirmAlert(c)}
              disabled={clients.length === 0}
            >
              <View style={styles.campaignHead}>
                <Text style={styles.campaignIcon}>{c.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.campaignLabel}>{c.label}</Text>
                  <Text style={styles.campaignSubject}>{c.subject}</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#A3A3A3" />
              </View>
              <View style={[styles.sendPill, { backgroundColor: c.color }]}>
                <Feather name="send" size={12} color="#FFF" />
                <Text style={styles.sendPillText}>Envoyer à {clients.length} clients</Text>
              </View>
            </TouchableOpacity>
          ))}

          <View style={styles.infoCard}>
            <Feather name="info" size={16} color="#0891B2" />
            <Text style={styles.infoText}>
              Les courriels sont envoyés en BCC (copie cachée) — chaque client verra uniquement son adresse. Votre app courriel ouvrira avec tout pré-rempli, vous n'avez qu'à cliquer "Envoyer".
            </Text>
          </View>
        </ScrollView>
      )}
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
});
