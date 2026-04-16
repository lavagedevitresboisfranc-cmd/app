import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
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

export default function CalendarScreen() {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAppointments = useCallback(async (date: string) => {
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

  useFocusEffect(
    useCallback(() => {
      fetchAppointments(selectedDate);
    }, [selectedDate])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAppointments(selectedDate);
    setRefreshing(false);
  };

  const onDayPress = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
  };

  const getStatusColor = (status: string) => {
    if (status === 'completed') return '#34C759';
    if (status === 'cancelled') return '#FF3B30';
    return '#000000';
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
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

  const markedDates: Record<string, any> = {
    [selectedDate]: {
      selected: true,
      selectedColor: '#000000',
    },
  };

  return (
    <SafeAreaView style={styles.safeArea} testID="calendar-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Appointments</Text>
        <TouchableOpacity
          testID="today-button"
          onPress={() => setSelectedDate(today)}
          activeOpacity={0.7}
        >
          <Text style={styles.todayBtn}>Today</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        testID="appointments-list"
        data={appointments}
        keyExtractor={(item) => item.id}
        renderItem={renderAppointment}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
        }
        ListHeaderComponent={
          <View>
            <Calendar
              current={selectedDate}
              onDayPress={onDayPress}
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
            <View style={styles.dateHeader}>
              <Text style={styles.dateTitle}>{formatDate(selectedDate)}</Text>
              <Text style={styles.countText}>
                {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator testID="loading-indicator" size="small" color="#000" style={{ marginTop: 32 }} />
          ) : (
            <View style={styles.emptyState} testID="empty-state">
              <Feather name="calendar" size={48} color="#E5E5E5" />
              <Text style={styles.emptyTitle}>No appointments</Text>
              <Text style={styles.emptySubtitle}>Tap "New" to create one</Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
      />
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
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#FAFAFA',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
    color: '#0A0A0A',
  },
  todayBtn: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  calendar: {
    marginBottom: 8,
  },
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  dateTitle: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: '#0A0A0A',
  },
  countText: {
    fontSize: 14,
    color: '#737373',
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
  emptySubtitle: {
    fontSize: 14,
    color: '#A3A3A3',
    marginTop: 4,
  },
});
