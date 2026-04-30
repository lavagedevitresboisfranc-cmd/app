import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Platform, Linking, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface CalendarInfo {
  enabled: boolean;
  url?: string;
  webcal_url?: string;
  refresh_minutes?: number;
  message?: string;
}

export default function CalendarSyncScreen() {
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<CalendarInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/calendar/info`);
      const data = await r.json();
      setInfo(data);
    } catch (e) {
      setInfo({ enabled: false, message: 'Erreur — impossible de récupérer le lien.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const showOk = (msg: string) => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      window.alert(msg);
    } else {
      Alert.alert('Copié!', msg);
    }
  };

  const handleCopy = async () => {
    if (!info?.url) return;
    try {
      await Clipboard.setStringAsync(info.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      showOk('Lien copié! Vous pouvez maintenant le coller dans Apple Calendar.');
    } catch {
      showOk('Voici le lien :\n\n' + info.url);
    }
  };

  const handleSubscribe = async () => {
    if (!info?.webcal_url) return;
    // webcal:// scheme triggers iOS to open the system calendar subscription dialog
    if (Platform.OS === 'web') {
      // On iOS Safari (PWA), webcal:// works — open in same window
      try {
        window.location.href = info.webcal_url;
      } catch {
        // Fallback: copy to clipboard
        handleCopy();
      }
    } else {
      try {
        await Linking.openURL(info.webcal_url);
      } catch {
        handleCopy();
      }
    }
  };

  const handleShare = async () => {
    if (!info?.url) return;
    try {
      if (Platform.OS === 'web' && (navigator as any).share) {
        await (navigator as any).share({
          title: 'Synchro Apple Calendar — Gexia360',
          text: 'Mon flux iCalendar (.ics) Gexia360',
          url: info.url,
        });
      } else {
        await Share.share({
          message: `Lien iCalendar Gexia360 :\n${info.url}`,
          url: info.url,
        });
      }
    } catch {
      handleCopy();
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader title="Synchro Apple Calendar" showBack />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0B5394" />
        </View>
      </View>
    );
  }

  if (!info?.enabled) {
    return (
      <View style={styles.container}>
        <AppHeader title="Synchro Apple Calendar" showBack />
        <View style={styles.center}>
          <Feather name="alert-circle" size={48} color="#DC2626" />
          <Text style={styles.errorText}>{info?.message || 'Configuration manquante'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader title="Synchro Apple Calendar" showBack />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>📅</Text>
          <Text style={styles.heroTitle}>Voyez vos rendez-vous{'\n'}directement dans Apple Calendar</Text>
          <Text style={styles.heroSub}>
            Tous vos RDV Gexia360 apparaissent automatiquement sur votre iPhone, Mac, iPad et Apple Watch.
          </Text>
        </View>

        {/* Quick subscribe button */}
        <TouchableOpacity
          testID="subscribe-button"
          style={styles.subscribeBtn}
          activeOpacity={0.85}
          onPress={handleSubscribe}
        >
          <Feather name="calendar" size={22} color="#FFFFFF" />
          <Text style={styles.subscribeBtnText}>S'abonner sur cet iPhone</Text>
        </TouchableOpacity>

        <Text style={styles.subBtnHint}>
          📱 Touchez ce bouton sur votre iPhone — Apple Calendar va vous demander de confirmer.
        </Text>

        {/* Or divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OU manuellement</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* URL block */}
        <View style={styles.urlCard}>
          <Text style={styles.urlLabel}>Lien d'abonnement (gardez secret)</Text>
          <Text style={styles.urlValue} selectable>
            {info.url}
          </Text>
          <View style={styles.urlBtnRow}>
            <TouchableOpacity
              testID="copy-button"
              style={[styles.urlBtn, { backgroundColor: copied ? '#10B981' : '#0B5394' }]}
              activeOpacity={0.8}
              onPress={handleCopy}
            >
              <Feather name={copied ? 'check' : 'copy'} size={16} color="#FFFFFF" />
              <Text style={styles.urlBtnText}>{copied ? 'Copié!' : 'Copier'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="share-button"
              style={[styles.urlBtn, { backgroundColor: '#64748B' }]}
              activeOpacity={0.8}
              onPress={handleShare}
            >
              <Feather name="share-2" size={16} color="#FFFFFF" />
              <Text style={styles.urlBtnText}>Partager</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Instructions iPhone */}
        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>📲 Configurer sur iPhone</Text>
          <View style={styles.step}>
            <Text style={styles.stepNum}>1</Text>
            <Text style={styles.stepText}>Ouvrez l'app <Text style={styles.bold}>Réglages</Text></Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>2</Text>
            <Text style={styles.stepText}>Faites défiler et touchez <Text style={styles.bold}>Calendrier</Text></Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>3</Text>
            <Text style={styles.stepText}>Touchez <Text style={styles.bold}>Comptes</Text> → <Text style={styles.bold}>Ajouter un compte</Text></Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>4</Text>
            <Text style={styles.stepText}>Choisissez <Text style={styles.bold}>Autre</Text></Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>5</Text>
            <Text style={styles.stepText}>Touchez <Text style={styles.bold}>Ajouter un calendrier d'abonnement</Text></Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>6</Text>
            <Text style={styles.stepText}>Collez le lien copié dans le champ <Text style={styles.bold}>Serveur</Text> → <Text style={styles.bold}>Suivant</Text></Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>7</Text>
            <Text style={styles.stepText}>Touchez <Text style={styles.bold}>Enregistrer</Text> ✅</Text>
          </View>
        </View>

        {/* Instructions Mac */}
        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>💻 Configurer sur Mac</Text>
          <View style={styles.step}>
            <Text style={styles.stepNum}>1</Text>
            <Text style={styles.stepText}>Ouvrez l'app <Text style={styles.bold}>Calendrier</Text></Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>2</Text>
            <Text style={styles.stepText}>Menu <Text style={styles.bold}>Fichier → Nouvel abonnement à un calendrier</Text> (⌥⌘S)</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>3</Text>
            <Text style={styles.stepText}>Collez le lien et cliquez <Text style={styles.bold}>S'abonner</Text></Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>4</Text>
            <Text style={styles.stepText}>Réglez la fréquence sur <Text style={styles.bold}>Toutes les 15 minutes</Text></Text>
          </View>
        </View>

        {/* Forcer le rafraîchissement / désabonner */}
        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>🔄 Forcer une mise à jour ou se désabonner</Text>
          <Text style={[styles.stepText, { marginBottom: 10, fontStyle: 'italic' }]}>
            Si l'adresse n'est pas cliquable ou si vous voulez recommencer:
          </Text>
          <View style={styles.step}>
            <Text style={styles.stepNum}>1</Text>
            <Text style={styles.stepText}>Ouvrez l'app <Text style={styles.bold}>Calendrier</Text> sur votre iPhone</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>2</Text>
            <Text style={styles.stepText}>Touchez <Text style={styles.bold}>Calendriers</Text> en bas au centre</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>3</Text>
            <Text style={styles.stepText}>
              Cherchez la section <Text style={styles.bold}>"ABONNEMENTS"</Text> tout en bas de la liste
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>4</Text>
            <Text style={styles.stepText}>
              Touchez le <Text style={styles.bold}>(i)</Text> à côté de <Text style={styles.bold}>"Gexia360 — Rendez-vous"</Text>
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNum}>5</Text>
            <Text style={styles.stepText}>
              Pour rafraîchir: touchez <Text style={styles.bold}>"Actualiser le calendrier"</Text>{'\n'}
              Pour supprimer: touchez <Text style={[styles.bold, { color: '#DC2626' }]}>"Supprimer le calendrier"</Text>
            </Text>
          </View>
          <Text style={[styles.stepText, { marginTop: 10, color: '#64748B', fontSize: 12 }]}>
            💡 Après avoir supprimé, retournez en haut de cette page et cliquez à nouveau "S'abonner sur cet iPhone" pour ré-importer la version la plus récente avec les cartes GPS.
          </Text>
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <Feather name="info" size={18} color="#0B5394" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.infoTitle}>Bon à savoir</Text>
            <Text style={styles.infoText}>
              • Mise à jour automatique toutes les <Text style={styles.bold}>{info.refresh_minutes ?? 15} minutes</Text>{'\n'}
              • Lecture seule — modifiez vos RDV dans Gexia360{'\n'}
              • Rappel automatique 24h avant chaque RDV{'\n'}
              • Inclut adresse, téléphone, prix du client{'\n'}
              • Fonctionne aussi avec Google Calendar et Outlook
            </Text>
          </View>
        </View>

        {/* Security warning */}
        <View style={styles.warnCard}>
          <Feather name="lock" size={18} color="#B91C1C" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.warnTitle}>Sécurité</Text>
            <Text style={styles.warnText}>
              Ne partagez ce lien avec personne. Toute personne possédant le lien peut voir tous vos rendez-vous (mais ne peut RIEN modifier).
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  errorText: { marginTop: 12, fontSize: 16, color: '#374151', textAlign: 'center' },
  content: { padding: 16 },

  hero: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  heroEmoji: { fontSize: 56, marginBottom: 8 },
  heroTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A', textAlign: 'center', marginBottom: 8 },
  heroSub: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },

  subscribeBtn: {
    backgroundColor: '#0B5394',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 14,
    marginBottom: 6,
  },
  subscribeBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  subBtnHint: { fontSize: 12, color: '#64748B', textAlign: 'center', marginBottom: 16 },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { paddingHorizontal: 12, color: '#94A3B8', fontSize: 12, fontWeight: '600' },

  urlCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginTop: 10, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  urlLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  urlValue: { fontSize: 12, color: '#0F172A', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), padding: 10, backgroundColor: '#F1F5F9', borderRadius: 8, marginBottom: 10 },
  urlBtnRow: { flexDirection: 'row', gap: 8 },
  urlBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10 },
  urlBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  instructions: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  instructionsTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  step: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#0B5394', color: '#FFFFFF', textAlign: 'center', lineHeight: 26, fontWeight: '700', fontSize: 13 },
  stepText: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  bold: { fontWeight: '700', color: '#0F172A' },

  infoCard: { flexDirection: 'row', backgroundColor: '#EFF6FF', padding: 14, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#0B5394', marginBottom: 4 },
  infoText: { fontSize: 13, color: '#1E3A8A', lineHeight: 19 },

  warnCard: { flexDirection: 'row', backgroundColor: '#FEF2F2', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA' },
  warnTitle: { fontSize: 14, fontWeight: '700', color: '#B91C1C', marginBottom: 4 },
  warnText: { fontSize: 13, color: '#7F1D1D', lineHeight: 19 },
});
