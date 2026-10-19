import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { notifyOthers } from '../lib/push';
import { openByCategory, settingsOf, store, useStore } from '../lib/store';
import type { ShoppingItem } from '../lib/types';
import { ItemEditor, ItemView } from './ShoppingList';
import { useWakeLock } from './ui';

/**
 * Einkaufsmodus für den Laden: große Kacheln in Laufreihenfolge, Fortschritt,
 * Bildschirm bleibt an. Was der/die andere währenddessen einträgt, erscheint als "neu".
 */
export function ShoppingMode({ onClose }: { onClose: () => void }) {
  const state = useStore();
  const { shopping_items: items, member, householdId } = state;
  const note = settingsOf(state);
  const order = note.category_order;
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useWakeLock();

  // Was zu Beginn offen war, und was seitdem dazukam
  const startOpen = useRef<Set<string>>(new Set(items.filter((i) => !i.checked).map((i) => i.id)));
  const known = useRef<Set<string>>(new Set(items.map((i) => `${i.id}:${i.created_at}`)));
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    store.startShopping();
    if (householdId) {
      void notifyOthers(householdId, `${member.trim() || 'Jemand'} ist einkaufen 🛒`, 'Fehlt noch was? Jetzt eintragen – es erscheint sofort im Laden.');
    }
    return () => store.stopShopping();
  }, [householdId, member]);

  // Neue Einträge der anderen erkennen (auch wieder aktivierte, daher id + created_at)
  useEffect(() => {
    const fresh = items.filter((i) => !i.checked && !known.current.has(`${i.id}:${i.created_at}`));
    if (fresh.length === 0) return;
    fresh.forEach((i) => known.current.add(`${i.id}:${i.created_at}`));
    const fromOthers = fresh.filter((i) => i.added_by !== member.trim() || ['Siri', 'Alexa'].includes(i.source));
    if (fromOthers.length === 0) return;
    setAdded((prev) => new Set([...prev, ...fromOthers.map((i) => i.id)]));
    const who = fromOthers[0].added_by || fromOthers[0].source || 'Jemand';
    setToast(`${who}: ${fromOthers.map((i) => i.name).join(', ')}`);
  }, [items, member]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const relevant = useMemo(
    () => items.filter((i) => startOpen.current.has(i.id) || added.has(i.id) || !i.checked),
    [items, added],
  );
  const groups = useMemo(() => openByCategory(relevant, order), [relevant, order]);
  const inCart = relevant.filter((i) => i.checked);
  const total = relevant.length;
  const done = inCart.length;
  const finished = total > 0 && done === total;
  // Kommt wieder etwas dazu (oder wird zurückgeholt), darf später erneut gefeiert werden
  if (!finished && dismissed) setDismissed(false);

  return (
    <div className="shopmode">
      <header className="shopmode-head">
        <div className="shopmode-row">
          <h1>🛒 Einkaufen</h1>
          <button className="primary small-btn" onClick={onClose}>Fertig</button>
        </div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div className="progress-bar" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        <div className="progress-label">{done} von {total} im Wagen</div>
      </header>

      <main className="content">
        {note.list_note && (
          <div className="note static">
            <span className="note-text">📝 {note.list_note}</span>
            {note.list_note_by && <span className="note-by">– {note.list_note_by}</span>}
          </div>
        )}
        {groups.map(({ category, items }) => (
          <section key={category.key}>
            <h3 className="section-title cat-title" style={{ '--cat': category.color } as CSSProperties}>
              <span className="cat-dot" />{category.name}<span className="cat-count">{items.length}</span>
            </h3>
            <div className="grid big-grid">
              {items.map((item) => (
                <ItemView key={item.id} item={item} view="tiles" big highlight={added.has(item.id)} onEdit={() => setEditing(item)} />
              ))}
            </div>
          </section>
        ))}

        {inCart.length > 0 && (
          <section>
            <button className="section-title" onClick={() => setShowCart(!showCart)}>
              Im Wagen ({inCart.length}) {showCart ? '▾' : '▸'}
            </button>
            {showCart && (
              <div className="list">
                {inCart.map((item) => (
                  <ItemView key={item.id} item={item} view="list" onEdit={() => setEditing(item)} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {toast && <div className="toast" role="status">➕ {toast}</div>}

      {finished && !dismissed && (
        <div className="celebrate">
          <Confetti />
          <div className="celebrate-card">
            <div className="celebrate-emoji">🎉</div>
            <h2>Alles im Wagen!</h2>
            <p>{total} {total === 1 ? 'Artikel' : 'Artikel'} erledigt.</p>
            <button className="primary wide" onClick={onClose}>Einkauf beenden</button>
            <button className="link" onClick={() => { setDismissed(true); setShowCart(true); }}>Doch noch was vergessen?</button>
          </div>
        </div>
      )}

      {editing && <ItemEditor item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const CONFETTI_COLORS = ['#2f9e57', '#e0a21c', '#d64545', '#2f86d1', '#cc5a9b', '#7564cf'];

function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 60 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 1.8 + Math.random() * 1.4,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
    })),
    [],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} style={{
          left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`, transform: `rotate(${p.rotate}deg)`,
        }} />
      ))}
    </div>
  );
}
