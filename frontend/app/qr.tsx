import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ScrollView, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function QRScreen() {
  const qrUrl = `${API_URL}/api/booking-qr`;
  const bookingUrl = `${API_URL}/api/booking`;
  const printableUrl = `${API_URL}/api/booking-qr-page`;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(bookingUrl);
    Alert.alert('Copié!', 'Le lien de réservation est dans votre presse-papier.');
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `📅 Prenez rendez-vous en ligne avec Lavage de Vitres Bois-Franc:\n${bookingUrl}`,
        url: bookingUrl,
        title: 'Prendre rendez-vous',
      });
    } catch { Alert.alert('Erreur', 'Impossible de partager'); }
  };

  const handlePrintable = async () => {
    try {
      await Share.share({
        message: `Page imprimable du QR code: ${printableUrl}`,
        url: printableUrl,
        title: 'QR Code imprimable',
      });
    } catch { Alert.alert('Erreur', 'Impossible d\'ouvrir'); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="QR Code Client" showBack />
      <ScrollView contentContainerStyle={styles.content}>

        {/* Hero card */}
        <View style={styles.card}>
          <Text style={styles.tagline}>LAVAGE DE VITRES BOIS-FRANC</Text>
          <Text style={styles.title}>📅 Prenez rendez-vous</Text>

          <View style={styles.qrWrap}>
            <Image source={{ uri: qrUrl }} style={styles.qrImage} resizeMode="contain" />
          </View>

          <Text style={styles.scanLabel}>Scannez avec votre téléphone</Text>
          <Text style={styles.scanHint}>Ouvrez l'appareil photo et pointez-le vers le QR</Text>
        </View>

        {/* Contact info */}
        <View style={styles.contactCard}>
          <View style={styles.contactRow}>
            <Feather name="phone" size={16} color="#0891B2" />
            <Text style={styles.contactText}>514-570-9802</Text>
          </View>
          <View style={styles.contactRow}>
            <Feather name="mail" size={16} color="#0891B2" />
            <Text style={styles.contactText}>lavagedevitreboisfranc@live.com</Text>
          </View>
          <View style={styles.contactRow}>
            <Feather name="globe" size={16} color="#0891B2" />
            <Text style={styles.contactText}>Lavagedevitre.org</Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>PARTAGER CE QR CODE</Text>

          <TouchableOpacity style={styles.btn} activeOpacity={0.7} onPress={handleShare}>
            <Feather name="share-2" size={18} color="#0891B2" />
            <Text style={styles.btnText}>Partager le lien de réservation</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btn} activeOpacity={0.7} onPress={handleCopy}>
            <Feather name="copy" size={18} color="#0891B2" />
            <Text style={styles.btnText}>Copier le lien</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnPrint]} activeOpacity={0.7} onPress={handlePrintable}>
            <Feather name="printer" size={18} color="#FFF" />
            <Text style={styles.btnTextWhite}>Version imprimable (pour affiches/cartes)</Text>
          </TouchableOpacity>
        </View>

        {/* Usage tips */}
        <View style={styles.tipCard}>
          <Feather name="info" size={16} color="#0891B2" />
          <View style={{ flex: 1 }}>
            <Text style={styles.tipTitle}>Comment utiliser</Text>
            <Text style={styles.tipText}>
              • Montrez cet écran au client — il scanne avec son téléphone{'\n'}
              • Imprimez la version papier pour votre véhicule et vos cartes{'\n'}
              • Partagez le lien par SMS ou courriel
            </Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#0891B2',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24 },
      android: { elevation: 8 },
    }),
  },
  tagline: {
    color: '#E0F7FA',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
  },
  qrWrap: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 20,
    marginVertical: 8,
  },
  qrImage: { width: 240, height: 240 },
  scanLabel: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 20,
    textAlign: 'center',
  },
  scanHint: {
    color: '#E0F7FA',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  contactCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    gap: 10,
  },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  contactText: { fontSize: 14, color: '#0A0A0A', fontWeight: '500' },
  actionsSection: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#737373',
    letterSpacing: 1, marginBottom: 10,
  },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#0891B2',
    paddingVertical: 14, borderRadius: 10, marginBottom: 10,
  },
  btnText: { color: '#0891B2', fontSize: 15, fontWeight: '700' },
  btnPrint: { backgroundColor: '#0891B2', borderColor: '#0891B2' },
  btnTextWhite: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  tipCard: {
    flexDirection: 'row', gap: 10, backgroundColor: '#F0F9FF',
    padding: 14, borderRadius: 10,
  },
  tipTitle: { fontSize: 13, fontWeight: '700', color: '#0C4A6E', marginBottom: 4 },
  tipText: { fontSize: 12, color: '#0C4A6E', lineHeight: 18 },
});
