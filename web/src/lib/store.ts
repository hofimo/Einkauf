import { useSyncExternalStore } from 'react';
import { Api, ApiError } from './api';
import { categoryFor, CATEGORIES, itemCategory } from './catalog';
import { DEFAULT_STAPLES, displayName, isStaple, parseIngredient, splitSpoken } from './parser';
import { combineQuantities, formatQuantity } from './quantity';
import { now, uuid, type Ingredient, type MealPlanEntry, type Recipe, type ShoppingItem, type Settings, type Staple, type Table, type Tables } from './types';

/** Eine noch nicht zum Server übertragene Änderung (Offline-Warteschlange). */
interface PendingOp {
  id: string;
  table: Table;
  kind: 'upsert' | 'delete';
  recordId: string;
  row?: object;
}

export type SyncState =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'ok' }
  | { kind: 'offline'; message: string }
  | { kind: 'error'; message: string };

export interface State {
  householdId: string | null;
  shopping_items: ShoppingItem[];
  recipes: Recipe[];
  meal_plan: MealPlanEntry[];
  staples: Staple[];
  settings: Settings[];
  outbox: PendingOp[];
  sync: SyncState;
  lastSync: string | null;
}

const STORAGE_KEY = 'einkauf-state-v1';

const empty = (householdId: string | null): State => ({
  householdId,
  shopping_items: [],
  recipes: [],
  meal_plan: [],
  staples: [],
  settings: [],
  outbox: [],
  sync: { kind: 'idle' },
  lastSync: null,
});

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...empty(null), ...JSON.parse(raw), sync: { kind: 'idle' } };
  } catch {
    // Speicher nicht verfügbar → leer starten
  }
  return empty(null);
}

const normalized = (s: string) => s.trim().toLowerCase();

/**
 * Zentrale Datenhaltung: Änderungen gelten sofort lokal (auch offline) und werden
 * über eine Warteschlange an Supabase geschickt. Alle 5 Sekunden wird der Serverstand geholt.
 */
class Store {
  private state: State = load();
  private listeners = new Set<() => void>();
  private syncing = false;
  private resync = false;
  private lastFullSync = 0;
  private timer: number | undefined;

  getState = (): State => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    try {
      const { sync: _sync, ...persist } = this.state;
      void _sync;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
    } catch {
      // z. B. privater Modus – dann eben nur im Speicher
    }
    this.listeners.forEach((l) => l());
  }

  private get api(): Api | null {
    return this.state.householdId && Api.available ? new Api(this.state.householdId) : null;
  }

  // ---------------------------------------------------------------- Haushalt

  createHousehold() {
    this.state = empty(uuid());
    this.set({});
    DEFAULT_STAPLES.forEach((s) => this.addStaple(s));
    this.startPolling();
  }

  joinHousehold(id: string) {
    this.state = empty(id.toLowerCase());
    this.set({});
    this.lastFullSync = 0;
    this.startPolling();
  }

  leaveHousehold() {
    this.stopPolling();
    this.state = empty(null);
    this.set({});
  }

  // ---------------------------------------------------------------- Einkaufsliste

  /** Fügt einen Artikel hinzu; vorhandene werden zusammengefasst bzw. wieder aktiviert. */
  addItem(rawName: string, quantity = '', source = '') {
    const hid = this.state.householdId;
    const name = rawName.trim();
    if (!hid || !name) return;
    const key = normalized(name);
    const items = this.state.shopping_items;

    const open = items.find((i) => !i.checked && normalized(i.name) === key);
    if (open) {
      const sources = open.source ? open.source.split(', ') : [];
      if (source && !sources.includes(source)) sources.push(source);
      this.save('shopping_items', { ...open, quantity: combineQuantities(open.quantity, quantity), source: sources.join(', ') });
      return;
    }
    const done = items.find((i) => i.checked && normalized(i.name) === key);
    if (done) {
      this.save('shopping_items', { ...done, checked: false, checked_at: null, quantity, note: '', source, created_at: now() });
      return;
    }
    this.save('shopping_items', {
      id: uuid(),
      household_id: hid,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      quantity,
      note: '',
      category: categoryFor(name),
      checked: false,
      checked_at: null,
      source,
      created_at: now(),
      updated_at: now(),
    });
  }

  /** "Brot, 2 Liter Milch und Eier" → drei Artikel */
  addText(text: string, source = '') {
    for (const piece of splitSpoken(text)) {
      const ing = parseIngredient(piece);
      if (ing) this.addItem(ing.name, formatQuantity(ing.amount, ing.unit), source);
    }
  }

  toggle(item: ShoppingItem) {
    const checked = !item.checked;
    this.save('shopping_items', {
      ...item,
      checked,
      checked_at: checked ? now() : null,
      created_at: checked ? item.created_at : now(),
    });
  }

  updateItem(item: ShoppingItem) {
    this.save('shopping_items', item);
  }

  deleteItem(item: ShoppingItem) {
    this.remove('shopping_items', item.id);
  }

  clearChecked() {
    this.state.shopping_items.filter((i) => i.checked).forEach((i) => this.remove('shopping_items', i.id));
  }

  // ---------------------------------------------------------------- Rezepte & Plan

  saveRecipe(recipe: Recipe) {
    this.save('recipes', recipe);
  }

  deleteRecipe(recipe: Recipe) {
    this.state.meal_plan
      .filter((e) => e.recipe_id === recipe.id)
      .forEach((e) => this.save('meal_plan', { ...e, recipe_id: null }));
    this.remove('recipes', recipe.id);
  }

  addPlanEntry(day: string, title: string, recipe: Recipe | null, servings: number) {
    const hid = this.state.householdId;
    if (!hid) return;
    this.save('meal_plan', {
      id: uuid(), household_id: hid, day, recipe_id: recipe?.id ?? null, title, servings,
      created_at: now(), updated_at: now(),
    });
  }

  removePlanEntry(entry: MealPlanEntry) {
    this.remove('meal_plan', entry.id);
  }

  /** Zutaten skaliert auf die Einkaufsliste übernehmen. */
  addIngredients(ingredients: Ingredient[], scale: number, source: string) {
    for (const ing of ingredients) {
      this.addItem(displayName(ing.name), formatQuantity(ing.amount == null ? null : ing.amount * scale, ing.unit, true), source);
    }
  }

  // ---------------------------------------------------------------- Grundvorrat

  isStaple = (ing: Ingredient): boolean => isStaple(ing.name, this.state.staples.map((s) => s.name));

  addStaple(name: string) {
    const hid = this.state.householdId;
    const n = name.trim();
    if (!hid || !n || this.state.staples.some((s) => normalized(s.name) === normalized(n))) return;
    this.save('staples', { id: uuid(), household_id: hid, name: n, created_at: now(), updated_at: now() });
  }

  removeStaple(staple: Staple) {
    this.remove('staples', staple.id);
  }

  // ---------------------------------------------------------------- Einstellungen

  updateSettings(patch: Partial<Pick<Settings, 'week_start' | 'category_order'>>) {
    const hid = this.state.householdId;
    if (!hid) return;
    this.save('settings', { ...settingsOf(this.state), ...patch });
  }

  // ---------------------------------------------------------------- Lokale Änderungen

  private save<T extends Table>(table: T, record: Tables[T]) {
    const row = { ...record, updated_at: now() } as Tables[T];
    const list = this.state[table] as Tables[T][];
    const exists = list.some((r) => r.id === row.id);
    const next = exists ? list.map((r) => (r.id === row.id ? row : r)) : [...list, row];
    this.enqueue({ id: uuid(), table, kind: 'upsert', recordId: row.id, row }, { [table]: next } as Partial<State>);
  }

  private remove(table: Table, id: string) {
    const list = this.state[table] as { id: string }[];
    this.enqueue({ id: uuid(), table, kind: 'delete', recordId: id }, { [table]: list.filter((r) => r.id !== id) } as Partial<State>);
  }

  private enqueue(op: PendingOp, patch: Partial<State>) {
    // Ältere, noch nicht gesendete Änderungen desselben Datensatzes sind überholt.
    const outbox = this.state.outbox.filter((o) => !(o.recordId === op.recordId && o.table === op.table));
    this.set({ ...patch, outbox: [...outbox, op] });
    void this.syncNow();
  }

  // ---------------------------------------------------------------- Synchronisation

  startPolling() {
    if (this.timer !== undefined) return;
    void this.syncNow(true);
    this.timer = window.setInterval(() => void this.syncNow(), 5000);
  }

  stopPolling() {
    window.clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Warteschlange senden, dann Liste laden; Rezepte/Plan/Vorrat höchstens alle 30 s. */
  async syncNow(full = false): Promise<void> {
    const api = this.api;
    if (!api) return;
    if (this.syncing) {
      this.resync = true;
      if (full) this.lastFullSync = 0;
      return;
    }
    this.syncing = true;
    try {
      do {
        this.resync = false;
        if (this.state.sync.kind !== 'ok') this.set({ sync: { kind: 'syncing' } });
        try {
          await this.flush(api);
          const patch: Partial<State> = { shopping_items: this.merged('shopping_items', await api.fetchAll('shopping_items')) };
          if (full || Date.now() - this.lastFullSync > 30_000) {
            patch.recipes = this.merged('recipes', await api.fetchAll('recipes'));
            patch.meal_plan = this.merged('meal_plan', await api.fetchAll('meal_plan'));
            patch.staples = this.merged('staples', await api.fetchAll('staples'));
            // Fehlt die Tabelle noch (schema.sql nicht erneut ausgeführt), läuft der Rest trotzdem
            patch.settings = this.merged('settings', await api.fetchAll('settings').catch(() => this.state.settings));
            this.lastFullSync = Date.now();
          }
          // Haushalt gewechselt, während wir geladen haben? Dann verwerfen.
          if (api.householdId !== this.state.householdId) return;
          // Während des Ladens entstandene lokale Änderungen erneut darüberlegen
          for (const t of ['shopping_items', 'recipes', 'meal_plan', 'staples', 'settings'] as const) {
            if (patch[t]) (patch as Record<string, unknown>)[t] = this.merged(t, patch[t] as Tables[typeof t][]);
          }
          this.set({ ...patch, sync: { kind: 'ok' }, lastSync: now() });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          this.set({ sync: e instanceof ApiError && e.permanent ? { kind: 'error', message } : { kind: 'offline', message } });
        }
        full = false;
      } while (this.resync);
    } finally {
      this.syncing = false;
    }
  }

  private async flush(api: Api) {
    for (;;) {
      const op = this.state.outbox[0];
      if (!op || api.householdId !== this.state.householdId) return;
      try {
        if (op.kind === 'upsert') await api.upsert(op.table, op.row!);
        else await api.delete(op.table, op.recordId);
      } catch (e) {
        if (e instanceof ApiError && e.permanent) {
          // Vom Server abgelehnt → verwerfen, damit die Warteschlange nicht hängt
          this.set({ outbox: this.state.outbox.filter((o) => o.id !== op.id) });
        }
        throw e;
      }
      this.set({ outbox: this.state.outbox.filter((o) => o.id !== op.id) });
    }
  }

  /** Serverstand plus noch nicht gesendete lokale Änderungen. */
  private merged<T extends Table>(table: T, remote: Tables[T][]): Tables[T][] {
    let result = [...remote];
    for (const op of this.state.outbox) {
      if (op.table !== table) continue;
      if (op.kind === 'delete') result = result.filter((r) => r.id !== op.recordId);
      else {
        const row = op.row as Tables[T];
        const i = result.findIndex((r) => r.id === row.id);
        if (i >= 0) result[i] = row;
        else result.push(row);
      }
    }
    return result;
  }
}

export const store = new Store();

export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.getState);
}

// ---------------------------------------------------------------- Abgeleitete Daten

/** Einstellungen des Haushalts (mit Standardwerten, solange noch nichts gespeichert ist). */
export function settingsOf(state: State): Settings {
  const hid = state.householdId ?? '';
  return state.settings.find((s) => s.household_id === hid) ?? {
    id: hid, household_id: hid, week_start: 1, category_order: [], created_at: now(), updated_at: now(),
  };
}

type CategoryInfo = (typeof CATEGORIES)[number];

/** Abteilungen in der gewählten Laufreihenfolge; neue/unbekannte hinten an. */
export function orderedCategories(order: string[]): CategoryInfo[] {
  const rank = (c: CategoryInfo) => {
    const i = order.indexOf(c.name);
    return i >= 0 ? i : order.length + CATEGORIES.indexOf(c);
  };
  return [...CATEGORIES].sort((a, b) => rank(a) - rank(b));
}

export function openByCategory(items: ShoppingItem[], order: string[] = []): { category: CategoryInfo; items: ShoppingItem[] }[] {
  const open = items.filter((i) => !i.checked);
  return orderedCategories(order).map((category) => ({
    category,
    items: open.filter((i) => itemCategory(i) === category.name).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  })).filter((g) => g.items.length > 0);
}

export function checkedItems(items: ShoppingItem[]): ShoppingItem[] {
  return items.filter((i) => i.checked).sort((a, b) => (b.checked_at ?? '').localeCompare(a.checked_at ?? ''));
}
