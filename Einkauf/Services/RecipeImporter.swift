import Foundation

/// Suche und Import von Chefkoch-Rezepten sowie Import beliebiger Rezept-Webseiten
/// (alles, was schema.org/Recipe als JSON-LD einbettet).
///
/// Chefkoch bietet keine offizielle API. Genutzt wird die Schnittstelle, die auch die
/// Chefkoch-App verwendet. Ändert Chefkoch sie, funktioniert der Import per Link
/// (JSON-LD) weiterhin.
enum RecipeImporter {
    struct SearchResult: Identifiable, Hashable, Sendable {
        let id: String
        let title: String
        let subtitle: String
        let rating: Double
        let votes: Int
        let minutes: Int
        let imageURL: URL?
        let siteURL: String
        let isPremium: Bool
    }

    /// Ein importiertes Rezept, noch nicht gespeichert.
    struct Draft: Sendable {
        var title: String
        var servings: Int
        var ingredients: [Ingredient]
        var instructions: String
        var sourceURL: String?
        var imageURL: String?
        var chefkochId: String?

        func recipe(householdId: UUID) -> Recipe {
            Recipe(householdId: householdId, title: title, servings: servings, ingredients: ingredients,
                   instructions: instructions, sourceUrl: sourceURL, imageUrl: imageURL, chefkochId: chefkochId)
        }
    }

    enum ImportError: LocalizedError {
        case noRecipe, badURL
        var errorDescription: String? {
            switch self {
            case .noRecipe: "Auf dieser Seite wurde kein Rezept gefunden."
            case .badURL: "Ungültiger Link."
            }
        }
    }

    private static let userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"

    private static func get(_ url: URL) async throws -> Data {
        var r = URLRequest(url: url)
        r.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        r.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: r)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw APIError.http(code, "") }
        return data
    }

    static func imageURL(template: String?, format: String = "crop-480x300") -> URL? {
        guard let template else { return nil }
        return URL(string: template.replacingOccurrences(of: "<format>", with: format))
    }

    // MARK: Chefkoch-Suche

    static func search(_ query: String, offset: Int = 0) async throws -> [SearchResult] {
        var c = URLComponents(string: "https://api.chefkoch.de/v2/recipes")!
        c.queryItems = [
            .init(name: "query", value: query),
            .init(name: "limit", value: "30"),
            .init(name: "offset", value: String(offset)),
        ]
        let data = try await get(c.url!)
        let response = try JSONDecoder().decode(CKSearchResponse.self, from: data)
        return response.results.map { r in
            let x = r.recipe
            return SearchResult(id: x.id, title: x.title, subtitle: x.subtitle ?? "",
                                rating: x.rating?.rating ?? 0, votes: x.rating?.numVotes ?? 0,
                                minutes: x.preparationTime ?? 0,
                                imageURL: x.hasImage == true ? imageURL(template: x.previewImageUrlTemplate) : nil,
                                siteURL: x.siteUrl ?? "", isPremium: (x.isPremium ?? false) || (x.isPlus ?? false))
        }
    }

    static func chefkochRecipe(id: String) async throws -> Draft {
        let data = try await get(URL(string: "https://api.chefkoch.de/v2/recipes/\(id)")!)
        let r = try JSONDecoder().decode(CKRecipe.self, from: data)
        var ingredients: [Ingredient] = []
        for group in r.ingredientGroups ?? [] {
            let header = (group.header ?? "").trimmingCharacters(in: CharacterSet(charactersIn: " :"))
            for i in group.ingredients {
                let amount = (i.amount ?? 0) > 0 ? i.amount : nil
                ingredients.append(Ingredient(name: i.name, amount: amount, unit: i.unit ?? "",
                                              note: i.usageInfo ?? "", group: header))
            }
        }
        return Draft(title: r.title, servings: max(r.servings ?? 2, 1), ingredients: ingredients,
                     instructions: r.instructions ?? "", sourceURL: r.siteUrl,
                     imageURL: r.hasImage == true ? imageURL(template: r.previewImageUrlTemplate, format: "crop-960x720")?.absoluteString : nil,
                     chefkochId: r.id)
    }

    // MARK: Import per Link

    static func chefkochId(from url: URL) -> String? {
        guard url.host?.contains("chefkoch.de") == true else { return nil }
        let parts = url.pathComponents
        if let i = parts.firstIndex(of: "rezepte"), i + 1 < parts.count, parts[i + 1].allSatisfy(\.isNumber) {
            return parts[i + 1]
        }
        return nil
    }

    static func importRecipe(from link: String) async throws -> Draft {
        let trimmed = link.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.scheme?.hasPrefix("http") == true else { throw ImportError.badURL }
        if let id = chefkochId(from: url), let draft = try? await chefkochRecipe(id: id) {
            return draft
        }
        let data = try await get(url)
        let html = String(decoding: data, as: UTF8.self)
        guard var draft = parseJSONLD(html: html) else { throw ImportError.noRecipe }
        draft.sourceURL = trimmed
        return draft
    }

    /// Sucht in einer HTML-Seite nach einem schema.org-Recipe in JSON-LD.
    static func parseJSONLD(html: String) -> Draft? {
        let pattern = #"<script[^>]*type=["']application/ld\+json["'][^>]*>(.*?)</script>"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators, .caseInsensitive]) else { return nil }
        let ns = html as NSString
        for match in regex.matches(in: html, range: NSRange(location: 0, length: ns.length)) {
            let json = ns.substring(with: match.range(at: 1))
            guard let data = json.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data),
                  let recipe = findRecipe(in: object) else { continue }
            return draft(from: recipe)
        }
        return nil
    }

    private static func findRecipe(in object: Any) -> [String: Any]? {
        if let dict = object as? [String: Any] {
            let type = dict["@type"]
            if (type as? String) == "Recipe" || (type as? [String])?.contains("Recipe") == true { return dict }
            if let graph = dict["@graph"] { return findRecipe(in: graph) }
        }
        if let array = object as? [Any] {
            for element in array { if let r = findRecipe(in: element) { return r } }
        }
        return nil
    }

    private static func draft(from r: [String: Any]) -> Draft {
        let title = (r["name"] as? String).map(decodeEntities) ?? "Rezept"
        let lines = (r["recipeIngredient"] as? [String]) ?? (r["ingredients"] as? [String]) ?? []
        let ingredients = lines.compactMap { IngredientParser.parse(decodeEntities($0)) }

        var servings = 2
        if let y = r["recipeYield"] {
            let text = (y as? String) ?? (y as? [Any])?.first.map { "\($0)" } ?? "\(y)"
            if let n = IngredientParser.parseAmount(prefixOf: text.trimmingCharacters(in: .whitespaces)).amount, n >= 1 {
                servings = Int(n)
            }
        }

        var steps: [String] = []
        func collect(_ any: Any?) {
            if let s = any as? String { steps.append(decodeEntities(s)) }
            else if let d = any as? [String: Any] {
                if let items = d["itemListElement"] { collect(items) } else if let t = d["text"] as? String { steps.append(decodeEntities(t)) }
            } else if let a = any as? [Any] { a.forEach(collect) }
        }
        collect(r["recipeInstructions"])

        var image: String?
        if let s = r["image"] as? String { image = s }
        else if let a = r["image"] as? [Any] { image = (a.first as? String) ?? ((a.first as? [String: Any])?["url"] as? String) }
        else if let d = r["image"] as? [String: Any] { image = d["url"] as? String }

        return Draft(title: title, servings: servings, ingredients: ingredients,
                     instructions: steps.joined(separator: "\n\n"), sourceURL: nil, imageURL: image, chefkochId: nil)
    }

    private static func decodeEntities(_ s: String) -> String {
        s.replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

// MARK: - Chefkoch-Antworten (nur die benötigten Felder)

private struct CKSearchResponse: Decodable {
    struct Result: Decodable { let recipe: CKRecipeSummary }
    let results: [Result]
}

private struct CKRating: Decodable {
    let rating: Double?
    let numVotes: Int?
}

private struct CKRecipeSummary: Decodable {
    let id: String
    let title: String
    let subtitle: String?
    let rating: CKRating?
    let preparationTime: Int?
    let hasImage: Bool?
    let previewImageUrlTemplate: String?
    let siteUrl: String?
    let isPremium: Bool?
    let isPlus: Bool?
}

private struct CKRecipe: Decodable {
    struct Group: Decodable {
        let header: String?
        let ingredients: [Item]
    }
    struct Item: Decodable {
        let name: String
        let amount: Double?
        let unit: String?
        let usageInfo: String?
    }
    let id: String
    let title: String
    let servings: Int?
    let instructions: String?
    let siteUrl: String?
    let hasImage: Bool?
    let previewImageUrlTemplate: String?
    let ingredientGroups: [Group]?
}
