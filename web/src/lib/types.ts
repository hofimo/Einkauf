// Feldnamen entsprechen 1:1 den Spalten in Supabase (backend/schema.sql).

export interface ShoppingItem {
  id: string;
  household_id: string;
  name: string;
  quantity: string;
  note: string;
  category: string;
  checked: boolean;
  checked_at: string | null;
  /** Woher der Eintrag stammt, z. B. "Lasagne", "Siri" oder "Alexa". */
  source: string;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  id: string;
  name: string;
  /** null = ohne Mengenangabe ("Salz", "etwas Rotwein") */
  amount: number | null;
  unit: string;
  note: string;
  group: string;
}

export interface Recipe {
  id: string;
  household_id: string;
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: string;
  source_url: string | null;
  image_url: string | null;
  chefkoch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MealPlanEntry {
  id: string;
  household_id: string;
  /** yyyy-MM-dd */
  day: string;
  recipe_id: string | null;
  title: string;
  servings: number;
  created_at: string;
  updated_at: string;
}

export interface Staple {
  id: string;
  household_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  /** = household_id, damit es genau eine Zeile pro Haushalt gibt */
  id: string;
  household_id: string;
  /** Erster Tag im Wochenplan: 0 = Sonntag, 1 = Montag … 6 = Samstag */
  week_start: number;
  /** Abteilungen in Laufreihenfolge des eigenen Supermarkts */
  category_order: string[];
  created_at: string;
  updated_at: string;
}

export type Table = 'shopping_items' | 'recipes' | 'meal_plan' | 'staples' | 'settings';

export interface Tables {
  shopping_items: ShoppingItem;
  recipes: Recipe;
  meal_plan: MealPlanEntry;
  staples: Staple;
  settings: Settings;
}

export const uuid = (): string => crypto.randomUUID();
export const now = (): string => new Date().toISOString();
