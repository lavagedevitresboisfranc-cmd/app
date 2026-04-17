import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface Props {
  title?: string;
  showBack?: boolean;
}

const menuItems = [
  { icon: 'calendar' as const, label: 'Calendrier', route: '/' },
  { icon: 'list' as const, label: 'Tous les RDV', route: '/appointments' },
  { icon: 'plus-circle' as const, label: 'Nouveau RDV', route: '/create' },
  { icon: 'inbox' as const, label: 'Demandes', route: '/requests' },
  { icon: 'bar-chart-2' as const, label: 'Statistiques', route: '/stats' },
  { icon: 'dollar-sign' as const, label: 'Estimation', route: '/estimate' },
  { icon: 'users' as const, label: 'Employés', route: '/employees' },
  { icon: 'user' as const, label: 'Clients', route: '/client-history' },
];

export default function AppHeader({ title, showBack }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.drawer}>
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
            {menuItems.map((item) => (
              <TouchableOpacity
                key={item.route}
                testID={`menu-${item.label}`}
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setMenuOpen(false);
                  if (item.route === '/') {
                    router.replace('/');
                  } else {
                    router.push(item.route as any);
                  }
                }}
              >
                <Feather name={item.icon} size={22} color="#0A0A0A" />
                <Text style={styles.menuItemText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
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
    width: 280, backgroundColor: '#FFFFFF', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40,
    shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 10,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 20, borderBottomWidth: 1, borderColor: '#E5E5E5' },
  logoGrid: { width: 32, height: 32, flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderRadius: 4 },
  pane: { width: 15, height: 15, borderRadius: 2 },
  logoText: { fontSize: 20, fontWeight: '800', color: '#0A0A0A' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderColor: '#F5F5F5' },
  menuItemText: { fontSize: 16, fontWeight: '600', color: '#0A0A0A' },
});
