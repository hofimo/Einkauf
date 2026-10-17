import { SUPABASE_KEY, SUPABASE_URL } from '../config';
import { parseAmount, parseIngredient } from './parser';
import { now, uuid, type Ingredient, type Recipe } from './types';

/**
 * Chefkoch-Suche und Rezept-Import. Läuft über die Supabase Edge Function "chefkoch"
 * (backend/functions/chefkoch), weil Browser Chefkoch nicht direkt abfragen dürfen.
 */

export interface SearchResult {
  id: string;
  title: string;
  rating: number;
  votes: number;
  minutes: number;
  image: string | null;
  premium: boolean;
}

export type Draft = Omit<Recipe, 'id' | 'household_id' | 'created_at' | 'updated_at'>;

export function draftToRecipe(d: Draft, householdId: string): Recipe {
  return { ...d, id: uuid(), household_id: householdId, created_at: now(), updated_at: now() };
}

async function call(params: Record<string, string>): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const headers: Record<string, string> = { apikey: SUPABASE_KEY };
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/chefkoch?${new URLSearchParams(params)}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Fehler ${res.status}`);
  return body;
}

const image = (template: string | undefined, format: string) => (template ? template.replace('<format>', format) : null);

export async function searchChefkoch(query: string): Promise<SearchResult[]> {
  const data = await call({ action: 'search', q: query });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.results ?? []).map(({ recipe: r }: any) => ({
    id: r.id,
    title: r.title,
    rating: r.rating?.rating ?? 0,
    votes: r.rating?.numVotes ?? 0,
    minutes: r.preparationTime ?? 0,
    image: r.hasImage ? image(r.previewImageUrlTemplate, 'crop-360x240') : null,
    premium: Boolean(r.isPremium || r.isPlus),
  }));
}

export async function loadChefkoch(id: string): Promise<Draft> {
  const r = await call({ action: 'recipe', id });
  const ingredients: Ingredient[] = [];
  for (const g of r.ingredientGroups ?? []) {
    const group = String(g.header ?? '').replace(/[\s:]+$/, '').trim();
    for (const i of g.ingredients ?? []) {
      ingredients.push({
        id: uuid(),
        name: i.name,
        amount: i.amount > 0 ? i.amount : null,
        unit: i.unit ?? '',
        note: String(i.usageInfo ?? '').replace(/^[,;\s]+/, ''),
        group,
      });
    }
  }
  return {
    title: r.title,
    servings: Math.max(r.servings ?? 2, 1),
    ingredients,
    instructions: r.instructions ?? '',
    source_url: r.siteUrl ?? null,
    image_url: r.hasImage ? image(r.previewImageUrlTemplate, 'crop-960x640') : null,
    chefkoch_id: String(r.id),
  };
}

export function chefkochIdFromUrl(link: string): string | null {
  const m = link.match(/chefkoch\.de\/rezepte\/(\d+)/);
  return m ? m[1] : null;
}

const decode = (s: string) => {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value.trim();
};

/** Import über einen Link: Chefkoch direkt, sonst schema.org/Recipe (JSON-LD). */
export async function importFromLink(link: string): Promise<Draft> {
  const url = link.trim();
  const ckId = chefkochIdFromUrl(url);
  if (ckId) {
    try {
      return await loadChefkoch(ckId);
    } catch {
      // weiter mit JSON-LD
    }
  }
  const { recipe: r } = await call({ action: 'import', url });
  return draftFromJsonLd(r, url);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function draftFromJsonLd(r: any, url: string): Draft {
  const lines: string[] = r.recipeIngredient ?? r.ingredients ?? [];
  const ingredients = lines.map((l) => parseIngredient(decode(String(l)))).filter((x): x is Ingredient => x !== null);

  let servings = 2;
  const y = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
  if (y != null) {
    const n = parseAmount(String(y)).amount;
    if (n && n >= 1) servings = Math.round(n);
  }

  const steps: string[] = [];
  const collect = (x: unknown): void => {
    if (typeof x === 'string') steps.push(decode(x));
    else if (Array.isArray(x)) x.forEach(collect);
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (o.itemListElement) collect(o.itemListElement);
      else if (typeof o.text === 'string') steps.push(decode(o.text));
    }
  };
  collect(r.recipeInstructions);

  let img: string | null = null;
  const i = Array.isArray(r.image) ? r.image[0] : r.image;
  if (typeof i === 'string') img = i;
  else if (i && typeof i.url === 'string') img = i.url;

  return {
    title: decode(String(r.name ?? 'Rezept')),
    servings,
    ingredients,
    instructions: steps.join('\n\n'),
    source_url: url,
    image_url: img,
    chefkoch_id: null,
  };
}
