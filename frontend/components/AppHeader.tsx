import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Flag } from './Flag';
import { saveLanguage, SUPPORTED_LANGUAGES } from '../src/i18n';

interface Props {
  title?: string;
  showBack?: boolean;
}

type MenuItem = { icon: any; labelKey: string; route: string };
type MenuSection = { titleKey: string; color: string; items: MenuItem[] };

const menuSections: MenuSection[] = [
  {
    titleKey: 'menu.sections.agenda',
    color: '#0891B2',
    items: [
      { icon: 'calendar' as const, labelKey: 'menu.items.calendar', route: '/' },
      { icon: 'list' as const, labelKey: 'menu.items.allAppointments', route: '/appointments' },
      { icon: 'plus-circle' as const, labelKey: 'menu.items.newAppointment', route: '/create' },
      { icon: 'inbox' as const, labelKey: 'menu.items.requests', route: '/requests' },
    ],
  },
  {
    titleKey: 'menu.sections.clients',
    color: '#D97706',
    items: [
      { icon: 'database' as const, labelKey: 'menu.items.clientsDb', route: '/clients-db' },
      { icon: 'user' as const, labelKey: 'menu.items.clientsHistory', route: '/client-history' },
      { icon: 'star' as const, labelKey: 'menu.items.reviews', route: '/reviews' },
    ],
  },
  {
    titleKey: 'menu.sections.marketing',
    color: '#7C3AED',
    items: [
      { icon: 'dollar-sign' as const, labelKey: 'menu.items.estimate', route: '/estimate' },
      { icon: 'send' as const, labelKey: 'menu.items.campaigns', route: '/campaigns' },
      { icon: 'grid' as const, labelKey: 'menu.items.qr', route: '/qr' },
    ],
  },
  {
    titleKey: 'menu.sections.team',
    color: '#16A34A',
    items: [
      { icon: 'users' as const, labelKey: 'menu.items.employees', route: '/employees' },
      { icon: 'bar-chart-2' as const, labelKey: 'menu.items.stats', route: '/stats' },
    ],
  },
  {
    titleKey: 'menu.sections.system',
    color: '#64748B',
    items: [
      { icon: 'cloud' as const, labelKey: 'menu.items.backup', route: '/backup' },
    ],
  },
];

export default function AppHeader({ title, showBack }: Props) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentLang = i18n.language || 'fr';

  const goTo = (route: string) => {
    setMenuOpen(false);
    if (route === '/') router.replace('/');
    else router.push(route as any);
  };

  const changeLang = async (code: string) => {
    await saveLanguage(code);
  };

  return (
    <>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.drawer} onPress={(e) => e.stopPropagation()}>
            {/* Logo in menu */}
            <View style={styles.logoRow}>
              <View style={styles.logoGrid}>
                <View style={[styles.pane, { backgroundColor: '#0891B2' }]} />
                <View style={[styles.pane, { backgroundColor: '#06B6D4' }]} />
                <View style={[styles.pane, { backgroundColor: '#06B6D4' }]} />
                <View style={[styles.pane, { backgroundColor: '#22D3EE' }]} />
              </View>
              <Text style={styles.logoText}>Bright<Text style={{ color: '#0891B2' }}>Calendar</Text></Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              {/* Language Selector */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionDot, { backgroundColor: '#EC4899' }]} />
                  <Text style={[styles.sectionTitle, { color: '#EC4899' }]}>{t('menu.sections.language')}</Text>
                </View>
                <View style={styles.flagRow}>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <TouchableOpacity
                      key={lang.code}
                      testID={`lang-${lang.code}`}
                      style={[styles.flagBtn, currentLang === lang.code && styles.flagBtnActive]}
                      activeOpacity={0.7}
                      onPress={() => changeLang(lang.code)}
                    >
                      <Flag code={lang.code} size={36} />
                      <Text style={[styles.flagLabel, currentLang === lang.code && styles.flagLabelActive]}>
                        {lang.code.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {menuSections.map((section) => (
                <View key={section.titleKey} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={[styles.sectionDot, { backgroundColor: section.color }]} />
                    <Text style={[styles.sectionTitle, { color: section.color }]}>{t(section.titleKey)}</Text>
                  </View>
                  {section.items.map((item) => (
                    <TouchableOpacity
                      key={item.route}
                      testID={`menu-${item.labelKey}`}
                      style={styles.menuItem}
                      activeOpacity={0.7}
                      onPress={() => goTo(item.route)}
                    >
                      <Feather name={item.icon} size={20} color="#0A0A0A" />
                      <Text style={styles.menuItemText}>{t(item.labelKey)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.header}>
        <TouchableOpacity testID="hamburger-menu" onPress={() => setMenuOpen(true)} style={styles.btn} activeOpacity={0.7}>
          <Feather name="menu" size={24} color="#0A0A0A" />
        </TouchableOpacity>

        {title ? (
          <Text style={styles.title}>{title}</Text>
        ) : (
          <View style={styles.logoRowSmall}>
            <View style={styles.logoGridSmall}>
              <View style={[styles.paneSmall, { backgroundColor: '#0891B2' }]} />
              <View style={[styles.paneSmall, { backgroundColor: '#06B6D4' }]} />
              <View style={[styles.paneSmall, { backgroundColor: '#06B6D4' }]} />
              <View style={[styles.paneSmall, { backgroundColor: '#22D3EE' }]} />
            </View>
            <Text style={styles.logoTextSmall}>Bright<Text style={{ color: '#0891B2' }}>Calendar</Text></Text>
          </View>
        )}

        {showBack ? (
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.btn} activeOpacity={0.7}>
            <Feather name="arrow-left" size={22} color="#0A0A0A" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity testID="add-btn" onPress={() => router.push('/create')} style={styles.btn} activeOpacity={0.7}>
            <Feather name="plus" size={24} color="#0891B2" />
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FAFAFA',
    borderBottomWidth: 1, borderColor: '#E5E5E5',
  },
  btn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  logoRowSmall: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoGridSmall: { width: 24, height: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 1.5, borderRadius: 3 },
  paneSmall: { width: 11, height: 11, borderRadius: 1.5 },
  logoTextSmall: { fontSize: 18, fontWeight: '800', color: '#0A0A0A' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', flexDirection: 'row' },
  drawer: {
    width: 290, backgroundColor: '#FFFFFF', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 10,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#E5E5E5' },
  logoGrid: { width: 32, height: 32, flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderRadius: 4 },
  pane: { width: 15, height: 15, borderRadius: 2 },
  logoText: { fontSize: 20, fontWeight: '800', color: '#0A0A0A' },
  section: { marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 2 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingLeft: 16, borderRadius: 8 },
  menuItemText: { fontSize: 15, fontWeight: '600', color: '#0A0A0A' },
  flagRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingTop: 4 },
  flagBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#F9FAFB',
  },
  flagBtnActive: {
    borderColor: '#EC4899',
    backgroundColor: '#FDF2F8',
  },
  flagLabel: { fontSize: 11, fontWeight: '800', color: '#6B7280', letterSpacing: 0.5 },
  flagLabelActive: { color: '#EC4899' },
});
