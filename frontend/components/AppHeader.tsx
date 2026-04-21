import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { saveLanguage, SUPPORTED_LANGUAGES } from '../src/i18n';

interface Props {
  title?: string;
  showBack?: boolean;
}

type MenuItem = { icon: any; labelKey: string; route: string };
type MenuSection = { key: string; titleKey: string; icon: any; color: string; items: MenuItem[] };

const menuSections: MenuSection[] = [
  {
    key: 'agenda',
    titleKey: 'menu.sections.agenda',
    icon: 'calendar' as const,
    color: '#0891B2',
    items: [
      { icon: 'calendar' as const, labelKey: 'menu.items.calendar', route: '/' },
      { icon: 'list' as const, labelKey: 'menu.items.allAppointments', route: '/appointments' },
      { icon: 'plus-circle' as const, labelKey: 'menu.items.newAppointment', route: '/create' },
      { icon: 'inbox' as const, labelKey: 'menu.items.requests', route: '/requests' },
    ],
  },
  {
    key: 'clients',
    titleKey: 'menu.sections.clients',
    icon: 'users' as const,
    color: '#D97706',
    items: [
      { icon: 'database' as const, labelKey: 'menu.items.clientsDb', route: '/clients-db' },
      { icon: 'archive' as const, labelKey: 'menu.items.clientsArchive', route: '/clients-archive' },
      { icon: 'user' as const, labelKey: 'menu.items.clientsHistory', route: '/client-history' },
      { icon: 'star' as const, labelKey: 'menu.items.reviews', route: '/reviews' },
    ],
  },
  {
    key: 'marketing',
    titleKey: 'menu.sections.marketing',
    icon: 'trending-up' as const,
    color: '#7C3AED',
    items: [
      { icon: 'send' as const, labelKey: 'menu.items.campaigns', route: '/campaigns' },
      { icon: 'grid' as const, labelKey: 'menu.items.qr', route: '/qr' },
    ],
  },
  {
    key: 'finance',
    titleKey: 'menu.sections.finance',
    icon: 'dollar-sign' as const,
    color: '#10B981',
    items: [
      { icon: 'trending-up' as const, labelKey: 'menu.items.revenues', route: '/revenues' },
      { icon: 'credit-card' as const, labelKey: 'menu.items.expenses', route: '/expenses' },
      { icon: 'pie-chart' as const, labelKey: 'menu.items.bilan', route: '/bilan' },
      { icon: 'dollar-sign' as const, labelKey: 'menu.items.estimate', route: '/estimate' },
    ],
  },
  {
    key: 'team',
    titleKey: 'menu.sections.team',
    icon: 'bar-chart-2' as const,
    color: '#16A34A',
    items: [
      { icon: 'users' as const, labelKey: 'menu.items.employees', route: '/employees' },
      { icon: 'bar-chart-2' as const, labelKey: 'menu.items.stats', route: '/stats' },
    ],
  },
  {
    key: 'system',
    titleKey: 'menu.sections.system',
    icon: 'settings' as const,
    color: '#64748B',
    items: [
      { icon: 'cloud' as const, labelKey: 'menu.items.backup', route: '/backup' },
      { icon: 'mail' as const, labelKey: 'menu.items.dnsGuide', route: '/dns-guide' },
    ],
  },
];

export default function AppHeader({ title, showBack }: Props) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ agenda: true });
  const [langOpen, setLangOpen] = useState(false);
  const currentLang = i18n.language || 'fr';

  const goTo = (route: string) => {
    setMenuOpen(false);
    if (route === '/') router.replace('/');
    else router.push(route as any);
  };

  const toggleSection = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const changeLang = async (code: string) => {
    await saveLanguage(code);
    setLangOpen(false);
  };

  const currentLangName = SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.name || 'Français';

  return (
    <>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.drawer} onPress={(e) => e.stopPropagation()}>
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
              {/* Language selector (collapsible) */}
              <TouchableOpacity
                onPress={() => setLangOpen((s) => !s)}
                style={styles.langHeader}
                activeOpacity={0.7}
                testID="lang-toggle"
              >
                <Feather name="globe" size={18} color="#EC4899" />
                <Text style={styles.langHeaderText}>{t('menu.sections.language')}</Text>
                <Text style={styles.langCurrent}>{currentLangName}</Text>
                <Feather name={langOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#EC4899" />
              </TouchableOpacity>
              {langOpen && (
                <View style={styles.langList}>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <TouchableOpacity
                      key={lang.code}
                      testID={`lang-${lang.code}`}
                      onPress={() => changeLang(lang.code)}
                      style={[styles.langItem, currentLang === lang.code && styles.langItemActive]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.langCode, currentLang === lang.code && styles.langCodeActive]}>
                        {lang.code.toUpperCase()}
                      </Text>
                      <Text style={[styles.langName, currentLang === lang.code && styles.langNameActive]}>
                        {lang.name}
                      </Text>
                      {currentLang === lang.code && <Feather name="check" size={18} color="#EC4899" />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Collapsible sections */}
              {menuSections.map((section) => {
                const isOpen = !!expanded[section.key];
                return (
                  <View key={section.key} style={styles.section}>
                    <TouchableOpacity
                      onPress={() => toggleSection(section.key)}
                      style={styles.sectionHeader}
                      activeOpacity={0.6}
                      testID={`section-${section.key}`}
                    >
                      <Feather name={section.icon} size={18} color={section.color} />
                      <Text style={[styles.sectionTitle, { color: section.color }]}>{t(section.titleKey)}</Text>
                      <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={section.color} />
                    </TouchableOpacity>
                    {isOpen &&
                      section.items.map((item) => (
                        <TouchableOpacity
                          key={item.route}
                          testID={`menu-${item.labelKey}`}
                          style={styles.menuItem}
                          activeOpacity={0.7}
                          onPress={() => goTo(item.route)}
                        >
                          <Feather name={item.icon} size={18} color="#6B7280" />
                          <Text style={styles.menuItemText}>{t(item.labelKey)}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                );
              })}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderColor: '#E5E5E5' },
  btn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  logoRowSmall: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoGridSmall: { width: 24, height: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 1.5, borderRadius: 3 },
  paneSmall: { width: 11, height: 11, borderRadius: 1.5 },
  logoTextSmall: { fontSize: 18, fontWeight: '800', color: '#0A0A0A' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', flexDirection: 'row' },
  drawer: { width: 290, backgroundColor: '#FFFFFF', paddingTop: 60, paddingHorizontal: 16, paddingBottom: 20, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 10 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#E5E5E5' },
  logoGrid: { width: 32, height: 32, flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderRadius: 4 },
  pane: { width: 15, height: 15, borderRadius: 2 },
  logoText: { fontSize: 20, fontWeight: '800', color: '#0A0A0A' },
  section: { marginBottom: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F9FAFB' },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingLeft: 38, borderRadius: 8 },
  menuItemText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  langHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FDF2F8', marginBottom: 4 },
  langHeaderText: { flex: 1, fontSize: 14, fontWeight: '800', color: '#EC4899', letterSpacing: 0.3 },
  langCurrent: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  langList: { paddingLeft: 12, marginBottom: 10, borderLeftWidth: 2, borderLeftColor: '#FBCFE8', marginLeft: 10 },
  langItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8 },
  langItemActive: { backgroundColor: '#FDF2F8' },
  langCode: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', minWidth: 28, letterSpacing: 1 },
  langCodeActive: { color: '#EC4899' },
  langName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#374151' },
  langNameActive: { color: '#EC4899', fontWeight: '700' },
});
