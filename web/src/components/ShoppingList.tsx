import { useMemo, useRef, useState } from 'react';
import { emojiFor, itemCategory, SUGGESTIONS, categoryFor } from '../lib/catalog';
import { checkedItems, openByCategory, orderedCategories, settingsOf, store, useStore } from '../lib/store';
import type { ShoppingItem } from '../lib/types';
import { Empty, Sheet, SyncBadge, TopBar } from './ui';

/** Einkaufsliste im Stil von Bring: Kacheln nach Abteilung, Antippen = gekauft. */
export function ShoppingList() {
  const state = useStore();
  const items = state.shopping_items;
  const order = settingsOf(state).category_order;
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [showChecked, setShowChecked] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => openByCategory(items, order), [items, order]);
  const checked = useMemo(() => checkedItems(items), [items]);

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

  const share = async () => {
    const text = groups
      .map((g) => [`${g.category.name}:`, ...g.items.map((i) => `• ${i.name}${i.quantity ? ` (${i.quantity})` : ''}`)].join('\n'))
      .join('\n\n');
    if (navigator.share) await navigator.share({ text }).catch(() => undefined);
    else await navigator.clipboard.writeText(text);
  };

  return (
    <>
      <TopBar
        title="Einkaufsliste"
        left={<SyncBadge />}
        right={<button className="icon-btn" onClick={share} aria-label="Liste teilen">⤴︎</button>}
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

        {suggestions.length === 0 && groups.length === 0 && (
          <Empty icon="🎉" title="Alles erledigt">
            Tippe oben etwas ein, sag „Hey Siri, Einkauf“ oder plane Gerichte im Wochenplan.
          </Empty>
        )}

        {groups.map(({ category, items }) => (
          <section key={category.key}>
            <h3 className="section-title">{category.name}</h3>
            <div className="grid">
              {items.map((item) => (
                <Tile key={item.id} item={item} onEdit={() => setEditing(item)} />
              ))}
            </div>
          </section>
        ))}

        {checked.length > 0 && (
          <section>
            <div className="section-head">
              <button className="section-title" onClick={() => setShowChecked(!showChecked)}>
                Zuletzt gekauft {showChecked ? '▾' : '▸'}
              </button>
              <button className="link small" onClick={() => confirm('Alle gekauften Artikel entfernen?') && store.clearChecked()}>
                Leeren
              </button>
            </div>
            {showChecked && (
              <div className="grid">
                {checked.slice(0, 30).map((item) => (
                  <Tile key={item.id} item={item} onEdit={() => setEditing(item)} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {editing && <ItemEditor item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function Tile({ item, onEdit }: { item: ShoppingItem; onEdit: () => void }) {
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const detail = [item.quantity, item.note].filter(Boolean).join(' · ');

  // Antippen = abhaken, lange drücken = bearbeiten
  const start = () => {
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      navigator.vibrate?.(10);
      onEdit();
    }, 500);
  };
  const cancel = () => window.clearTimeout(timer.current);

  return (
    <button
      className={`tile ${item.checked ? 'checked' : 'open'}`}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => { e.preventDefault(); cancel(); if (!longPressed.current) onEdit(); longPressed.current = true; }}
      onClick={() => { if (!longPressed.current) store.toggle(item); }}
      aria-label={`${item.name}${detail ? `, ${detail}` : ''}${item.checked ? ', wieder hinzufügen' : ', als gekauft markieren'}`}
    >
      {item.source && !item.checked && (
        <span className="tile-source">{['Siri', 'Alexa'].includes(item.source) ? '🎙' : '🍴'}</span>
      )}
      <span className="tile-emoji">{emojiFor(item.name, itemCategory(item))}</span>
      <span className="tile-name">{item.name}</span>
      {detail && <span className="tile-detail">{detail}</span>}
    </button>
  );
}

function ItemEditor({ item, onClose }: { item: ShoppingItem; onClose: () => void }) {
  const order = settingsOf(useStore()).category_order;
  const [draft, setDraft] = useState({ ...item, category: itemCategory(item) });
  const save = () => {
    if (!draft.name.trim()) return;
    store.updateItem({ ...draft, name: draft.name.trim() });
    onClose();
  };
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
        {item.source && <p className="hint">Für: {item.source}</p>}
      </div>
      <div className="form-group">
        <button className="danger-row" onClick={() => { store.deleteItem(item); onClose(); }}>Löschen</button>
      </div>
    </Sheet>
  );
}
