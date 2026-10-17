import { useEffect, useMemo, useState } from 'react';
import { draftToRecipe, importFromLink, loadChefkoch, searchChefkoch, type Draft, type SearchResult } from '../lib/recipes';
import { ingredientLine, parseIngredient } from '../lib/parser';
import { formatQuantity } from '../lib/quantity';
import { store, useStore } from '../lib/store';
import { now, uuid, type Ingredient, type Recipe } from '../lib/types';
import { PlanRecipeSheet } from './WeekPlan';
import { Empty, RecipeImage, Sheet, Stepper, TopBar } from './ui';

type View =
  | { kind: 'list' }
  | { kind: 'detail'; id: string }
  | { kind: 'search' }
  | { kind: 'preview'; result: SearchResult };

export function Recipes({ initialRecipeId }: { initialRecipeId?: string }) {
  const [view, setView] = useState<View>(initialRecipeId ? { kind: 'detail', id: initialRecipeId } : { kind: 'list' });
  const back = () => setView({ kind: 'list' });

  switch (view.kind) {
    case 'detail':
      return <RecipeDetail id={view.id} onBack={back} />;
    case 'search':
      return <ChefkochSearch onBack={back} onOpen={(result) => setView({ kind: 'preview', result })} />;
    case 'preview':
      return <ChefkochPreview result={view.result} onBack={() => setView({ kind: 'search' })} />;
    default:
      return <RecipeList onOpen={(id) => setView({ kind: 'detail', id })} onSearch={() => setView({ kind: 'search' })} />;
  }
}

function RecipeList({ onOpen, onSearch }: { onOpen: (id: string) => void; onSearch: () => void }) {
  const { recipes } = useStore();
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState<'new' | 'import' | null>(null);

  const filtered = useMemo(() => {
    const list = [...recipes].sort((a, b) => a.title.localeCompare(b.title, 'de'));
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((r) => r.title.toLowerCase().includes(s) || r.ingredients.some((i) => i.name.toLowerCase().includes(s)));
  }, [recipes, q]);

  return (
    <>
      <TopBar
        title="Rezepte"
        right={
          <>
            <button className="link" onClick={() => setSheet('import')}>Link</button>
            <button className="icon-btn" aria-label="Eigenes Rezept" onClick={() => setSheet('new')}>＋</button>
          </>
        }
      />
      <main className="content">
        <button className="card row-button" onClick={onSearch}>🔎 Auf Chefkoch suchen</button>
        {recipes.length > 0 && (
          <input className="search" type="search" placeholder="Rezept oder Zutat" value={q} onChange={(e) => setQ(e.target.value)} />
        )}
        {recipes.length === 0 ? (
          <Empty icon="📖" title="Noch keine Rezepte">
            Such ein Gericht auf Chefkoch, importiere einen Link oder leg ein eigenes Rezept an.
          </Empty>
        ) : (
          <ul className="list">
            {filtered.map((r) => (
              <li key={r.id}>
                <button className="list-row" onClick={() => onOpen(r.id)}>
                  <RecipeImage src={r.image_url} className="thumb" />
                  <span className="list-text">
                    <strong>{r.title}</strong>
                    <small>{r.ingredients.length} Zutaten · {r.servings} Portionen</small>
                  </span>
                  <span className="chevron">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      {sheet === 'new' && <RecipeEditor onClose={() => setSheet(null)} />}
      {sheet === 'import' && <ImportSheet onClose={() => setSheet(null)} onImported={onOpen} />}
    </>
  );
}

export function IngredientList({ ingredients, scale = 1 }: { ingredients: Ingredient[]; scale?: number }) {
  useStore(); // Grundvorrat kann sich ändern
  let lastGroup = '';
  return (
    <ul className="ingredients">
      {ingredients.map((ing) => {
        const header = ing.group && ing.group !== lastGroup ? ing.group : null;
        lastGroup = ing.group;
        return (
          <li key={ing.id}>
            {header && <div className="ing-group">{header}</div>}
            <div className="ing-row">
              <span className="ing-qty">{formatQuantity(ing.amount == null ? null : ing.amount * scale, ing.unit)}</span>
              <span className="ing-name">
                {ing.name}
                {ing.note && <small>{ing.note}</small>}
              </span>
              {store.isStaple(ing) && <span className="pill">Vorrat</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RecipeDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { recipes } = useStore();
  const recipe = recipes.find((r) => r.id === id);
  const [servings, setServings] = useState(recipe?.servings ?? 2);
  const [editing, setEditing] = useState(false);
  const [planning, setPlanning] = useState(false);

  if (!recipe) return <><TopBar title="Rezept" left={<button className="link" onClick={onBack}>‹ Rezepte</button>} /><Empty icon="📖" title="Rezept nicht gefunden" /></>;

  return (
    <>
      <TopBar
        title={recipe.title}
        left={<button className="link" onClick={onBack}>‹ Rezepte</button>}
        right={<button className="link" onClick={() => setEditing(true)}>Bearbeiten</button>}
      />
      <main className="content">
        {recipe.image_url && <RecipeImage src={recipe.image_url} className="hero" />}
        <button className="primary wide" onClick={() => setPlanning(true)}>📅 Zum Wochenplan hinzufügen</button>
        <div className="card">
          <Stepper value={servings} onChange={setServings} label={(v) => `${v} Portionen`} />
          <IngredientList ingredients={recipe.ingredients} scale={servings / Math.max(recipe.servings, 1)} />
        </div>
        {recipe.instructions && (
          <div className="card">
            <h3>Zubereitung</h3>
            <p className="instructions">{recipe.instructions}</p>
          </div>
        )}
        {recipe.source_url && (
          <a className="card row-button" href={recipe.source_url} target="_blank" rel="noreferrer">
            🌐 {recipe.chefkoch_id ? 'Auf Chefkoch öffnen' : 'Originalrezept öffnen'}
          </a>
        )}
        <button className="danger-row" onClick={() => {
          if (confirm(`„${recipe.title}“ löschen?`)) { store.deleteRecipe(recipe); onBack(); }
        }}>Rezept löschen</button>
      </main>
      {editing && <RecipeEditor recipe={recipe} onClose={() => setEditing(false)} />}
      {planning && <PlanRecipeSheet recipe={recipe} servings={servings} onClose={() => setPlanning(false)} />}
    </>
  );
}

function RecipeEditor({ recipe, onClose }: { recipe?: Recipe; onClose: () => void }) {
  const hid = useStore().householdId!;
  const [title, setTitle] = useState(recipe?.title ?? '');
  const [servings, setServings] = useState(recipe?.servings ?? 2);
  const [ingredientText, setIngredientText] = useState(recipe?.ingredients.map(ingredientLine).join('\n') ?? '');
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '');
  const [link, setLink] = useState(recipe?.source_url ?? '');

  const save = () => {
    if (!title.trim()) return;
    // Unveränderte Zeilen behalten Gruppen und Details (z. B. von Chefkoch)
    const existing = new Map((recipe?.ingredients ?? []).map((i) => [ingredientLine(i), i]));
    const ingredients = ingredientText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => existing.get(l) ?? parseIngredient(l))
      .filter((i): i is Ingredient => i !== null);
    store.saveRecipe({
      id: recipe?.id ?? uuid(),
      household_id: hid,
      title: title.trim(),
      servings,
      ingredients,
      instructions,
      source_url: link.trim() || null,
      image_url: recipe?.image_url ?? null,
      chefkoch_id: recipe?.chefkoch_id ?? null,
      created_at: recipe?.created_at ?? now(),
      updated_at: now(),
    });
    onClose();
  };

  return (
    <Sheet
      title={recipe ? 'Rezept bearbeiten' : 'Neues Rezept'}
      onClose={onClose}
      action={<button className="link bold" disabled={!title.trim()} onClick={save}>Sichern</button>}
    >
      <div className="form-group">
        <label>Name<input value={title} placeholder="Name des Gerichts" onChange={(e) => setTitle(e.target.value)} /></label>
        <Stepper value={servings} onChange={setServings} label={(v) => `${v} Portionen`} />
      </div>
      <h4 className="form-label">Zutaten</h4>
      <div className="form-group">
        <textarea rows={8} value={ingredientText} onChange={(e) => setIngredientText(e.target.value)}
          placeholder={'500 g Hackfleisch\n2 Zwiebeln\n1 Dose Tomaten\nSalz und Pfeffer'} />
      </div>
      <p className="hint">Eine Zutat pro Zeile. Grundvorrat wie Salz und Pfeffer wird beim Einplanen automatisch weggelassen.</p>
      <h4 className="form-label">Zubereitung</h4>
      <div className="form-group">
        <textarea rows={6} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </div>
      <div className="form-group">
        <label>Link<input type="url" value={link} placeholder="https://… (optional)" onChange={(e) => setLink(e.target.value)} /></label>
      </div>
    </Sheet>
  );
}

function ImportSheet({ onClose, onImported }: { onClose: () => void; onImported: (id: string) => void }) {
  const hid = useStore().householdId!;
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const recipe = draftToRecipe(await importFromLink(link), hid);
      store.saveRecipe(recipe);
      onClose();
      onImported(recipe.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Rezept importieren" onClose={onClose}
      action={<button className="link bold" disabled={!link || busy} onClick={run}>{busy ? '…' : 'Importieren'}</button>}>
      <div className="form-group">
        <label>Link<input type="url" autoFocus value={link} placeholder="https://www.chefkoch.de/rezepte/…" onChange={(e) => setLink(e.target.value)} /></label>
      </div>
      <p className="hint">Funktioniert mit Chefkoch und den meisten anderen Rezeptseiten.</p>
      {error && <p className="error">{error}</p>}
    </Sheet>
  );
}

function ChefkochSearch({ onBack, onOpen }: { onBack: () => void; onOpen: (r: SearchResult) => void }) {
  const [q, setQ] = useState(() => sessionStorage.getItem('ck-q') ?? '');
  const [results, setResults] = useState<SearchResult[]>(() => JSON.parse(sessionStorage.getItem('ck-results') ?? '[]'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await searchChefkoch(q.trim());
      setResults(r);
      sessionStorage.setItem('ck-q', q);
      sessionStorage.setItem('ck-results', JSON.stringify(r));
    } catch (e) {
      setError(`Suche fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="Chefkoch" left={<button className="link" onClick={onBack}>‹ Rezepte</button>} />
      <main className="content">
        <form onSubmit={(e) => { e.preventDefault(); void run(); }}>
          <input className="search" type="search" autoFocus value={q} placeholder="z. B. Lasagne, Linsencurry" enterKeyHint="search"
            onChange={(e) => setQ(e.target.value)} />
        </form>
        {busy && <div className="spinner" />}
        {error && <p className="error">{error}</p>}
        <ul className="list">
          {results.map((r) => (
            <li key={r.id}>
              <button className="list-row" onClick={() => onOpen(r)}>
                <RecipeImage src={r.image} className="thumb wide-thumb" />
                <span className="list-text">
                  <strong>{r.title}</strong>
                  <small>
                    {r.votes > 0 && `★ ${r.rating.toFixed(1)} (${r.votes})`}
                    {r.minutes > 0 && ` · ${r.minutes} Min.`}
                    {r.premium && ' · Plus'}
                  </small>
                </span>
                <span className="chevron">›</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}

function ChefkochPreview({ result, onBack }: { result: SearchResult; onBack: () => void }) {
  const { recipes, householdId } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState<Recipe | null>(null);
  const saved = recipes.find((r) => r.chefkoch_id === result.id);

  useEffect(() => {
    loadChefkoch(result.id).then(setDraft, (e) => setError(`Rezept konnte nicht geladen werden: ${e.message}`));
  }, [result.id]);

  const save = (): Recipe => {
    const recipe = draftToRecipe(draft!, householdId!);
    store.saveRecipe(recipe);
    return recipe;
  };

  return (
    <>
      <TopBar title={result.title} left={<button className="link" onClick={onBack}>‹ Suche</button>} />
      <main className="content">
        <RecipeImage src={draft?.image_url ?? result.image} className="hero" />
        {error && <p className="error">{error}</p>}
        {!draft && !error && <div className="spinner" />}
        {draft && (
          <>
            {saved ? (
              <>
                <p className="success">✓ In euren Rezepten gespeichert</p>
                <button className="primary wide" onClick={() => setPlanning(saved)}>📅 Zum Wochenplan hinzufügen</button>
              </>
            ) : (
              <div className="button-row">
                <button className="secondary" onClick={save}>Übernehmen</button>
                <button className="primary" onClick={() => setPlanning(save())}>Übernehmen & einplanen</button>
              </div>
            )}
            <div className="card">
              <h3>Zutaten für {draft.servings} Portionen</h3>
              <IngredientList ingredients={draft.ingredients} />
            </div>
            {draft.instructions && (
              <div className="card">
                <h3>Zubereitung</h3>
                <p className="instructions">{draft.instructions}</p>
              </div>
            )}
          </>
        )}
      </main>
      {planning && <PlanRecipeSheet recipe={planning} servings={planning.servings} onClose={() => setPlanning(null)} />}
    </>
  );
}
