import type { Ingredient } from './types';

/** Teilt den Zubereitungstext in Schritte (Absätze, Nummerierung oder Satzgruppen). */
export function splitSteps(instructions: string): string[] {
  const text = instructions.replace(/\r/g, '').trim();
  if (!text) return [];
  let parts = text
    .split(/\n\s*\n|\n(?=\s*(?:\d+[.)]|Schritt \d+)\s)/)
    .map((p) => p.replace(/^\s*(?:\d+[.)]|Schritt \d+:?)\s*/, '').replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);

  // Ein langer Block ohne Absätze → in Gruppen von Sätzen aufteilen
  if (parts.length === 1 && parts[0].length > 320) {
    const sentences = parts[0].match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [parts[0]];
    parts = [];
    let current = '';
    for (const s of sentences.map((x) => x.trim())) {
      if (current && (current + ' ' + s).length > 240) {
        parts.push(current);
        current = s;
      } else {
        current = current ? `${current} ${s}` : s;
      }
    }
    if (current) parts.push(current);
  }
  return parts;
}

export interface TimerHint {
  label: string;
  seconds: number;
}

const UNIT_SECONDS: [RegExp, number][] = [
  [/^(stunden?|std\.?)$/i, 3600],
  [/^(minuten?|min\.?)$/i, 60],
  [/^(sekunden?|sek\.?)$/i, 1],
];

/** Findet Zeitangaben wie "20 Minuten", "10-15 Min." oder "1,5 Stunden" (bei Spannen der obere Wert). */
export function findTimers(step: string): TimerHint[] {
  const re = /(\d+(?:[,.]\d+)?|½)(?:\s*(?:-|–|bis)\s*(\d+(?:[,.]\d+)?))?\s*(Stunden|Stunde|Std\.?|Minuten|Minute|Min\.?|Sekunden|Sekunde|Sek\.?)(?![\p{L}])/giu;
  const out: TimerHint[] = [];
  for (const m of step.matchAll(re)) {
    const value = parseFloat((m[2] ?? m[1]).replace('½', '0.5').replace(',', '.'));
    const factor = UNIT_SECONDS.find(([r]) => r.test(m[3]))?.[1] ?? 60;
    const seconds = Math.round(value * factor);
    if (seconds > 0 && !out.some((t) => t.seconds === seconds)) out.push({ label: m[0].trim(), seconds });
  }
  return out;
}

/** Wortstamm einer Zutat zum Wiederfinden im Text: "Zwiebel(n)" → "zwiebel", "Möhren" → "möhre". */
function stem(name: string): string {
  const core = name.toLowerCase().split(',')[0].replace(/\([^)]*\)/g, '').trim();
  const words = core.split(/\s+/).filter((w) => w.length >= 3);
  const word = words[words.length - 1] ?? core; // Hauptwort steht im Deutschen meist am Ende
  return word.replace(/(en|n|e|s)$/, '').slice(0, Math.max(4, word.length - 2));
}

/** Zutaten, die im Schritt erwähnt werden. */
export function ingredientsInStep(step: string, ingredients: Ingredient[]): Ingredient[] {
  const text = step.toLowerCase();
  return ingredients.filter((ing) => {
    const s = stem(ing.name);
    return s.length >= 3 && text.includes(s);
  });
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
