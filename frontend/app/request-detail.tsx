import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00',
];

interface AppointmentRequest {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  preferred_date: string;
  preferred_time: string;
  message: string;
  status: string;
  suggested_date: string | null;
  suggested_time: string | null;
  suggested_note: string | null;
  created_at: string;
}

export default function RequestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<AppointmentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSuggest, setShowSuggest] = useState(false);
  const [showAcceptPrice, setShowAcceptPrice] = useState(false);
  const [acceptPrice, setAcceptPrice] = useState('');
  const [suggestedDate, setSuggestedDate] = useState('');
  const [suggestedTime, setSuggestedTime] = useState('');
  const [suggestNote, setSuggestNote] = useState('');
  const [acting, setActing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (id) fetchRequest();
    }, [id])
  );

  const fetchRequest = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/requests/${id}`);
      if (res.ok) {
        const data = await res.json();
        setRequest(data);
        // Pre-fill suggest date from preferred
        if (!suggestedDate) setSuggestedDate(data.preferred_date);
      }
    } catch (e) {
      console.error('Failed to fetch request', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    Keyboard.dismiss();
    setActing(true);
    try {
      const res = await fetch(`${API_URL}/api/requests/${id}/accept`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: acceptPrice ? parseFloat(acceptPrice) : 0 }),
      });
      if (res.ok) {
        Alert.alert('Confirmé!', 'Rendez-vous créé avec succès', [{ text: 'OK', onPress: () => router.back() }]);
      } else {
        Alert.alert('Erreur', 'Échec de l\'acceptation');
      }
    } catch {
      Alert.alert('Erreur', 'Erreur réseau');
    } finally {
      setActing(false);
    }
  };

  const handleSuggest = async () => {
    if (!suggestedTime) {
      Alert.alert('Required', 'Please select a time slot');
      return;
    }
    Keyboard.dismiss();
    setActing(true);
    try {
      const res = await fetch(`${API_URL}/api/requests/${id}/suggest`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggested_date: suggestedDate,
          suggested_time: suggestedTime,
          note: suggestNote.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRequest(data);
        setShowSuggest(false);
        Alert.alert('Done', 'Alternative suggestion sent');
      } else {
        Alert.alert('Error', 'Failed to send suggestion');
      }
    } catch {
      Alert.alert('Error', 'Network error');
    } finally {
      setActing(false);
    }
  };

  const handleDecline = () => {
    Alert.alert('Decline Request', 'Are you sure you want to decline this request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(`${API_URL}/api/requests/${id}`, { method: 'DELETE' });
            if (res.ok) router.back();
          } catch {
            Alert.alert('Error', 'Failed to decline');
          }
        },
      },
    ]);
  };

  const changeDate = (offset: number) => {
    const d = new Date(suggestedDate + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setSuggestedDate(d.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    if (status === 'accepted') return '#34C759';
    if (status === 'alternative_offered') return '#FF9500';
    return '#000000';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'alternative_offered') return 'Alternative Offered';
    return status;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator testID="request-detail-loading" size="small" color="#000" style={{ marginTop: 48 }} />
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity testID="back-button" onPress={() => router.back()} style={styles.headerBtn}>
            <Feather name="arrow-left" size={24} color="#0A0A0A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Not Found</Text>
          <View style={styles.headerBtn} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} testID="request-detail-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <AppHeader title="Demande" showBack />

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Customer Info */}
          <Text style={styles.title} testID="request-customer-name">{request.customer_name}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { borderColor: getStatusColor(request.status) }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(request.status) }]} />
              <Text style={[styles.statusBadgeText, { color: getStatusColor(request.status) }]}>
                {getStatusLabel(request.status)}
              </Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Feather name="mail" size={18} color="#737373" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>EMAIL</Text>
                <Text style={styles.infoValue} testID="request-email">{request.customer_email}</Text>
              </View>
            </View>
          </View>

          {request.customer_phone ? (
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Feather name="phone" size={18} color="#737373" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>TÉLÉPHONE</Text>
                  <Text style={styles.infoValue} testID="request-phone">{request.customer_phone}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {request.customer_address ? (
            <TouchableOpacity
              testID="request-address-link"
              activeOpacity={0.7}
              onPress={() => {
                const address = encodeURIComponent(request.customer_address);
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
                  <Text style={[styles.infoValue, { textDecorationLine: 'underline' }]} testID="request-address">{request.customer_address}</Text>
                </View>
                <Feather name="navigation" size={18} color="#000000" />
              </View>
            </TouchableOpacity>
          ) : null}

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Feather name="calendar" size={18} color="#737373" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>PREFERRED DATE & TIME</Text>
                <Text style={styles.infoValue} testID="request-datetime">
                  {formatDate(request.preferred_date)} at {request.preferred_time}
                </Text>
              </View>
            </View>
          </View>

          {request.message ? (
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Feather name="message-circle" size={18} color="#737373" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>MESSAGE</Text>
                  <Text style={styles.infoValue} testID="request-message">{request.message}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Alternative offered */}
          {request.status === 'alternative_offered' && request.suggested_date && (
            <View style={styles.suggestedCard}>
              <View style={styles.suggestedHeader}>
                <Feather name="repeat" size={16} color="#FF9500" />
                <Text style={styles.suggestedTitle}>Your Suggestion</Text>
              </View>
              <Text style={styles.suggestedInfo}>
                {formatDate(request.suggested_date)} at {request.suggested_time}
              </Text>
              {request.suggested_note ? (
                <Text style={styles.suggestedNote}>{request.suggested_note}</Text>
              ) : null}
            </View>
          )}

          {/* Actions for pending requests */}
          {request.status === 'pending' && !showSuggest && (
            <View style={styles.actionsSection}>
              <Text style={styles.sectionLabel}>ACTIONS</Text>

              {/* Price input for accept */}
              <View style={styles.priceInputRow}>
                <Feather name="dollar-sign" size={18} color="#0891B2" />
                <TextInput
                  testID="accept-price-input"
                  style={styles.priceInput}
                  value={acceptPrice}
                  onChangeText={setAcceptPrice}
                  placeholder="Prix ($) - optionnel"
                  placeholderTextColor="#A3A3A3"
                  keyboardType="decimal-pad"
                />
              </View>

              <TouchableOpacity
                testID="accept-request-button"
                style={styles.acceptBtn}
                activeOpacity={0.7}
                onPress={handleAccept}
                disabled={acting}
              >
                <Feather name="check" size={20} color="#FFFFFF" />
                <Text style={styles.acceptBtnText}>{acting ? 'En cours...' : 'Accepter la demande'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="suggest-alternative-button"
                style={styles.suggestBtn}
                activeOpacity={0.7}
                onPress={() => setShowSuggest(true)}
              >
                <Feather name="repeat" size={18} color="#FF9500" />
                <Text style={styles.suggestBtnText}>Suggest Alternative</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="decline-request-button"
                style={styles.declineBtn}
                activeOpacity={0.7}
                onPress={handleDecline}
              >
                <Feather name="x" size={18} color="#FF3B30" />
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Suggest alternative form */}
          {showSuggest && (
            <View style={styles.suggestForm}>
              <View style={styles.suggestFormHeader}>
                <Text style={styles.sectionLabel}>SUGGEST ALTERNATIVE</Text>
                <TouchableOpacity testID="cancel-suggest" onPress={() => setShowSuggest(false)} activeOpacity={0.7}>
                  <Feather name="x" size={20} color="#737373" />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>DATE</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity testID="suggest-date-prev" onPress={() => changeDate(-1)} activeOpacity={0.7} style={styles.dateArrow}>
                  <Feather name="chevron-left" size={20} color="#0A0A0A" />
                </TouchableOpacity>
                <Text testID="suggest-date-display" style={styles.dateText}>
                  {formatShortDate(suggestedDate)}
                </Text>
                <TouchableOpacity testID="suggest-date-next" onPress={() => changeDate(1)} activeOpacity={0.7} style={styles.dateArrow}>
                  <Feather name="chevron-right" size={20} color="#0A0A0A" />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>TIME</Text>
              <View style={styles.slotsGrid}>
                {TIME_SLOTS.map((slot) => (
                  <TouchableOpacity
                    key={slot}
                    testID={`suggest-time-${slot}`}
                    style={[styles.slotBtn, suggestedTime === slot && styles.slotBtnActive]}
                    activeOpacity={0.7}
                    onPress={() => setSuggestedTime(slot)}
                  >
                    <Text style={[styles.slotText, suggestedTime === slot && styles.slotTextActive]}>
                      {slot}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
              <TextInput
                testID="suggest-note-input"
                style={styles.noteInput}
                value={suggestNote}
                onChangeText={setSuggestNote}
                placeholder="e.g. This time works better for me..."
                placeholderTextColor="#A3A3A3"
                multiline
              />

              <TouchableOpacity
                testID="send-suggestion-button"
                style={styles.sendSuggestBtn}
                activeOpacity={0.7}
                onPress={handleSuggest}
                disabled={acting}
              >
                <Text style={styles.sendSuggestText}>{acting ? 'Sending...' : 'Send Suggestion'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Actions for alternative_offered */}
          {request.status === 'alternative_offered' && (
            <View style={styles.actionsSection}>
              <Text style={styles.sectionLabel}>ACTIONS</Text>
              <TouchableOpacity
                testID="accept-request-button"
                style={styles.acceptBtn}
                activeOpacity={0.7}
                onPress={handleAccept}
                disabled={acting}
              >
                <Feather name="check" size={20} color="#FFFFFF" />
                <Text style={styles.acceptBtnText}>Accept Original Request</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="decline-request-button"
                style={styles.declineBtn}
                activeOpacity={0.7}
                onPress={handleDecline}
              >
                <Feather name="x" size={18} color="#FF3B30" />
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
    marginBottom: 24,
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
  suggestedCard: {
    backgroundColor: '#FFF8F0',
    borderWidth: 1,
    borderColor: '#FF9500',
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
  },
  suggestedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  suggestedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF9500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  suggestedInfo: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  suggestedNote: {
    fontSize: 14,
    color: '#737373',
    marginTop: 6,
  },
  actionsSection: {
    marginTop: 20,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#737373',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderRadius: 4,
    paddingVertical: 14,
    gap: 8,
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#0891B2',
    borderRadius: 4,
    paddingHorizontal: 14,
    gap: 8,
  },
  priceInput: {
    flex: 1,
    fontSize: 16,
    color: '#0A0A0A',
    paddingVertical: 12,
  },
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FF9500',
    borderRadius: 4,
    paddingVertical: 14,
    gap: 8,
  },
  suggestBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF9500',
  },
  declineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 4,
    paddingVertical: 14,
    gap: 8,
  },
  declineBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
  suggestForm: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
    padding: 16,
  },
  suggestFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#737373',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 16,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateArrow: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotBtn: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
  },
  slotBtnActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  slotText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0A0A0A',
  },
  slotTextActive: {
    color: '#FFFFFF',
  },
  noteInput: {
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
    fontSize: 15,
    color: '#0A0A0A',
    paddingVertical: 8,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  sendSuggestBtn: {
    backgroundColor: '#FF9500',
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  sendSuggestText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
