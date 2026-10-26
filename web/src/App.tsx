import { useEffect, useState } from 'react';
import { isConfigured } from './config';
import { Recipes } from './components/Recipes';
import { Settings } from './components/Settings';
import { ShoppingList } from './components/ShoppingList';
import { WeekPlan } from './components/WeekPlan';
import { store, useStore } from './lib/store';
import { KitchenView } from './components/KitchenView';
import { isKitchenDevice, PAIRING_RE, redeemPairingCode } from './lib/pairing';

type Tab = 'list' | 'plan' | 'recipes' | 'more';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Haushalts-Code aus "#join=<uuid>" oder aus einem eingefügten Link/Code. */
export function parseHouseholdCode(text: string): string | null {
  const m = text.trim().match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m && UUID_RE.test(m[1]) ? m[1].toLowerCase() : null;
}

function readJoinHash(): string | null {
  return location.hash.startsWith('#join=') ? parseHouseholdCode(location.hash.slice(6)) : null;
}

export default function App() {
  const { householdId, member } = useStore();
  const [tab, setTab] = useState<Tab>('list');
  const [openRecipe, setOpenRecipe] = useState<{ id: string; n: number } | null>(null);
  const [kitchen, setKitchen] = useState(isKitchenDevice);

  // Beitritt per Link (#join=…). Der Hash bleibt in der Adresse, damit
  // "Zum Home-Bildschirm" den Haushalt mitnimmt.
  useEffect(() => {
    const check = () => {
      const id = readJoinHash();
      const current = store.getState().householdId;
      if (id && id !== current && (!current || confirm('Diesem Haushalt beitreten? Die Liste auf diesem Gerät wird ersetzt.'))) {
        store.joinHousehold(id);
      }
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, []);

  useEffect(() => {
    if (!householdId) return;
    if (!readJoinHash()) history.replaceState(null, '', `#join=${householdId}${kitchen ? '&kueche' : ''}`);
    const onVisible = () => (document.visibilityState === 'visible' ? store.startPolling() : store.stopPolling());
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      store.stopPolling();
    };
  }, [householdId, kitchen]);

  if (!householdId) return <Onboarding kitchen={kitchen} />;
  if (kitchen) return <KitchenView onExit={() => setKitchen(false)} />;
  if (!member.trim()) return <AskName />;

  return (
    <div className="app">
      <div className="screen" key={tab}>
        {tab === 'list' && <ShoppingList />}
        {tab === 'plan' && <WeekPlan onOpenRecipe={(id) => { setOpenRecipe({ id, n: Date.now() }); setTab('recipes'); }} />}
        {tab === 'recipes' && <Recipes key={openRecipe?.n} initialRecipeId={openRecipe?.id} />}
        {tab === 'more' && <Settings />}
      </div>
      <nav className="tabbar">
        {([
          ['list', '🛒', 'Einkauf'],
          ['plan', '📅', 'Wochenplan'],
          ['recipes', '📖', 'Rezepte'],
          ['more', '⚙️', 'Mehr'],
        ] as const).map(([key, icon, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => {
            setTab(key);
            if (key !== 'recipes') setOpenRecipe(null);
            window.scrollTo(0, 0);
          }}>
            <span className="tab-icon">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Einmalig: Name für die Kürzel auf der Liste */
function AskName() {
  const [name, setName] = useState('');
  return (
    <main className="onboarding">
      <div className="hero-emoji">👋</div>
      <h1>Wie heißt du?</h1>
      <p className="muted-text">Damit ihr seht, wer was auf die Liste geschrieben hat, und wer gerade einkaufen ist.</p>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (name.trim()) store.setMember(name); }}>
        <input className="search" autoFocus value={name} maxLength={20} placeholder="Dein Vorname" onChange={(e) => setName(e.target.value)} />
        <button className="primary wide" disabled={!name.trim()}>Weiter</button>
      </form>
    </main>
  );
}

function Onboarding({ kitchen }: { kitchen: boolean }) {
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(kitchen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseHouseholdCode(code);
  const pairing = PAIRING_RE.test(code.trim().toUpperCase());

  const join = async () => {
    setError(null);
    if (parsed) {
      store.joinHousehold(parsed);
      return;
    }
    if (!pairing) return;
    setBusy(true);
    try {
      const id = await redeemPairingCode(code);
      if (id) store.joinHousehold(id);
      else setError('Code ungültig oder abgelaufen. Bitte am Handy einen neuen erzeugen.');
    } catch (e) {
      setError(`Keine Verbindung: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="onboarding">
      <div className="hero-emoji">{kitchen ? '👩‍🍳' : '🛒'}</div>
      <h1>{kitchen ? 'Küchen-Display' : 'Einkauf'}</h1>
      <p className="muted-text">
        {kitchen
          ? 'Am Handy unter Mehr → Küchen-Display einen Code erzeugen und hier eingeben.'
          : 'Gemeinsame Einkaufsliste und Wochenplan – für euch beide.'}
      </p>
      {!isConfigured && (
        <p className="warning">Supabase ist noch nicht eingerichtet. Trage URL und Key in <code>web/src/config.ts</code> ein (siehe README).</p>
      )}
      {!joining ? (
        <div className="stack">
          <button className="primary wide" onClick={() => store.createHousehold()}>Neuen Haushalt anlegen</button>
          <button className="secondary wide" onClick={() => setJoining(true)}>Haushalt beitreten</button>
          <p className="hint center">
            Zum Beitreten den QR-Code vom anderen Handy (Mehr → Haushalt teilen) mit der Kamera scannen oder den Code hier einfügen.
          </p>
        </div>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void join(); }}>
          <input className={`search ${kitchen ? 'pair-input' : ''}`} autoFocus value={code} autoCapitalize="characters" autoComplete="off"
            placeholder={kitchen ? 'z. B. K7QX2M' : 'Kopplungscode, Haushalts-Code oder Link'} onChange={(e) => setCode(e.target.value)} />
          <button className="primary wide" disabled={(!parsed && !pairing) || busy}>{busy ? '…' : 'Verbinden'}</button>
          {error && <p className="error center">{error}</p>}
          {!kitchen && <button type="button" className="link" onClick={() => setJoining(false)}>Zurück</button>}
        </form>
      )}
    </main>
  );
}
