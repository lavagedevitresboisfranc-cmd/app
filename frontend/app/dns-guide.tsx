import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AppHeader from '../components/AppHeader';

const copy = async (text: string) => {
  try {
    await Clipboard.setStringAsync(text);
    Alert.alert('✅ Copié', `"${text.length > 50 ? text.slice(0, 50) + '...' : text}" copié dans le presse-papier`);
  } catch {
    Alert.alert('❌ Erreur', 'Impossible de copier');
  }
};

function CopyRow({ label, value }: { label?: string; value: string }) {
  return (
    <View style={styles.copyRow}>
      <View style={{ flex: 1 }}>
        {label && <Text style={styles.copyLabel}>{label}</Text>}
        <Text style={styles.copyValue} selectable>{value}</Text>
      </View>
      <TouchableOpacity onPress={() => copy(value)} style={styles.copyBtn} activeOpacity={0.7}>
        <Feather name="copy" size={16} color="#0891B2" />
      </TouchableOpacity>
    </View>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHeader}>
        <View style={styles.stepNum}><Text style={styles.stepNumText}>{n}</Text></View>
        <Text style={styles.stepTitle}>{title}</Text>
      </View>
      <View style={styles.stepBody}>{children}</View>
    </View>
  );
}

export default function DnsGuideScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="📧 Guide DNS Resend" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.introTitle}>🎯 Objectif</Text>
          <Text style={styles.introText}>
            Vérifier votre domaine <Text style={{ fontWeight: '800' }}>lavagedevitre.org</Text> chez Resend pour envoyer des campagnes automatiques sans limitation sandbox.
          </Text>
          <Text style={styles.introText}>
            ⏱️ Temps estimé: 10-15 minutes + propagation DNS (15 min à 4 h)
          </Text>
        </View>

        {/* STEP 1 */}
        <Step n={1} title="Obtenir les enregistrements DNS de Resend">
          <Text style={styles.bodyText}>
            1️⃣ Ouvrez Resend et ajoutez votre domaine:
          </Text>
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => Linking.openURL('https://resend.com/domains/add')}
            activeOpacity={0.7}
          >
            <Feather name="external-link" size={16} color="#fff" />
            <Text style={styles.linkBtnText}>Ouvrir resend.com/domains/add</Text>
          </TouchableOpacity>
          <Text style={styles.bodyText}>
            2️⃣ Tapez <Text style={styles.mono}>lavagedevitre.org</Text> et cliquez "Add".
          </Text>
          <Text style={styles.bodyText}>
            3️⃣ Resend affichera 3 enregistrements DNS à ajouter. Gardez cet onglet ouvert.
          </Text>
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              ⚠️ Chaque domaine a des valeurs uniques. Copiez les vôtres depuis le dashboard Resend, pas les exemples ci-dessous.
            </Text>
          </View>
        </Step>

        {/* STEP 2 */}
        <Step n={2} title="Se connecter au Panneau Netfirms">
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => Linking.openURL('https://www.netfirms.ca/ca/')}
            activeOpacity={0.7}
          >
            <Feather name="external-link" size={16} color="#fff" />
            <Text style={styles.linkBtnText}>Ouvrir netfirms.ca</Text>
          </TouchableOpacity>
          <Text style={styles.bodyText}>
            1️⃣ Cliquez <Text style={styles.mono}>Se Connecter</Text> (en haut à droite).
          </Text>
          <Text style={styles.bodyText}>
            2️⃣ Entrez votre nom d'utilisateur et mot de passe Netfirms.
          </Text>
          <Text style={styles.bodyText}>
            3️⃣ Une fois dans le tableau de bord, cherchez <Text style={styles.mono}>lavagedevitre.org</Text> dans la liste des domaines.
          </Text>
          <Text style={styles.bodyText}>
            4️⃣ Cliquez sur <Text style={styles.mono}>Gérer</Text> (ou "Manage") à côté du domaine.
          </Text>
        </Step>

        {/* STEP 3 */}
        <Step n={3} title="Ouvrir le Gestionnaire DNS (DNS Manager)">
          <Text style={styles.bodyText}>
            1️⃣ Dans la page du domaine, cherchez <Text style={styles.mono}>DNS Manager</Text>, <Text style={styles.mono}>Gestion DNS</Text> ou <Text style={styles.mono}>Advanced DNS</Text>.
          </Text>
          <Text style={styles.bodyText}>
            2️⃣ Vous verrez un tableau avec des colonnes <Text style={styles.mono}>Host/Name</Text>, <Text style={styles.mono}>Type</Text>, <Text style={styles.mono}>Value/Points to</Text>, <Text style={styles.mono}>TTL</Text>.
          </Text>
          <Text style={styles.bodyText}>
            3️⃣ Cliquez <Text style={styles.mono}>Add Record</Text> ou <Text style={styles.mono}>+</Text> pour ajouter.
          </Text>
        </Step>

        {/* STEP 4 */}
        <Step n={4} title="Ajouter Enregistrement #1 — SPF (TXT)">
          <Text style={styles.bodyText}>Créez un enregistrement TXT:</Text>
          <View style={styles.recordCard}>
            <CopyRow label="Type" value="TXT" />
            <CopyRow label="Host / Name" value="send" />
            <CopyRow label="Value" value="v=spf1 include:amazonses.com ~all" />
            <CopyRow label="TTL" value="300" />
          </View>
          <Text style={styles.noteText}>
            ℹ️ Si Netfirms demande FQDN complet, utilisez <Text style={styles.mono}>send.lavagedevitre.org</Text>.
          </Text>
        </Step>

        {/* STEP 5 */}
        <Step n={5} title="Ajouter Enregistrement #2 — DKIM (TXT)">
          <Text style={styles.bodyText}>
            Copiez la valeur exacte du dashboard Resend (c'est une longue chaîne commençant par <Text style={styles.mono}>p=...</Text>):
          </Text>
          <View style={styles.recordCard}>
            <CopyRow label="Type" value="TXT" />
            <CopyRow label="Host / Name" value="resend._domainkey" />
            <Text style={styles.copyLabel}>Value (EXEMPLE — utilisez celle de Resend)</Text>
            <Text style={styles.monoBox} selectable>
              p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...
            </Text>
            <CopyRow label="TTL" value="300" />
          </View>
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              ⚠️ La valeur DKIM est TRÈS longue (~380 caractères). Copiez-la EXACTEMENT depuis Resend sans espaces ajoutés.
            </Text>
          </View>
        </Step>

        {/* STEP 6 */}
        <Step n={6} title="Ajouter Enregistrement #3 — DMARC (TXT)">
          <View style={styles.recordCard}>
            <CopyRow label="Type" value="TXT" />
            <CopyRow label="Host / Name" value="_dmarc" />
            <CopyRow label="Value" value="v=DMARC1; p=none;" />
            <CopyRow label="TTL" value="300" />
          </View>
          <Text style={styles.noteText}>
            ℹ️ DMARC est parfois optionnel mais recommandé. Utilisez <Text style={styles.mono}>p=none</Text> au début (mode "monitor only").
          </Text>
        </Step>

        {/* STEP 7 */}
        <Step n={7} title="Ajouter Enregistrement #4 — MX (optionnel, bounces)">
          <Text style={styles.bodyText}>
            Resend demande aussi un MX pour gérer les rebonds (retours):
          </Text>
          <View style={styles.recordCard}>
            <CopyRow label="Type" value="MX" />
            <CopyRow label="Host / Name" value="send" />
            <CopyRow label="Priority" value="10" />
            <CopyRow label="Value" value="feedback-smtp.us-east-1.amazonses.com" />
            <CopyRow label="TTL" value="300" />
          </View>
        </Step>

        {/* STEP 8 */}
        <Step n={8} title="Vérifier la configuration">
          <Text style={styles.bodyText}>
            1️⃣ Sauvegardez chaque enregistrement dans Netfirms (bouton <Text style={styles.mono}>Save</Text>).
          </Text>
          <Text style={styles.bodyText}>
            2️⃣ Attendez 15 min à 4h (propagation DNS mondiale).
          </Text>
          <Text style={styles.bodyText}>
            3️⃣ Testez la propagation:
          </Text>
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => Linking.openURL('https://dnschecker.org/#TXT/send.lavagedevitre.org')}
            activeOpacity={0.7}
          >
            <Feather name="external-link" size={16} color="#fff" />
            <Text style={styles.linkBtnText}>Vérifier SPF (dnschecker.org)</Text>
          </TouchableOpacity>
          <Text style={styles.bodyText}>
            4️⃣ Retournez sur Resend et cliquez <Text style={styles.mono}>Verify DNS Records</Text>.
          </Text>
          <Text style={styles.bodyText}>
            5️⃣ Quand le statut passe à <Text style={{ color: '#10B981', fontWeight: '800' }}>Verified ✅</Text>, votre domaine est prêt!
          </Text>
        </Step>

        {/* STEP 9 */}
        <Step n={9} title="Mettre à jour l'expéditeur dans CrystalTask">
          <Text style={styles.bodyText}>
            Une fois vérifié, je dois changer l'adresse d'expéditeur dans le backend de:
          </Text>
          <Text style={styles.monoBox} selectable>onboarding@resend.dev</Text>
          <Text style={styles.bodyText}>vers votre domaine, par exemple:</Text>
          <Text style={styles.monoBox} selectable>noreply@lavagedevitre.org</Text>
          <Text style={styles.bodyText}>
            Revenez me voir après vérification et je mettrai à jour le code 🛠️
          </Text>
        </Step>

        {/* FAQ */}
        <View style={styles.faqCard}>
          <Text style={styles.faqTitle}>❓ Problèmes fréquents</Text>

          <Text style={styles.faqQ}>Mon enregistrement TXT DKIM est refusé (trop long)</Text>
          <Text style={styles.faqA}>
            Netfirms devrait l'accepter. Si refusé, vérifiez qu'il n'y a pas de guillemets ajoutés autour de la valeur.
          </Text>

          <Text style={styles.faqQ}>Resend dit "Pending" après 4h</Text>
          <Text style={styles.faqA}>
            Vérifiez que vous utilisez <Text style={styles.mono}>send</Text> (pas <Text style={styles.mono}>@</Text>) comme Host/Name. Sur dnschecker.org, testez <Text style={styles.mono}>send.lavagedevitre.org</Text>.
          </Text>

          <Text style={styles.faqQ}>Est-ce gratuit?</Text>
          <Text style={styles.faqA}>
            Oui! L'ajout d'enregistrements DNS chez Netfirms est gratuit. Resend gratuit = 100 emails/jour, 3000/mois.
          </Text>

          <Text style={styles.faqQ}>Mon domaine principal (site web) va-t-il casser?</Text>
          <Text style={styles.faqA}>
            Non. Ces enregistrements ajoutent des sous-domaines (send, _dmarc, resend._domainkey). Votre site web reste intact.
          </Text>
        </View>

        {/* Contact */}
        <TouchableOpacity
          style={styles.contactBtn}
          onPress={() => Linking.openURL('https://resend.com/docs/dashboard/domains/introduction')}
          activeOpacity={0.7}
        >
          <Feather name="book-open" size={18} color="#fff" />
          <Text style={styles.contactBtnText}>📚 Documentation officielle Resend</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  intro: { backgroundColor: '#0891B2', padding: 16, borderRadius: 14 },
  introTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 6 },
  introText: { color: '#ECFEFF', fontSize: 14, marginTop: 4, lineHeight: 20 },
  step: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#0891B2', justifyContent: 'center', alignItems: 'center' },
  stepNumText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  stepTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#111' },
  stepBody: { padding: 14, gap: 10 },
  bodyText: { fontSize: 14, color: '#374151', lineHeight: 20 },
  noteText: { fontSize: 12, color: '#6B7280', fontStyle: 'italic', lineHeight: 17 },
  mono: { fontFamily: 'Courier', backgroundColor: '#F3F4F6', paddingHorizontal: 4, borderRadius: 3, color: '#111', fontWeight: '700' },
  monoBox: { fontFamily: 'Courier', backgroundColor: '#F3F4F6', padding: 10, borderRadius: 8, color: '#111', fontSize: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  recordCard: { backgroundColor: '#FAFAFA', borderRadius: 10, padding: 10, gap: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  copyLabel: { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, marginBottom: 2 },
  copyValue: { fontFamily: 'Courier', fontSize: 13, color: '#111', fontWeight: '600' },
  copyBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#ECFEFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#A5F3FC' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0891B2', paddingVertical: 12, borderRadius: 10 },
  linkBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  warnBox: { backgroundColor: '#FEF3C7', borderLeftWidth: 4, borderLeftColor: '#F59E0B', padding: 10, borderRadius: 6 },
  warnText: { fontSize: 12, color: '#92400E', fontWeight: '600', lineHeight: 17 },
  faqCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  faqTitle: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 10 },
  faqQ: { fontSize: 13, fontWeight: '800', color: '#0891B2', marginTop: 10 },
  faqA: { fontSize: 13, color: '#374151', marginTop: 4, lineHeight: 18 },
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7C3AED', paddingVertical: 14, borderRadius: 10 },
  contactBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
