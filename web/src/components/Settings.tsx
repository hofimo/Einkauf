import qrcode from 'qrcode-generator';
import { useMemo, useState, type ReactNode } from 'react';
import { SUPABASE_KEY, SUPABASE_URL } from '../config';
import { store, useStore } from '../lib/store';
import { TopBar } from './ui';

export const joinLink = (id: string) => `${location.origin}${location.pathname}#join=${id}`;

type Page = 'main' | 'share' | 'siri';

export function Settings() {
  const [page, setPage] = useState<Page>('main');
  const back = <button className="link" onClick={() => setPage('main')}>‹ Mehr</button>;
  if (page === 'share') return <><TopBar title="Haushalt teilen" left={back} /><SharePage /></>;
  if (page === 'siri') return <><TopBar title="Siri & Alexa" left={back} /><VoicePage /></>;
  return <><TopBar title="Mehr" /><MainPage go={setPage} /></>;
}

function MainPage({ go }: { go: (p: Page) => void }) {
  const { staples, sync, lastSync, outbox } = useStore();
  const [newStaple, setNewStaple] = useState('');
  const sorted = useMemo(() => [...staples].sort((a, b) => a.name.localeCompare(b.name, 'de')), [staples]);

  const status =
    sync.kind === 'ok' ? (outbox.length ? `${outbox.length} ausstehend` : 'Aktuell')
    : sync.kind === 'syncing' ? 'Synchronisiere …'
    : sync.kind === 'offline' ? `Offline – ${outbox.length} Änderungen warten`
    : sync.kind === 'error' ? sync.message : '–';

  return (
    <main className="content">
      <ul className="list">
        <li><button className="list-row" onClick={() => go('share')}>👥 <span className="list-text">Haushalt teilen</span><span className="chevron">›</span></button></li>
        <li><button className="list-row" onClick={() => go('siri')}>🎙 <span className="list-text">Siri & Alexa einrichten</span><span className="chevron">›</span></button></li>
      </ul>

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
      <p>„Alexa, öffne Einkauf und schreibe Brot auf die Liste“ oder „Alexa, frag Einkauf, was auf der Liste steht“.</p>
      <p>Einmalig den Skill anlegen (Anleitung im README, Ordner <code>alexa/</code>). Dabei wird dieser Haushalts-Code gebraucht:</p>
      <Copy value={id} />
    </main>
  );
}
