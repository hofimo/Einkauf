// Zugriff auf die Einkaufsliste in Supabase (ohne Alexa-Abhängigkeiten, damit testbar).
const crypto = require('crypto');

const NUMBER_WORDS = {
  ein: 1, eine: 1, einen: 1, einem: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6,
  sieben: 7, acht: 8, neun: 9, zehn: 10, zwölf: 12, halbe: 0.5, halben: 0.5, halbes: 0.5,
};
const UNITS = [
  'kilogramm', 'kilo', 'kg', 'gramm', 'g', 'liter', 'l', 'milliliter', 'ml',
  'packungen', 'packung', 'päckchen', 'dosen', 'dose', 'flaschen', 'flasche', 'kisten', 'kiste',
  'becher', 'gläser', 'glas', 'stück', 'bund', 'beutel', 'tüten', 'tüte', 'netz', 'rollen', 'rolle',
];

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "brot, zwei liter milch und eier" → [{name:'Brot',quantity:''},{name:'Milch',quantity:'2 Liter'},…] */
function parseSpoken(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+(und|sowie|plus)\s+/g, ',')
    .split(',')
    .map((s) => s.trim().replace(/^(noch|bitte|etwas|ein paar)\s+/, '').replace(/\s+bitte$/, ''))
    .filter(Boolean)
    .map(parseOne)
    .filter((x) => x.name);
}

function parseOne(piece) {
  const words = piece.split(/\s+/);
  let amount = null;
  if (/^\d+([.,]\d+)?$/.test(words[0])) amount = words.shift().replace('.', ',');
  else if (NUMBER_WORDS[words[0]] !== undefined && words.length > 1) amount = String(NUMBER_WORDS[words.shift()]).replace('.', ',');
  let unit = '';
  if (amount && words.length > 1 && UNITS.includes(words[0])) unit = capitalize(words.shift());
  if (unit.length <= 2) unit = unit.toLowerCase();
  const name = words.map(capitalize).join(' ');
  const quantity = amount ? [amount, unit].filter(Boolean).join(' ') : '';
  return { name, quantity };
}

class ShoppingList {
  constructor({ SUPABASE_URL, SUPABASE_KEY, HOUSEHOLD_ID }, fetchImpl = fetch) {
    this.base = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
    this.household = HOUSEHOLD_ID.toLowerCase();
    this.fetch = fetchImpl;
    this.headers = {
      apikey: SUPABASE_KEY,
      'x-household-id': this.household,
      'Content-Type': 'application/json',
    };
    if (SUPABASE_KEY.startsWith('eyJ')) this.headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  }

  async request(path, options = {}) {
    const res = await this.fetch(`${this.base}/${path}`, { ...options, headers: { ...this.headers, ...options.headers } });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async items() {
    return this.request(`shopping_items?select=*&household_id=eq.${this.household}&order=created_at.asc`);
  }

  async openItems() {
    return (await this.items()).filter((i) => !i.checked);
  }

  /** Fügt Artikel hinzu; gibt {added, existing} mit Namen zurück. */
  async add(text) {
    const wanted = parseSpoken(text);
    const all = await this.items();
    const added = [];
    const existing = [];
    for (const { name, quantity } of wanted) {
      const match = all.find((i) => i.name.toLowerCase() === name.toLowerCase());
      const now = new Date().toISOString();
      if (match && !match.checked) {
        existing.push(name);
        continue;
      }
      if (match) {
        // Früher gekauft → wieder aktivieren
        await this.request(`shopping_items?id=eq.${match.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ checked: false, checked_at: null, quantity, source: 'Alexa', created_at: now, updated_at: now }),
        });
      } else {
        await this.request('shopping_items', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            household_id: this.household,
            name,
            quantity,
            note: '',
            category: '', // ordnet die App anhand des Namens zu
            checked: false,
            source: 'Alexa',
            created_at: now,
            updated_at: now,
          }),
        });
      }
      added.push(name);
    }
    return { added, existing };
  }
}

/** ["Brot","Milch","Eier"] → "Brot, Milch und Eier" */
function joinGerman(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}`;
}

module.exports = { ShoppingList, parseSpoken, joinGerman };
