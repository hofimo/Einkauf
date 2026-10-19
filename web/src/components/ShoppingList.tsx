import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { categoryColor, categoryFor, emojiFor, itemCategory, SUGGESTIONS } from '../lib/catalog';
import { activeShopper, checkedItems, openByCategory, orderedCategories, settingsOf, store, useStore } from '../lib/store';
import type { ShoppingItem } from '../lib/types';
import { dayKey } from './WeekPlan';
import { CookMode } from './CookMode';
import { ShoppingMode } from './ShoppingMode';
import { Empty, MemberBadge, Sheet, SyncBadge, TopBar } from './ui';

export type ListView = 'tiles' | 'list';

const VIEW_KEY = 'einkauf-view';
export function readView(): ListView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'tiles';
  } catch {
    return 'tiles';
  }
}
export function saveView(view: ListView) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // egal
  }
}

/** Einkaufsliste im Stil von Bring: farbige Kacheln nach Abteilung, Antippen = gekauft. */
export function ShoppingList() {
  const state = useStore();
  const items = state.shopping_items;
  const settings = settingsOf(state);
  const shopper = activeShopper(state);
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [showChecked, setShowChecked] = useState(false);
  const [view, setView] = useState<ListView>(readView);
  const [shopping, setShopping] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [cooking, setCooking] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => openByCategory(items, settings.category_order), [items, settings.category_order]);
  const checked = useMemo(() => checkedItems(items), [items]);
  const openCount = items.length - checked.length;

  const todays = state.meal_plan
    .filter((e) => e.day === dayKey(new Date()) && e.recipe_id)
    .map((e) => ({ entry: e, recipe: state.recipes.find((r) => r.id === e.recipe_id) }))
    .filter((x) => x.recipe);

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    const open = new Set(items.filter((i) => !i.checked).map((i) => i.name.toLowerCase()));
    const seen = new Set<string>();
    const matches = [...checked.map((i) => i.name), ...SUGGESTIONS].filter((name) => {
      const lower = name.toLowerCase();
      if (!lower.includes(q) || open.has(lower) || seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
    const exact = matches.some((m) => m.toLowerCase() === q);
    return [...(exact ? [] : [input.trim()]), ...matches].slice(0, 9);
  }, [input, items, checked]);

  const add = (text: string) => {
    if (!text.trim()) return;
    store.addText(text);
    setInput('');
    inputRef.current?.focus();
  };

  const toggleView = () => {
    const next = view === 'tiles' ? 'list' : 'tiles';
    setView(next);
    saveView(next);
  };

  const share = async () => {
    const text = groups
      .map((g) => [`${g.category.name}:`, ...g.items.map((i) => `• ${i.name}${i.quantity ? ` (${i.quantity})` : ''}`)].join('\n'))
      .join('\n\n');
    if (navigator.share) await navigator.share({ text }).catch(() => undefined);
    else await navigator.clipboard.writeText(text);
  };

  if (shopping) return <ShoppingMode onClose={() => setShopping(false)} />;

  const cookRecipe = cooking ? state.recipes.find((r) => r.id === cooking) : undefined;

  return (
    <>
      <TopBar
        title="Einkaufsliste"
        left={<SyncBadge />}
        right={
          <>
            <button className="icon-btn" onClick={share} aria-label="Liste teilen">⤴︎</button>
            <button className="icon-btn" onClick={toggleView} aria-label={view === 'tiles' ? 'Als Liste anzeigen' : 'Als Kacheln anzeigen'}>
              {view === 'tiles' ? '☰' : '▦'}
            </button>
          </>
        }
      />
      <div className="input-bar">
        <form onSubmit={(e) => { e.preventDefault(); add(input); }}>
          <span className="plus">＋</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Was brauchst du?"
            enterKeyHint="done"
            autoComplete="off"
          />
          {input && <button type="submit" className="link bold">Hinzufügen</button>}
        </form>
      </div>

      <main className="content">
        {suggestions.length > 0 && (
          <div className="grid">
            {suggestions.map((name) => (
              <button key={name} className="tile suggestion" onClick={() => add(name)}>
                <span className="tile-emoji">{emojiFor(name, categoryFor(name))}</span>
                <span className="tile-name">{name}</span>
              </button>
            ))}
          </div>
        )}

        {suggestions.length === 0 && (
          <>
            {shopper && shopper !== state.member.trim() && (
              <div className="banner shopper">
                <span className="banner-icon">🛒</span>
                <span><b>{shopper}</b> ist gerade einkaufen. Was du jetzt einträgst, sieht {shopper} sofort.</span>
              </div>
            )}

            {settings.list_note ? (
              <button className="note" onClick={() => setNoteOpen(true)}>
                <span className="note-text">📝 {settings.list_note}</span>
                {settings.list_note_by && <span className="note-by">– {settings.list_note_by}</span>}
              </button>
            ) : (
              <div className="chips">
                <button className="chip" onClick={() => setNoteOpen(true)}>📝 Notiz an die Liste</button>
              </div>
            )}

            {todays.map(({ entry, recipe }) => (
              <div key={entry.id} className="today">
                <span className="today-text">
                  <small>Heute gibt's</small>
                  <strong>{entry.title}</strong>
                </span>
                <button className="today-btn" onClick={() => setCooking(recipe!.id)}>👩‍🍳 Kochen</button>
              </div>
            ))}

            {openCount > 0 && (
              <button className="primary wide shop-btn" onClick={() => setShopping(true)}>
                🛒 Einkaufen gehen <span className="shop-count">{openCount}</span>
              </button>
            )}

            {groups.length === 0 && (
              <Empty icon="🎉" title="Alles erledigt">
                Tippe oben etwas ein, sag „Hey Siri, Einkauf“ oder plane Gerichte im Wochenplan.
              </Empty>
            )}
          </>
        )}

        {groups.map(({ category, items }) => (
          <section key={category.key}>
            <h3 className="section-title cat-title" style={{ '--cat': category.color } as CSSProperties}>
              <span className="cat-dot" />{category.name}<span className="cat-count">{items.length}</span>
            </h3>
            <div className={view === 'tiles' ? 'grid' : 'list'}>
              {items.map((item) => (
                <ItemView key={item.id} item={item} view={view} onEdit={() => setEditing(item)} />
              ))}
            </div>
          </section>
        ))}

        {checked.length > 0 && (
          <section>
            <div className="section-head">
              <button className="section-title" onClick={() => setShowChecked(!showChecked)}>
                Zuletzt gekauft ({checked.length}) {showChecked ? '▾' : '▸'}
              </button>
              {showChecked && (
                <button className="link small" onClick={() => confirm('Alle gekauften Artikel entfernen?') && store.clearChecked()}>
                  Leeren
                </button>
              )}
            </div>
            {showChecked && (
              <div className={view === 'tiles' ? 'grid' : 'list'}>
                {checked.slice(0, 30).map((item) => (
                  <ItemView key={item.id} item={item} view={view} onEdit={() => setEditing(item)} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {editing && <ItemEditor item={editing} onClose={() => setEditing(null)} />}
      {noteOpen && <NoteEditor onClose={() => setNoteOpen(false)} />}
      {cookRecipe && (
        <CookMode
          recipe={cookRecipe}
          servings={todays.find((t) => t.recipe?.id === cookRecipe.id)?.entry.servings}
          onClose={() => setCooking(null)}
        />
      )}
    </>
  );
}

/** Eine Zeile oder Kachel. Antippen = abhaken (mit kurzer Animation), lange drücken = bearbeiten. */
export function ItemView({ item, view, onEdit, onToggle, big, highlight }: {
  item: ShoppingItem;
  view: ListView;
  onEdit: () => void;
  onToggle?: () => void;
  big?: boolean;
  highlight?: boolean;
}) {
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const category = itemCategory(item);
  const detail = [item.quantity, item.note].filter(Boolean).join(' · ');
  const voice = ['Siri', 'Alexa'].includes(item.source);
  const fromRecipe = Boolean(item.source) && !voice;

  const start = () => {
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      onEdit();
    }, 500);
  };
  const cancel = () => window.clearTimeout(timer.current);
  const toggle = () => {
    if (longPressed.current || leaving) return;
    setLeaving(true);
    window.setTimeout(() => {
      if (onToggle) onToggle();
      else store.toggle(item);
      setLeaving(false);
    }, 220);
  };

  // Eigene Einträge brauchen kein Kürzel – nur was andere (oder Siri/Alexa) eingetragen haben
  const me = useStore().member.trim();
  const badge = voice
    ? <span className="who voice" title={`über ${item.source}`}>🎙</span>
    : item.added_by && item.added_by !== me ? <MemberBadge name={item.added_by} /> : null;

  const classes = [
    view === 'tiles' ? 'tile' : 'row',
    item.checked ? 'checked' : 'open',
    leaving && 'leaving',
    big && 'big',
    highlight && 'highlight',
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      style={{ '--cat': categoryColor(category) } as CSSProperties}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => { e.preventDefault(); cancel(); if (!longPressed.current) onEdit(); longPressed.current = true; }}
      onClick={toggle}
      aria-label={`${item.name}${detail ? `, ${detail}` : ''}${item.checked ? ', wieder hinzufügen' : ', als gekauft markieren'}`}
    >
      {view === 'tiles' ? (
        <>
          {!item.checked && badge && <span className="tile-badge">{badge}</span>}
          {!item.checked && fromRecipe && <span className="tile-recipe" title={`für ${item.source}`}>🍴</span>}
          {highlight && <span className="tile-new">neu</span>}
          <span className="tile-emoji">{emojiFor(item.name, category)}</span>
          <span className="tile-name">{item.name}</span>
          {detail && <span className="tile-detail">{detail}</span>}
        </>
      ) : (
        <>
          <span className="row-check">{item.checked || leaving ? '✓' : ''}</span>
          <span className="row-emoji">{emojiFor(item.name, category)}</span>
          <span className="row-text">
            <span className="row-name">{item.name}{highlight && <span className="tile-new inline">neu</span>}</span>
            {(detail || fromRecipe) && <small>{[detail, fromRecipe ? `für ${item.source}` : ''].filter(Boolean).join(' · ')}</small>}
          </span>
          {!item.checked && badge}
        </>
      )}
    </button>
  );
}

export function ItemEditor({ item, onClose }: { item: ShoppingItem; onClose: () => void }) {
  const order = settingsOf(useStore()).category_order;
  const [draft, setDraft] = useState({ ...item, category: itemCategory(item) });
  const save = () => {
    if (!draft.name.trim()) return;
    store.updateItem({ ...draft, name: draft.name.trim() });
    onClose();
  };
  const origin = [item.added_by && `von ${item.added_by}`, item.source && `für/über ${item.source}`].filter(Boolean).join(', ');
  return (
    <Sheet title="Artikel" onClose={onClose} action={<button className="link bold" onClick={save}>Sichern</button>}>
      <div className="form-group">
        <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Menge<input value={draft.quantity} placeholder="z. B. 500 g" onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} /></label>
        <label>Notiz<input value={draft.note} placeholder="z. B. Bio, Marke" onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
        <label>
          Abteilung
          <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
            {orderedCategories(order).map((c) => <option key={c.key} value={c.name}>{c.emoji} {c.name}</option>)}
          </select>
        </label>
      </div>
      {origin && <p className="hint">Eingetragen {origin}</p>}
      <div className="form-group">
        <button className="danger-row" onClick={() => { store.deleteItem(item); onClose(); }}>Löschen</button>
      </div>
    </Sheet>
  );
}

function NoteEditor({ onClose }: { onClose: () => void }) {
  const current = settingsOf(useStore()).list_note;
  const [text, setText] = useState(current);
  const save = () => {
    store.setNote(text);
    onClose();
  };
  return (
    <Sheet title="Notiz an die Liste" onClose={onClose} action={<button className="link bold" onClick={save}>Sichern</button>}>
      <div className="form-group">
        <textarea rows={3} autoFocus value={text} maxLength={200} placeholder="z. B. Bitte die Bio-Eier! Oder: Heute Abend kommt Besuch."
          onChange={(e) => setText(e.target.value)} />
      </div>
      <p className="hint">Erscheint bei euch beiden oben auf der Liste, bis ihr sie löscht.</p>
      {current && (
        <div className="form-group">
          <button className="danger-row" onClick={() => { store.setNote(''); onClose(); }}>Notiz löschen</button>
        </div>
      )}
    </Sheet>
  );
}
