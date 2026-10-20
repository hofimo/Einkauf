import type { Ingredient } from './types';

/**
 * Unverträglichkeiten und die Zutaten, die dabei typischerweise Probleme machen.
 * Bewusst eher vorsichtig – lieber ein Rezept zu viel aussortieren als eines zu wenig.
 * Ersetzt keine ärztliche Beratung; eigene Zutaten lassen sich in den Einstellungen ergänzen.
 */
export interface Intolerance {
  key: string;
  label: string;
  emoji: string;
  /** Wortteile, die in Zutatennamen gesucht werden (klein geschrieben) */
  words: string[];
  /** Ausnahmen, z. B. "laktosefrei" */
  except?: string[];
}

export const INTOLERANCES: Intolerance[] = [
  {
    key: 'fructose', label: 'Fructose', emoji: '🍎',
    words: [
      'apfel', 'äpfel', 'birne', 'mango', 'traube', 'rosine', 'dattel', 'feige', 'trockenobst', 'trockenfrücht',
      'honig', 'agave', 'ahornsirup', 'fruchtsaft', 'apfelsaft', 'orangensaft', 'birnendicksaft', 'fruktose', 'fructose',
      'fruchtzucker', 'sorbit', 'kirsche', 'pflaume', 'zwetschge', 'wassermelone', 'kaki', 'papaya', 'aprikose',
      'pfirsich', 'nektarine', 'ketchup', 'chutney', 'marmelade', 'konfitüre', 'gelee', 'süßwein', 'portwein',
      'cranberr', 'preiselbeer',
    ],
    except: ['mangold', 'erdapfel'],
  },
  {
    key: 'lactose', label: 'Laktose', emoji: '🥛',
    words: [
      'milch', 'sahne', 'joghurt', 'jogurt', 'quark', 'frischkäse', 'schmand', 'crème fraîche', 'creme fraiche',
      'mascarpone', 'ricotta', 'buttermilch', 'kondensmilch', 'molke', 'pudding', 'rahm', 'schmelzkäse', 'hüttenkäse',
      'mozzarella', 'feta', 'butter', 'kefir', 'skyr',
    ],
    except: ['laktosefrei', 'lactosefrei', 'kokosmilch', 'hafermilch', 'mandelmilch', 'sojamilch', 'erdnussbutter', 'kokossahne', 'butternut'],
  },
  {
    key: 'gluten', label: 'Gluten', emoji: '🌾',
    words: [
      'weizen', 'mehl', 'dinkel', 'roggen', 'gerste', 'grünkern', 'nudel', 'spaghetti', 'penne', 'tagliatelle',
      'fusilli', 'lasagne', 'pasta', 'gnocchi', 'brot', 'brötchen', 'baguette', 'toast', 'paniermehl', 'semmelbrösel',
      'couscous', 'bulgur', 'grieß', 'blätterteig', 'pizzateig', 'tortilla', 'wrap', 'sojasauce', 'sojasoße', 'bier',
      'seitan', 'graupen', 'zwieback', 'knödel', 'spätzle', 'maultasche',
    ],
    except: ['glutenfrei', 'reismehl', 'maismehl', 'mandelmehl', 'kokosmehl', 'buchweizen', 'reisnudel', 'glasnudel', 'maistortilla', 'kartoffelmehl', 'johannisbrotkernmehl'],
  },
];

export interface Conflict {
  ingredient: string;
  reason: string;
}

/** Findet problematische Zutaten. `custom` sind eigene Wörter wie "Zwiebel". */
export function findConflicts(ingredients: Ingredient[], keys: string[], custom: string[] = []): Conflict[] {
  const active = INTOLERANCES.filter((i) => keys.includes(i.key));
  const own = custom.map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2);
  const out: Conflict[] = [];
  for (const ing of ingredients) {
    const name = `${ing.name} ${ing.note}`.toLowerCase();
    for (const intol of active) {
      if (intol.except?.some((e) => name.includes(e))) continue;
      if (intol.words.some((w) => name.includes(w))) {
        out.push({ ingredient: ing.name, reason: intol.label });
        break;
      }
    }
    if (!out.some((c) => c.ingredient === ing.name)) {
      const word = own.find((w) => name.includes(w));
      if (word) out.push({ ingredient: ing.name, reason: word.charAt(0).toUpperCase() + word.slice(1) });
    }
  }
  return out;
}

/** "Fructose: Apfel, Honig · Laktose: Sahne" */
export function conflictSummary(conflicts: Conflict[]): string {
  const byReason = new Map<string, string[]>();
  for (const c of conflicts) byReason.set(c.reason, [...(byReason.get(c.reason) ?? []), c.ingredient.split(',')[0]]);
  return [...byReason].map(([reason, names]) => `${reason}: ${[...new Set(names)].join(', ')}`).join(' · ');
}
