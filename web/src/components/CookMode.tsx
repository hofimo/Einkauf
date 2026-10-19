import { useEffect, useMemo, useRef, useState } from 'react';
import { findTimers, formatTime, ingredientsInStep, splitSteps } from '../lib/cooking';
import { formatQuantity } from '../lib/quantity';
import type { Recipe } from '../lib/types';
import { IngredientList } from './Recipes';
import { Stepper, useWakeLock } from './ui';

interface RunningTimer {
  id: number;
  label: string;
  endsAt: number;
  rang: boolean;
}

/** Kochmodus: Schritt für Schritt, große Schrift, Timer zum Antippen, Bildschirm bleibt an. */
export function CookMode({ recipe, servings: initialServings, onClose }: {
  recipe: Recipe;
  servings?: number;
  onClose: () => void;
}) {
  useWakeLock();
  const steps = useMemo(() => splitSteps(recipe.instructions), [recipe.instructions]);
  const [servings, setServings] = useState(initialServings ?? recipe.servings);
  const [index, setIndex] = useState(0); // 0 = Zutaten-Übersicht, 1… = Schritte
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const audio = useRef<AudioContext | null>(null);
  const scale = servings / Math.max(recipe.servings, 1);

  // Sekundentakt für die Timer
  useEffect(() => {
    if (timers.length === 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [timers.length]);

  // Abgelaufene Timer klingeln lassen
  useEffect(() => {
    const due = timers.filter((t) => !t.rang && t.endsAt <= now);
    if (due.length === 0) return;
    beep(audio.current);
    navigator.vibrate?.([300, 150, 300]);
    setTimers((list) => list.map((t) => (due.some((d) => d.id === t.id) ? { ...t, rang: true } : t)));
  }, [now, timers]);

  const startTimer = (label: string, seconds: number) => {
    // Ton erst nach einer Berührung möglich (iOS) – daher hier vorbereiten
    audio.current ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    void audio.current.resume();
    setNow(Date.now());
    setTimers((list) => [...list, { id: Date.now(), label, endsAt: Date.now() + seconds * 1000, rang: false }]);
  };

  const step = index > 0 ? steps[index - 1] : '';
  const stepIngredients = step ? ingredientsInStep(step, recipe.ingredients) : [];
  const stepTimers = step ? findTimers(step) : [];
  const last = steps.length;

  return (
    <div className="cookmode" role="dialog" aria-label={`Kochmodus: ${recipe.title}`}>
      <header className="cook-head">
        <button className="icon-btn" onClick={onClose} aria-label="Kochmodus beenden">✕</button>
        <h1>{recipe.title}</h1>
        <span className="cook-pos">{index === 0 ? 'Zutaten' : `${index}/${last}`}</span>
      </header>

      {timers.length > 0 && (
        <div className="timers">
          {timers.map((t) => {
            const left = (t.endsAt - now) / 1000;
            return (
              <button key={t.id} className={`timer ${t.rang ? 'ringing' : ''}`}
                onClick={() => setTimers((list) => list.filter((x) => x.id !== t.id))}
                aria-label={`${t.label}, ${t.rang ? 'abgelaufen' : `noch ${formatTime(left)}`}, antippen zum Entfernen`}>
                <span>⏱ {t.rang ? 'Fertig!' : formatTime(left)}</span>
                <small>{t.label}</small>
              </button>
            );
          })}
        </div>
      )}

      <div className="cook-dots" aria-hidden="true">
        {Array.from({ length: last + 1 }, (_, i) => (
          <span key={i} className={i === index ? 'on' : i < index ? 'done' : ''} />
        ))}
      </div>

      <main className="cook-body">
        {index === 0 ? (
          <>
            <Stepper value={servings} onChange={setServings} label={(v) => `${v} Portionen`} />
            <IngredientList ingredients={recipe.ingredients} scale={scale} />
            {last === 0 && <p className="hint">Dieses Rezept hat keine Zubereitungsschritte.</p>}
          </>
        ) : (
          <>
            <p className="cook-step">{step}</p>
            {stepIngredients.length > 0 && (
              <div className="cook-ings">
                {stepIngredients.map((ing) => (
                  <span key={ing.id} className="cook-ing">
                    <b>{formatQuantity(ing.amount == null ? null : ing.amount * scale, ing.unit)}</b> {ing.name}
                  </span>
                ))}
              </div>
            )}
            {stepTimers.map((t) => (
              <button key={t.label} className="secondary wide cook-timer-btn" onClick={() => startTimer(t.label, t.seconds)}>
                ⏱ Timer: {t.label}
              </button>
            ))}
          </>
        )}
      </main>

      <footer className="cook-nav">
        <button className="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>‹ Zurück</button>
        {index < last ? (
          <button className="primary" onClick={() => setIndex(index + 1)}>{index === 0 ? 'Los geht\'s ›' : 'Weiter ›'}</button>
        ) : (
          <button className="primary" onClick={onClose}>Guten Appetit! 🍽️</button>
        )}
      </footer>
    </div>
  );
}

/** Drei kurze Töne, ohne Audiodatei. */
function beep(ctx: AudioContext | null) {
  if (!ctx) return;
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.35 + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.35);
    osc.stop(ctx.currentTime + i * 0.35 + 0.3);
  }
}
