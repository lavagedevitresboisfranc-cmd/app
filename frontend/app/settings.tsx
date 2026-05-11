import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import { useTheme, ThemeMode } from '../src/theme/ThemeContext';
import { getPushState, enablePush, disablePush, sendTestPush, PushState } from '../src/webPush';

export default function SettingsScreen() {
  const { mode, setMode, colors, isDark, scheme } = useTheme();

  // === Push notifications state ===
  const [push, setPush] = useState<PushState>({ supported: false, permission: 'unsupported', subscribed: false, endpoint: '' });
  const [busy, setBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');

  const refreshPush = useCallback(async () => {
    const s = await getPushState();
    setPush(s);
  }, []);

  useEffect(() => { refreshPush(); }, [refreshPush]);

  const handleEnable = async () => {
    setBusy(true); setPushMsg('');
    const r = await enablePush(`${Platform.OS === 'web' ? 'PWA' : 'Native'} - ${new Date().toLocaleDateString('fr-CA')}`);
    setBusy(false);
    if (r.ok) {
      setPushMsg('✅ Notifications activées sur cet appareil!');
      // Send a quick test
      const t = await sendTestPush();
      setPushMsg(`✅ Notifications activées. Test envoyé à ${t.sent}/${t.total} appareil(s).`);
    } else {
      setPushMsg('⚠️ ' + (r.error || 'Échec'));
    }
    refreshPush();
  };

  const handleDisable = async () => {
    setBusy(true); setPushMsg('');
    const r = await disablePush();
    setBusy(false);
    setPushMsg(r.ok ? '🔕 Notifications désactivées.' : '⚠️ ' + (r.error || 'Échec'));
    refreshPush();
  };

  const handleTest = async () => {
    setBusy(true); setPushMsg('');
    const t = await sendTestPush();
    setBusy(false);
    setPushMsg(`📨 Test envoyé à ${t.sent}/${t.total} appareil(s). ${t.failed ? `(${t.failed} échec)` : ''}`);
  };

  const themeOptions: { id: ThemeMode; label: string; icon: keyof typeof Feather.glyphMap; description: string }[] = [
    { id: 'auto',  label: 'Automatique', icon: 'smartphone', description: 'Suit le réglage système de votre appareil' },
    { id: 'light', label: 'Clair',       icon: 'sun',        description: 'Interface claire en permanence' },
    { id: 'dark',  label: 'Sombre',      icon: 'moon',       description: 'Interface sombre en permanence (économise la batterie OLED)' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <AppHeader title="Paramètres" showBack />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* === Notifications push (PWA) === */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>NOTIFICATIONS</Text>
          <Text style={[styles.sectionHint, { color: colors.textSubtle }]}>
            Recevez une alerte instantanée sur cet appareil pour chaque nouvelle demande ou réponse client.
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}>
            {!push.supported ? (
              <View>
                <Text style={[styles.optionLabel, { color: colors.text }]}>📵 Non disponible</Text>
                <Text style={[styles.optionDesc, { color: colors.textMuted, marginTop: 6 }]}>
                  Sur iPhone, installez d'abord l'app: tapez « Partager » → « Sur l'écran d'accueil » → puis ouvrez l'app depuis l'icône Gexia360 et revenez ici.
                </Text>
              </View>
            ) : (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Feather name={push.subscribed ? 'bell' : 'bell-off'} size={22} color={push.subscribed ? '#10B981' : '#A3A3A3'} />
                  <Text style={[styles.optionLabel, { color: colors.text, marginLeft: 12 }]}>
                    {push.subscribed ? 'Activées sur cet appareil' : 'Désactivées'}
                  </Text>
                </View>
                {push.permission === 'denied' && (
                  <Text style={[styles.optionDesc, { color: '#DC2626', marginBottom: 10 }]}>
                    ⚠️ Permission refusée. Pour activer: Réglages iOS → Notifications → cherchez « Gexia360 » → Autoriser.
                  </Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {!push.subscribed ? (
                    <TouchableOpacity
                      style={[styles.btn, { backgroundColor: '#10B981' }]}
                      onPress={handleEnable}
                      disabled={busy}
                    >
                      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>🔔 Activer</Text>}
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity style={[styles.btn, { backgroundColor: '#0B5394', flex: 1 }]} onPress={handleTest} disabled={busy}>
                        <Text style={styles.btnText}>📨 Tester</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btn, { backgroundColor: '#DC2626', flex: 1 }]} onPress={handleDisable} disabled={busy}>
                        <Text style={styles.btnText}>🔕 Désactiver</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
                {!!pushMsg && (
                  <Text style={[styles.optionDesc, { color: colors.text, marginTop: 12 }]}>{pushMsg}</Text>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Theme section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>APPARENCE</Text>
          <Text style={[styles.sectionHint, { color: colors.textSubtle }]}>
            Mode actuel : {scheme === 'dark' ? '🌙 Sombre' : '☀️ Clair'}
          </Text>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {themeOptions.map((opt, i) => {
              const selected = mode === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.option,
                    i < themeOptions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                  onPress={() => setMode(opt.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, { backgroundColor: selected ? colors.primarySoft : colors.cardAlt }]}>
                    <Feather name={opt.icon} size={18} color={selected ? colors.primarySoftText : colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, { color: colors.text }]}>{opt.label}</Text>
                    <Text style={[styles.optionDesc, { color: colors.textMuted }]}>{opt.description}</Text>
                  </View>
                  {selected && <Feather name="check-circle" size={22} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* About section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>À PROPOS</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}>
            <Text style={[styles.aboutApp, { color: colors.text }]}>Gexia360</Text>
            <Text style={[styles.aboutVersion, { color: colors.textMuted }]}>Application de gestion pour laveurs de vitres</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    marginBottom: 4, marginLeft: 6,
  },
  sectionHint: { fontSize: 12, marginBottom: 10, marginLeft: 6 },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  iconBox: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  optionLabel: { fontSize: 15, fontWeight: '700' },
  optionDesc: { fontSize: 12, marginTop: 2, lineHeight: 18 },
  aboutApp: { fontSize: 18, fontWeight: '800' },
  aboutVersion: { fontSize: 12, marginTop: 4 },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});
