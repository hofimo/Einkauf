import { useEffect, useMemo, useRef, useState } from 'react';
import { currentRound, deckFor, members, openMatches, othersProgress, roundDishes } from '../lib/match';
import { buildDeck, THEMES, type Theme } from '../lib/matchDeck';
import { notifyOthers } from '../lib/push';
import { draftToRecipe, loadChefkoch } from '../lib/recipes';
import { store, useStore } from '../lib/store';
import type { MatchDish, Recipe } from '../lib/types';
import { PlanRecipeSheet } from './WeekPlan';
import { RecipeImage } from './ui';

type Tab = 'swipe' | 'matches';

/** Gerichte-Match: beide wischen denselben Stapel, gemeinsame 💚 werden zu Matches. */
export function MatchMode({ onClose }: { onClose: () => void }) {
  const state = useStore();
  const { match_dishes: dishes, match_votes: votes, member: rawMember, householdId } = state;
  const member = rawMember.trim();
  const matches = useMemo(() => openMatches(dishes, votes), [dishes, votes]);
  const [tab, setTab] = useState<Tab>(() => (matches.length > 0 && deckFor(dishes, votes, member).length === 0 ? 'matches' : 'swipe'));
  const [justMatched, setJustMatched] = useState<MatchDish | null>(null);
  const [planning, setPlanning] = useState<{ recipe: Recipe; dish: MatchDish } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Während das Match offen ist, Stimmen alle 5 Sekunden abgleichen
  useEffect(() => {
    void store.refreshMatch();
    const t = window.setInterval(() => void store.refreshMatch(), 5000);
    return () => window.clearInterval(t);
  }, []);

  const onMatch = (dish: MatchDish) => {
    setJustMatched(dish);
    if (householdId) void notifyOthers(householdId, '💚 Match!', `Ihr habt beide Lust auf ${dish.title}. Jetzt übernehmen?`);
  };

  /** Rezept in "Unsere Rezepte" aufnehmen (falls noch nicht da) und zurückgeben. */
  const ensureRecipe = async (dish: MatchDish): Promise<Recipe | null> => {
    if (dish.source === 'recipe') return state.recipes.find((r) => r.id === dish.ref_id) ?? null;
    const saved = state.recipes.find((r) => r.chefkoch_id === dish.ref_id);
    if (saved) return saved;
    const recipe = draftToRecipe(await loadChefkoch(dish.ref_id), householdId!);
    store.saveRecipe(recipe);
    return recipe;
  };

  /** Option 1: nur als Rezept übernehmen */
  const takeOver = async (dish: MatchDish) => {
    setError(null);
    setBusy(dish.id);
    try {
      if (!(await ensureRecipe(dish))) throw new Error('Dieses Rezept gibt es nicht mehr.');
      store.closeMatch(dish);
      setToast(`📖 „${dish.title}“ ist jetzt in euren Rezepten.`);
    } catch (e) {
      setError(`Rezept konnte nicht übernommen werden: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  };

  /** Option 2: übernehmen und gleich einplanen */
  const plan = async (dish: MatchDish) => {
    setError(null);
    setBusy(dish.id);
    try {
      const recipe = await ensureRecipe(dish);
      if (!recipe) throw new Error('Dieses Rezept gibt es nicht mehr.');
      setPlanning({ recipe, dish });
    } catch (e) {
      setError(`Rezept konnte nicht geladen werden: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="matchmode" role="dialog" aria-label="Gerichte-Match">
      <header className="cook-head">
        <button className="icon-btn" onClick={onClose} aria-label="Schließen">✕</button>
        <h1>💚 Gerichte-Match</h1>
        <span />
      </header>
      <div className="segmented">
        <button className={tab === 'swipe' ? 'on' : ''} onClick={() => setTab('swipe')}>Wischen</button>
        <button className={tab === 'matches' ? 'on' : ''} onClick={() => setTab('matches')}>
          Matches{matches.length > 0 && <span className="seg-badge">{matches.length}</span>}
        </button>
      </div>

      {error && <p className="error center">{error}</p>}

      {tab === 'swipe' ? (
        <SwipeView member={member} onMatch={onMatch} onShowMatches={() => setTab('matches')} />
      ) : (
        <main className="match-list">
          {matches.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">💞</div>
              <h3>Noch keine Matches</h3>
              <p>Sobald ihr beide dasselbe Gericht nach rechts gewischt habt, landet es hier.</p>
            </div>
          ) : (
            matches.map((d) => (
              <div key={d.id} className="match-card">
                <RecipeImage src={d.image_url} className="match-img" />
                <div className="match-body">
                  <strong>{d.title}</strong>
                  {d.info && <small>{d.info}</small>}
                  <div className="button-row match-actions">
                    <button className="secondary" disabled={busy === d.id} onClick={() => void takeOver(d)}>📖 Übernehmen</button>
                    <button className="primary" disabled={busy === d.id} onClick={() => void plan(d)}>📅 Einplanen</button>
                    <button className="icon-btn muted" onClick={() => store.closeMatch(d)} aria-label={`${d.title} verwerfen`}>✕</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </main>
      )}

      {justMatched && (
        <div className="celebrate" onClick={() => setJustMatched(null)}>
          <div className="celebrate-card match-pop" onClick={(e) => e.stopPropagation()}>
            <div className="match-heart">💚</div>
            <h2>It's a Match!</h2>
            <RecipeImage src={justMatched.image_url} className="match-pop-img" />
            <p>Ihr habt beide Lust auf <b>{justMatched.title}</b>.</p>
            <button className="primary wide" onClick={() => { const d = justMatched; setJustMatched(null); void plan(d); }}>
              📅 Übernehmen &amp; einplanen
            </button>
            <button className="secondary wide" onClick={() => { const d = justMatched; setJustMatched(null); void takeOver(d); }}>
              📖 Als Rezept übernehmen
            </button>
            <button className="link" onClick={() => setJustMatched(null)}>Später entscheiden</button>
          </div>
        </div>
      )}

      {busy && !planning && <div className="toast" role="status">Rezept wird geladen …</div>}
      {toast && <div className="toast" role="status">{toast}</div>}

      {planning && (
        <PlanRecipeSheet
          recipe={planning.recipe}
          servings={planning.recipe.servings}
          onPlanned={() => store.closeMatch(planning.dish)}
          onClose={() => setPlanning(null)}
        />
      )}
    </div>
  );
}

function SwipeView({ member, onMatch, onShowMatches }: { member: string; onMatch: (d: MatchDish) => void; onShowMatches: () => void }) {
  const state = useStore();
  const { match_dishes: dishes, match_votes: votes } = state;
  const deck = useMemo(() => deckFor(dishes, votes, member), [dishes, votes, member]);
  const round = currentRound(dishes);
  const total = roundDishes(dishes, round).length;
  const others = othersProgress(dishes, votes, member);
  const partners = members(votes).filter((m) => m !== member);
  const [history, setHistory] = useState<MatchDish[]>([]);
  const [choosing, setChoosing] = useState(false);

  const vote = (dish: MatchDish, liked: boolean) => {
    setHistory((h) => [...h, dish]);
    if (store.vote(dish, liked)) onMatch(dish);
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    store.undoVote(last);
    setHistory((h) => h.slice(0, -1));
  };

  if (!round || choosing) {
    return <ThemePicker onCancel={round ? () => setChoosing(false) : undefined} onStarted={() => { setChoosing(false); setHistory([]); }} />;
  }

  if (deck.length === 0) {
    return (
      <main className="swipe-done">
        <div className="empty-icon">🎉</div>
        <h3>Du bist durch!</h3>
        {Object.entries(others).map(([name, n]) => (
          <p key={name} className="muted-text">{name}: {n} von {total} gewischt{n >= total ? ' ✓' : ''}</p>
        ))}
        {partners.length === 0 && (
          <p className="muted-text">Matches entstehen, sobald auch dein Partner bzw. deine Partnerin wischt (Wochenplan → Gerichte-Match).</p>
        )}
        <div className="stack">
          <button className="primary wide" onClick={onShowMatches}>Matches ansehen</button>
          {history.length > 0 && <button className="secondary wide" onClick={undo}>↶ Letztes rückgängig</button>}
          <button className="link" onClick={() => setChoosing(true)}>Neue Runde starten</button>
        </div>
      </main>
    );
  }

  return (
    <main className="swipe-area">
      <div className="swipe-count">{total - deck.length + 1} / {total}</div>
      <div className="card-stack">
        {deck.slice(0, 3).reverse().map((dish, i, arr) => (
          <SwipeCard key={dish.id} dish={dish} depth={arr.length - 1 - i} onVote={(liked) => vote(dish, liked)} />
        ))}
      </div>
      <div className="swipe-buttons">
        <button className="swipe-btn nope" aria-label="Nein" onClick={() => vote(deck[0], false)}>✕</button>
        <button className="swipe-btn undo" aria-label="Rückgängig" disabled={history.length === 0} onClick={undo}>↶</button>
        <button className="swipe-btn like" aria-label="Lust drauf" onClick={() => vote(deck[0], true)}>💚</button>
      </div>
    </main>
  );
}

/** Eine Karte; die oberste lässt sich ziehen. Weit genug nach rechts/links = Stimme. */
function SwipeCard({ dish, depth, onVote }: { dish: MatchDish; depth: number; onVote: (liked: boolean) => void }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const top = depth === 0;

  const finish = (dir: 1 | -1) => {
    setLeaving(dir);
    window.setTimeout(() => onVote(dir === 1), 230);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!top) return;
    start.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDx(e.clientX - start.current.x);
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (Math.abs(dx) > 100) finish(dx > 0 ? 1 : -1);
    else setDx(0);
  };

  const x = leaving ? leaving * 700 : dx;
  const style: React.CSSProperties = top
    ? {
        transform: `translateX(${x}px) rotate(${x / 18}deg)`,
        transition: dragging ? 'none' : 'transform 0.25s ease',
      }
    : { transform: `scale(${1 - depth * 0.05}) translateY(${depth * 14}px)` };

  return (
    <div
      className={`swipe-card ${top ? 'top' : ''}`}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <RecipeImage src={dish.image_url} className="swipe-img" />
      {top && (
        <>
          <span className="stamp like" style={{ opacity: Math.max(0, Math.min(1, x / 100)) }}>LECKER</span>
          <span className="stamp nope" style={{ opacity: Math.max(0, Math.min(1, -x / 100)) }}>NÖ</span>
        </>
      )}
      <div className="swipe-info">
        <h2>{dish.title}</h2>
        {dish.info && <span>{dish.info}</span>}
      </div>
    </div>
  );
}

function ThemePicker({ onStarted, onCancel }: { onStarted: () => void; onCancel?: () => void }) {
  const state = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (theme: Theme) => {
    setBusy(theme.key);
    setError(null);
    try {
      const deck = await buildDeck(theme, state.recipes);
      store.startRound(deck);
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="theme-picker">
      <h3>Worauf habt ihr Lust?</h3>
      <p className="muted-text">Wählt ein Thema. Ihr bekommt beide denselben Stapel mit 20 neuen Chefkoch-Ideen, die noch nicht in euren Rezepten sind.</p>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button key={t.key} className="theme-btn" disabled={busy !== null} onClick={() => void start(t)}>
            {busy === t.key ? '…' : t.label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {onCancel && <button className="link" onClick={onCancel}>Abbrechen</button>}
    </main>
  );
}
