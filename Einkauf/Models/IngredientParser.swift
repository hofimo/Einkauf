import Foundation

/// Zerlegt Zutatenzeilen wie "1 ½ EL Olivenöl (extra vergine)" in Menge, Einheit, Name und Notiz.
enum IngredientParser {
    static let units: [String] = [
        "kg", "g", "mg", "gramm", "kilo", "l", "liter", "ml", "cl", "dl",
        "el", "tl", "msp.", "msp", "prise", "prisen", "pck.", "pck", "päckchen", "packung", "packungen",
        "dose", "dosen", "becher", "bund", "stück", "stk.", "stk", "zehe", "zehen", "scheibe", "scheiben",
        "glas", "gläser", "tasse", "tassen", "würfel", "kopf", "köpfe", "stange", "stangen", "zweig", "zweige",
        "handvoll", "tüte", "tüten", "flasche", "flaschen", "beutel", "blatt", "blätter", "spritzer", "schuss",
        "tropfen", "knolle", "knollen", "netz", "schale", "schalen", "rolle", "rollen", "dose(n)", "zehe(n)",
        "scheibe(n)", "stange(n)", "zweig(e)", "tasse(n)", "packung(en)", "flasche(n)", "becher(n)", "glas(er)",
        "etwas", "n. b.", "n.b.", "evtl.", "wenig", "viel", "einige", "große", "kleine", "mittelgroße",
    ]

    /// Wörter, die keine Mengen- sondern nur Hinweis-Einheiten sind.
    static let vagueUnits: Set<String> = ["etwas", "n. b.", "n.b.", "evtl.", "wenig", "viel", "einige"]

    static let fractions: [Character: Double] = ["½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1.0 / 3, "⅔": 2.0 / 3, "⅛": 0.125]

    static func parse(_ line: String, group: String = "") -> Ingredient? {
        var text = line.trimmingCharacters(in: .whitespacesAndNewlines)
        text = text.replacingOccurrences(of: "\u{00A0}", with: " ")
        // Aufzählungszeichen entfernen
        while let first = text.first, "-•*–·".contains(first) { text = String(text.dropFirst()).trimmingCharacters(in: .whitespaces) }
        guard !text.isEmpty else { return nil }

        let parsed = parseAmount(prefixOf: text)
        var amount = parsed.amount
        var rest = parsed.rest.trimmingCharacters(in: .whitespaces)

        var unit = ""
        let lowerRest = rest.lowercased()
        // Längste passende Einheit zuerst, muss von Leerzeichen gefolgt werden
        for candidate in units.sorted(by: { $0.count > $1.count }) {
            guard lowerRest.hasPrefix(candidate) else { continue }
            let after = lowerRest.dropFirst(candidate.count)
            if after.isEmpty || after.first == " " {
                unit = String(rest.prefix(candidate.count))
                rest = String(rest.dropFirst(candidate.count)).trimmingCharacters(in: .whitespaces)
                break
            }
        }
        if vagueUnits.contains(unit.lowercased()) {
            amount = nil
            unit = unit.lowercased() == "etwas" ? "etwas" : ""
        }
        if ["große", "kleine", "mittelgroße"].contains(unit.lowercased()) {
            rest = unit + " " + rest
            unit = ""
        }

        // Notiz in Klammern am Ende abtrennen: "Tomaten (800 g)"
        var note = ""
        if let open = rest.lastIndex(of: "("), rest.hasSuffix(")"), open != rest.startIndex {
            let inner = rest[rest.index(after: open)..<rest.index(before: rest.endIndex)]
            // "Zwiebel(n)" ist keine Notiz
            if inner.count > 2 {
                note = String(inner).trimmingCharacters(in: .whitespaces)
                rest = String(rest[..<open]).trimmingCharacters(in: .whitespaces)
            }
        }
        guard !rest.isEmpty else { return nil }
        return Ingredient(name: rest, amount: amount, unit: unit, note: note, group: group)
    }

    /// Liest eine führende Zahl ("2", "1,5", "1/2", "1 ½", "2-3") und gibt den Rest zurück.
    static func parseAmount(prefixOf text: String) -> (amount: Double?, rest: String) {
        var index = text.startIndex
        var total: Double = 0
        var found = false

        func skipSpaces() {
            while index < text.endIndex, text[index] == " " { index = text.index(after: index) }
        }

        func readNumber() -> Double? {
            let start = index
            while index < text.endIndex, text[index].isNumber || text[index] == "," || text[index] == "." {
                // "1." am Satzende o. ä. nicht als Dezimaltrenner werten
                if (text[index] == "," || text[index] == "."),
                   text.index(after: index) == text.endIndex || !text[text.index(after: index)].isNumber { break }
                index = text.index(after: index)
            }
            guard start < index else { return nil }
            var number = Double(text[start..<index].replacingOccurrences(of: ",", with: ".")) ?? 0
            if index < text.endIndex, text[index] == "/" {
                let slash = index
                index = text.index(after: index)
                let denomStart = index
                while index < text.endIndex, text[index].isNumber { index = text.index(after: index) }
                if let denom = Double(text[denomStart..<index]), denom > 0 {
                    number /= denom
                } else {
                    index = slash
                }
            }
            return number
        }

        if let n = readNumber() { total += n; found = true }
        skipSpaces()
        if index < text.endIndex, let frac = fractions[text[index]] {
            total += frac; found = true
            index = text.index(after: index)
        }
        // Spannen wie "2-3" oder "2 - 3": den oberen Wert nehmen
        let beforeRange = index
        skipSpaces()
        if found, index < text.endIndex, text[index] == "-" || text[index] == "–" {
            index = text.index(after: index)
            skipSpaces()
            if let upper = readNumber() { total = upper } else { index = beforeRange }
        } else {
            index = beforeRange
        }
        guard found else { return (nil, text) }
        return (total, String(text[index...]))
    }
}

/// Erkennt Grundvorrat (Salz, Pfeffer, Öl …), der nicht auf die Einkaufsliste soll.
enum StapleMatcher {
    static let defaults: [String] = [
        "Salz", "Pfeffer", "Zucker", "Mehl", "Öl", "Wasser", "Essig", "Paprikapulver", "Muskat",
        "Muskatnuss", "Zimt", "Oregano", "Currypulver", "Chilipulver", "Kreuzkümmel", "Backpulver",
        "Natron", "Speisestärke", "Brühe", "Fett", "Lorbeerblatt", "Lorbeerblätter", "Vanillezucker",
        "Senf", "Gewürze", "Kräuter der Provence", "Italienische Kräuter", "Cayennepfeffer",
    ]

    /// Reduziert "Zwiebel(n), rote" → "zwiebel", "Muskatnuss, frisch geriebene" → "muskatnuss".
    static func coreName(_ name: String) -> String {
        var s = name.lowercased()
        if let comma = s.firstIndex(of: ",") { s = String(s[..<comma]) }
        s = s.replacingOccurrences(of: #"\([^)]*\)"#, with: "", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespaces)
    }

    static func isStaple(_ ingredientName: String, staples: [String]) -> Bool {
        let set = staples.map { $0.lowercased().trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let core = coreName(ingredientName)
        guard !core.isEmpty else { return false }
        // "Salz und Pfeffer", "Salz/Pfeffer", "Öl oder Butter"
        let parts = core
            .replacingOccurrences(of: " und ", with: "|")
            .replacingOccurrences(of: " oder ", with: "|")
            .replacingOccurrences(of: "/", with: "|")
            .replacingOccurrences(of: "&", with: "|")
            .split(separator: "|")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return parts.allSatisfy { part in
            let words = part.split(separator: " ").map(String.init)
            guard let first = words.first, let last = words.last else { return false }
            return set.contains { staple in
                if part == staple || first == staple { return true }   // "Fett für die Form"
                if staple.contains(" ") { return part.hasPrefix(staple) }
                // Deutsche Komposita: "Olivenöl", "Meersalz", "Gemüsebrühe", nicht aber "Zuckerschoten"
                return last.hasSuffix(staple)
            }
        }
    }
}
