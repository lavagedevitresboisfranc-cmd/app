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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
  const today = new Date().toISOString().split('T')[0];
  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [selectedDate, setSelectedDate] = useState(today);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [weekAppointments, setWeekAppointments] = useState<Record<string, Appointment[]>>({});
  const [weekBase, setWeekBase] = useState(today);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDayAppointments = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/appointments?date=${date}`);
      const data = await res.json();
      setAppointments(data);
    } catch (e) {
      console.error('Failed to fetch appointments', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWeekAppointments = useCallback(async (base: string) => {
    setLoading(true);
    try {
      const days = getDaysOfWeek(base);
      const results: Record<string, Appointment[]> = {};
      await Promise.all(
        days.map(async (day) => {
          const res = await fetch(`${API_URL}/api/appointments?date=${day}`);
          const data = await res.json();
          if (data.length > 0) results[day] = data;
        })
      );
      setWeekAppointments(results);
    } catch (e) {
      console.error('Failed to fetch week appointments', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (viewMode === 'today') {
        fetchDayAppointments(today);
      } else if (viewMode === 'week') {
        fetchWeekAppointments(weekBase);
      } else {
        fetchDayAppointments(selectedDate);
      }
    }, [viewMode, selectedDate, weekBase])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    if (viewMode === 'today') {
      await fetchDayAppointments(today);
    } else if (viewMode === 'week') {
      await fetchWeekAppointments(weekBase);
    } else {
      await fetchDayAppointments(selectedDate);
    }
    setRefreshing(false);
  };

  const changeWeek = (offset: number) => {
    const d = new Date(weekBase + 'T00:00:00');
    d.setDate(d.getDate() + offset * 7);
    const newBase = d.toISOString().split('T')[0];
    setWeekBase(newBase);
    fetchWeekAppointments(newBase);
  };

  const getStatusColor = (status: string) => {
    if (status === 'completed') return '#34C759';
    if (status === 'cancelled') return '#FF3B30';
    return '#000000';
  };

  const renderAppointment = ({ item }: { item: Appointment }) => (
    <TouchableOpacity
      testID={`appointment-card-${item.id}`}
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => router.push({ pathname: '/detail', params: { id: item.id } })}
    >
      <View style={styles.cardLeft}>
        <Text style={styles.timeText}>{item.time_slot}</Text>
        <Text style={styles.durationText}>{item.duration_minutes}m</Text>
      </View>
      <View style={styles.cardDivider} />
      <View style={styles.cardRight}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardClient} numberOfLines={1}>{item.client_name}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Feather name="chevron-right" size={20} color="#A3A3A3" />
    </TouchableOpacity>
  );

  const views: { key: ViewMode; label: string }[] = [
    { key: 'today', label: "Aujourd'hui" },
    { key: 'week', label: 'Semaine' },
    { key: 'month', label: 'Mois' },
  ];

  // Week sections
  const weekDays = getDaysOfWeek(weekBase);
  const weekSections = weekDays
    .filter((day) => weekAppointments[day] && weekAppointments[day].length > 0)
    .map((day) => ({
      title: formatDayLabel(day),
      data: weekAppointments[day],
    }));

  const markedDates: Record<string, any> = {
    [selectedDate]: { selected: true, selectedColor: '#000000' },
  };

  return (
    <SafeAreaView style={styles.safeArea} testID="calendar-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Rendez-vous</Text>
      </View>

      {/* View Toggle */}
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
          data={appointments}
          keyExtractor={(item) => item.id}
          renderItem={renderAppointment}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
          ListHeaderComponent={
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{formatDayLabel(today)}</Text>
              <Text style={styles.countText}>{appointments.length} rdv</Text>
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
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* WEEK VIEW */}
      {viewMode === 'week' && (
        <SectionList
          testID="week-list"
          sections={weekSections}
          keyExtractor={(item) => item.id}
          renderItem={renderAppointment}
          renderSectionHeader={({ section }) => (
            <View style={styles.weekDayHeader}>
              <Text style={styles.weekDayTitle}>{section.title}</Text>
              <Text style={styles.weekDayCount}>{section.data.length} rdv</Text>
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
        />
      )}

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <FlatList
          testID="month-list"
          data={appointments}
          keyExtractor={(item) => item.id}
          renderItem={renderAppointment}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
          ListHeaderComponent={
            <View>
              <Calendar
                key={selectedDate}
                current={selectedDate}
                onDayPress={(day: { dateString: string }) => {
                  setSelectedDate(day.dateString);
                  fetchDayAppointments(day.dateString);
                }}
                markedDates={markedDates}
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
                <Text style={styles.countText}>{appointments.length} rdv</Text>
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
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
    color: '#0A0A0A',
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
    width: 50,
  },
  timeText: {
    fontSize: 16,
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
});
