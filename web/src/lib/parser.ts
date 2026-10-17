import { uuid, type Ingredient } from './types';

const UNITS = [
  'kg', 'g', 'mg', 'gramm', 'kilo', 'l', 'liter', 'ml', 'cl', 'dl',
  'el', 'tl', 'msp.', 'msp', 'prise', 'prisen', 'pck.', 'pck', 'päckchen', 'packung', 'packungen',
  'dose', 'dosen', 'becher', 'bund', 'stück', 'stk.', 'stk', 'zehe', 'zehen', 'scheibe', 'scheiben',
  'glas', 'gläser', 'tasse', 'tassen', 'würfel', 'kopf', 'köpfe', 'stange', 'stangen', 'zweig', 'zweige',
  'handvoll', 'tüte', 'tüten', 'flasche', 'flaschen', 'beutel', 'blatt', 'blätter', 'spritzer', 'schuss',
  'tropfen', 'knolle', 'knollen', 'netz', 'schale', 'schalen', 'rolle', 'rollen', 'dose(n)', 'zehe(n)',
  'scheibe(n)', 'stange(n)', 'zweig(e)', 'tasse(n)', 'packung(en)', 'flasche(n)',
  'etwas', 'n. b.', 'n.b.', 'evtl.', 'wenig', 'viel', 'einige', 'große', 'kleine', 'mittelgroße',
].sort((a, b) => b.length - a.length);

const VAGUE = new Set(['etwas', 'n. b.', 'n.b.', 'evtl.', 'wenig', 'viel', 'einige']);
const SIZES = new Set(['große', 'kleine', 'mittelgroße']);
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8,
  neun: 9, zehn: 10, zwölf: 12, halbe: 0.5, halben: 0.5, halbes: 0.5,
};

/** Liest eine führende Menge ("2", "1,5", "1/2", "1 ½", "2-3", "zwei") und gibt den Rest zurück. */
export function parseAmount(text: string): { amount: number | null; rest: string } {
  const m = text.match(/^\s*(\d+(?:[.,]\d+)?(?:\/\d+)?)?\s*([½¼¾⅓⅔⅛])?(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?/);
  if (m && (m[1] || m[2])) {
    let total = 0;
    if (m[1]) {
      const [num, den] = m[1].split('/');
      total = parseFloat(num.replace(',', '.'));
      if (den) total /= parseFloat(den);
    }
    if (m[2]) total += FRACTIONS[m[2]];
    if (m[3]) total = parseFloat(m[3].replace(',', '.')); // Spanne: oberen Wert nehmen
    return { amount: total, rest: text.slice(m[0].length) };
  }
  const word = text.match(/^\s*(\p{L}+)\s+/u);
  if (word && NUMBER_WORDS[word[1].toLowerCase()] !== undefined) {
    return { amount: NUMBER_WORDS[word[1].toLowerCase()], rest: text.slice(word[0].length) };
  }
  return { amount: null, rest: text };
}

/** "1 ½ EL Olivenöl (extra vergine)" → Menge, Einheit, Name, Notiz */
export function parseIngredient(line: string, group = ''): Ingredient | null {
  let text = line.replace(/\u00a0/g, ' ').trim().replace(/^[-•*–·]+\s*/, '');
  if (!text) return null;

  const parsed = parseAmount(text);
  let amount = parsed.amount;
  text = parsed.rest.trim();

  let unit = '';
  const lower = text.toLowerCase();
  for (const u of UNITS) {
    if (lower.startsWith(u) && (lower.length === u.length || lower[u.length] === ' ')) {
      unit = text.slice(0, u.length);
      text = text.slice(u.length).trim();
      break;
    }
  }
  if (VAGUE.has(unit.toLowerCase())) {
    amount = null;
    unit = unit.toLowerCase() === 'etwas' ? 'etwas' : '';
  }
  if (SIZES.has(unit.toLowerCase())) {
    text = `${unit} ${text}`;
    unit = '';
  }

  // Notiz in Klammern am Ende: "Tomaten (800 g)" – aber nicht "Zwiebel(n)"
  let note = '';
  const noteMatch = text.match(/^(.+?)\s*\(([^()]{3,})\)$/);
  if (noteMatch) {
    text = noteMatch[1].trim();
    note = noteMatch[2].trim();
  }
  if (!text) return null;
  return { id: uuid(), name: text, amount, unit, note, group };
}

/** "Brot, 2 Liter Milch und Eier" → einzelne Teile */
export function splitSpoken(text: string): string[] {
  return text
    .split(/\s*,\s*|\s+und\s+|\s+sowie\s+|\s+plus\s+/i)
    .map((s) => s.trim().replace(/^(noch|bitte)\s+/i, ''))
    .filter(Boolean);
}

/** "Zwiebel(n)" → "Zwiebeln" */
export function displayName(name: string): string {
  return name.replace('(n)', 'n').replace('(e)', 'e').replace('(s)', 's').replace('(en)', 'en').trim();
}

export function ingredientLine(ing: Ingredient): string {
  const parts = [formatAmountUnit(ing), ing.name].filter(Boolean);
  if (ing.note) parts.push(`(${ing.note})`);
  return parts.join(' ');
}

function formatAmountUnit(ing: Ingredient): string {
  if (ing.amount == null || ing.amount <= 0) return ing.unit;
  const v = ing.amount.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  return ing.unit ? `${v} ${ing.unit}` : v;
}

// ---------------------------------------------------------------------------
// Grundvorrat

export const DEFAULT_STAPLES = [
  'Salz', 'Pfeffer', 'Zucker', 'Mehl', 'Öl', 'Wasser', 'Essig', 'Paprikapulver', 'Muskat',
  'Muskatnuss', 'Zimt', 'Oregano', 'Currypulver', 'Chilipulver', 'Kreuzkümmel', 'Backpulver',
  'Natron', 'Speisestärke', 'Brühe', 'Fett', 'Lorbeerblatt', 'Lorbeerblätter', 'Vanillezucker',
  'Senf', 'Gewürze', 'Kräuter der Provence', 'Italienische Kräuter', 'Cayennepfeffer',
];

/** "Zwiebel(n), rote" → "zwiebel" */
function coreName(name: string): string {
  return name.toLowerCase().split(',')[0].replace(/\([^)]*\)/g, '').trim();
}

/**
 * Gehört die Zutat zum Grundvorrat? Versteht Komposita ("Olivenöl", "Gemüsebrühe"),
 * ohne "Zuckerschoten" oder "Essiggurken" fälschlich wegzulassen.
 */
export function isStaple(ingredientName: string, staples: string[]): boolean {
  const set = staples.map((s) => s.toLowerCase().trim()).filter(Boolean);
  const core = coreName(ingredientName);
  if (!core) return false;
  const parts = core.split(/\s+und\s+|\s+oder\s+|\/|&/).map((p) => p.trim()).filter(Boolean);
  return parts.every((part) => {
    const words = part.split(/\s+/);
    const first = words[0];
    const last = words[words.length - 1];
    return set.some((staple) => {
      if (part === staple || first === staple) return true; // "Fett für die Form"
      if (staple.includes(' ')) return part.startsWith(staple);
      return last.endsWith(staple);
    });
  });
}
