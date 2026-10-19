// Supabase Edge Function "notify"
// Schickt eine Push-Nachricht an alle anderen Geräte des Haushalts,
// z. B. "Timo ist einkaufen – noch schnell was auf die Liste?".
//
// Aufruf (aus der App): POST /functions/v1/notify
//   Header: apikey, x-household-id
//   Body:   { "title": "...", "body": "...", "exclude": "<eigener Push-Endpoint>" }
//
// Benötigte Secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (z. B. mailto:du@example.com)
//
// Web Push nach RFC 8291 (Verschlüsselung) und RFC 8292 (VAPID), nur mit WebCrypto.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-household-id, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** Verschlüsselt eine Nachricht für ein Push-Abo (Content-Encoding: aes128gcm). */
export async function encryptPayload(payload: string, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(p256dh);
  const auth = b64urlDecode(authSecret);

  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, ephemeral.privateKey, 256));

  const prkKey = await hmac(auth, ecdhSecret);
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plaintext = concat(enc.encode(payload), new Uint8Array([2])); // 0x02 = letzter Datensatz
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

/** VAPID-Authorization-Header für den Push-Dienst des Empfängers. */
export async function vapidHeader(endpoint: string, publicKey: string, privateKey: string, subject: string): Promise<string> {
  const pub = b64urlDecode(publicKey);
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: privateKey, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)) },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const jwtHeader = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })));
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${jwtHeader}.${claims}`),
  ));
  return `vapid t=${jwtHeader}.${claims}.${b64urlEncode(signature)}, k=${publicKey}`;
}

interface Subscription { id: string; endpoint: string; p256dh: string; auth: string }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// In Node (Tests) gibt es kein Deno – dort nur die Hilfsfunktionen exportieren.
type DenoLike = { serve: (h: (r: Request) => Promise<Response>) => void; env: { get(k: string): string | undefined } };
const Deno = (globalThis as unknown as { Deno?: DenoLike }).Deno;

if (Deno) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    try {
      const household = req.headers.get('x-household-id') ?? '';
      const apikey = req.headers.get('apikey') ?? '';
      if (!/^[0-9a-f-]{36}$/i.test(household) || !apikey) return json({ error: 'Haushalt fehlt' }, 400);

      const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
      const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
      const subject = Deno.env.get('VAPID_SUBJECT') ?? 'https://hofimo.github.io/Einkauf/';
      if (!publicKey || !privateKey) return json({ error: 'VAPID-Schlüssel fehlen (Secrets)' }, 500);

      const { title = 'Einkauf', body = '', exclude = '' } = await req.json();

      // Abos dieses Haushalts lesen – mit dem Key und Code des Aufrufers, also unter Row Level Security
      const rest = `${Deno.env.get('SUPABASE_URL')}/rest/v1/push_subscriptions`;
      const headers: Record<string, string> = { apikey, 'x-household-id': household };
      if (apikey.startsWith('eyJ')) headers.Authorization = `Bearer ${apikey}`;
      const subs: Subscription[] = await (await fetch(`${rest}?select=id,endpoint,p256dh,auth&household_id=eq.${household}`, { headers })).json();

      const payload = JSON.stringify({ title: String(title).slice(0, 80), body: String(body).slice(0, 300) });
      let sent = 0;
      for (const sub of subs.filter((s) => s.endpoint !== exclude)) {
        const res = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            Authorization: await vapidHeader(sub.endpoint, publicKey, privateKey, subject),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: '3600',
            Urgency: 'high',
          },
          body: await encryptPayload(payload, sub.p256dh, sub.auth),
        });
        if (res.ok) sent++;
        // Abo abgelaufen (App gelöscht o. ä.) → aufräumen
        if (res.status === 404 || res.status === 410) {
          await fetch(`${rest}?id=eq.${sub.id}`, { method: 'DELETE', headers });
        }
      }
      return json({ sent });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });
}
