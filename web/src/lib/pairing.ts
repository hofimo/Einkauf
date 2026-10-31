import { SUPABASE_KEY, SUPABASE_URL } from '../config';
import { Api } from './api';
import { now } from './types';

/**
 * Kopplung weiterer Geräte (z. B. Echo Show) über einen kurzen Code statt des
 * 36-stelligen Haushalts-Codes. Der Code gilt 10 Minuten und nur einmal.
 */

// Ohne leicht verwechselbare Zeichen (0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAIRING_RE = /^[A-HJKMNP-Z2-9]{6}$/;

export function randomPairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Legt einen neuen Kopplungscode für den Haushalt an. */
export async function createPairingCode(householdId: string): Promise<{ code: string; expiresAt: Date }> {
  const code = randomPairingCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await new Api(householdId).upsert('pairing_codes', {
    code,
    household_id: householdId,
    expires_at: expiresAt.toISOString(),
    created_at: now(),
    updated_at: now(),
  });
  return { code, expiresAt };
}

/** Löst einen Kopplungscode ein und gibt den Haushalts-Code zurück (oder null). */
export async function redeemPairingCode(code: string): Promise<string | null> {
  const headers: Record<string, string> = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/redeem_pairing`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_code: code.trim().toUpperCase() }),
  });
  if (!res.ok) throw new Error(`Fehler ${res.status}`);
  const id = await res.json();
  return typeof id === 'string' ? id : null;
}

// ---------------------------------------------------------------- Küchen-Display

const KITCHEN_KEY = 'einkauf-kitchen';

/** Dieses Gerät zeigt die Küchen-Ansicht (Echo Show). Aktiviert über "#kueche" in der Adresse. */
export function isKitchenDevice(): boolean {
  try {
    if (/[#&]kueche\b/.test(location.hash)) localStorage.setItem(KITCHEN_KEY, '1');
    return localStorage.getItem(KITCHEN_KEY) === '1';
  } catch {
    return /[#&]kueche\b/.test(location.hash);
  }
}

export function setKitchenDevice(on: boolean) {
  try {
    if (on) localStorage.setItem(KITCHEN_KEY, '1');
    else localStorage.removeItem(KITCHEN_KEY);
  } catch {
    // egal
  }
}

export interface KitchenOptions {
  /** Läuft in einem Rahmen (Home Assistant Webseiten-Karte o. ä.) */
  embedded: boolean;
  theme: 'light' | 'dark' | null;
  clock: boolean;
}

/** Optionen aus der Adresse: "#join=…&kueche&dunkel&ohneuhr" */
export function kitchenOptions(hash = location.hash): KitchenOptions {
  const has = (w: string) => new RegExp(`[#&]${w}\\b`).test(hash);
  let embedded = has('eingebettet');
  try {
    embedded ||= window.self !== window.top;
  } catch {
    embedded = true; // Zugriff auf fremdes Fenster verweigert → sicher eingebettet
  }
  return { embedded, theme: has('dunkel') ? 'dark' : has('hell') ? 'light' : null, clock: !has('ohneuhr') };
}

/** Link, der den Haushalt gleich mitbringt – für Dashboards, die sich nichts merken (Home Assistant, Kiosk-Apps). */
export function kitchenLink(householdId: string, extra: string[] = []): string {
  return `${location.origin}${location.pathname}#${['join=' + householdId, 'kueche', ...extra].join('&')}`;
}
