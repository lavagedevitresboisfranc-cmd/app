/**
 * Web Push helper — registers the Service Worker, manages browser subscription
 * lifecycle, and talks to the backend /api/push/* endpoints.
 *
 * Only runs on Platform.OS === 'web'. Returns no-ops on native.
 */
import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_KEY || '';

/** Convert base64url string → Uint8Array for PushManager.subscribe applicationServerKey */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = typeof window !== 'undefined' ? window.atob(base64) : '';
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushState = {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  endpoint: string;
};

export async function getPushState(): Promise<PushState> {
  const empty: PushState = { supported: false, permission: 'unsupported', subscribed: false, endpoint: '' };
  if (Platform.OS !== 'web') return empty;
  if (typeof window === 'undefined') return empty;
  // @ts-ignore — DOM types not always available in RN env
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return empty;
  }
  // @ts-ignore
  const permission: NotificationPermission = Notification.permission;
  try {
    // @ts-ignore
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return { supported: true, permission, subscribed: false, endpoint: '' };
    const sub = await reg.pushManager.getSubscription();
    return {
      supported: true,
      permission,
      subscribed: !!sub,
      endpoint: sub ? sub.endpoint : '',
    };
  } catch {
    return { supported: true, permission, subscribed: false, endpoint: '' };
  }
}

export async function enablePush(label: string = 'iPhone PWA'): Promise<{ ok: boolean; error?: string; endpoint?: string }> {
  if (Platform.OS !== 'web') return { ok: false, error: 'Disponible uniquement en mode PWA web.' };
  if (typeof window === 'undefined') return { ok: false, error: 'Pas de fenêtre disponible' };
  // @ts-ignore
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, error: 'Notifications non supportées par ce navigateur. Sur iPhone, installez d\'abord l\'app (Partager → Sur l\'écran d\'accueil), puis ouvrez-la.' };
  }
  if (!VAPID_PUBLIC_KEY) return { ok: false, error: 'Clé VAPID manquante (EXPO_PUBLIC_VAPID_KEY).' };

  try {
    // 1) Register the service worker at scope '/'
    // @ts-ignore
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    // Wait until it's active
    // @ts-ignore
    if (reg.installing) await new Promise((resolve) => {
      const sw = reg.installing;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated') resolve(null);
      });
    });

    // 2) Ask permission
    // @ts-ignore
    let perm: NotificationPermission = Notification.permission;
    if (perm === 'default') {
      // @ts-ignore
      perm = await Notification.requestPermission();
    }
    if (perm !== 'granted') {
      return { ok: false, error: 'Permission refusée. Activez les notifications dans Réglages > Safari ou Réglages > Notifications.' };
    }

    // 3) Subscribe via PushManager
    const appKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appKey,
    });

    // 4) Send the subscription to the backend
    const json = subscription.toJSON ? subscription.toJSON() : subscription;
    const res = await fetch(`${API_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: json, label }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: 'Échec côté serveur: ' + txt.slice(0, 200) };
    }
    return { ok: true, endpoint: subscription.endpoint };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur inconnue' };
  }
}

export async function disablePush(): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS !== 'web') return { ok: false, error: 'Disponible uniquement en mode PWA web.' };
  try {
    // @ts-ignore
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return { ok: true };
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      // Tell the backend to forget
      await fetch(`${API_URL}/api/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      }).catch(() => undefined);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur inconnue' };
  }
}

export async function sendTestPush(): Promise<{ sent: number; total: number; failed: number }> {
  try {
    const res = await fetch(`${API_URL}/api/push/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '🔔 Test Gexia360',
        body: 'Si vous voyez ce message, les notifications fonctionnent! 🎉',
        url: '/',
      }),
    });
    const d = await res.json().catch(() => ({}));
    return { sent: d?.sent || 0, total: d?.total || 0, failed: d?.failed || 0 };
  } catch {
    return { sent: 0, total: 0, failed: 0 };
  }
}
