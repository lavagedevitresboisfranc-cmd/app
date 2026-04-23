import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import { useTheme, ThemeMode } from '../src/theme/ThemeContext';

export default function SettingsScreen() {
  const { mode, setMode, colors, isDark, scheme } = useTheme();

  const themeOptions: { id: ThemeMode; label: string; icon: keyof typeof Feather.glyphMap; description: string }[] = [
    { id: 'auto',  label: 'Automatique', icon: 'smartphone', description: 'Suit le réglage système de votre appareil' },
    { id: 'light', label: 'Clair',       icon: 'sun',        description: 'Interface claire en permanence' },
    { id: 'dark',  label: 'Sombre',      icon: 'moon',       description: 'Interface sombre en permanence (économise la batterie OLED)' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <AppHeader title="Paramètres" showBack />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
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
  optionDesc: { fontSize: 12, marginTop: 2 },
  aboutApp: { fontSize: 18, fontWeight: '800' },
  aboutVersion: { fontSize: 12, marginTop: 4 },
});
