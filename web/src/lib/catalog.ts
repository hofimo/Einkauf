// Abteilungen in der Reihenfolge, in der man durch den Supermarkt läuft.
export const CATEGORIES = [
  { key: 'produce', color: '#2f9e57', name: 'Obst & Gemüse', emoji: '🥦' },
  { key: 'meat', color: '#d64545', name: 'Fleisch & Fisch', emoji: '🥩' },
  { key: 'eggs', color: '#e0a21c', name: 'Eier', emoji: '🥚' },
  { key: 'bakery', color: '#b9773a', name: 'Brot & Backwaren', emoji: '🥖' },
  { key: 'pantry', color: '#e07b2e', name: 'Nudeln, Reis & Konserven', emoji: '🍝' },
  { key: 'sweets', color: '#cc5a9b', name: 'Süßes & Snacks', emoji: '🍫' },
  { key: 'drinks', color: '#2f86d1', name: 'Getränke', emoji: '🧃' },
  { key: 'household', color: '#7564cf', name: 'Drogerie & Haushalt', emoji: '🧻' },
  { key: 'dairy', color: '#2aa3b8', name: 'Milch & Käse', emoji: '🧀' },
  { key: 'sausage', color: '#b8433b', name: 'Wurst', emoji: '🌭' },
  { key: 'baking', color: '#8c7f63', name: 'Gewürze & Backen', emoji: '🧂' },
  { key: 'frozen', color: '#4aa8de', name: 'Tiefkühl', emoji: '🧊' },
  { key: 'other', color: '#7d7d84', name: 'Sonstiges', emoji: '🛒' },
] as const;

export const OTHER = 'Sonstiges';

const RAW: [string, [string, string][]][] = [
  ['Obst & Gemüse', [
    ['apfel', '🍎'], ['äpfel', '🍎'], ['banane', '🍌'], ['birne', '🍐'], ['orange', '🍊'], ['mandarine', '🍊'],
    ['zitrone', '🍋'], ['limette', '🍋'], ['traube', '🍇'], ['erdbeer', '🍓'], ['himbeer', '🍓'],
    ['heidelbeer', '🫐'], ['blaubeer', '🫐'], ['kirsche', '🍒'], ['pfirsich', '🍑'], ['ananas', '🍍'],
    ['mango', '🥭'], ['kiwi', '🥝'], ['melone', '🍉'], ['wassermelone', '🍉'], ['avocado', '🥑'], ['tomate', '🍅'],
    ['gurke', '🥒'], ['salat', '🥬'], ['rucola', '🥬'], ['spinat', '🥬'], ['paprika', '🫑'], ['zwiebel', '🧅'],
    ['schalotte', '🧅'], ['knoblauch', '🧄'], ['kartoffel', '🥔'], ['süßkartoffel', '🍠'], ['karotte', '🥕'],
    ['möhre', '🥕'], ['brokkoli', '🥦'], ['blumenkohl', '🥦'], ['zucchini', '🥒'], ['aubergine', '🍆'],
    ['champignon', '🍄'], ['pilze', '🍄'], ['mais', '🌽'], ['lauch', '🥬'], ['porree', '🥬'],
    ['lauchzwiebel', '🧅'], ['frühlingszwiebel', '🧅'], ['sellerie', '🥬'], ['kohl', '🥬'], ['kohlrabi', '🥬'],
    ['radieschen', '🥬'], ['ingwer', '🫚'], ['chili', '🌶️'], ['peperoni', '🌶️'], ['petersilie', '🌿'],
    ['basilikum', '🌿'], ['schnittlauch', '🌿'], ['koriander', '🌿'], ['dill', '🌿'], ['minze', '🌿'],
    ['rosmarin', '🌿'], ['kürbis', '🎃'], ['spargel', '🥬'], ['fenchel', '🥬'], ['rote bete', '🥬'], ['obst', '🍎'],
    ['gemüse', '🥦'], ['bohnen, grüne', '🫛'], ['zuckerschote', '🫛'],
  ]],
  ['Brot & Backwaren', [
    ['brot', '🍞'], ['brötchen', '🥐'], ['semmel', '🥐'], ['baguette', '🥖'], ['toast', '🍞'], ['croissant', '🥐'],
    ['brezel', '🥨'], ['laugen', '🥨'], ['wrap', '🌯'], ['tortilla', '🌯'], ['kuchen', '🍰'], ['knäckebrot', '🍞'],
    ['ciabatta', '🥖'], ['fladenbrot', '🫓'], ['pita', '🫓'],
  ]],
  ['Milch & Käse', [
    ['milch', '🥛'], ['joghurt', '🥛'], ['jogurt', '🥛'], ['quark', '🥛'], ['sahne', '🥛'], ['schmand', '🥛'],
    ['crème fraîche', '🥛'], ['creme fraiche', '🥛'], ['butter', '🧈'], ['käse', '🧀'], ['gouda', '🧀'],
    ['emmentaler', '🧀'], ['mozzarella', '🧀'], ['parmesan', '🧀'], ['feta', '🧀'], ['hirtenkäse', '🧀'],
    ['frischkäse', '🧀'], ['mascarpone', '🧀'], ['ricotta', '🧀'],
    ['margarine', '🧈'], ['skyr', '🥛'], ['kefir', '🥛'], ['buttermilch', '🥛'], ['schmelzkäse', '🧀'],
    ['halloumi', '🧀'], ['hafermilch', '🥛'],
  ]],
  ['Fleisch & Fisch', [
    ['fleisch', '🥩'], ['hack', '🥩'], ['rind', '🥩'], ['schwein', '🥩'], ['steak', '🥩'], ['schnitzel', '🥩'],
    ['hähnchen', '🍗'], ['hühnchen', '🍗'], ['huhn', '🍗'], ['pute', '🍗'], ['chicken', '🍗'], ['lachs', '🐟'],
    ['thunfisch', '🐟'], ['fisch', '🐟'], ['garnele', '🦐'], ['shrimps', '🦐'], ['garnelen', '🦐'],
    ['gyros', '🥩'], ['tofu', '🧆'], ['lamm', '🥩'], ['kassler', '🥩'],
  ]],
  ['Eier', [
    ['ei', '🥚'], ['eier', '🥚'], ['bio-eier', '🥚'],
  ]],
  ['Wurst', [
    ['wurst', '🌭'], ['würstchen', '🌭'], ['wiener', '🌭'], ['bratwurst', '🌭'], ['fleischwurst', '🌭'],
    ['leberwurst', '🌭'], ['teewurst', '🌭'], ['lyoner', '🌭'], ['cabanossi', '🌭'], ['chorizo', '🌭'],
    ['salami', '🍖'], ['mortadella', '🍖'], ['schinken', '🥓'], ['speck', '🥓'], ['bacon', '🥓'],
    ['aufschnitt', '🥓'], ['wurstaufschnitt', '🥓'],
  ]],
  ['Nudeln, Reis & Konserven', [
    ['nudeln', '🍝'], ['spaghetti', '🍝'], ['penne', '🍝'], ['pasta', '🍝'], ['lasagne', '🍝'],
    ['tagliatelle', '🍝'], ['fusilli', '🍝'], ['gnocchi', '🥟'], ['reis', '🍚'], ['couscous', '🍚'],
    ['bulgur', '🍚'], ['quinoa', '🍚'], ['linsen', '🫘'], ['kichererbsen', '🫘'], ['bohnen', '🫘'],
    ['tomatenmark', '🥫'], ['passierte tomaten', '🥫'], ['tomaten, geschälte', '🥫'], ['dose', '🥫'],
    ['konserve', '🥫'], ['brühe', '🥫'], ['fond', '🥫'], ['haferflocken', '🥣'], ['müsli', '🥣'],
    ['cornflakes', '🥣'], ['honig', '🍯'], ['marmelade', '🍯'], ['konfitüre', '🍯'], ['nutella', '🍯'],
    ['senf', '🥫'], ['ketchup', '🥫'], ['mayo', '🥫'], ['soße', '🥫'], ['sauce', '🥫'], ['sojasauce', '🥫'],
    ['pesto', '🫙'], ['oliven', '🫒'], ['kokosmilch', '🥥'], ['essiggurke', '🥒'], ['mais (dose)', '🥫'],
    ['erdnussbutter', '🥜'], ['nüsse', '🥜'], ['mandeln', '🥜'],
  ]],
  ['Gewürze & Backen', [
    ['salz', '🧂'], ['pfeffer', '🧂'], ['zucker', '🧂'], ['mehl', '🌾'], ['öl', '🫒'], ['olivenöl', '🫒'],
    ['essig', '🫙'], ['balsamico', '🫙'], ['hefe', '🌾'], ['backpulver', '🌾'], ['vanille', '🌾'],
    ['paprikapulver', '🧂'], ['curry', '🧂'], ['zimt', '🧂'], ['muskat', '🧂'], ['oregano', '🌿'],
    ['thymian', '🌿'], ['gewürz', '🧂'], ['speisestärke', '🌾'], ['kakao', '🍫'], ['puderzucker', '🧂'],
    ['lorbeer', '🌿'], ['kreuzkümmel', '🧂'], ['kümmel', '🧂'],
  ]],
  ['Tiefkühl', [
    ['tk', '🧊'], ['tiefkühl', '🧊'], ['pizza', '🍕'], ['eis', '🍦'], ['eiswürfel', '🧊'], ['pommes', '🍟'],
    ['fischstäbchen', '🐟'], ['erbsen', '🫛'], ['spinat tk', '🧊'],
  ]],
  ['Süßes & Snacks', [
    ['schokolade', '🍫'], ['chips', '🥔'], ['gummibärchen', '🍬'], ['keks', '🍪'], ['kekse', '🍪'],
    ['bonbon', '🍬'], ['süßigkeit', '🍬'], ['riegel', '🍫'], ['popcorn', '🍿'], ['salzstangen', '🥨'],
    ['cracker', '🍘'], ['flips', '🥜'],
  ]],
  ['Getränke', [
    ['wasser', '💧'], ['sprudel', '💧'], ['saft', '🧃'], ['cola', '🥤'], ['limo', '🥤'], ['bier', '🍺'],
    ['wein', '🍷'], ['rotwein', '🍷'], ['weißwein', '🥂'], ['sekt', '🥂'], ['kaffee', '☕️'], ['tee', '🍵'],
    ['espresso', '☕️'], ['eistee', '🧋'], ['prosecco', '🥂'], ['schorle', '🧃'], ['energy', '🥤'], ['gin', '🍸'],
    ['tonic', '🥤'],
  ]],
  ['Drogerie & Haushalt', [
    ['klopapier', '🧻'], ['toilettenpapier', '🧻'], ['küchenrolle', '🧻'], ['taschentücher', '🤧'],
    ['spülmittel', '🧽'], ['schwamm', '🧽'], ['waschmittel', '🧺'], ['weichspüler', '🧺'], ['müllbeutel', '🗑️'],
    ['zahnpasta', '🪥'], ['zahnbürste', '🪥'], ['shampoo', '🧴'], ['duschgel', '🧴'], ['seife', '🧼'],
    ['deo', '🧴'], ['creme', '🧴'], ['tabs', '🧽'], ['alufolie', '📦'], ['frischhaltefolie', '📦'],
    ['backpapier', '📦'], ['batterie', '🔋'], ['windeln', '🍼'], ['rasierer', '🪒'], ['putzmittel', '🧽'],
    ['kerzen', '🕯️'],
  ]],
];

interface Entry { keyword: string; category: string; emoji: string }

// Längere Stichwörter gewinnen ('tomatenmark' vor 'tomate').
const ENTRIES: Entry[] = RAW.flatMap(([category, words]) => words.map(([keyword, emoji]) => ({ keyword, category, emoji })))
  .sort((a, b) => b.keyword.length - a.keyword.length);

function match(name: string): Entry | undefined {
  const lower = name.toLowerCase();
  const words = new Set(lower.split(/[^\p{L}]+/u).filter(Boolean));
  // Kurze Stichwörter ('ei', 'öl', 'tk') nur als ganzes Wort, damit 'Reis' nicht als 'Ei' gilt.
  return ENTRIES.find((e) => {
    if (e.keyword.length <= 3) {
      return words.has(e.keyword) || (e.keyword === 'öl' && [...words].some((w) => w.endsWith('öl')));
    }
    return lower.includes(e.keyword);
  });
}

export function categoryFor(name: string): string {
  return match(name)?.category ?? OTHER;
}

/** Gültige Abteilung des Eintrags; ohne (z. B. von Siri/Alexa angelegt) aus dem Namen abgeleitet. */
export function itemCategory(item: { name: string; category: string }): string {
  return CATEGORIES.some((c) => c.name === item.category) ? item.category : categoryFor(item.name);
}

/** Farbe der Abteilung (für Kacheln und Überschriften) */
export function categoryColor(name: string): string {
  return CATEGORIES.find((c) => c.name === name)?.color ?? '#7d7d84';
}

export function emojiFor(name: string, category?: string): string {
  return match(name)?.emoji ?? CATEGORIES.find((c) => c.name === category)?.emoji ?? '🛒';
}

export const SUGGESTIONS = ['Äpfel', 'Bananen', 'Tomaten', 'Gurke', 'Salat', 'Paprika', 'Zwiebeln', 'Knoblauch', 'Kartoffeln',
        'Karotten', 'Zitronen', 'Brot', 'Brötchen', 'Toast', 'Milch', 'Butter', 'Eier', 'Joghurt', 'Quark',
        'Sahne', 'Käse', 'Mozzarella', 'Parmesan', 'Hackfleisch', 'Hähnchenbrust', 'Lachs', 'Nudeln',
        'Spaghetti', 'Reis', 'Passierte Tomaten', 'Haferflocken', 'Kaffee', 'Tee', 'Mineralwasser',
        'Apfelsaft', 'Bier', 'Wein', 'Schokolade', 'Chips', 'Klopapier', 'Küchenrolle', 'Spülmittel',
        'Waschmittel', 'Müllbeutel', 'Zahnpasta', 'Duschgel'];
