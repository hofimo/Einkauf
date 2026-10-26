import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { INTOLERANCES } from '../lib/intolerance';
import { createPairingCode, setKitchenDevice } from '../lib/pairing';
import { disablePush, enablePush, pushStatus, sendTestPush, type PushStatus } from '../lib/push';
import { SUPABASE_KEY, SUPABASE_URL } from '../config';
import { orderedCategories, settingsOf, store, useStore } from '../lib/store';
import { TopBar } from './ui';

export const joinLink = (id: string) => `${location.origin}${location.pathname}#join=${id}`;

type Page = 'main' | 'share' | 'siri' | 'order' | 'kitchen';

export function Settings() {
  const [page, setPage] = useState<Page>('main');
  const back = <button className="link" onClick={() => setPage('main')}>‹ Mehr</button>;
  if (page === 'share') return <><TopBar title="Haushalt teilen" left={back} /><SharePage /></>;
  if (page === 'siri') return <><TopBar title="Siri & Alexa" left={back} /><VoicePage /></>;
  if (page === 'order') return <><TopBar title="Reihenfolge im Laden" left={back} /><OrderPage /></>;
  if (page === 'kitchen') return <><TopBar title="Küchen-Display" left={back} /><KitchenPage /></>;
  return <><TopBar title="Mehr" /><MainPage go={setPage} /></>;
}

function MainPage({ go }: { go: (p: Page) => void }) {
  const state = useStore();
  const { staples, sync, lastSync, outbox } = state;
  const settings = settingsOf(state);
  const [newStaple, setNewStaple] = useState('');
  const sorted = useMemo(() => [...staples].sort((a, b) => a.name.localeCompare(b.name, 'de')), [staples]);

  const status =
    sync.kind === 'ok' ? (outbox.length ? `${outbox.length} ausstehend` : 'Aktuell')
    : sync.kind === 'syncing' ? 'Synchronisiere …'
    : sync.kind === 'offline' ? `Offline – ${outbox.length} Änderungen warten`
    : sync.kind === 'error' ? sync.message : '–';

  return (
    <main className="content">
      <h3 className="section-title first">Du</h3>
      <ul className="list">
        <li>
          <label className="list-row">
            <span className="list-text">Dein Name</span>
            <input className="inline-input" value={state.member} placeholder="z. B. Timo" maxLength={20}
              onChange={(e) => store.setMember(e.target.value)} />
          </label>
        </li>
        <li><PushRow /></li>
      </ul>
      <p className="hint">Der Name erscheint als Kürzel auf allem, was du einträgst. Push-Nachrichten bekommst du, wenn {'der/die andere'} einkaufen geht.</p>

      <h3 className="section-title">Haushalt</h3>
      <ul className="list">
        <li><button className="list-row" onClick={() => go('share')}>👥 <span className="list-text">Haushalt teilen</span><span className="chevron">›</span></button></li>
        <li><button className="list-row" onClick={() => go('siri')}>🎙 <span className="list-text">Siri & Alexa einrichten</span><span className="chevron">›</span></button></li>
        <li><button className="list-row" onClick={() => go('kitchen')}>📺 <span className="list-text">Küchen-Display (Echo Show)</span><span className="chevron">›</span></button></li>
      </ul>

      <h3 className="section-title">Einkauf & Wochenplan</h3>
      <ul className="list">
        <li>
          <label className="list-row">
            <span className="list-text">Woche beginnt am</span>
            <select className="inline-select" value={settings.week_start}
              onChange={(e) => store.updateSettings({ week_start: Number(e.target.value) })}>
              {WEEKDAYS.map((name, i) => <option key={i} value={(i + 1) % 7}>{name}</option>)}
            </select>
          </label>
        </li>
        <li>
          <button className="list-row" onClick={() => go('order')}>
            <span className="list-text">Reihenfolge im Laden</span><span className="chevron">›</span>
          </button>
        </li>
      </ul>
      <p className="hint">Gilt für euch beide. Zum Beispiel Freitag als Starttag, wenn ihr freitags einkauft.</p>

      <IntolerancesSection />

      <h3 className="section-title">Grundvorrat</h3>
      <ul className="list">
        {sorted.map((s) => (
          <li key={s.id} className="list-row">
            <span className="list-text">{s.name}</span>
            <button className="icon-btn muted" aria-label={`${s.name} entfernen`} onClick={() => store.removeStaple(s)}>✕</button>
          </li>
        ))}
        <li>
          <form className="list-row" onSubmit={(e) => { e.preventDefault(); store.addStaple(newStaple); setNewStaple(''); }}>
            <input className="bare" value={newStaple} placeholder="Hinzufügen …" onChange={(e) => setNewStaple(e.target.value)} />
            <button className="link bold" disabled={!newStaple.trim()}>Hinzufügen</button>
          </form>
        </li>
      </ul>
      <p className="hint">
        Diese Zutaten habt ihr immer zu Hause. Beim Einplanen eines Gerichts kommen sie nicht auf die Liste.
        „Öl“ erfasst auch Olivenöl, Rapsöl usw.
      </p>

      <h3 className="section-title">Synchronisation</h3>
      <ul className="list">
        <li className="list-row"><span className="list-text">Status</span><span className="muted-text">{status}</span></li>
        {lastSync && (
          <li className="list-row"><span className="list-text">Zuletzt</span>
            <span className="muted-text">{new Date(lastSync).toLocaleTimeString('de-DE')}</span></li>
        )}
        <li><button className="list-row link" onClick={() => void store.syncNow(true)}>Jetzt synchronisieren</button></li>
      </ul>

      <button className="danger-row" onClick={() => {
        if (confirm('Haushalt auf diesem Gerät verlassen? Die Daten bleiben auf dem Server, mit dem Code kannst du wieder beitreten.')) {
          history.replaceState(null, '', location.pathname);
          store.leaveHousehold();
        }
      }}>Haushalt verlassen</button>
    </main>
  );
}

function PushRow() {
  const { householdId, member } = useStore();
  const [status, setStatus] = useState<PushStatus | 'busy'>('busy');
  const [error, setError] = useState<string | null>(null);
  const [testInfo, setTestInfo] = useState<string | null>(null);

  const test = async () => {
    if (!householdId) return;
    setError(null);
    setTestInfo('Wird gesendet …');
    try {
      const sent = await sendTestPush(householdId);
      setTestInfo(sent > 0
        ? `An ${sent} ${sent === 1 ? 'Gerät' : 'Geräte'} gesendet. Kommt gleich oben als Mitteilung.`
        : 'Kein Gerät angemeldet – Push erst einschalten.');
    } catch (e) {
      setTestInfo(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    pushStatus().then(setStatus, () => setStatus('unsupported'));
  }, []);

  const toggle = async () => {
    if (!householdId) return;
    setError(null);
    const before = status;
    setStatus('busy');
    try {
      if (before === 'on') {
        await disablePush(householdId);
        setStatus('off');
      } else {
        setStatus(await enablePush(householdId, member));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(before);
    }
  };

  const text: Record<PushStatus | 'busy', string> = {
    busy: '…',
    on: 'An',
    off: 'Einschalten',
    denied: 'Blockiert',
    'needs-install': 'Nicht verfügbar',
    unsupported: 'Nicht verfügbar',
  };
  const help: Partial<Record<PushStatus | 'busy', string>> = {
    denied: 'Erlauben unter iPhone-Einstellungen → Mitteilungen → Einkauf.',
    'needs-install': 'Geht nur in der App vom Home-Bildschirm (Safari → Teilen → Zum Home-Bildschirm).',
    unsupported: 'Dieser Browser kann keine Push-Nachrichten empfangen.',
  };
  const canToggle = status === 'on' || status === 'off';

  return (
    <>
      <button className="list-row" disabled={!canToggle} onClick={toggle}>
        <span className="list-text">🔔 Push-Nachrichten</span>
        <span className={status === 'on' ? 'on-text' : status === 'off' ? 'link' : 'muted-text'}>{text[status]}</span>
      </button>
      {help[status] && <p className="hint small-pad">{help[status]}</p>}
      {status === 'on' && (
        <button className="list-row link" onClick={test}>Test-Nachricht an mich senden</button>
      )}
      {testInfo && <p className="hint small-pad">{testInfo}</p>}
      {error && <p className="error small-pad">{error}</p>}
    </>
  );
}

function IntolerancesSection() {
  const settings = settingsOf(useStore());
  const [word, setWord] = useState('');

  const toggle = (key: string) => {
    const has = settings.intolerances.includes(key);
    store.updateSettings({ intolerances: has ? settings.intolerances.filter((k) => k !== key) : [...settings.intolerances, key] });
  };
  const addWord = () => {
    const w = word.trim();
    if (!w || settings.avoid_words.some((x) => x.toLowerCase() === w.toLowerCase())) return;
    store.updateSettings({ avoid_words: [...settings.avoid_words, w] });
    setWord('');
  };

  return (
    <>
      <h3 className="section-title">Unverträglichkeiten</h3>
      <ul className="list">
        {INTOLERANCES.map((i) => (
          <li key={i.key}>
            <label className="list-row switch-row">
              <span className="list-text">{i.emoji} {i.label}</span>
              <input type="checkbox" role="switch" checked={settings.intolerances.includes(i.key)} onChange={() => toggle(i.key)} />
            </label>
          </li>
        ))}
        {settings.avoid_words.map((w) => (
          <li key={w} className="list-row">
            <span className="list-text">🚫 {w}</span>
            <button className="icon-btn muted" aria-label={`${w} entfernen`}
              onClick={() => store.updateSettings({ avoid_words: settings.avoid_words.filter((x) => x !== w) })}>✕</button>
          </li>
        ))}
        <li>
          <form className="list-row" onSubmit={(e) => { e.preventDefault(); addWord(); }}>
            <input className="bare" value={word} placeholder="Weitere Zutat meiden, z. B. Zwiebel" onChange={(e) => setWord(e.target.value)} />
            <button className="link bold" disabled={!word.trim()}>Hinzufügen</button>
          </form>
        </li>
      </ul>
      <p className="hint">
        Gerichte-Match schlägt nichts vor, was solche Zutaten enthält, und bei Rezepten erscheint ein Warnhinweis.
        Die Erkennung läuft über die Zutatennamen und ersetzt keine ärztliche Beratung.
      </p>
    </>
  );
}

// Montag zuerst; Wert im Select ist JS-getDay (0 = Sonntag)
const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

/** Abteilungen per Pfeil in die Laufreihenfolge des eigenen Supermarkts bringen. */
function OrderPage() {
  const order = settingsOf(useStore()).category_order;
  const cats = orderedCategories(order);

  const move = (index: number, delta: number) => {
    const names = cats.map((c) => c.name);
    const [moved] = names.splice(index, 1);
    names.splice(index + delta, 0, moved);
    store.updateSettings({ category_order: names });
  };

  return (
    <main className="content">
      <p className="hint">So, wie ihr durch euren Laden lauft. In dieser Reihenfolge erscheinen die Artikel auf der Einkaufsliste.</p>
      <ul className="list">
        {cats.map((c, i) => (
          <li key={c.key} className="list-row">
            <span className="order-n">{i + 1}</span>
            <span className="list-text">{c.emoji} {c.name}</span>
            <button className="icon-btn order-btn" aria-label={`${c.name} nach oben`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="icon-btn order-btn" aria-label={`${c.name} nach unten`} disabled={i === cats.length - 1} onClick={() => move(i, 1)}>↓</button>
          </li>
        ))}
      </ul>
      {order.length > 0 && (
        <button className="danger-row" onClick={() => store.updateSettings({ category_order: [] })}>Standard-Reihenfolge</button>
      )}
    </main>
  );
}

/** Echo Show o. ä. als Küchen-Display koppeln */
function KitchenPage() {
  const { householdId } = useStore();
  const [pairing, setPairing] = useState<{ code: string; expiresAt: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!pairing) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [pairing]);

  const create = async () => {
    if (!householdId) return;
    setError(null);
    try {
      setPairing(await createPairingCode(householdId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const left = pairing ? Math.max(0, Math.round((pairing.expiresAt.getTime() - Date.now()) / 1000)) : 0;
  const url = `${location.origin}${location.pathname}#kueche`;

  return (
    <main className="content prose">
      <p>Auf einem Echo Show (oder Tablet) zeigt die Küchen-Ansicht dauerhaft euren Wochenplan und das heutige Gericht – mit Kochmodus zum Antippen.</p>
      <ol className="steps">
        <Step n={1}>Am Echo Show: <b>„Alexa, öffne Silk“</b> (der Browser).</Step>
        <Step n={2}>Diese Adresse eingeben:<Copy value={url} /></Step>
        <Step n={3}>
          Code erzeugen und dort eingeben:
          {pairing && left > 0 ? (
            <div className="pair-code">
              <span>{pairing.code}</span>
              <small>noch {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} gültig</small>
            </div>
          ) : (
            <button className="primary wide pair-btn" onClick={() => void create()}>{pairing ? 'Neuen Code erzeugen' : 'Kopplungscode erzeugen'}</button>
          )}
          {error && <p className="error">{error}</p>}
        </Step>
        <Step n={4}>Optional in Silk die Seite als Lesezeichen speichern – dann reicht künftig „Alexa, öffne Silk“.</Step>
      </ol>
      <h3>Dieses Gerät</h3>
      <p>Du kannst auch dieses Gerät (z. B. ein altes Tablet) zur Küchen-Ansicht machen:</p>
      <button className="secondary wide" onClick={() => { setKitchenDevice(true); location.hash = `join=${householdId}&kueche`; location.reload(); }}>
        📺 Als Küchen-Display anzeigen
      </button>
    </main>
  );
}

function Copy({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="copy">
      {label && <small>{label}</small>}
      <code>{value}</code>
      <button className="link" onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}>{done ? '✓ Kopiert' : 'Kopieren'}</button>
    </div>
  );
}

function SharePage() {
  const id = useStore().householdId!;
  const link = joinLink(id);
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }, [link]);

  return (
    <main className="content">
      <p className="hint center">
        Auf dem anderen iPhone die Kamera auf den Code richten und den Link öffnen.
        Danach dort in Safari <b>Teilen → Zum Home-Bildschirm</b> wählen.
      </p>
      <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="button-row">
        {'share' in navigator && (
          <button className="secondary" onClick={() => navigator.share({ title: 'Einkauf', url: link }).catch(() => undefined)}>Link senden</button>
        )}
      </div>
      <Copy label="Link" value={link} />
      <Copy label="Haushalts-Code (auch für Alexa und Siri)" value={id} />
    </main>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return <li className="step"><span className="step-n">{n}</span><div>{children}</div></li>;
}

function VoicePage() {
  const id = useStore().householdId!;
  const legacy = SUPABASE_KEY.startsWith('eyJ');
  return (
    <main className="content prose">
      <h3>Siri: „Hey Siri, Einkauf“</h3>
      <p>Siri fragt „Was soll auf die Einkaufsliste?“, du sagst zum Beispiel „Brot, Butter und zwei Liter Milch“. Dafür legst du einmal einen Kurzbefehl an:</p>
      <ol className="steps">
        <Step n={1}>App <b>Kurzbefehle</b> öffnen → <b>＋</b> → oben den Namen auf <b>Einkauf</b> setzen. So lautet später der Sprachbefehl.</Step>
        <Step n={2}>Aktion <b>„Nach Eingabe fragen“</b> hinzufügen. Frage: <i>Was soll auf die Einkaufsliste?</i></Step>
        <Step n={3}>
          Aktion <b>„Inhalte von URL abrufen“</b> hinzufügen. URL:
          <Copy value={`${SUPABASE_URL}/rest/v1/rpc/add_items`} />
          Auf den Pfeil tippen: <b>Methode</b> POST. Unter <b>Header</b> hinzufügen:
          <Copy label="Schlüssel: apikey" value={SUPABASE_KEY} />
          {legacy && <Copy label="Schlüssel: Authorization" value={`Bearer ${SUPABASE_KEY}`} />}
          <Copy label="Schlüssel: x-household-id" value={id} />
          <Copy label="Schlüssel: Accept" value="text/plain" />
          <b>Hauptteil anfordern:</b> JSON mit zwei Textfeldern:
          <ul>
            <li><code>items</code> → Variable <b>Bereitgestellte Eingabe</b></li>
            <li><code>src</code> → <i>Siri</i></li>
          </ul>
        </Step>
        <Step n={4}>Aktion <b>„Text sprechen“</b> mit der Variablen <b>Inhalte von URL</b>. Dann sagt Siri zum Beispiel „Brot steht auf der Liste.“</Step>
      </ol>
      <p>Optional einen zweiten Kurzbefehl <b>„Was steht auf der Liste“</b> anlegen: wie oben, aber ohne Schritt 2. Die URL endet auf <code>/rpc/list_items</code>, als JSON-Hauptteil reicht ein leeres Feld.</p>

      <h3>Alexa</h3>
      <p>„Alexa, sag Einkauf, ich brauche Brot“, „Alexa, öffne Einkauf“ (dann einfach die Artikel nennen) oder „Alexa, frag Einkauf, was auf der Liste steht“. Sätze mit „auf die Liste“ meiden, die landen sonst auf Amazons eigener Einkaufsliste.</p>
      <p>Einmalig den Skill anlegen (Anleitung im README, Ordner <code>alexa/</code>). Dabei wird dieser Haushalts-Code gebraucht:</p>
      <Copy value={id} />
    </main>
  );
}
