import { describe, expect, it } from 'vitest';
import { categoryFor, emojiFor } from './catalog';
import { DEFAULT_STAPLES, isStaple, parseIngredient, splitSpoken } from './parser';
import { combineQuantities, formatQuantity } from './quantity';

describe('Zutaten-Parser', () => {
  const cases: [string, number | null, string, string, string][] = [
    ['200 g Mehl', 200, 'g', 'Mehl', ''],
    ['1/2 TL Salz', 0.5, 'TL', 'Salz', ''],
    ['1 ½ Liter Milch', 1.5, 'Liter', 'Milch', ''],
    ['2-3 Zwiebel(n)', 3, '', 'Zwiebel(n)', ''],
    ['etwas Rotwein (und Brühe)', null, 'etwas', 'Rotwein', 'und Brühe'],
    ['1 Dose Tomaten, geschälte (800 g)', 1, 'Dose', 'Tomaten, geschälte', '800 g'],
    ['2 große Kartoffeln', 2, '', 'große Kartoffeln', ''],
    ['zwei Liter Milch', 2, 'Liter', 'Milch', ''],
    ['Brot', null, '', 'Brot', ''],
  ];
  it.each(cases)('%s', (line, amount, unit, name, note) => {
    expect(parseIngredient(line)).toMatchObject({ amount, unit, name, note });
  });
  it('teilt gesprochene Listen', () => {
    expect(splitSpoken('Brot, 2 Liter Milch und Eier')).toEqual(['Brot', '2 Liter Milch', 'Eier']);
  });
});

describe('Grundvorrat', () => {
  it.each([
    ['Salz und Pfeffer', true], ['Olivenöl', true], ['Sonnenblumenöl', true], ['Fett für die Form', true],
    ['Muskatnuss, frisch geriebene', true], ['Gemüsebrühe', true], ['Pfeffer, schwarzer', true],
    ['Zuckerschoten', false], ['Essiggurken', false], ['Salzstangen', false], ['Hackfleisch, gemischtes', false],
    ['Zwiebel(n)', false], ['Butter', false],
  ] as const)('%s → %s', (name, expected) => {
    expect(isStaple(name, DEFAULT_STAPLES)).toBe(expected);
  });
});

describe('Mengen', () => {
  it('fasst zusammen', () => {
    expect(combineQuantities('500 g', '750 g')).toBe('1,25 kg');
    expect(combineQuantities('1 l', '200 ml')).toBe('1,2 l');
    expect(combineQuantities('1 Dose', '200 g')).toBe('1 Dose + 200 g');
    expect(combineQuantities('2', '3')).toBe('5');
  });
  it('rundet Zählbares für den Einkauf auf', () => {
    expect(formatQuantity(4.5, '', true)).toBe('5');
    expect(formatQuantity(4.5, '')).toBe('4,5');
    expect(formatQuantity(333, 'g', true)).toBe('335 g');
  });
});

describe('Abteilungen', () => {
  it.each([
    ['Reis', 'Nudeln, Reis & Konserven'], ['Tomatenmark', 'Nudeln, Reis & Konserven'],
    ['Weintrauben', 'Obst & Gemüse'], ['Eistee', 'Getränke'], ['Klopapier', 'Drogerie & Haushalt'],
    ['Salami', 'Wurst'], ['Putenschinken', 'Wurst'], ['Fleischwurst', 'Wurst'], ['Bacon', 'Wurst'],
    ['Eier', 'Eier'], ['Hackfleisch', 'Fleisch & Fisch'], ['Gouda', 'Milch & Käse'],
    ['Hähnchenbrust', 'Fleisch & Fisch'], ['Wassermelone', 'Obst & Gemüse'], ['Irgendwas', 'Sonstiges'],
  ])('%s → %s', (name, cat) => {
    expect(categoryFor(name)).toBe(cat);
  });
  it('liefert Emojis', () => expect(emojiFor('Bananen')).toBe('🍌'));
});

describe('Wochenstart', async () => {
  const { startOfWeek, dayKey } = await import('../components/WeekPlan');
  const mo = new Date(2026, 9, 19); // Montag, 19.10.2026
  it.each([
    [1, mo, '2026-10-19'],                      // Montag-Woche, Montag
    [1, new Date(2026, 9, 25), '2026-10-19'],   // Montag-Woche, Sonntag
    [5, mo, '2026-10-16'],                      // Freitag-Woche, Montag → letzter Freitag
    [5, new Date(2026, 9, 23), '2026-10-23'],   // Freitag-Woche, Freitag
    [0, mo, '2026-10-18'],                      // Sonntag-Woche
  ])('Start %i für %s', (first, date, expected) => {
    expect(dayKey(startOfWeek(date as Date, first as number))).toBe(expected);
  });
});

describe('Laufreihenfolge', async () => {
  const { orderedCategories, openByCategory } = await import('./store');
  it('nutzt die eigene Reihenfolge, Rest hinten', () => {
    const names = orderedCategories(['Brot & Backwaren', 'Obst & Gemüse']).map((c) => c.name);
    expect(names[0]).toBe('Brot & Backwaren');
    expect(names.indexOf('Obst & Gemüse')).toBeGreaterThan(0);
    expect(names.indexOf('Fleisch & Fisch')).toBe(names.indexOf('Obst & Gemüse') + 1);
    expect(names).toHaveLength(13);
  });
  it('Standard ist die Aldi-Reihenfolge', () => {
    expect(orderedCategories([]).map((c) => c.name)).toEqual([
      'Obst & Gemüse', 'Fleisch & Fisch', 'Eier', 'Brot & Backwaren', 'Nudeln, Reis & Konserven', 'Süßes & Snacks',
      'Getränke', 'Drogerie & Haushalt', 'Milch & Käse', 'Wurst', 'Gewürze & Backen', 'Tiefkühl', 'Sonstiges']);
  });
  it('fügt neue Abteilungen in eine alte gespeicherte Reihenfolge ein', () => {
    const old = ['Obst & Gemüse', 'Brot & Backwaren', 'Nudeln, Reis & Konserven', 'Milch & Käse', 'Fleisch & Fisch',
      'Gewürze & Backen', 'Tiefkühl', 'Süßes & Snacks', 'Getränke', 'Drogerie & Haushalt', 'Sonstiges'];
    const names = orderedCategories(old).map((c) => c.name);
    expect(names.indexOf('Wurst')).toBe(names.indexOf('Milch & Käse') + 1);
    expect(names.indexOf('Eier')).toBe(names.indexOf('Fleisch & Fisch') + 1);
  });
  it('sortiert die Liste entsprechend', () => {
    const item = (name: string, category: string) => ({ id: name, household_id: 'h', name, quantity: '', note: '', category,
      checked: false, checked_at: null, source: '', added_by: '', created_at: '', updated_at: '' });
    const groups = openByCategory([item('Milch', 'Milch & Käse'), item('Nudeln', 'Nudeln, Reis & Konserven')],
      ['Nudeln, Reis & Konserven']);
    expect(groups.map((g) => g.category.name)).toEqual(['Nudeln, Reis & Konserven', 'Milch & Käse']);
  });
});

describe('Kochmodus', async () => {
  const { splitSteps, findTimers, ingredientsInStep, formatTime } = await import('./cooking');
  const { parseIngredient } = await import('./parser');
  it('teilt Absätze und Nummerierung in Schritte', () => {
    expect(splitSteps('Zwiebeln schälen.\n\nIm Topf anbraten.')).toEqual(['Zwiebeln schälen.', 'Im Topf anbraten.']);
    expect(splitSteps('1. Wasser kochen\n2. Nudeln rein\n3. Abgießen')).toEqual(['Wasser kochen', 'Nudeln rein', 'Abgießen']);
  });
  it('teilt lange Blöcke in Satzgruppen', () => {
    const long = Array.from({ length: 8 }, (_, i) => `Das ist Satz Nummer ${i + 1} mit etwas mehr Text darin.`).join(' ');
    const steps = splitSteps(long);
    expect(steps.length).toBeGreaterThan(1);
    expect(steps.join(' ')).toBe(long);
  });
  it.each([
    ['Bei 180 Grad ca. 20 Minuten backen.', [1200]],
    ['10-15 Min. köcheln lassen', [900]],
    ['1,5 Stunden schmoren, dann 30 Sekunden mixen', [5400, 30]],
    ['Mit 2 EL Öl anbraten', []],
  ])('Timer in „%s“', (step, secs) => {
    expect(findTimers(step).map((t) => t.seconds)).toEqual(secs);
  });
  it('findet Zutaten im Schritt', () => {
    const ings = ['2 Zwiebel(n)', '500 g Hackfleisch, gemischtes', '3 Möhren', '1 Prise Salz', '200 g Käse, geriebener']
      .map((l) => parseIngredient(l)!);
    const found = ingredientsInStep('Die Zwiebeln und Möhren würfeln, dann das Hackfleisch anbraten.', ings).map((i) => i.name);
    expect(found).toEqual(['Zwiebel(n)', 'Hackfleisch, gemischtes', 'Möhren']);
  });
  it('formatiert Zeiten', () => {
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(3725)).toBe('1:02:05');
  });
});

describe('Gerichte-Match', async () => {
  const m = await import('./match');
  const dish = (id: string, round: string, t: string) => ({ id, household_id: 'h', round_id: round, source: 'chefkoch' as const,
    ref_id: id, title: id, image_url: null, info: '', done: false, created_at: t, updated_at: t });
  const vote = (dish_id: string, member: string, liked: boolean) => ({ id: `${dish_id}-${member}`, household_id: 'h', dish_id, member, liked,
    created_at: '', updated_at: '' });
  const dishes = [dish('alt', 'r1', '2026-10-01'), dish('a', 'r2', '2026-10-19T10:00'), dish('b', 'r2', '2026-10-19T10:00'), dish('c', 'r2', '2026-10-19T10:00')];
  const votes = [vote('a', 'Timo', true), vote('a', 'Sarah', true), vote('b', 'Timo', true), vote('b', 'Sarah', false), vote('c', 'Sarah', true)];

  it('Stapel enthält nur die aktuelle Runde ohne eigene Stimmen', () => {
    expect(m.deckFor(dishes, votes, 'Timo').map((d) => d.id)).toEqual(['c']);
    expect(m.deckFor(dishes, votes, 'Neu').map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });
  it('Match nur, wenn zwei verschiedene Personen mögen', () => {
    expect(m.openMatches(dishes, votes).map((d) => d.id)).toEqual(['a']);
    expect(m.isMatch('c', [...votes, vote('c', 'Sarah', true)])).toBe(false);
    expect(m.isMatch('c', [...votes, vote('c', 'Timo', true)])).toBe(true);
  });
  it('erledigte Matches verschwinden', () => {
    expect(m.openMatches(dishes.map((d) => (d.id === 'a' ? { ...d, done: true } : d)), votes)).toEqual([]);
  });
  it('zeigt den Fortschritt der anderen', () => {
    expect(m.othersProgress(dishes, votes, 'Timo')).toEqual({ Sarah: 3 });
  });
});

describe('Stapel-Filter', () => {
  it('erkennt Nicht-Hauptgerichte', async () => {
    const { NOT_A_MEAL: re } = await import('./matchDeck');
    for (const t of ['Der unglaublich cremige NY Cheese Cake', 'Apfelkuchen vom Blech', 'Schoko-Mousse', 'Leichte Thunfisch - Creme', 'Erdbeer-Eis', 'Himbeertraum', 'Grill - Marinade', 'Honig-Senf-Dressing'])
      expect(re.test(t), t).toBe(true);
    for (const t of ['Nudeln in leichter, sämiger Thunfisch-Tomaten-Käse Sauce', 'Eierpfannekuchen für eine Person', 'Cremige Tomatensuppe', 'Reis mit Gemüse', 'Kaiserschmarrn', 'Kartoffel-Creme-Suppe'])
      expect(re.test(t), t).toBe(false);
  });
});

describe('Unverträglichkeiten', async () => {
  const { findConflicts, conflictSummary } = await import('./intolerance');
  const { parseIngredient } = await import('./parser');
  const ings = (...lines: string[]) => lines.map((l) => parseIngredient(l)!);

  it('findet Fructose-Zutaten', () => {
    const c = findConflicts(ings('2 Äpfel', '1 EL Honig', '500 g Hackfleisch', '1 Zwiebel'), ['fructose']);
    expect(c.map((x) => x.ingredient)).toEqual(['Äpfel', 'Honig']);
    expect(conflictSummary(c)).toBe('Fructose: Äpfel, Honig');
  });
  it('beachtet Ausnahmen (laktosefrei, Kokosmilch)', () => {
    expect(findConflicts(ings('200 ml Milch, laktosefreie', '400 ml Kokosmilch'), ['lactose'])).toEqual([]);
    expect(findConflicts(ings('200 ml Sahne'), ['lactose']).length).toBe(1);
  });
  it('eigene Zutaten', () => {
    const c = findConflicts(ings('2 Zwiebeln', '1 Knoblauchzehe'), [], ['Zwiebel']);
    expect(conflictSummary(c)).toBe('Zwiebel: Zwiebeln');
  });
  it('keine Fehlalarme bei ähnlichen Wörtern', () => {
    expect(findConflicts(ings('300 g Mangold', '1 Butternutkürbis', '2 EL Kartoffelmehl'), ['fructose', 'lactose', 'gluten'])).toEqual([]);
  });
  it('ohne Auswahl keine Treffer', () => {
    expect(findConflicts(ings('2 Äpfel'), [])).toEqual([]);
  });
});
