import { parseAmount } from './parser';

const UNIT_FACTORS: Record<string, [string, number]> = {
  g: ['g', 1], gr: ['g', 1], gramm: ['g', 1], kg: ['g', 1000], kilo: ['g', 1000], kilogramm: ['g', 1000],
  ml: ['ml', 1], milliliter: ['ml', 1], cl: ['ml', 10], dl: ['ml', 100], l: ['ml', 1000], liter: ['ml', 1000],
  '': ['', 1],
};

// Zählbares (Zwiebeln, Dosen, Zehen) wird für den Einkauf aufgerundet.
const COUNTABLE = new Set([
  '', 'stück', 'stk.', 'stk', 'dose', 'dosen', 'becher', 'bund', 'pck.', 'pck', 'päckchen', 'packung', 'glas',
  'zehe', 'zehen', 'zehe(n)', 'dose(n)', 'kopf', 'knolle', 'flasche', 'beutel', 'netz', 'stange', 'stangen',
  'scheibe', 'scheiben', 'zweig', 'zweige', 'würfel', 'tüte', 'rolle',
]);

function roundAmount(value: number, unit: string, countableUp: boolean): number {
  const lower = unit.toLowerCase().replace(/\/(n|en|e|s)$/, ''); // Chefkoch: "Zehe/n"
  if ((lower === 'g' || lower === 'ml') && value > 50) return Math.round(value / 5) * 5;
  if (countableUp && COUNTABLE.has(lower)) return Math.ceil(value - 1e-9);
  if (['kg', 'l', 'liter'].includes(lower)) return Math.round(value * 20) / 20;
  if (value >= 10) return Math.round(value);
  return Math.round(value * 4) / 4;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/** "500 g", "2 EL", "etwas", "" */
export function formatQuantity(amount: number | null, unit: string, forShopping = false): string {
  if (amount == null || amount <= 0) return unit;
  const value = formatNumber(roundAmount(amount, unit, forShopping));
  return unit ? `${value} ${unit}` : value;
}

function parseQuantity(text: string): { amount: number; unit: string } | null {
  const t = text.trim();
  if (!t) return null;
  const { amount, rest } = parseAmount(t);
  if (amount == null) return null;
  return { amount, unit: rest.trim() };
}

/** "500 g" + "250 g" = "750 g", "1 l" + "200 ml" = "1,2 l", sonst "1 Dose + 200 g". */
export function combineQuantities(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const qa = parseQuantity(a);
  const qb = parseQuantity(b);
  if (qa && qb) {
    const ua = UNIT_FACTORS[qa.unit.toLowerCase().replace(/\.$/, '')];
    const ub = UNIT_FACTORS[qb.unit.toLowerCase().replace(/\.$/, '')];
    if (ua && ub && ua[0] === ub[0]) {
      let total = qa.amount * ua[1] + qb.amount * ub[1];
      let unit = ua[0];
      if (unit === 'g' && total >= 1000) { total /= 1000; unit = 'kg'; }
      if (unit === 'ml' && total >= 1000) { total /= 1000; unit = 'l'; }
      return formatQuantity(total, unit);
    }
    if (qa.unit.toLowerCase() === qb.unit.toLowerCase()) return formatQuantity(qa.amount + qb.amount, qa.unit);
  }
  return `${a} + ${b}`;
}
