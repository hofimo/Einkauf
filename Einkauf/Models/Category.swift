import Foundation

/// Abteilungen in der Reihenfolge, in der man typischerweise durch den Supermarkt läuft.
enum Category: String, CaseIterable, Identifiable, Codable, Sendable {
    case produce = "Obst & Gemüse"
    case meat = "Fleisch & Fisch"
    case eggs = "Eier"
    case bakery = "Brot & Backwaren"
    case pantry = "Nudeln, Reis & Konserven"
    case sweets = "Süßes & Snacks"
    case drinks = "Getränke"
    case household = "Drogerie & Haushalt"
    case dairy = "Milch & Käse"
    case sausage = "Wurst"
    case baking = "Gewürze & Backen"
    case frozen = "Tiefkühl"
    case other = "Sonstiges"

    var id: String { rawValue }

    var emoji: String {
        switch self {
        case .produce: "🥦"
        case .bakery: "🥖"
        case .dairy: "🧀"
        case .meat: "🥩"
        case .eggs: "🥚"
        case .sausage: "🌭"
        case .pantry: "🍝"
        case .baking: "🧂"
        case .frozen: "🧊"
        case .sweets: "🍫"
        case .drinks: "🧃"
        case .household: "🧻"
        case .other: "🛒"
        }
    }
}

/// Ordnet Artikeln anhand von Stichwörtern eine Abteilung und ein Symbol zu.
enum Catalog {
    struct Entry {
        let keyword: String
        let category: Category
        let emoji: String
    }

    // Längere Stichwörter gewinnen ("tomatenmark" vor "tomate").
    static let entries: [Entry] = {
        let raw: [(Category, [(String, String)])] = [
            (.produce, [
                ("apfel", "🍎"), ("äpfel", "🍎"), ("banane", "🍌"), ("birne", "🍐"), ("orange", "🍊"),
                ("mandarine", "🍊"), ("zitrone", "🍋"), ("limette", "🍋"), ("traube", "🍇"), ("erdbeer", "🍓"),
                ("himbeer", "🍓"), ("heidelbeer", "🫐"), ("blaubeer", "🫐"), ("kirsche", "🍒"), ("pfirsich", "🍑"),
                ("ananas", "🍍"), ("mango", "🥭"), ("kiwi", "🥝"), ("melone", "🍉"), ("wassermelone", "🍉"), ("avocado", "🥑"),
                ("tomate", "🍅"), ("gurke", "🥒"), ("salat", "🥬"), ("rucola", "🥬"), ("spinat", "🥬"),
                ("paprika", "🫑"), ("zwiebel", "🧅"), ("schalotte", "🧅"), ("knoblauch", "🧄"), ("kartoffel", "🥔"),
                ("süßkartoffel", "🍠"), ("karotte", "🥕"), ("möhre", "🥕"), ("brokkoli", "🥦"), ("blumenkohl", "🥦"),
                ("zucchini", "🥒"), ("aubergine", "🍆"), ("champignon", "🍄"), ("pilze", "🍄"), ("mais", "🌽"),
                ("lauch", "🥬"), ("porree", "🥬"), ("lauchzwiebel", "🧅"), ("frühlingszwiebel", "🧅"),
                ("sellerie", "🥬"), ("kohl", "🥬"), ("kohlrabi", "🥬"), ("radieschen", "🥬"), ("ingwer", "🫚"),
                ("chili", "🌶️"), ("peperoni", "🌶️"), ("petersilie", "🌿"), ("basilikum", "🌿"),
                ("schnittlauch", "🌿"), ("koriander", "🌿"), ("dill", "🌿"), ("minze", "🌿"), ("rosmarin", "🌿"),
                ("kürbis", "🎃"), ("spargel", "🥬"), ("fenchel", "🥬"), ("rote bete", "🥬"), ("obst", "🍎"),
                ("gemüse", "🥦"), ("bohnen, grüne", "🫛"), ("zuckerschote", "🫛"),
            ]),
            (.bakery, [
                ("brot", "🍞"), ("brötchen", "🥐"), ("semmel", "🥐"), ("baguette", "🥖"), ("toast", "🍞"),
                ("croissant", "🥐"), ("brezel", "🥨"), ("laugen", "🥨"), ("wrap", "🌯"), ("tortilla", "🌯"),
                ("kuchen", "🍰"), ("knäckebrot", "🍞"), ("ciabatta", "🥖"), ("fladenbrot", "🫓"), ("pita", "🫓"),
            ]),
            (.dairy, [
                ("milch", "🥛"), ("joghurt", "🥛"), ("jogurt", "🥛"), ("quark", "🥛"), ("sahne", "🥛"),
                ("schmand", "🥛"), ("crème fraîche", "🥛"), ("creme fraiche", "🥛"), ("butter", "🧈"),
                ("käse", "🧀"), ("gouda", "🧀"), ("emmentaler", "🧀"), ("mozzarella", "🧀"), ("parmesan", "🧀"),
                ("feta", "🧀"), ("hirtenkäse", "🧀"), ("frischkäse", "🧀"), ("mascarpone", "🧀"), ("ricotta", "🧀"), ("margarine", "🧈"), ("skyr", "🥛"), ("kefir", "🥛"),
                ("buttermilch", "🥛"), ("schmelzkäse", "🧀"), ("halloumi", "🧀"), ("hafermilch", "🥛"),
            ]),
            (.meat, [
                ("fleisch", "🥩"), ("hack", "🥩"), ("rind", "🥩"), ("schwein", "🥩"), ("steak", "🥩"),
                ("schnitzel", "🥩"), ("hähnchen", "🍗"), ("hühnchen", "🍗"), ("huhn", "🍗"), ("pute", "🍗"),
                ("chicken", "🍗"), ("lachs", "🐟"), ("thunfisch", "🐟"), ("fisch", "🐟"),
                ("garnele", "🦐"), ("shrimps", "🦐"), ("garnelen", "🦐"), ("gyros", "🥩"),
                ("tofu", "🧆"), ("lamm", "🥩"), ("kassler", "🥩"),
            ]),
            (.eggs, [
                ("ei", "🥚"), ("eier", "🥚"), ("bio-eier", "🥚"),
            ]),
            (.sausage, [
                ("wurst", "🌭"), ("würstchen", "🌭"), ("wiener", "🌭"), ("bratwurst", "🌭"), ("fleischwurst", "🌭"),
                ("leberwurst", "🌭"), ("teewurst", "🌭"), ("lyoner", "🌭"), ("cabanossi", "🌭"), ("chorizo", "🌭"),
                ("salami", "🍖"), ("mortadella", "🍖"), ("schinken", "🥓"), ("speck", "🥓"), ("bacon", "🥓"),
                ("aufschnitt", "🥓"), ("wurstaufschnitt", "🥓"),
            ]),
            (.pantry, [
                ("nudeln", "🍝"), ("spaghetti", "🍝"), ("penne", "🍝"), ("pasta", "🍝"), ("lasagne", "🍝"),
                ("tagliatelle", "🍝"), ("fusilli", "🍝"), ("gnocchi", "🥟"), ("reis", "🍚"), ("couscous", "🍚"),
                ("bulgur", "🍚"), ("quinoa", "🍚"), ("linsen", "🫘"), ("kichererbsen", "🫘"), ("bohnen", "🫘"),
                ("tomatenmark", "🥫"), ("passierte tomaten", "🥫"), ("tomaten, geschälte", "🥫"), ("dose", "🥫"),
                ("konserve", "🥫"), ("brühe", "🥫"), ("fond", "🥫"), ("haferflocken", "🥣"), ("müsli", "🥣"),
                ("cornflakes", "🥣"), ("honig", "🍯"), ("marmelade", "🍯"), ("konfitüre", "🍯"), ("nutella", "🍯"),
                ("senf", "🥫"), ("ketchup", "🥫"), ("mayo", "🥫"), ("soße", "🥫"), ("sauce", "🥫"),
                ("sojasauce", "🥫"), ("pesto", "🫙"), ("oliven", "🫒"), ("kokosmilch", "🥥"), ("essiggurke", "🥒"),
                ("mais (dose)", "🥫"), ("erdnussbutter", "🥜"), ("nüsse", "🥜"), ("mandeln", "🥜"),
            ]),
            (.baking, [
                ("salz", "🧂"), ("pfeffer", "🧂"), ("zucker", "🧂"), ("mehl", "🌾"), ("öl", "🫒"),
                ("olivenöl", "🫒"), ("essig", "🫙"), ("balsamico", "🫙"), ("hefe", "🌾"), ("backpulver", "🌾"),
                ("vanille", "🌾"), ("paprikapulver", "🧂"), ("curry", "🧂"), ("zimt", "🧂"), ("muskat", "🧂"),
                ("oregano", "🌿"), ("thymian", "🌿"), ("gewürz", "🧂"), ("speisestärke", "🌾"), ("kakao", "🍫"),
                ("puderzucker", "🧂"), ("lorbeer", "🌿"), ("kreuzkümmel", "🧂"), ("kümmel", "🧂"),
            ]),
            (.frozen, [
                ("tk", "🧊"), ("tiefkühl", "🧊"), ("pizza", "🍕"), ("eis", "🍦"), ("eiswürfel", "🧊"),
                ("pommes", "🍟"), ("fischstäbchen", "🐟"), ("erbsen", "🫛"), ("spinat tk", "🧊"),
            ]),
            (.sweets, [
                ("schokolade", "🍫"), ("chips", "🥔"), ("gummibärchen", "🍬"), ("keks", "🍪"), ("kekse", "🍪"),
                ("bonbon", "🍬"), ("süßigkeit", "🍬"), ("riegel", "🍫"), ("popcorn", "🍿"), ("salzstangen", "🥨"),
                ("cracker", "🍘"), ("flips", "🥜"),
            ]),
            (.drinks, [
                ("wasser", "💧"), ("sprudel", "💧"), ("saft", "🧃"), ("cola", "🥤"), ("limo", "🥤"),
                ("bier", "🍺"), ("wein", "🍷"), ("rotwein", "🍷"), ("weißwein", "🥂"), ("sekt", "🥂"),
                ("kaffee", "☕️"), ("tee", "🍵"), ("espresso", "☕️"), ("eistee", "🧋"), ("prosecco", "🥂"),
                ("schorle", "🧃"), ("energy", "🥤"), ("gin", "🍸"), ("tonic", "🥤"),
            ]),
            (.household, [
                ("klopapier", "🧻"), ("toilettenpapier", "🧻"), ("küchenrolle", "🧻"), ("taschentücher", "🤧"),
                ("spülmittel", "🧽"), ("schwamm", "🧽"), ("waschmittel", "🧺"), ("weichspüler", "🧺"),
                ("müllbeutel", "🗑️"), ("zahnpasta", "🪥"), ("zahnbürste", "🪥"), ("shampoo", "🧴"),
                ("duschgel", "🧴"), ("seife", "🧼"), ("deo", "🧴"), ("creme", "🧴"), ("tabs", "🧽"),
                ("alufolie", "📦"), ("frischhaltefolie", "📦"), ("backpapier", "📦"), ("batterie", "🔋"),
                ("windeln", "🍼"), ("rasierer", "🪒"), ("putzmittel", "🧽"), ("kerzen", "🕯️"),
            ]),
        ]
        return raw
            .flatMap { category, words in words.map { Entry(keyword: $0.0, category: category, emoji: $0.1) } }
            .sorted { $0.keyword.count > $1.keyword.count }
    }()

    static func match(_ name: String) -> Entry? {
        let lower = name.lowercased()
        let words = Set(lower.split(whereSeparator: { !$0.isLetter }).map(String.init))
        // Sehr kurze Stichwörter (z. B. "ei", "öl", "tk") nur als ganzes Wort bzw. Wortende,
        // damit "Reis" nicht als "Ei" erkannt wird.
        return entries.first { entry in
            if entry.keyword.count <= 3 {
                return words.contains(entry.keyword) || (entry.keyword == "öl" && words.contains { $0.hasSuffix("öl") })
            }
            return lower.contains(entry.keyword)
        }
    }

    static func category(for name: String) -> Category {
        match(name)?.category ?? .other
    }

    static func emoji(for name: String, category: Category) -> String {
        match(name)?.emoji ?? category.emoji
    }

    /// Häufige Artikel als Vorschläge beim Tippen.
    static let suggestions: [String] = [
        "Äpfel", "Bananen", "Tomaten", "Gurke", "Salat", "Paprika", "Zwiebeln", "Knoblauch", "Kartoffeln",
        "Karotten", "Zitronen", "Brot", "Brötchen", "Toast", "Milch", "Butter", "Eier", "Joghurt", "Quark",
        "Sahne", "Käse", "Mozzarella", "Parmesan", "Hackfleisch", "Hähnchenbrust", "Lachs", "Nudeln",
        "Spaghetti", "Reis", "Passierte Tomaten", "Haferflocken", "Kaffee", "Tee", "Mineralwasser",
        "Apfelsaft", "Bier", "Wein", "Schokolade", "Chips", "Klopapier", "Küchenrolle", "Spülmittel",
        "Waschmittel", "Müllbeutel", "Zahnpasta", "Duschgel",
    ]
}
