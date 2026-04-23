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
  Modal,
  Pressable,
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
  request_type?: string;
  quoted_price?: number | null;
  quote_note?: string | null;
  quote_valid_until?: string | null;
  quoted_at?: string | null;
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
  // Estimate modal (for quote response to 'est' requests)
  const [showEstimate, setShowEstimate] = useState(false);
  const [estimatePrice, setEstimatePrice] = useState('');
  const [estimateNote, setEstimateNote] = useState('');

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

  const handleConvertEstimate = async () => {
    if (!request) return;
    const price = request.quoted_price || 0;
    const doConvert = async () => {
      Keyboard.dismiss();
      setActing(true);
      try {
        const res = await fetch(`${API_URL}/api/requests/${id}/accept`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price }),
        });
        if (res.ok) {
          Alert.alert(
            '✅ Converti !',
            `Rendez-vous confirmé créé avec succès\nPrix : ${price.toFixed(2)} $`,
            [{ text: 'OK', onPress: () => router.back() }]
          );
        } else {
          const err = await res.text();
          Alert.alert('Erreur', `Conversion impossible: ${err}`);
        }
      } catch {
        Alert.alert('Erreur', 'Erreur réseau');
      } finally {
        setActing(false);
      }
    };

    // Confirmation dialog
    if (Platform.OS === 'web') {
      const ok = window.confirm(
        `Convertir cette estimation en rendez-vous confirmé ?\n\n• Client: ${request.customer_name}\n• Date: ${request.preferred_date} à ${request.preferred_time}\n• Prix: ${price.toFixed(2)} $\n\nUn RDV sera créé automatiquement.`
      );
      if (ok) await doConvert();
    } else {
      Alert.alert(
        '🔄 Convertir en RDV ?',
        `Client: ${request.customer_name}\nDate: ${request.preferred_date} à ${request.preferred_time}\nPrix: ${price.toFixed(2)} $\n\nUn RDV confirmé sera créé automatiquement.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Convertir', style: 'default', onPress: doConvert },
        ]
      );
    }
  };

  const handleSuggest = async () => {
    if (!suggestedTime) {
      Alert.alert('Requis', 'Sélectionnez une heure');
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

        // Open native email/SMS to actually send the proposal to the client
        const customerName = request?.customer_name || 'Client';
        const customerEmail = (request?.customer_email || '').trim();
        const customerPhone = (request?.customer_phone || '').replace(/\D/g, '');
        const noteBlock = suggestNote.trim() ? `\n\nNote: ${suggestNote.trim()}` : '';
        const message = `Bonjour ${customerName},\n\nMerci pour votre demande de rendez-vous. Je vous propose une alternative :\n\n📅 Date: ${suggestedDate}\n🕐 Heure: ${suggestedTime}${noteBlock}\n\nCette proposition vous convient-elle? Répondez pour confirmer.\n\nMerci,\nLavage de Vitres Bois-Franc\n📞 514-570-9802`;

        Alert.alert(
          'Envoyer au client',
          `Comment voulez-vous transmettre la proposition à ${customerName} ?`,
          [
            ...(customerEmail ? [{
              text: '📧 Courriel',
              onPress: async () => {
                const subject = 'Proposition de rendez-vous — Lavage de Vitres Bois-Franc';
                const url = `mailto:${customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
                try {
                  const can = await Linking.canOpenURL(url);
                  if (can) await Linking.openURL(url);
                  else Alert.alert('Erreur', 'Aucune app courriel disponible');
                } catch { Alert.alert('Erreur', 'Impossible d\'ouvrir l\'app courriel'); }
              }
            }] : []),
            ...(customerPhone ? [{
              text: '💬 SMS',
              onPress: async () => {
                const sep = Platform.OS === 'ios' ? '&' : '?';
                const url = `sms:${customerPhone}${sep}body=${encodeURIComponent(message)}`;
                try {
                  const can = await Linking.canOpenURL(url);
                  if (can) await Linking.openURL(url);
                  else Alert.alert('Erreur', 'SMS non supporté');
                } catch { Alert.alert('Erreur', 'Impossible d\'ouvrir SMS'); }
              }
            }] : []),
            { text: 'Plus tard', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('Erreur', 'Échec de l\'envoi');
      }
    } catch {
      Alert.alert('Erreur', 'Erreur réseau');
    } finally {
      setActing(false);
    }
  };

  const handleSendEstimate = async () => {
    const priceNum = parseFloat((estimatePrice || '').replace(',', '.'));
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Prix invalide', 'Entrez un prix supérieur à 0.');
      return;
    }
    Keyboard.dismiss();
    setActing(true);
    try {
      const res = await fetch(`${API_URL}/api/requests/${id}/send-estimate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: priceNum,
          note: estimateNote.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRequest(data);
        setShowEstimate(false);
        // Native email/SMS fallback (in case Resend is sandbox or the email didn't go through)
        const customerName = request?.customer_name || 'Client';
        const customerEmail = (request?.customer_email || '').trim();
        const customerPhone = (request?.customer_phone || '').replace(/\D/g, '');
        const priceStr = `${priceNum.toFixed(2)} $`;
        const noteBlock = estimateNote.trim() ? `\n\nNote: ${estimateNote.trim()}` : '';
        const message = `Bonjour ${customerName},\n\nMerci pour votre demande d'estimation. Voici mon prix proposé :\n\n💰 Prix : ${priceStr}${noteBlock}\n\nCette estimation vous convient-elle ? Répondez pour confirmer le rendez-vous.\n\nMerci,\nLavage de Vitres Bois-Franc\n📞 514-570-9802`;

        const options: any[] = [];
        if (customerEmail) {
          options.push({
            text: '📧 Courriel',
            onPress: () => Linking.openURL(`mailto:${customerEmail}?subject=${encodeURIComponent(`Votre estimation — ${priceStr}`)}&body=${encodeURIComponent(message)}`),
          });
        }
        if (customerPhone) {
          options.push({
            text: '📱 SMS',
            onPress: () => Linking.openURL(`sms:${customerPhone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`),
          });
        }
        options.push({ text: 'OK (déjà envoyé via Resend)', style: 'cancel' });

        Alert.alert(
          '✅ Estimation enregistrée',
          `Prix ${priceStr} pour ${customerName}.\n\nUn courriel HTML a été envoyé (si Resend est activé).\n\nVoulez-vous aussi envoyer manuellement ?`,
          options
        );
      } else {
        Alert.alert('Erreur', "Échec de l'envoi de l'estimation");
      }
    } catch {
      Alert.alert('Erreur', 'Erreur réseau');
    } finally {
      setActing(false);
    }
  };

  const handleDecline = () => {
    const doDecline = async () => {
      try {
        const res = await fetch(`${API_URL}/api/requests/${id}`, { method: 'DELETE' });
        if (res.ok) router.back();
        else Alert.alert('Erreur', 'Archivage impossible');
      } catch {
        Alert.alert('Erreur', 'Archivage impossible');
      }
    };
    const msg = 'Êtes-vous certain de vouloir archiver cette demande ?\n\n✅ La demande sera déplacée dans l\'onglet « 🗂️ Archivées » — vous pourrez la restaurer plus tard si nécessaire.';
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(msg)) doDecline();
    } else {
      Alert.alert(
        'Archiver la demande',
        msg,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: '🗂️ Archiver', style: 'destructive', onPress: doDecline },
        ],
        { cancelable: true }
      );
    }
  };

  const changeDate = (offset: number) => {
    const d = new Date(suggestedDate + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setSuggestedDate(d.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    if (status === 'accepted') return '#34C759';
    if (status === 'alternative_offered') return '#FF9500';
    if (status === 'estimate_sent') return '#3B82F6';
    if (status === 'declined') return '#9CA3AF';
    return '#0891B2';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'alternative_offered') return 'Alternative proposée';
    if (status === 'accepted') return 'Accepté';
    if (status === 'estimate_sent') return 'Estimation envoyée';
    if (status === 'pending') return 'En attente';
    if (status === 'declined') return 'Archivé';
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
            {/* Type badge */}
            <View style={[styles.statusBadge, {
              borderColor: request.request_type === 'est' ? '#F59E0B' : '#0891B2',
              backgroundColor: request.request_type === 'est' ? '#FEF3C7' : '#ECFEFF',
            }]}>
              <Text style={[styles.statusBadgeText, {
                color: request.request_type === 'est' ? '#B45309' : '#0891B2',
              }]}>
                {request.request_type === 'est' ? '💰 ESTIMATION' : '📅 RDV'}
              </Text>
            </View>
            {/* Status badge */}
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
                <Text style={styles.infoLabel}>PRÉFÉRÉ: DATE & HEURE</Text>
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
                <Text style={styles.suggestBtnText}>Suggérer une alternative</Text>
              </TouchableOpacity>

              {/* Estimate button — only for 'est' request type */}
              {request?.request_type === 'est' && (
                <TouchableOpacity
                  testID="send-estimate-button"
                  style={styles.estimateBtn}
                  activeOpacity={0.7}
                  onPress={() => {
                    setEstimatePrice('');
                    setEstimateNote('');
                    setShowEstimate(true);
                  }}
                >
                  <Feather name="dollar-sign" size={18} color="#FFFFFF" />
                  <Text style={styles.estimateBtnText}>Envoyer une estimation (prix)</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                testID="decline-request-button"
                style={styles.declineBtn}
                activeOpacity={0.7}
                onPress={handleDecline}
              >
                <Feather name="x" size={18} color="#FF3B30" />
                <Text style={styles.declineBtnText}>🗂️ Archiver</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Estimate sent — offer to convert to a confirmed appointment */}
          {request?.status === 'estimate_sent' && (
            <View style={styles.actionsSection}>
              <Text style={styles.sectionLabel}>ESTIMATION ENVOYÉE</Text>

              {/* Quote recap card */}
              <View style={styles.quoteRecapCard}>
                <View style={styles.quoteRecapHeader}>
                  <Feather name="dollar-sign" size={18} color="#3B82F6" />
                  <Text style={styles.quoteRecapTitle}>Devis transmis au client</Text>
                </View>
                <View style={styles.quoteRecapRow}>
                  <Text style={styles.quoteRecapLabel}>Prix proposé</Text>
                  <Text style={styles.quoteRecapPrice}>
                    {(request.quoted_price || 0).toFixed(2)} $
                  </Text>
                </View>
                {request.quote_valid_until ? (
                  <View style={styles.quoteRecapRow}>
                    <Text style={styles.quoteRecapLabel}>Valide jusqu'au</Text>
                    <Text style={styles.quoteRecapValue}>{request.quote_valid_until}</Text>
                  </View>
                ) : null}
                {request.quote_note ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.quoteRecapLabel}>Note</Text>
                    <Text style={styles.quoteRecapValue}>{request.quote_note}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.convertHint}>
                Le client a accepté ? Convertissez cette estimation en rendez-vous confirmé.
              </Text>

              <TouchableOpacity
                testID="convert-estimate-button"
                style={styles.convertBtn}
                activeOpacity={0.8}
                onPress={handleConvertEstimate}
                disabled={acting}
              >
                <Feather name="check-circle" size={20} color="#FFFFFF" />
                <Text style={styles.convertBtnText}>
                  {acting ? 'Conversion…' : '✅ Convertir en RDV confirmé'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="resend-estimate-button"
                style={styles.estimateBtn}
                activeOpacity={0.7}
                onPress={() => {
                  setEstimatePrice(String(request.quoted_price || ''));
                  setEstimateNote(request.quote_note || '');
                  setShowEstimate(true);
                }}
              >
                <Feather name="refresh-cw" size={18} color="#FFFFFF" />
                <Text style={styles.estimateBtnText}>Renvoyer / Modifier l'estimation</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="decline-estimate-button"
                style={styles.declineBtn}
                activeOpacity={0.7}
                onPress={handleDecline}
              >
                <Feather name="x" size={18} color="#FF3B30" />
                <Text style={styles.declineBtnText}>🗂️ Archiver</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Restore button for archived requests */}
          {request?.status === 'declined' && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                testID="restore-request-button"
                style={styles.acceptBtn}
                activeOpacity={0.7}
                onPress={async () => {
                  try {
                    const res = await fetch(`${API_URL}/api/requests/${id}/restore`, { method: 'PUT' });
                    if (res.ok) router.back();
                  } catch {
                    Alert.alert('Erreur', 'Restauration impossible');
                  }
                }}
              >
                <Feather name="rotate-ccw" size={20} color="#FFFFFF" />
                <Text style={styles.acceptBtnText}>Restaurer la demande</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="permanent-delete-button"
                style={[styles.declineBtn, { borderColor: '#DC2626' }]}
                activeOpacity={0.7}
                onPress={() => {
                  const msg = '⚠️ ATTENTION — Suppression DÉFINITIVE\n\nCette demande sera supprimée pour toujours et ne pourra PAS être récupérée.\n\nÊtes-vous certain ?';
                  const doDel = async () => {
                    try {
                      const res = await fetch(`${API_URL}/api/requests/${id}/permanent`, { method: 'DELETE' });
                      if (res.ok) router.back();
                      else Alert.alert('Erreur', 'Suppression impossible');
                    } catch {
                      Alert.alert('Erreur', 'Suppression impossible');
                    }
                  };
                  if (Platform.OS === 'web') {
                    // eslint-disable-next-line no-alert
                    if (window.confirm(msg)) doDel();
                  } else {
                    Alert.alert(
                      '⚠️ Supprimer définitivement',
                      msg,
                      [
                        { text: 'Annuler', style: 'cancel' },
                        { text: '🗑️ Supprimer', style: 'destructive', onPress: doDel },
                      ],
                      { cancelable: true }
                    );
                  }
                }}
              >
                <Feather name="trash-2" size={18} color="#DC2626" />
                <Text style={[styles.declineBtnText, { color: '#DC2626' }]}>🗑️ Supprimer définitivement</Text>
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
                <Text style={styles.declineBtnText}>🗂️ Archiver</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>

        {/* Estimate Modal (for 'est' request type) */}
        <Modal visible={showEstimate} animationType="slide" transparent onRequestClose={() => setShowEstimate(false)}>
          <Pressable style={styles.estimateOverlay} onPress={() => { Keyboard.dismiss(); setShowEstimate(false); }}>
            <Pressable style={styles.estimateBox} onPress={(e: any) => e.stopPropagation()}>
              <View style={styles.estimateHeader}>
                <Text style={styles.estimateTitle}>💰 Envoyer une estimation</Text>
                <TouchableOpacity onPress={() => setShowEstimate(false)}>
                  <Feather name="x" size={24} color="#111" />
                </TouchableOpacity>
              </View>

              <Text style={styles.estimateHint}>
                Entrez le prix estimé pour "{request?.customer_name || 'ce client'}". Un courriel HTML élégant lui sera envoyé avec le montant.
              </Text>

              <Text style={styles.estimateLabel}>Prix estimé ($)</Text>
              <TextInput
                style={styles.estimateInput}
                placeholder="Ex: 150.00"
                placeholderTextColor="#9CA3AF"
                value={estimatePrice}
                onChangeText={setEstimatePrice}
                keyboardType="decimal-pad"
                autoFocus
              />

              <Text style={styles.estimateLabel}>Note / Description (optionnelle)</Text>
              <TextInput
                style={[styles.estimateInput, { minHeight: 80, textAlignVertical: 'top' }]}
                placeholder="Ex: 2 étages, intérieur et extérieur. Valide 30 jours."
                placeholderTextColor="#9CA3AF"
                value={estimateNote}
                onChangeText={setEstimateNote}
                multiline
              />

              <TouchableOpacity
                style={[styles.estimateSendBtn, acting && { opacity: 0.6 }]}
                onPress={handleSendEstimate}
                disabled={acting}
                activeOpacity={0.8}
              >
                {acting ? (
                  <Text style={styles.estimateSendText}>Envoi en cours...</Text>
                ) : (
                  <>
                    <Feather name="send" size={18} color="#fff" />
                    <Text style={styles.estimateSendText}>Envoyer l'estimation</Text>
                  </>
                )}
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
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
  estimateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
  },
  estimateBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Convert estimate -> appointment styles
  quoteRecapCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12,
  },
  quoteRecapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  quoteRecapTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E40AF',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  quoteRecapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  quoteRecapLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  quoteRecapValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  quoteRecapPrice: {
    fontSize: 20,
    color: '#059669',
    fontWeight: '800',
  },
  convertHint: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  convertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 15,
    gap: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  convertBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  // Estimate modal styles
  estimateOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  estimateBox: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '92%',
  },
  estimateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  estimateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  estimateHint: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 18,
  },
  estimateLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  estimateInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FAFAFA',
  },
  estimateSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 20,
  },
  estimateSendText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
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
