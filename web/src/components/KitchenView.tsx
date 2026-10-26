import { useEffect, useMemo, useState } from 'react';
import { conflictSummary } from '../lib/intolerance';
import { setKitchenDevice } from '../lib/pairing';
import { recipeConflicts, settingsOf, useStore } from '../lib/store';
import type { MealPlanEntry, Recipe } from '../lib/types';
import { CookMode } from './CookMode';
import { IngredientList } from './Recipes';
import { dayKey, startOfWeek } from './WeekPlan';
import { RecipeImage, useWakeLock } from './ui';

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Küchen-Ansicht für Echo Show (Silk-Browser) oder ein Tablet: links die Woche,
 * rechts das ausgewählte Gericht (standardmäßig heute) mit Kochmodus. Aktualisiert sich selbst.
 */
export function KitchenView({ onExit }: { onExit: () => void }) {
  const state = useStore();
  const settings = settingsOf(state);
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null); // Plan-Eintrag
  const [cooking, setCooking] = useState<{ recipe: Recipe; servings: number } | null>(null);
  const [showIngredients, setShowIngredients] = useState(false);
  useWakeLock();

  // Uhr und Tageswechsel
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(t);
  }, []);

  const today = dayKey(now);
  const days = useMemo(() => {
    const start = startOfWeek(now, settings.week_start);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [now, settings.week_start]);

  const entriesOn = (d: Date) =>
    state.meal_plan.filter((e) => e.day === dayKey(d)).sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Ausgewählt: angetippter Eintrag, sonst das nächste geplante Gericht ab heute
  const upcoming = state.meal_plan
    .filter((e) => e.day >= today)
    .sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at));
  const entry: MealPlanEntry | undefined = state.meal_plan.find((e) => e.id === selected) ?? upcoming[0];
  const recipe = entry ? state.recipes.find((r) => r.id === entry.recipe_id) : undefined;
  const conflicts = recipe ? recipeConflicts(state, recipe.ingredients) : [];
  const openItems = state.shopping_items.filter((i) => !i.checked).length;

  const dayLabel = (d: string) => {
    if (d === today) return 'Heute';
    if (d === dayKey(addDays(now, 1))) return 'Morgen';
    const date = new Date(`${d}T12:00`);
    return date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short' });
  };

  return (
    <div className="kitchen">
      <header className="kitchen-head">
        <div>
          <div className="kitchen-time">{now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="kitchen-date">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <div className="kitchen-chips">
          <span className="kitchen-chip">🛒 {openItems} {openItems === 1 ? 'Artikel' : 'Artikel'} auf der Liste</span>
          {settings.list_note && <span className="kitchen-chip note-chip">📝 {settings.list_note}</span>}
        </div>
      </header>

      <div className="kitchen-body">
        <section className="kitchen-week" aria-label="Wochenplan">
          {days.map((d) => {
            const key = dayKey(d);
            const entries = entriesOn(d);
            return (
              <div key={key} className={`kday ${key === today ? 'today' : ''} ${key < today ? 'past' : ''}`}>
                <div className="kday-name">
                  <strong>{d.toLocaleDateString('de-DE', { weekday: 'short' })}</strong>
                  <span>{d.getDate()}.</span>
                </div>
                <div className="kday-meals">
                  {entries.length === 0 && <span className="kday-empty">–</span>}
                  {entries.map((e) => {
                    const r = state.recipes.find((x) => x.id === e.recipe_id);
                    return (
                      <button key={e.id} className={`kmeal ${entry?.id === e.id ? 'on' : ''}`} onClick={() => { setSelected(e.id); setShowIngredients(false); }}>
                        <RecipeImage src={r?.image_url} className="kmeal-img" />
                        <span>{e.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        <section className="kitchen-focus">
          {!entry ? (
            <div className="empty">
              <div className="empty-icon">🍽️</div>
              <h3>Diese Woche ist noch nichts geplant</h3>
              <p>Plant Gerichte in der App – sie erscheinen hier automatisch.</p>
            </div>
          ) : (
            <>
              <div className="kfocus-label">{dayLabel(entry.day)}</div>
              <h1 className="kfocus-title">{entry.title}</h1>
              {recipe && <RecipeImage src={recipe.image_url} className="kfocus-img" />}
              {conflicts.length > 0 && <div className="banner conflict">⚠️ {conflictSummary(conflicts)}</div>}
              {recipe ? (
                <>
                  <div className="button-row kfocus-actions">
                    <button className="primary" onClick={() => setCooking({ recipe, servings: entry.servings })}>👩‍🍳 Kochmodus starten</button>
                    <button className="secondary" onClick={() => setShowIngredients(!showIngredients)}>
                      {showIngredients ? 'Zutaten ausblenden' : `🧺 Zutaten (${entry.servings} P.)`}
                    </button>
                  </div>
                  {showIngredients && (
                    <div className="card kfocus-ings">
                      <IngredientList ingredients={recipe.ingredients} scale={entry.servings / Math.max(recipe.servings, 1)} />
                    </div>
                  )}
                </>
              ) : (
                <p className="muted-text">Ohne Rezept geplant.</p>
              )}
            </>
          )}
        </section>
      </div>

      <button className="kitchen-exit" onClick={() => {
        if (!confirm('Küchen-Ansicht auf diesem Gerät beenden?')) return;
        setKitchenDevice(false);
        history.replaceState(null, '', location.hash.replace(/&kueche\b/, ''));
        onExit();
      }} aria-label="Küchen-Ansicht beenden">⚙️</button>

      {cooking && <CookMode recipe={cooking.recipe} servings={cooking.servings} onClose={() => setCooking(null)} />}
    </div>
  );
}
