import { SUPABASE_KEY, SUPABASE_URL, VAPID_PUBLIC_KEY } from '../config';
import { Api } from './api';
import { now } from './types';

/**
 * Push-Nachrichten an die anderen Geräte des Haushalts.
 * Auf dem iPhone geht das nur, wenn die App über "Zum Home-Bildschirm" installiert ist (ab iOS 16.4).
 */

export type PushStatus = 'unsupported' | 'needs-install' | 'off' | 'denied' | 'on';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

export async function pushStatus(): Promise<PushStatus> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64url.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Fragt nach Erlaubnis, meldet das Gerät an und speichert das Abo beim Haushalt. */
export async function enablePush(householdId: string, member: string): Promise<PushStatus> {
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  await new Api(householdId).upsert('push_subscriptions', {
    household_id: householdId,
    member,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    created_at: now(),
    updated_at: now(),
  }, 'endpoint');
  return 'on';
}

export async function disablePush(householdId: string): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await new Api(householdId).deleteWhere('push_subscriptions', 'endpoint', sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
}

/** Schickt eine Test-Nachricht an alle Geräte des Haushalts, auch an dieses. Gibt die Anzahl zurück. */
export async function sendTestPush(householdId: string): Promise<number> {
  const headers: Record<string, string> = { apikey: SUPABASE_KEY, 'x-household-id': householdId, 'Content-Type': 'application/json' };
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/notify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Einkauf 🛒', body: 'Test erfolgreich – Push-Nachrichten funktionieren!', exclude: '' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
  return data.sent ?? 0;
}

/** Benachrichtigt die anderen Geräte. Fehler sind egal – Push ist ein Extra. */
export async function notifyOthers(householdId: string, title: string, body: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const own = (await reg?.pushManager?.getSubscription())?.endpoint ?? '';
    const headers: Record<string, string> = { apikey: SUPABASE_KEY, 'x-household-id': householdId, 'Content-Type': 'application/json' };
    if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
    await fetch(`${SUPABASE_URL}/functions/v1/notify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, body, exclude: own }),
    });
  } catch {
    // offline o. ä.
  }
}
