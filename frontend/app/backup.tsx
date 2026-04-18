import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import AppHeader from '../components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function BackupScreen() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/api/backup/export`);
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const json = JSON.stringify(data, null, 2);
      const today = new Date().toISOString().split('T')[0];
      const fileName = `brightcalendar-backup-${today}.json`;

      if (Platform.OS === 'web') {
        // Web: trigger download
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert('Exporté!', 'Votre sauvegarde a été téléchargée.');
      } else {
        // Mobile: write file and open share sheet (AirDrop, iCloud Drive, Google Drive, etc.)
        const fileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
        const available = await Sharing.isAvailableAsync();
        if (available) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/json',
            dialogTitle: 'Sauvegarder vers iCloud / Google Drive',
            UTI: 'public.json',
          });
        } else {
          Alert.alert('Sauvegarde créée', `Fichier : ${fileUri}`);
        }
      }
    } catch (e) {
      Alert.alert('Erreur', "Impossible d'exporter les données");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    Alert.alert(
      'Restaurer les données',
      'La restauration va ajouter/mettre à jour les données depuis votre fichier de sauvegarde.\n\nLes données actuelles ne seront pas supprimées — seulement complétées ou mises à jour.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Continuer', onPress: doImport },
      ]
    );
  };

  const doImport = async () => {
    setImporting(true);
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (pick.canceled || !pick.assets?.[0]) {
        setImporting(false);
        return;
      }
      const file = pick.assets[0];
      let content = '';
      if (Platform.OS === 'web') {
        // On web, 'file' has a 'file' or 'uri' (blob URL). Read it:
        const resp = await fetch(file.uri);
        content = await resp.text();
      } else {
        content = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      }
      const json = JSON.parse(content);

      const res = await fetch(`${API_URL}/api/backup/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      if (!res.ok) throw new Error('Import failed');
      const result = await res.json();
      const { imported } = result;
      Alert.alert(
        'Restauration réussie',
        `RDV: ${imported.appointments || 0}\n` +
        `Demandes: ${imported.requests || 0}\n` +
        `Employés: ${imported.employees || 0}\n` +
        `Avis: ${imported.reviews || 0}`
      );
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || "Impossible de restaurer");
    } finally {
      setImporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="Sauvegarde" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusIcon}>
            <Feather name="cloud" size={32} color="#10B981" />
          </View>
          <Text style={styles.statusTitle}>Vos données sont sécurisées</Text>
          <Text style={styles.statusText}>
            Vos rendez-vous, clients et avis sont automatiquement sauvegardés sur nos serveurs. Même si votre téléphone est perdu ou cassé, vous pouvez retrouver tout votre historique en vous connectant depuis un autre appareil.
          </Text>
        </View>

        {/* Export to iCloud/Drive */}
        <Text style={styles.sectionTitle}>EXPORTER VERS ICLOUD / GOOGLE DRIVE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Feather name="download-cloud" size={22} color="#0891B2" />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Télécharger une copie complète</Text>
              <Text style={styles.rowText}>
                Crée un fichier JSON avec tous vos RDV, clients, employés et avis. Vous pouvez le sauvegarder sur:
              </Text>
              <View style={styles.destinations}>
                <View style={styles.dest}><Text style={styles.destIcon}>☁️</Text><Text style={styles.destText}>iCloud Drive</Text></View>
                <View style={styles.dest}><Text style={styles.destIcon}>📁</Text><Text style={styles.destText}>Google Drive</Text></View>
                <View style={styles.dest}><Text style={styles.destIcon}>📧</Text><Text style={styles.destText}>Email</Text></View>
                <View style={styles.dest}><Text style={styles.destIcon}>💾</Text><Text style={styles.destText}>Dropbox</Text></View>
              </View>
            </View>
          </View>
          <TouchableOpacity
            testID="export-btn"
            style={[styles.btn, styles.btnPrimary]}
            activeOpacity={0.7}
            onPress={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Feather name="download-cloud" size={18} color="#FFF" />
                <Text style={styles.btnPrimaryText}>Exporter maintenant</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Import */}
        <Text style={styles.sectionTitle}>RESTAURER DEPUIS UNE SAUVEGARDE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Feather name="upload-cloud" size={22} color="#7C3AED" />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Restaurer un fichier JSON</Text>
              <Text style={styles.rowText}>
                Utile si vous avez changé de téléphone ou en cas de perte. Sélectionnez le fichier JSON depuis iCloud Drive, Google Drive ou vos documents.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            testID="import-btn"
            style={[styles.btn, styles.btnSecondary]}
            activeOpacity={0.7}
            onPress={handleImport}
            disabled={importing}
          >
            {importing ? (
              <ActivityIndicator size="small" color="#7C3AED" />
            ) : (
              <>
                <Feather name="upload-cloud" size={18} color="#7C3AED" />
                <Text style={styles.btnSecondaryText}>Choisir un fichier</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Tips */}
        <View style={styles.tipCard}>
          <Feather name="info" size={16} color="#0891B2" />
          <View style={{ flex: 1 }}>
            <Text style={styles.tipTitle}>Conseil</Text>
            <Text style={styles.tipText}>
              Exportez votre sauvegarde une fois par mois et envoyez-vous le fichier par courriel ou sauvegardez sur iCloud Drive. Ainsi, en cas de problème, vous pouvez tout restaurer en 30 secondes.
            </Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  statusCard: {
    backgroundColor: '#F0FDF4', borderRadius: 14, padding: 20, marginBottom: 20,
    borderWidth: 1, borderColor: '#BBF7D0', alignItems: 'center',
  },
  statusIcon: { marginBottom: 10 },
  statusTitle: { fontSize: 17, fontWeight: '700', color: '#065F46', marginBottom: 6 },
  statusText: { fontSize: 13, color: '#047857', lineHeight: 20, textAlign: 'center' },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#737373', letterSpacing: 1, marginBottom: 10, marginTop: 8 },
  card: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 18,
    borderWidth: 1, borderColor: '#E5E5E5',
  },
  row: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#0A0A0A', marginBottom: 4 },
  rowText: { fontSize: 13, color: '#525252', lineHeight: 18 },
  destinations: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  dest: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F5F5F5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  destIcon: { fontSize: 14 },
  destText: { fontSize: 11, fontWeight: '600', color: '#404040' },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 10, minHeight: 48,
  },
  btnPrimary: { backgroundColor: '#0891B2' },
  btnPrimaryText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  btnSecondary: { backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#7C3AED' },
  btnSecondaryText: { color: '#7C3AED', fontSize: 15, fontWeight: '700' },
  tipCard: {
    flexDirection: 'row', gap: 10, backgroundColor: '#F0F9FF',
    padding: 12, borderRadius: 10, marginTop: 8,
  },
  tipTitle: { fontSize: 13, fontWeight: '700', color: '#0C4A6E', marginBottom: 4 },
  tipText: { fontSize: 12, color: '#0C4A6E', lineHeight: 18 },
});
