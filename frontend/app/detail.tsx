import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Appointment {
  id: string;
  title: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_address: string;
  date: string;
  time_slot: string;
  duration_minutes: number;
  notes: string;
  status: string;
  created_at: string;
}

export default function DetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (id) {
        fetchAppointment();
      }
    }, [id])
  );

  const fetchAppointment = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/appointments/${id}`);
      if (res.ok) {
        const data = await res.json();
        setAppointment(data);
      }
    } catch (e) {
      console.error('Failed to fetch appointment', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Appointment', 'Are you sure you want to delete this appointment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(`${API_URL}/api/appointments/${id}`, { method: 'DELETE' });
            if (res.ok) {
              router.back();
            }
          } catch (e) {
            Alert.alert('Error', 'Failed to delete');
          }
        },
      },
    ]);
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await fetch(`${API_URL}/api/appointments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setAppointment(data);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleEdit = () => {
    if (!appointment) return;
    router.push({
      pathname: '/create',
      params: {
        editId: appointment.id,
        editTitle: appointment.title,
        editClient: appointment.client_name,
        editDate: appointment.date,
        editTime: appointment.time_slot,
        editDuration: String(appointment.duration_minutes),
        editNotes: appointment.notes,
        editStatus: appointment.status,
      },
    });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    if (status === 'completed') return '#34C759';
    if (status === 'cancelled') return '#FF3B30';
    return '#000000';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator testID="detail-loading" size="small" color="#000" style={{ marginTop: 48 }} />
      </SafeAreaView>
    );
  }

  if (!appointment) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity testID="back-button" onPress={() => router.back()} style={styles.headerBtn}>
            <Feather name="arrow-left" size={24} color="#0A0A0A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Not Found</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.emptyState}>
          <Feather name="alert-circle" size={48} color="#E5E5E5" />
          <Text style={styles.emptyTitle}>Appointment not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} testID="detail-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="detail-back-button" onPress={() => router.back()} style={styles.headerBtn} activeOpacity={0.7}>
          <Feather name="arrow-left" size={24} color="#0A0A0A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Details</Text>
        <TouchableOpacity testID="edit-button" onPress={handleEdit} style={styles.headerBtn} activeOpacity={0.7}>
          <Feather name="edit-2" size={20} color="#0A0A0A" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Title & Status */}
        <Text style={styles.title} testID="detail-title">{appointment.title}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { borderColor: getStatusColor(appointment.status) }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(appointment.status) }]} />
            <Text style={[styles.statusBadgeText, { color: getStatusColor(appointment.status) }]}>
              {appointment.status}
            </Text>
          </View>
        </View>

        {/* Info Cards */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Feather name="user" size={18} color="#737373" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>CLIENT</Text>
              <Text style={styles.infoValue} testID="detail-client">{appointment.client_name}</Text>
            </View>
          </View>
        </View>

        {appointment.client_email ? (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Feather name="mail" size={18} color="#737373" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>COURRIEL</Text>
                <Text style={styles.infoValue} testID="detail-email">{appointment.client_email}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {appointment.client_phone ? (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Feather name="phone" size={18} color="#737373" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>TÉLÉPHONE</Text>
                <Text style={styles.infoValue} testID="detail-phone">{appointment.client_phone}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {appointment.client_address ? (
          <TouchableOpacity
            testID="detail-address-link"
            activeOpacity={0.7}
            onPress={() => {
              const address = encodeURIComponent(appointment.client_address);
              Alert.alert('Ouvrir avec', 'Choisissez votre app de navigation', [
                { text: 'Waze', onPress: () => Linking.openURL(`https://waze.com/ul?q=${address}&navigate=yes`) },
                { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${address}`) },
                { text: 'Annuler', style: 'cancel' },
              ]);
            }}
            style={styles.infoCard}
          >
            <View style={styles.infoRow}>
              <Feather name="map-pin" size={18} color="#737373" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>ADRESSE</Text>
                <Text style={[styles.infoValue, { textDecorationLine: 'underline' }]} testID="detail-address">{appointment.client_address}</Text>
              </View>
              <Feather name="navigation" size={18} color="#000000" />
            </View>
          </TouchableOpacity>
        ) : null}

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Feather name="calendar" size={18} color="#737373" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>DATE</Text>
              <Text style={styles.infoValue} testID="detail-date">{formatDate(appointment.date)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Feather name="clock" size={18} color="#737373" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>TIME</Text>
              <Text style={styles.infoValue} testID="detail-time">{appointment.time_slot} — {appointment.duration_minutes} minutes</Text>
            </View>
          </View>
        </View>

        {appointment.notes ? (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Feather name="file-text" size={18} color="#737373" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>NOTES</Text>
                <Text style={styles.infoValue} testID="detail-notes">{appointment.notes}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Status Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>UPDATE STATUS</Text>
          <View style={styles.statusActions}>
            {appointment.status !== 'completed' && (
              <TouchableOpacity
                testID="mark-completed-button"
                style={[styles.actionBtn, { borderColor: '#34C759' }]}
                activeOpacity={0.7}
                onPress={() => handleStatusChange('completed')}
              >
                <Feather name="check-circle" size={18} color="#34C759" />
                <Text style={[styles.actionBtnText, { color: '#34C759' }]}>Complete</Text>
              </TouchableOpacity>
            )}
            {appointment.status !== 'cancelled' && (
              <TouchableOpacity
                testID="mark-cancelled-button"
                style={[styles.actionBtn, { borderColor: '#FF3B30' }]}
                activeOpacity={0.7}
                onPress={() => handleStatusChange('cancelled')}
              >
                <Feather name="x-circle" size={18} color="#FF3B30" />
                <Text style={[styles.actionBtnText, { color: '#FF3B30' }]}>Cancel</Text>
              </TouchableOpacity>
            )}
            {appointment.status !== 'upcoming' && (
              <TouchableOpacity
                testID="mark-upcoming-button"
                style={[styles.actionBtn, { borderColor: '#000000' }]}
                activeOpacity={0.7}
                onPress={() => handleStatusChange('upcoming')}
              >
                <Feather name="rotate-ccw" size={18} color="#000000" />
                <Text style={[styles.actionBtnText, { color: '#000000' }]}>Reopen</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Delete */}
        <TouchableOpacity
          testID="delete-button"
          style={styles.deleteBtn}
          activeOpacity={0.7}
          onPress={handleDelete}
        >
          <Feather name="trash-2" size={18} color="#FF3B30" />
          <Text style={styles.deleteBtnText}>Delete Appointment</Text>
        </TouchableOpacity>
      </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
  },
  headerBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0A0A0A',
    letterSpacing: -0.5,
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.8,
  },
  statusRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 28,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoContent: {
    marginLeft: 14,
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A3A3A3',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#0A0A0A',
    lineHeight: 22,
  },
  section: {
    marginTop: 20,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#737373',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  statusActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 4,
    paddingVertical: 14,
    gap: 8,
    marginTop: 8,
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF3B30',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0A0A0A',
    marginTop: 16,
  },
});
