import Foundation

/// Gemeinsame Basis aller synchronisierten Datensätze.
protocol SyncRecord: Codable, Identifiable, Hashable, Sendable where ID == UUID {
    static var table: String { get }
    var householdId: UUID { get set }
    var updatedAt: Date { get set }
    /// Optionale Spalten, die beim Speichern explizit auf NULL gesetzt werden müssen.
    static var nullableColumns: [String] { get }
}

extension SyncRecord {
    static var nullableColumns: [String] { [] }
}

struct ShoppingItem: SyncRecord {
    static let table = "shopping_items"
    static let nullableColumns = ["checked_at"]

    var id: UUID = UUID()
    var householdId: UUID
    var name: String
    var quantity: String = ""
    var note: String = ""
    var category: String = Category.other.rawValue
    var checked: Bool = false
    var checkedAt: Date?
    /// Woher der Eintrag stammt, z. B. "Lasagne" oder "Alexa".
    var source: String = ""
    var createdAt: Date = Date()
    var updatedAt: Date = Date()

    /// Ohne gültige Abteilung (z. B. von Alexa angelegt) wird sie aus dem Namen abgeleitet.
    var categoryValue: Category { Category(rawValue: category) ?? Catalog.category(for: name) }
}

struct Ingredient: Codable, Hashable, Identifiable, Sendable {
    var id: UUID = UUID()
    var name: String
    /// nil = ohne Mengenangabe ("Salz", "etwas Rotwein")
    var amount: Double?
    var unit: String = ""
    var note: String = ""
    var group: String = ""

    init(id: UUID = UUID(), name: String, amount: Double? = nil, unit: String = "", note: String = "", group: String = "") {
        self.id = id
        self.name = name
        self.amount = amount
        self.unit = unit
        self.note = note
        self.group = group
    }

    // Tolerant dekodieren, da die Daten als jsonb gespeichert sind.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(UUID.self, forKey: .id)) ?? UUID()
        name = try c.decode(String.self, forKey: .name)
        amount = try? c.decodeIfPresent(Double.self, forKey: .amount)
        unit = (try? c.decodeIfPresent(String.self, forKey: .unit)) ?? ""
        note = (try? c.decodeIfPresent(String.self, forKey: .note)) ?? ""
        group = (try? c.decodeIfPresent(String.self, forKey: .group)) ?? ""
    }

    /// "500 g", "2 EL", "" – für die gewünschte Portionenzahl skaliert.
    func quantityText(scale: Double = 1, forShopping: Bool = false) -> String {
        let q = Quantity(amount: amount.map { $0 * scale }, unit: unit)
        return forShopping ? q.shoppingText : q.text
    }

    /// Zeile wie im Rezept: "500 g Hackfleisch (gemischt)"
    var displayLine: String {
        var parts = [quantityText(), name].filter { !$0.isEmpty }
        if !note.isEmpty { parts.append("(\(note))") }
        return parts.joined(separator: " ")
    }
}

struct Recipe: SyncRecord {
    static let table = "recipes"
    static let nullableColumns = ["source_url", "image_url", "chefkoch_id"]

    var id: UUID = UUID()
    var householdId: UUID
    var title: String
    var servings: Int = 2
    var ingredients: [Ingredient] = []
    var instructions: String = ""
    var sourceUrl: String?
    var imageUrl: String?
    var chefkochId: String?
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
}

struct MealPlanEntry: SyncRecord {
    static let table = "meal_plan"
    static let nullableColumns = ["recipe_id"]

    var id: UUID = UUID()
    var householdId: UUID
    /// "yyyy-MM-dd" – entspricht dem Postgres-Typ `date`.
    var day: String
    var recipeId: UUID?
    var title: String
    var servings: Int = 2
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
}

struct Staple: SyncRecord {
    static let table = "staples"

    var id: UUID = UUID()
    var householdId: UUID
    var name: String
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
}

/// Menge mit Einheit, z. B. 500 g. Kann addiert werden, wenn die Einheiten passen.
struct Quantity: Hashable {
    var amount: Double?
    var unit: String

    var text: String { formatted(shopping: false) }

    /// Wie `text`, aber Zählbares aufgerundet (½ Zwiebel → 1).
    var shoppingText: String { formatted(shopping: true) }

    private func formatted(shopping: Bool) -> String {
        guard let amount, amount > 0 else { return unit } // "", "etwas", "Prise" …
        let value = Quantity.format(Quantity.round(amount, unit: unit, countableUp: shopping))
        return unit.isEmpty ? value : "\(value) \(unit)"
    }

    /// Parst Texte wie "500 g", "1,5 l", "2", "½ TL".
    static func parse(_ text: String) -> Quantity? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        let parsed = IngredientParser.parseAmount(prefixOf: trimmed)
        guard let amount = parsed.amount else { return nil }
        return Quantity(amount: amount, unit: parsed.rest.trimmingCharacters(in: .whitespaces))
    }

    /// Fasst zwei Mengenangaben zusammen: "500 g" + "250 g" = "750 g", sonst "1 Dose + 200 g".
    static func combine(_ a: String, _ b: String) -> String {
        if a.isEmpty { return b }
        if b.isEmpty { return a }
        if let qa = parse(a), let qb = parse(b), let x = qa.amount, let y = qb.amount {
            if let ua = Unit.normalized(qa.unit), let ub = Unit.normalized(qb.unit), ua.base == ub.base {
                let total = x * ua.factor + y * ub.factor
                return Quantity(amount: total, unit: ua.base).humanized.text
            }
            if qa.unit.lowercased() == qb.unit.lowercased() {
                return Quantity(amount: x + y, unit: qa.unit).text
            }
        }
        return "\(a) + \(b)"
    }

    /// 1500 g → 1,5 kg
    var humanized: Quantity {
        guard let amount else { return self }
        switch unit {
        case "g" where amount >= 1000: return Quantity(amount: amount / 1000, unit: "kg")
        case "ml" where amount >= 1000: return Quantity(amount: amount / 1000, unit: "l")
        default: return self
        }
    }

    static func round(_ value: Double, unit: String, countableUp: Bool = false) -> Double {
        let lower = unit.lowercased()
        if ["g", "ml"].contains(lower) && value > 50 { return (value / 5).rounded() * 5 }
        // Zählbares (3 Zwiebeln, 1 Dose, 2 Zehen) aufrunden – halbe Dosen kauft man nicht
        let countable = ["", "stück", "stk.", "stk", "dose", "dosen", "becher", "bund", "pck.", "pck", "päckchen",
                         "packung", "glas", "zehe", "zehen", "zehe(n)", "dose(n)", "kopf", "knolle", "flasche", "beutel", "netz",
                         "stange", "stangen", "stange(n)", "scheibe", "scheiben", "zweig", "zweige", "würfel", "tüte", "rolle"]
        if countableUp, countable.contains(lower) { return value.rounded(.up) }
        if ["kg", "l", "liter"].contains(lower) { return (value * 20).rounded() / 20 }
        if value >= 10 { return value.rounded() }
        return (value * 4).rounded() / 4 // auf Viertel
    }

    static func format(_ value: Double) -> String {
        if value == value.rounded() { return String(Int(value)) }
        let f = NumberFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.maximumFractionDigits = 2
        f.minimumFractionDigits = 0
        return f.string(from: NSNumber(value: value)) ?? String(value)
    }
}

/// Umrechenbare Einheiten (für das Zusammenfassen von Mengen).
enum Unit {
    static func normalized(_ unit: String) -> (base: String, factor: Double)? {
        switch unit.lowercased().trimmingCharacters(in: .punctuationCharacters) {
        case "g", "gr", "gramm": return ("g", 1)
        case "kg", "kilo", "kilogramm": return ("g", 1000)
        case "ml", "milliliter": return ("ml", 1)
        case "cl": return ("ml", 10)
        case "dl": return ("ml", 100)
        case "l", "liter": return ("ml", 1000)
        case "": return ("", 1)
        default: return nil
        }
    }
}

enum DayFormat {
    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.locale = Locale(identifier: "de_DE")
        c.firstWeekday = 2 // Montag
        c.timeZone = .current
        return c
    }()

    static func string(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    static func date(_ string: String) -> Date? {
        let parts = string.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    static func startOfWeek(_ date: Date) -> Date {
        calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? calendar.startOfDay(for: date)
    }
}
