import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Simple in-memory cache shared across all instances of the component so we
// don't refetch the (~150–2000 row) clients list every time a screen mounts.
let _cache: any[] | null = null;
let _cachePromise: Promise<any[]> | null = null;

const loadClientsOnce = async (): Promise<any[]> => {
  if (_cache) return _cache;
  if (_cachePromise) return _cachePromise;
  _cachePromise = (async () => {
    try {
      const r = await fetch(`${API_URL}/api/clients-db?limit=2000`);
      const items = await r.json();
      _cache = Array.isArray(items) ? items : [];
      return _cache;
    } catch {
      _cache = [];
      return _cache;
    } finally {
      _cachePromise = null;
    }
  })();
  return _cachePromise;
};

// Public helper — call after creating/updating/deleting a client so the cache
// is refreshed on the next autocomplete usage.
export const invalidateClientCache = () => {
  _cache = null;
};

export interface ClientLite {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface ClientAutocompleteProps {
  value: string;
  onChangeName: (name: string) => void;
  onPickClient: (client: ClientLite) => void;
  placeholder?: string;
  inputStyle?: any;
  testID?: string;
  minChars?: number; // minimum chars before showing suggestions (default 2)
  maxResults?: number; // max suggestions (default 8)
}

/**
 * Autocomplete input for client name.
 *
 * Shows a dropdown of matching clients (by name OR phone OR email) as the
 * user types. When a row is tapped, the parent's `onPickClient` is called
 * with the full client object so it can prefill the other fields (phone,
 * email, address, etc.).
 *
 * Usage:
 *   <ClientAutocomplete
 *     value={clientName}
 *     onChangeName={setClientName}
 *     onPickClient={(c) => {
 *       setClientName(c.name || '');
 *       setClientPhone(c.phone || '');
 *       setClientEmail(c.email || '');
 *       setClientAddress(c.address || '');
 *     }}
 *   />
 */
export default function ClientAutocomplete({
  value,
  onChangeName,
  onPickClient,
  placeholder = 'ex. Alice Martin',
  inputStyle,
  testID = 'client-autocomplete-input',
  minChars = 2,
  maxResults = 8,
}: ClientAutocompleteProps) {
  const [clients, setClients] = useState<any[]>(_cache || []);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadClientsOnce().then((items) => {
      if (!cancelled) setClients(items);
    });
    return () => { cancelled = true; };
  }, []);

  const q = (value || '').trim().toLowerCase();
  const suggestions: any[] = (() => {
    if (q.length < minChars) return [];
    const list: any[] = [];
    for (const c of clients) {
      const n = String(c.name || '').toLowerCase();
      const p = String(c.phone || '').toLowerCase();
      const e = String(c.email || '').toLowerCase();
      if (n.includes(q) || p.includes(q) || e.includes(q)) {
        list.push(c);
        if (list.length >= maxResults) break;
      }
    }
    return list;
  })();

  const pick = (c: any) => {
    setShow(false);
    onPickClient({
      id: c.id,
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      notes: c.notes || '',
    });
  };

  return (
    <View>
      <TextInput
        testID={testID}
        style={[styles.input, inputStyle]}
        value={value}
        onChangeText={(t) => { onChangeName(t); setShow(true); }}
        onFocus={() => setShow(true)}
        placeholder={placeholder}
        placeholderTextColor="#A3A3A3"
      />
      {show && suggestions.length > 0 && (
        <View style={styles.box}>
          {suggestions.map((c) => (
            <TouchableOpacity
              key={c.id || `${c.name}-${c.phone || c.email}`}
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => pick(c)}
            >
              <Text style={styles.name} numberOfLines={1}>
                {c.name || '—'}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[c.phone, c.email, c.address].filter(Boolean).join(' · ')}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.close}
            activeOpacity={0.6}
            onPress={() => setShow(false)}
          >
            <Text style={styles.closeText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: '#0A0A0A',
  },
  box: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#0891B2',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  name: { fontSize: 15, fontWeight: '600', color: '#0A0A0A' },
  meta: { fontSize: 12, color: '#737373', marginTop: 2 },
  close: {
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  closeText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
});
