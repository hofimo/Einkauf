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
    ['Reis', 'Nudeln, Reis & Konserven'], ['Eier', 'Milch & Käse'], ['Tomatenmark', 'Nudeln, Reis & Konserven'],
    ['Weintrauben', 'Obst & Gemüse'], ['Eistee', 'Getränke'], ['Klopapier', 'Drogerie & Haushalt'],
    ['Hähnchenbrust', 'Fleisch & Fisch'], ['Wassermelone', 'Obst & Gemüse'], ['Irgendwas', 'Sonstiges'],
  ])('%s → %s', (name, cat) => {
    expect(categoryFor(name)).toBe(cat);
  });
  it('liefert Emojis', () => expect(emojiFor('Bananen')).toBe('🍌'));
});
