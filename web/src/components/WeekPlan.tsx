import { useEffect, useMemo, useRef, useState } from 'react';
import { displayName } from '../lib/parser';
import { formatQuantity } from '../lib/quantity';
import { recipeConflicts, settingsOf, store, useStore } from '../lib/store';
import { ConflictBanner } from './Recipes';
import type { MealPlanEntry, Recipe } from '../lib/types';
import { RecipeImage, Sheet, Stepper, TopBar } from './ui';

// ---------------------------------------------------------------- Datumshilfen

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Beginn der Planwoche, die `d` enthält. firstDay: 0 = Sonntag, 1 = Montag … 6 = Samstag */
export function startOfWeek(d: Date, firstDay: number): Date {
  return addDays(d, -((d.getDay() - firstDay + 7) % 7));
}

/** "17.–23. Okt." bzw. "30. Okt. – 5. Nov." */
function rangeTitle(start: Date): string {
  const end = addDays(start, 6);
  const month = (d: Date) => d.toLocaleDateString('de-DE', { month: 'short' });
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}.–${end.getDate()}. ${month(end)}`
    : `${start.getDate()}. ${month(start)} – ${end.getDate()}. ${month(end)}`;
}

const weekday = (d: Date) => d.toLocaleDateString('de-DE', { weekday: 'long' });
const shortDate = (d: Date) => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

// ---------------------------------------------------------------- Wochenansicht

export function WeekPlan({ onOpenRecipe }: { onOpenRecipe: (id: string) => void }) {
  const state = useStore();
  const { meal_plan, recipes } = state;
  const firstDay = settingsOf(state).week_start;
  // Wochen relativ zur aktuellen; so passt sich die Ansicht an, wenn der Starttag geändert wird
  const [offset, setOffset] = useState(0);
  const [pickDay, setPickDay] = useState<Date | null>(null);
  const today = dayKey(new Date());
  const thisWeek = offset === 0;
  const weekStart = useMemo(() => addDays(startOfWeek(new Date(), firstDay), offset * 7), [firstDay, offset]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const drag = useMealDrag((delta) => setOffset((o) => o + delta));

  // In der aktuellen Woche direkt zu heute springen
  useEffect(() => {
    if (thisWeek) document.getElementById(`day-${today}`)?.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }, [thisWeek, today]);

  return (
    <>
      <TopBar
        title={thisWeek ? `Diese Woche · ${rangeTitle(weekStart)}` : rangeTitle(weekStart)}
        left={<button className={`icon-btn ${drag.overWeek === -1 ? 'drop-on' : ''}`} data-drop-week="-1" aria-label="Vorige Woche" onClick={() => setOffset(offset - 1)}>‹</button>}
        right={<button className={`icon-btn ${drag.overWeek === 1 ? 'drop-on' : ''}`} data-drop-week="1" aria-label="Nächste Woche" onClick={() => setOffset(offset + 1)}>›</button>}
      />
      <main className="content">
        {!thisWeek && (
          <button className="link center" onClick={() => setOffset(0)}>Zur aktuellen Woche</button>
        )}
        {days.map((day) => {
          const key = dayKey(day);
          const entries = meal_plan.filter((e) => e.day === key).sort((a, b) => a.created_at.localeCompare(b.created_at));
          return (
            <section key={key} id={`day-${key}`} data-drop-day={key}
              className={`day ${drag.overDay === key && drag.entry?.day !== key ? 'drop-on' : ''}`}>
              <h3 className={`section-title day-title ${key === today ? 'today' : ''}`}>
                <span>{weekday(day)}</span>
                <span>{shortDate(day)}</span>
              </h3>
              <ul className="list">
                {entries.map((entry) => {
                  const recipe = recipes.find((r) => r.id === entry.recipe_id);
                  return (
                    <li key={entry.id} className={`list-row plan-row ${drag.entry?.id === entry.id ? 'dragging' : ''}`}
                      onPointerDown={(e) => drag.press(e, entry)}>
                      <span className="drag-handle" aria-hidden onPointerDown={(e) => drag.grab(e, entry)}>⠿</span>
                      <button className="list-row-main" disabled={!recipe} onClick={() => recipe && !drag.justDropped() && onOpenRecipe(recipe.id)}>
                        <RecipeImage src={recipe?.image_url} className="thumb small" />
                        <span className="list-text">
                          <strong>{entry.title}</strong>
                          {recipe && <small>{entry.servings} Portionen</small>}
                        </span>
                      </button>
                      <button className="icon-btn muted" aria-label={`${entry.title} entfernen`}
                        onClick={() => store.removePlanEntry(entry)}>✕</button>
                    </li>
                  );
                })}
                <li>
                  <button className="list-row add-row" onClick={() => setPickDay(day)}>＋ Gericht planen</button>
                </li>
              </ul>
            </section>
          );
        })}
      </main>
      {pickDay && <RecipePicker day={pickDay} onClose={() => setPickDay(null)} />}
      {drag.entry && drag.pos && (
        <div className="drag-ghost" style={{ left: drag.pos.x, top: drag.pos.y }}>
          <RecipeImage src={recipes.find((r) => r.id === drag.entry?.recipe_id)?.image_url} className="thumb small" />
          <strong>{drag.entry.title}</strong>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Ziehen & Ablegen

/**
 * Gerichte per Ziehen auf einen anderen Tag legen. Mit Zeiger-Events statt HTML5-Drag,
 * damit es auch auf iPhone und Echo Show geht: am Griff sofort, sonst nach langem Drücken.
 * Am Rand wird gescrollt; über ‹ / › kurz halten wechselt die Woche.
 */
function useMealDrag(changeWeek: (delta: number) => void) {
  const [entry, setEntry] = useState<MealPlanEntry | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [overWeek, setOverWeek] = useState<number | null>(null);
  const pressTimer = useRef<number | undefined>(undefined);
  const weekTimer = useRef<number | undefined>(undefined);
  const droppedAt = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const changeWeekRef = useRef(changeWeek);
  changeWeekRef.current = changeWeek;

  useEffect(() => {
    if (!entry) return;
    let frame = 0;
    // Erst nach der ersten Bewegung am Rand scrollen – sonst rollt die Seite beim Anheben weg
    let lastY = startY.current;
    let moved = false;
    const target = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      return {
        day: el?.closest<HTMLElement>('[data-drop-day]')?.dataset.dropDay ?? null,
        week: Number(el?.closest<HTMLElement>('[data-drop-week]')?.dataset.dropWeek) || null,
      };
    };
    const scroll = () => {
      const edge = 70;
      const speed = !moved ? 0 : lastY < edge ? -(edge - lastY) / 4 : lastY > innerHeight - edge - 64 ? (lastY - (innerHeight - edge - 64)) / 4 : 0;
      if (speed) window.scrollBy(0, speed);
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    let week: number | null = null;
    const move = (e: PointerEvent) => {
      e.preventDefault();
      moved ||= Math.abs(e.clientY - startY.current) > 6;
      lastY = e.clientY;
      setPos({ x: e.clientX, y: e.clientY });
      const t = target(e.clientX, e.clientY);
      setOverDay(t.day);
      if (t.week !== week) {
        week = t.week;
        setOverWeek(week);
        window.clearTimeout(weekTimer.current);
        if (week) {
          const delta = week;
          weekTimer.current = window.setTimeout(() => changeWeekRef.current(delta), 600);
        }
      }
    };
    const end = (e: PointerEvent) => {
      const t = target(e.clientX, e.clientY);
      if (e.type === 'pointerup' && t.day) store.movePlanEntry(entry, t.day);
      droppedAt.current = Date.now();
      setEntry(null);
      setPos(null);
      setOverDay(null);
      setOverWeek(null);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    document.body.classList.add('is-dragging');
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(weekTimer.current);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.body.classList.remove('is-dragging');
    };
  }, [entry]);

  // iOS: Seite nicht scrollen, solange ein Gericht gezogen wird. Der Listener muss schon vor
  // dem Berühren hängen, sonst nimmt Safari die Geste fürs Scrollen und bricht das Ziehen ab.
  useEffect(() => {
    dragging.current = entry !== null;
  }, [entry]);
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (dragging.current) e.preventDefault();
    };
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, []);

  const start = (e: { clientX: number; clientY: number }, item: MealPlanEntry) => {
    window.clearTimeout(pressTimer.current);
    navigator.vibrate?.(15);
    startY.current = e.clientY;
    dragging.current = true;
    setPos({ x: e.clientX, y: e.clientY });
    setEntry(item);
  };

  /** Griff: sofort ziehen */
  const grab = (e: React.PointerEvent, item: MealPlanEntry) => {
    e.preventDefault();
    e.stopPropagation();
    start(e, item);
  };

  /** Ganze Zeile: nach 350 ms Drücken ziehen, Bewegung vorher bricht ab (= Scrollen) */
  const press = (e: React.PointerEvent, item: MealPlanEntry) => {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const cancel = () => {
      window.clearTimeout(pressTimer.current);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
    };
    const onMove = (m: PointerEvent) => {
      if (Math.hypot(m.clientX - x0, m.clientY - y0) > 8) cancel();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', cancel);
    window.addEventListener('pointercancel', cancel);
    pressTimer.current = window.setTimeout(() => {
      cancel();
      start({ clientX: x0, clientY: y0 }, item);
    }, 350);
  };

  return { entry, pos, overDay, overWeek, grab, press, justDropped: () => Date.now() - droppedAt.current < 400 };
}

/** Rezept oder freien Eintrag ("Reste", "Essen gehen") für einen Tag wählen. */
function RecipePicker({ day, onClose }: { day: Date; onClose: () => void }) {
  const { recipes } = useStore();
  const [q, setQ] = useState('');
  const [free, setFree] = useState('');
  const [chosen, setChosen] = useState<Recipe | null>(null);

  const filtered = [...recipes]
    .sort((a, b) => a.title.localeCompare(b.title, 'de'))
    .filter((r) => r.title.toLowerCase().includes(q.trim().toLowerCase()));

  if (chosen) {
    return <PlanRecipeSheet recipe={chosen} servings={chosen.servings} day={day} onClose={onClose} />;
  }

  return (
    <Sheet title={`${weekday(day)}, ${shortDate(day)}`} onClose={onClose}>
      <form className="form-group inline-form" onSubmit={(e) => {
        e.preventDefault();
        if (!free.trim()) return;
        store.addPlanEntry(dayKey(day), free.trim(), null, 2);
        onClose();
      }}>
        <input value={free} placeholder="Ohne Rezept, z. B. „Reste“" onChange={(e) => setFree(e.target.value)} />
        <button className="link bold" disabled={!free.trim()}>OK</button>
      </form>
      <h4 className="form-label">Unsere Rezepte</h4>
      {recipes.length === 0 ? (
        <p className="hint">Noch keine Rezepte. Im Tab „Rezepte“ kannst du auf Chefkoch suchen oder eigene anlegen.</p>
      ) : (
        <>
          <input className="search" type="search" placeholder="Rezept suchen" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="list">
            {filtered.map((r) => (
              <li key={r.id}>
                <button className="list-row" onClick={() => setChosen(r)}>
                  <RecipeImage src={r.image_url} className="thumb" />
                  <span className="list-text">
                    <strong>{r.title}</strong>
                    <small>{r.servings} Portionen</small>
                  </span>
                  <span className="chevron">›</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

/**
 * Tag und Portionen wählen, Zutaten prüfen, auf die Einkaufsliste übernehmen.
 * Grundvorrat (Salz, Pfeffer …) ist vorab abgewählt.
 */
export function PlanRecipeSheet({ recipe, servings: initialServings, day: fixedDay, onClose, onPlanned }: {
  recipe: Recipe;
  servings: number;
  day?: Date;
  onClose: () => void;
  /** wird nach dem Einplanen aufgerufen (nicht beim Abbrechen) */
  onPlanned?: () => void;
}) {
  const conflicts = recipeConflicts(useStore(), recipe.ingredients);
  const [servings, setServings] = useState(initialServings);
  const [day, setDay] = useState(() => dayKey(fixedDay ?? new Date()));
  const [toList, setToList] = useState(true);
  const [selected, setSelected] = useState(() => new Set(recipe.ingredients.filter((i) => !store.isStaple(i)).map((i) => i.id)));
  const scale = servings / Math.max(recipe.servings, 1);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const commit = () => {
    store.addPlanEntry(day, recipe.title, recipe, servings);
    if (toList) store.addIngredients(recipe.ingredients.filter((i) => selected.has(i.id)), scale, recipe.title);
    onPlanned?.();
    onClose();
  };

  return (
    <Sheet title={recipe.title} onClose={onClose} action={<button className="link bold" onClick={commit}>Einplanen</button>}>
      <ConflictBanner ingredients={recipe.ingredients} />
      <div className="form-group">
        {!fixedDay && (
          <label>Tag<input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
        )}
        <Stepper value={servings} onChange={setServings} label={(v) => `${v} Portionen`} />
        <label className="switch-row">
          Zutaten auf die Einkaufsliste
          <input type="checkbox" role="switch" checked={toList} onChange={(e) => setToList(e.target.checked)} />
        </label>
      </div>
      {toList && (
        <>
          <h4 className="form-label">Zutaten ({selected.size} von {recipe.ingredients.length})</h4>
          <ul className="list check-list">
            {recipe.ingredients.map((ing) => {
              const on = selected.has(ing.id);
              return (
                <li key={ing.id}>
                  <button className={`list-row ${on ? '' : 'off'}`} onClick={() => toggle(ing.id)}>
                    <span className={`check ${on ? 'on' : ''}`}>{on ? '✓' : ''}</span>
                    <span className="list-text">{displayName(ing.name)}</span>
                    {conflicts.some((c) => c.ingredient === ing.name) && <span className="pill warn">⚠️</span>}
                    {store.isStaple(ing) && <span className="pill">Vorrat</span>}
                    <span className="qty">{formatQuantity(ing.amount == null ? null : ing.amount * scale, ing.unit, true)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="hint">Grundvorrat ist abgewählt. Was ihr zu Hause habt, einfach antippen. Den Grundvorrat pflegt ihr unter „Mehr“.</p>
        </>
      )}
    </Sheet>
  );
}
