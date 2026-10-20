import { loadChefkoch, searchChefkoch, type SearchResult } from './recipes';
import type { Ingredient } from './types';
import type { MatchDish, Recipe } from './types';

export type DeckInput = Pick<MatchDish, 'source' | 'ref_id' | 'title' | 'image_url' | 'info'>;

export interface Theme {
  key: string;
  label: string;
  queries: string[];
  /** Titel, die zum Thema nicht passen (z. B. Fleisch bei vegetarisch) */
  exclude?: RegExp;
}

const MEAT = /fleisch|hähnchen|hühnchen|huhn|pute|hack|wurst|würstchen|speck|schinken|rind|schwein|kalb|lamm|lachs|thunfisch|fisch|garnele|shrimp|bacon|salami|chorizo|gyros|steak|schnitzel|filet|kassler|leber|ente|gans/i;

export const THEMES: Theme[] = [
  { key: 'mix', label: '🎲 Überrasch mich', queries: ['Pasta', 'Curry', 'Auflauf', 'Suppe', 'Pfanne', 'Bowl', 'Eintopf', 'Risotto', 'Wraps', 'Gnocchi', 'Quiche', 'Burger'] },
  { key: 'quick', label: '⚡ Schnell', queries: ['schnell', 'schnelles Abendessen', 'Blitzrezept', 'schnell einfach', '20 Minuten'] },
  {
    key: 'veggie', label: '🥦 Vegetarisch', exclude: MEAT,
    queries: ['vegetarisch', 'vegetarische Pfanne', 'vegetarisches Curry', 'vegetarischer Auflauf', 'vegetarische Pasta', 'Linsen vegetarisch'],
  },
  { key: 'hearty', label: '🍖 Deftig', queries: ['deftig', 'Schnitzel', 'Gulasch', 'Braten', 'Hausmannskost', 'Rouladen'] },
  { key: 'light', label: '🥗 Leicht', queries: ['leicht', 'Salat Hauptgericht', 'low carb', 'Gemüse leicht', 'Fisch'] },
  { key: 'asian', label: '🥢 Asiatisch', queries: ['asiatisch', 'Thai Curry', 'gebratene Nudeln', 'Wok', 'Bowl asiatisch'] },
];

const DECK_SIZE = 20;
const MAX_SAME_START = 3;

// Keine Kuchen, Desserts, Getränke oder Aufstriche im Abendessen-Stapel
export const NOT_A_MEAL = /(?<!pfann|pfanne)kuchen|torte|cake|muffin|cookie|keks|plätzchen|dessert|pudding|mousse|tiramisu|waffel|smoothie|shake|likör|cocktail|marmelade|konfitüre|aufstrich|\bdip\b|brötchen|creme\s*$|\beis\b|eiscreme|pralinen|tarte au|traum\b|parfait|crumble|trifle|quarkspeise|grütze|kompott|sorbet|panna cotta|marinade|dressing|vinaigrette|gewürzmischung|gewürzsalz/i;

const firstWord = (title: string) => title.toLowerCase().split(/[\s-]+/)[0];

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fromChefkoch(r: SearchResult): DeckInput {
  const info = [r.minutes ? `${r.minutes} Min.` : '', r.votes ? `★ ${r.rating.toFixed(1).replace('.', ',')}` : ''].filter(Boolean).join(' · ');
  return {
    source: 'chefkoch',
    ref_id: r.id,
    title: r.title,
    image_url: r.image ? r.image.replace('crop-360x240', 'crop-960x640') : null,
    info,
  };
}

export interface DeckOptions {
  /** true = Rezept passt (z. B. keine Zutat, die jemand nicht verträgt). Lädt dafür die Zutaten. */
  accept?: (ingredients: Ingredient[]) => boolean;
  onProgress?: (found: number, wanted: number) => void;
}

/**
 * Stellt einen Stapel mit neuen Ideen zusammen: gut bewertete Chefkoch-Rezepte zum Thema,
 * die noch nicht in euren Rezepten sind (und, falls angegeben, zu den Unverträglichkeiten passen).
 */
export async function buildDeck(theme: Theme, recipes: Recipe[], options: DeckOptions = {}): Promise<DeckInput[]> {
  const ownChefkoch = new Set(recipes.map((r) => r.chefkoch_id).filter(Boolean));
  const ownTitles = new Set(recipes.map((r) => r.title.trim().toLowerCase()));

  const wanted = DECK_SIZE;
  const seen = new Set<string>();
  const found: SearchResult[] = [];
  const fits = (r: SearchResult) =>
    !seen.has(r.id) && !ownChefkoch.has(r.id) && !ownTitles.has(r.title.trim().toLowerCase()) && !r.premium && Boolean(r.image) && r.votes >= 5 && r.rating >= 3.8
    && !NOT_A_MEAL.test(r.title) && !theme.exclude?.test(r.title);
  const starts = new Map<string, number>();

  // Mehrere Suchbegriffe, je höchstens 7 Treffer – sonst besteht der Stapel nur aus Nudeln.
  // Zufällige Seite für Abwechslung; ist sie (fast) leer, Seite 1 nehmen.
  const search = async (q: string) => {
    let results = await searchChefkoch(q, [0, 30, 60][Math.floor(Math.random() * 3)]).catch(() => [] as SearchResult[]);
    if (results.filter(fits).length < 5) results = await searchChefkoch(q, 0).catch(() => [] as SearchResult[]);
    return shuffle(results.filter(fits)).slice(0, 7);
  };
  const extra = THEMES[0].queries.filter((q) => !theme.queries.includes(q));
  const queries = [...shuffle(theme.queries), ...shuffle(extra)];
  const allowed = (r: SearchResult) => fits(r) && (starts.get(firstWord(r.title)) ?? 0) < MAX_SAME_START;
  const take = (r: SearchResult) => {
    seen.add(r.id);
    starts.set(firstWord(r.title), (starts.get(firstWord(r.title)) ?? 0) + 1);
    found.push(r);
    options.onProgress?.(found.length, wanted);
  };

  for (let i = 0; i < queries.length && found.length < wanted; i += 3) {
    const batches = await Promise.all(queries.slice(i, i + 3).map(search));
    const candidates = batches.flat();
    if (!options.accept) {
      for (const r of candidates) if (found.length < wanted && allowed(r)) take(r);
      continue;
    }
    // Zutaten prüfen: jeweils 6 Rezepte gleichzeitig laden
    for (let j = 0; j < candidates.length && found.length < wanted; j += 6) {
      const chunk = candidates.slice(j, j + 6).filter(allowed);
      const checked = await Promise.all(chunk.map(async (r) => {
        try {
          const draft = await loadChefkoch(r.id);
          return options.accept!(draft.ingredients) ? r : null;
        } catch {
          return null; // nicht prüfbar → lieber weglassen
        }
      }));
      checked.forEach((r, k) => {
        if (r && found.length < wanted && allowed(r)) take(r);
        else if (!r) seen.add(chunk[k].id); // passt nicht – nicht nochmal prüfen
      });
    }
  }
  if (found.length === 0) throw new Error('Keine Gerichte gefunden – bitte nochmal versuchen.');
  return shuffle(found.map(fromChefkoch));
}
