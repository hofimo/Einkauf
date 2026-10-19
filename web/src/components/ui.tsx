import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useStore } from '../lib/store';

/** Bottom-Sheet im iOS-Stil. */
export function Sheet({ title, onClose, children, action }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  action?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          <button className="link" onClick={onClose}>Abbrechen</button>
          <h2>{title}</h2>
          <div className="sheet-action">{action}</div>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function TopBar({ title, left, right }: { title: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-side">{left}</div>
      <h1>{title}</h1>
      <div className="topbar-side right">{right}</div>
    </header>
  );
}

export function SyncBadge() {
  const { sync, outbox } = useStore();
  if (sync.kind === 'offline') {
    return <span className="badge warn" title={sync.message}>Offline{outbox.length ? ` (${outbox.length})` : ''}</span>;
  }
  if (sync.kind === 'error') {
    return <span className="badge err" title={sync.message} onClick={() => alert(sync.message)}>Fehler</span>;
  }
  return null;
}

export function RecipeImage({ src, className }: { src: string | null | undefined; className?: string }) {
  return src ? (
    <img className={`recipe-img ${className ?? ''}`} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <div className={`recipe-img placeholder ${className ?? ''}`}>🍽️</div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 20, label }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: (v: number) => string;
}) {
  return (
    <div className="stepper">
      <span>{label(value)}</span>
      <div>
        <button aria-label="weniger" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
        <button aria-label="mehr" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}


/** Kürzel mit fester Farbe pro Name, z. B. "T" für Timo */
export function MemberBadge({ name }: { name: string }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = [152, 24, 210, 280, 340, 45][hash % 6];
  return (
    <span className="who" title={`von ${name}`} style={{ '--who': `hsl(${hue} 65% 42%)` } as CSSProperties}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Hält den Bildschirm an, solange die Komponente sichtbar ist (Einkaufs- und Kochmodus). */
export function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
    if (!wl) return;
    let sentinel: Sentinel | null = null;
    let active = true;
    const acquire = async () => {
      try {
        if (active && document.visibilityState === 'visible') sentinel = await wl.request('screen');
      } catch {
        // z. B. Energiesparmodus – dann eben nicht
      }
    };
    const onVisible = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, []);
}
