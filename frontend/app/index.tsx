import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  SectionList,
  Modal,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { saveLanguage, SUPPORTED_LANGUAGES } from '../src/i18n';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const CACHE_KEY_ALL = 'brightcalendar_cache_all';
const CACHE_KEY_DAY = 'brightcalendar_cache_day_';
const CACHE_TS_KEY = 'brightcalendar_cache_ts';

interface Appointment {
  id: string;
  title: string;
  client_name: string;
  date: string;
  time_slot: string;
  duration_minutes: number;
  notes: string;
  status: string;
}

interface PendingRequest {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  preferred_date: string;
  preferred_time: string;
  message: string;
  status: string;
}

// Unified item for list display
interface CalendarItem {
  id: string;
  type: 'appointment' | 'request';
  name: string;
  date: string;
  time: string;
  duration?: number;
  status: string;
}

const LOGO_URL = process.env.EXPO_PUBLIC_LOGO_URL || '';

type ViewMode = 'today' | 'week' | 'month';

const getDaysOfWeek = (baseDate: string) => {
  const d = new Date(baseDate + 'T00:00:00');
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    days.push(dd.toISOString().split('T')[0]);
  }
  return days;
};

const formatDayLabel = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date().toISOString().split('T')[0];
  const dayName = d.toLocaleDateString('fr-CA', { weekday: 'long' });
  const label = d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' });
  const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  if (dateStr === today) return `Aujourd'hui — ${label}`;
  return `${capitalized} — ${label}`;
};

const formatDateShort = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
};

const formatWeekRange = (days: string[]) => {
  const start = new Date(days[0] + 'T00:00:00');
  const end = new Date(days[6] + 'T00:00:00');
  const s = start.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  const e = end.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  return `${s} — ${e}`;
};

export default function CalendarScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'fr';
  const today = new Date().toISOString().split('T')[0];
  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [selectedDate, setSelectedDate] = useState(today);
  const [dayItems, setDayItems] = useState<CalendarItem[]>([]);
  const [weekItems, setWeekItems] = useState<Record<string, CalendarItem[]>>({});
  const [weekBase, setWeekBase] = useState(today);
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [allItems, setAllItems] = useState<CalendarItem[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ agenda: true });
  const [langOpen, setLangOpen] = useState(false);
  const toggleSection = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  const currentLangName = SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.name || 'Français';
  const [pendingCount, setPendingCount] = useState(0);
  const [prevPendingCount, setPrevPendingCount] = useState(0);

  const menuSections: Array<{ key: string; titleKey: string; icon: any; color: string; items: Array<{ icon: any; labelKey: string; route: string }> }> = [
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
        { icon: 'clock' as const, labelKey: 'menu.items.scheduledCampaigns', route: '/scheduled-campaigns' },
        { icon: 'grid' as const, labelKey: 'menu.items.qr', route: '/qr' },
      ],
    },
    {
      key: 'finance',
      titleKey: 'menu.sections.finance',
      icon: 'dollar-sign' as const,
      color: '#10B981',
      items: [
        { icon: 'credit-card' as const, labelKey: 'menu.items.expenses', route: '/expenses' },
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
      ],
    },
  ];

  // Fetch ALL upcoming appointments + pending requests
  const fetchAllItems = useCallback(async () => {
    try {
      const [apptRes, reqRes] = await Promise.all([
        fetch(`${API_URL}/api/appointments`),
        fetch(`${API_URL}/api/requests?status=pending`),
      ]);
      const appts: Appointment[] = await apptRes.json();
      const reqs: PendingRequest[] = await reqRes.json();
      const items: CalendarItem[] = [
        ...appts.map((a) => ({
          id: a.id, type: 'appointment' as const, name: a.client_name,
          date: a.date, time: a.time_slot, duration: a.duration_minutes, status: a.status,
        })),
        ...reqs.map((r) => ({
          id: r.id, type: 'request' as const, name: r.customer_name,
          date: r.preferred_date, time: r.preferred_time, status: 'pending',
        })),
      ].sort((a, b) => a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date));
      setAllItems(items);
      setIsOffline(false);
      // Cache
      try {
        await AsyncStorage.setItem(CACHE_KEY_ALL, JSON.stringify(items));
        await AsyncStorage.setItem(CACHE_TS_KEY, new Date().toISOString());
      } catch {}
    } catch (e) {
      console.error('Failed to fetch all items, loading cache', e);
      // Offline fallback
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY_ALL);
        if (cached) {
          setAllItems(JSON.parse(cached));
          setIsOffline(true);
        }
      } catch {}
    }
  }, []);

  // Fetch appointments + pending requests for a single day
  const fetchDayItems = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [apptRes, reqRes] = await Promise.all([
        fetch(`${API_URL}/api/appointments?date=${date}`),
        fetch(`${API_URL}/api/requests?status=pending`),
      ]);
      const appts: Appointment[] = await apptRes.json();
      const reqs: PendingRequest[] = await reqRes.json();

      const items: CalendarItem[] = [
        ...appts.map((a) => ({
          id: a.id,
          type: 'appointment' as const,
          name: a.client_name,
          date: a.date,
          time: a.time_slot,
          duration: a.duration_minutes,
          status: a.status,
        })),
        ...reqs
          .filter((r) => r.preferred_date === date)
          .map((r) => ({
            id: r.id,
            type: 'request' as const,
            name: r.customer_name,
            date: r.preferred_date,
            time: r.preferred_time,
            status: 'pending',
          })),
      ].sort((a, b) => a.time.localeCompare(b.time));

      setDayItems(items);
      try { await AsyncStorage.setItem(CACHE_KEY_DAY + date, JSON.stringify(items)); } catch {}
    } catch (e) {
      console.error('Failed to fetch day items, loading cache', e);
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY_DAY + date);
        if (cached) { setDayItems(JSON.parse(cached)); setIsOffline(true); }
      } catch {}
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch all marked dates for calendar dots
  const fetchMarkedDates = useCallback(async (selected: string) => {
    try {
      const [apptRes, reqRes] = await Promise.all([
        fetch(`${API_URL}/api/appointments`),
        fetch(`${API_URL}/api/requests?status=pending`),
      ]);
      const appts: Appointment[] = await apptRes.json();
      const reqs: PendingRequest[] = await reqRes.json();

      const marks: Record<string, any> = {};

      // Green dots for appointments
      appts.forEach((a) => {
        if (!marks[a.date]) marks[a.date] = { dots: [] };
        const hasGreen = marks[a.date].dots.some((d: any) => d.color === '#34C759');
        if (!hasGreen) marks[a.date].dots.push({ key: 'appt', color: '#34C759' });
      });

      // Red dots for pending requests
      reqs.forEach((r) => {
        const d = r.preferred_date;
        if (!marks[d]) marks[d] = { dots: [] };
        const hasRed = marks[d].dots.some((dd: any) => dd.color === '#FF3B30');
        if (!hasRed) marks[d].dots.push({ key: 'req', color: '#FF3B30' });
      });

      // Add selected marker
      if (marks[selected]) {
        marks[selected] = { ...marks[selected], selected: true, selectedColor: '#000000' };
      } else {
        marks[selected] = { selected: true, selectedColor: '#000000', dots: [] };
      }

      setMarkedDates(marks);
    } catch (e) {
      console.error('Failed to fetch marked dates', e);
    }
  }, []);

  // Fetch week items
  const fetchWeekItems = useCallback(async (base: string) => {
    setLoading(true);
    try {
      const days = getDaysOfWeek(base);
      const [reqRes] = await Promise.all([
        fetch(`${API_URL}/api/requests?status=pending`),
      ]);
      const reqs: PendingRequest[] = await reqRes.json();

      const results: Record<string, CalendarItem[]> = {};
      await Promise.all(
        days.map(async (day) => {
          const apptRes = await fetch(`${API_URL}/api/appointments?date=${day}`);
          const appts: Appointment[] = await apptRes.json();

          const dayReqs = reqs.filter((r) => r.preferred_date === day);

          const items: CalendarItem[] = [
            ...appts.map((a) => ({
              id: a.id,
              type: 'appointment' as const,
              name: a.client_name,
              date: a.date,
              time: a.time_slot,
              duration: a.duration_minutes,
              status: a.status,
            })),
            ...dayReqs.map((r) => ({
              id: r.id,
              type: 'request' as const,
              name: r.customer_name,
              date: r.preferred_date,
              time: r.preferred_time,
              status: 'pending',
            })),
          ].sort((a, b) => a.time.localeCompare(b.time));

          if (items.length > 0) results[day] = items;
        })
      );
      setWeekItems(results);
    } catch (e) {
      console.error('Failed to fetch week items', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch pending requests count for badge
  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/requests?status=pending`);
      if (res.ok) {
        const data = await res.json();
        const count = Array.isArray(data) ? data.length : 0;
        setPendingCount((prev) => {
          if (count > prev && prev > 0) {
            // New request arrived while app is open
            if (typeof window !== 'undefined' && (window as any).navigator?.vibrate) {
              (window as any).navigator.vibrate(200);
            }
          }
          return count;
        });
      }
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAllItems();
      fetchPendingCount();
      if (viewMode === 'today') {
        fetchDayItems(today);
      } else if (viewMode === 'week') {
        fetchWeekItems(weekBase);
      } else {
        fetchDayItems(selectedDate);
        fetchMarkedDates(selectedDate);
      }
      // Poll for new requests every 30 seconds
      const interval = setInterval(() => {
        fetchPendingCount();
      }, 30000);
      return () => clearInterval(interval);
    }, [viewMode, selectedDate, weekBase])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllItems();
    if (viewMode === 'today') {
      await fetchDayItems(today);
    } else if (viewMode === 'week') {
      await fetchWeekItems(weekBase);
    } else {
      await fetchDayItems(selectedDate);
      await fetchMarkedDates(selectedDate);
    }
    setRefreshing(false);
  };

  const changeWeek = (offset: number) => {
    const d = new Date(weekBase + 'T00:00:00');
    d.setDate(d.getDate() + offset * 7);
    const newBase = d.toISOString().split('T')[0];
    setWeekBase(newBase);
    fetchWeekItems(newBase);
  };

  const formatItemDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  };

  const AllAppointmentsFooter = () => (
    <View>
      <View style={styles.allHeader}>
        <Text style={styles.allHeaderTitle}>Tous les rendez-vous</Text>
        <Text style={styles.allHeaderCount}>{allItems.length}</Text>
      </View>
      {allItems.map((item) => {
        const isRequest = item.type === 'request';
        const accentColor = isRequest ? '#FF3B30' : '#34C759';
        return (
          <TouchableOpacity
            key={item.id}
            style={[styles.card, { borderLeftWidth: 4, borderLeftColor: accentColor }]}
            activeOpacity={0.7}
            onPress={() => {
              if (isRequest) router.push({ pathname: '/request-detail', params: { id: item.id } });
              else router.push({ pathname: '/detail', params: { id: item.id } });
            }}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.cardDateSmall}>{formatItemDate(item.date)}</Text>
              <Text style={styles.timeText} numberOfLines={1}>{item.time}</Text>
            </View>
            <View style={styles.cardDivider} />
            <View style={styles.cardRight}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: accentColor }]} />
                <Text style={[styles.statusText, { color: accentColor }]}>
                  {isRequest ? 'En attente' : item.status === 'upcoming' ? 'Confirmé' : item.status}
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color="#A3A3A3" />
          </TouchableOpacity>
        );
      })}
      <View style={{ height: 24 }} />
    </View>
  );

  const renderItem = ({ item }: { item: CalendarItem }) => {
    const isRequest = item.type === 'request';
    const accentColor = isRequest ? '#FF3B30' : '#34C759';

    return (
      <TouchableOpacity
        testID={`calendar-item-${item.id}`}
        style={[styles.card, { borderLeftWidth: 4, borderLeftColor: accentColor }]}
        activeOpacity={0.7}
        onPress={() => {
          if (isRequest) {
            router.push({ pathname: '/request-detail', params: { id: item.id } });
          } else {
            router.push({ pathname: '/detail', params: { id: item.id } });
          }
        }}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.timeText}>{item.time}</Text>
          {item.duration ? <Text style={styles.durationText}>{item.duration}m</Text> : null}
        </View>
        <View style={styles.cardDivider} />
        <View style={styles.cardRight}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: accentColor }]} />
            <Text style={[styles.statusText, { color: accentColor }]}>
              {isRequest ? 'En attente' : item.status === 'upcoming' ? 'Confirmé' : item.status}
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={20} color="#A3A3A3" />
      </TouchableOpacity>
    );
  };

  const views: { key: ViewMode; label: string }[] = [
    { key: 'today', label: "Aujourd'hui" },
    { key: 'week', label: 'Semaine' },
    { key: 'month', label: 'Mois' },
  ];

  const weekDays = getDaysOfWeek(weekBase);
  const weekSections = weekDays
    .filter((day) => weekItems[day] && weekItems[day].length > 0)
    .map((day) => ({
      title: formatDayLabel(day),
      data: weekItems[day],
    }));

  return (
    <SafeAreaView style={styles.safeArea} testID="calendar-screen">
      {/* Hamburger Menu Modal */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuDrawer} onPress={(e) => e.stopPropagation()}>
            {/* CrystalTask logo in menu */}
            <View style={styles.menuLogoRow}>
              <Image
                source={require('../assets/images/crystaltask-logo-transparent.png')}
                style={styles.menuLogoImage}
                resizeMode="contain"
              />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              {/* Language (collapsible submenu, no flags) */}
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
                      onPress={() => { saveLanguage(lang.code); setLangOpen(false); }}
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
                const sectionHasPending = section.key === 'agenda' && pendingCount > 0;
                return (
                  <View key={section.key} style={styles.menuSectionBlock}>
                    <TouchableOpacity
                      onPress={() => toggleSection(section.key)}
                      style={styles.collapsibleHeader}
                      activeOpacity={0.6}
                      testID={`section-${section.key}`}
                    >
                      <Feather name={section.icon} size={18} color={section.color} />
                      <Text style={[styles.collapsibleTitle, { color: section.color }]}>{t(section.titleKey)}</Text>
                      {sectionHasPending && (
                        <View style={styles.sectionBadge}>
                          <Text style={styles.sectionBadgeText}>{pendingCount > 99 ? '99+' : pendingCount}</Text>
                        </View>
                      )}
                      <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={section.color} />
                    </TouchableOpacity>
                    {isOpen && section.items.map((item) => (
                      <TouchableOpacity
                        key={item.route}
                        testID={`menu-${item.labelKey}`}
                        style={styles.menuItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          setMenuOpen(false);
                          if (item.route === '/') return;
                          router.push(item.route as any);
                        }}
                      >
                        <View style={{ position: 'relative' }}>
                          <Feather name={item.icon} size={18} color="#6B7280" />
                          {item.route === '/requests' && pendingCount > 0 && (
                            <View style={styles.menuItemBadge}>
                              <Text style={styles.menuItemBadgeText}>{pendingCount > 99 ? '99+' : pendingCount}</Text>
                            </View>
                          )}
                        </View>
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

      {/* Header with hamburger */}
      <View style={styles.header}>
        <TouchableOpacity testID="hamburger-menu" onPress={() => setMenuOpen(true)} style={styles.hamburgerBtn} activeOpacity={0.7}>
          <Feather name="menu" size={24} color="#0A0A0A" />
          {pendingCount > 0 && (
            <View style={styles.hamburgerBadge}>
              <Text style={styles.hamburgerBadgeText}>{pendingCount > 9 ? '9+' : pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.logoRow}>
          <Image
            source={require('../assets/images/crystaltask-logo-transparent.png')}
            style={styles.headerLogoImage}
            resizeMode="contain"
          />
        </View>
        <TouchableOpacity testID="add-btn" onPress={() => router.push('/create')} style={styles.hamburgerBtn} activeOpacity={0.7}>
          <Feather name="plus" size={24} color="#0891B2" />
        </TouchableOpacity>
      </View>
      {isOffline && (
        <View style={styles.offlineBar}>
          <Feather name="wifi-off" size={14} color="#FFF" />
          <Text style={styles.offlineText}>Mode hors ligne — données en cache</Text>
        </View>
      )}
      <View style={styles.legendBar}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#34C759' }]} />
          <Text style={styles.legendLabel}>Confirmé</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FF3B30' }]} />
          <Text style={styles.legendLabel}>En attente</Text>
        </View>
      </View>

      <View style={styles.toggleRow}>
        {views.map((v) => (
          <TouchableOpacity
            key={v.key}
            testID={`view-${v.key}`}
            style={[styles.toggleBtn, viewMode === v.key && styles.toggleBtnActive]}
            activeOpacity={0.7}
            onPress={() => setViewMode(v.key)}
          >
            <Text style={[styles.toggleText, viewMode === v.key && styles.toggleTextActive]}>
              {v.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* TODAY VIEW */}
      {viewMode === 'today' && (
        <FlatList
          testID="today-list"
          data={dayItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
          ListHeaderComponent={
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{formatDayLabel(today)}</Text>
              <Text style={styles.countText}>{dayItems.length}</Text>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator size="small" color="#000" style={{ marginTop: 32 }} />
            ) : (
              <View style={styles.emptyState}>
                <Feather name="coffee" size={48} color="#E5E5E5" />
                <Text style={styles.emptyTitle}>Aucun rendez-vous aujourd'hui</Text>
              </View>
            )
          }
          ListFooterComponent={AllAppointmentsFooter}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* WEEK VIEW */}
      {viewMode === 'week' && (
        <SectionList
          testID="week-list"
          sections={weekSections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={styles.weekDayHeader}>
              <Text style={styles.weekDayTitle}>{section.title}</Text>
              <Text style={styles.weekDayCount}>{section.data.length}</Text>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
          ListHeaderComponent={
            <View style={styles.weekNav}>
              <TouchableOpacity testID="week-prev" onPress={() => changeWeek(-1)} activeOpacity={0.7} style={styles.weekArrow}>
                <Feather name="chevron-left" size={20} color="#0A0A0A" />
              </TouchableOpacity>
              <Text style={styles.weekRangeText}>{formatWeekRange(weekDays)}</Text>
              <TouchableOpacity testID="week-next" onPress={() => changeWeek(1)} activeOpacity={0.7} style={styles.weekArrow}>
                <Feather name="chevron-right" size={20} color="#0A0A0A" />
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator size="small" color="#000" style={{ marginTop: 32 }} />
            ) : (
              <View style={styles.emptyState}>
                <Feather name="calendar" size={48} color="#E5E5E5" />
                <Text style={styles.emptyTitle}>Aucun rendez-vous cette semaine</Text>
              </View>
            )
          }
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          ListFooterComponent={AllAppointmentsFooter}
        />
      )}

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <FlatList
          testID="month-list"
          data={dayItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
          ListHeaderComponent={
            <View>
              <Calendar
                key={selectedDate}
                current={selectedDate}
                onDayPress={(day: { dateString: string }) => {
                  setSelectedDate(day.dateString);
                  fetchDayItems(day.dateString);
                  fetchMarkedDates(day.dateString);
                }}
                markedDates={markedDates}
                markingType="multi-dot"
                theme={{
                  backgroundColor: '#FAFAFA',
                  calendarBackground: '#FAFAFA',
                  textSectionTitleColor: '#737373',
                  selectedDayBackgroundColor: '#000000',
                  selectedDayTextColor: '#FFFFFF',
                  todayTextColor: '#000000',
                  todayBackgroundColor: '#E5E5E5',
                  dayTextColor: '#0A0A0A',
                  textDisabledColor: '#A3A3A3',
                  arrowColor: '#000000',
                  monthTextColor: '#0A0A0A',
                  textMonthFontWeight: '700',
                  textMonthFontSize: 18,
                  textDayFontSize: 15,
                  textDayHeaderFontSize: 13,
                  textDayFontWeight: '500',
                  textDayHeaderFontWeight: '600',
                }}
                style={styles.calendar}
              />
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{formatDateShort(selectedDate)}</Text>
                <Text style={styles.countText}>{dayItems.length}</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator size="small" color="#000" style={{ marginTop: 32 }} />
            ) : (
              <View style={styles.emptyState}>
                <Feather name="calendar" size={48} color="#E5E5E5" />
                <Text style={styles.emptyTitle}>Aucun rendez-vous</Text>
              </View>
            )
          }
          ListFooterComponent={AllAppointmentsFooter}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: '#FAFAFA',
  },
  hamburgerBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 8,
  },
  headerLogoImage: {
    width: '70%',
    aspectRatio: 678 / 196,
    maxHeight: 98,
    alignSelf: 'center',
  },
  logoIcon: {
    width: 36,
    height: 36,
    position: 'relative',
  },
  logoWindowGrid: {
    width: 32,
    height: 32,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  logoPane: {
    width: 15,
    height: 15,
    borderRadius: 2,
  },
  logoSparkle: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
  logoSparkleText: {
    fontSize: 14,
    color: '#F59E0B',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    color: '#0A0A0A',
  },
  headerTitleAccent: {
    color: '#0891B2',
  },
  offlineBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F59E0B', paddingVertical: 6, paddingHorizontal: 12,
  },
  offlineText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  hamburgerBadge: {
    position: 'absolute', top: 4, right: 4,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FAFAFA',
  },
  hamburgerBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  menuItemBadge: {
    position: 'absolute', top: -6, right: -8,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center',
  },
  menuItemBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  menuItemPill: {
    marginLeft: 'auto',
    backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  menuItemPillText: { color: '#B91C1C', fontSize: 11, fontWeight: '700' },
  legendBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#737373',
  },
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#737373',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: '#0A0A0A',
  },
  countText: {
    fontSize: 14,
    color: '#737373',
    fontWeight: '500',
  },
  calendar: {
    marginBottom: 8,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  weekArrow: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
  },
  weekRangeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  weekDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderColor: '#E5E5E5',
  },
  weekDayTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  weekDayCount: {
    fontSize: 13,
    color: '#A3A3A3',
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 12,
  },
  cardLeft: {
    alignItems: 'center',
    minWidth: 55,
  },
  timeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  durationText: {
    fontSize: 13,
    color: '#A3A3A3',
    marginTop: 2,
  },
  cardDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E5E5',
    marginHorizontal: 14,
  },
  cardRight: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  cardClient: {
    fontSize: 14,
    color: '#737373',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A3A3A3',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingBottom: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0A0A0A',
    marginTop: 16,
  },
  allHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderColor: '#E5E5E5',
    marginTop: 16,
  },
  allHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  allHeaderCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A3A3A3',
  },
  cardDateSmall: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A3A3A3',
    marginBottom: 2,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    flexDirection: 'row',
  },
  menuDrawer: {
    width: 280,
    backgroundColor: '#FFFFFF',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  menuLogoRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
  },
  menuLogoImage: {
    width: 280,
    height: 90,
  },
  menuLogoIcon: {
    width: 32,
    height: 32,
  },
  menuLogoText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0A0A0A',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#F5F5F5',
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  menuSectionBlock: { marginBottom: 4 },
  menuSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 2 },
  menuSectionDot: { width: 8, height: 8, borderRadius: 4 },
  menuSectionTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 2 },
  collapsibleTitle: { flex: 1, fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  sectionBadge: { backgroundColor: '#DC2626', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, minWidth: 18, alignItems: 'center' },
  sectionBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
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
  flagRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 8, paddingTop: 4 },
  flagBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#F9FAFB' },
  flagBtnActive: { borderColor: '#EC4899', backgroundColor: '#FDF2F8' },
  flagLabel: { fontSize: 11, fontWeight: '800', color: '#6B7280', letterSpacing: 0.5 },
  flagLabelActive: { color: '#EC4899' },
});
