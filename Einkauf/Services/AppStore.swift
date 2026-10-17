import Foundation
import Observation

/// Eine noch nicht zum Server übertragene Änderung (Offline-Warteschlange).
struct PendingOp: Codable, Identifiable {
    enum Kind: String, Codable { case upsert, delete }
    var id = UUID()
    var table: String
    var kind: Kind
    var recordId: UUID
    var payload: Data?
}

enum SyncState: Equatable {
    case idle, syncing, ok, offline(String), error(String)
}

/// Zentrale Datenhaltung: lokaler Zwischenspeicher + Abgleich mit Supabase.
/// Alle Änderungen werden sofort lokal übernommen und in eine Warteschlange gelegt,
/// die bei Netzverbindung abgearbeitet wird. So funktioniert die Liste auch im Funkloch.
@MainActor
@Observable
final class AppStore {
    static let shared = AppStore()

    private(set) var householdId: UUID?
    private(set) var items: [ShoppingItem] = []
    private(set) var recipes: [Recipe] = []
    private(set) var plan: [MealPlanEntry] = []
    private(set) var staples: [Staple] = []
    private(set) var syncState: SyncState = .idle
    private(set) var lastSync: Date?
    private var outbox: [PendingOp] = []

    private var isSyncing = false
    private var resyncRequested = false
    private var fullResyncRequested = false
    private var lastFullSync: Date = .distantPast
    private var pollTask: Task<Void, Never>?

    private static let householdKey = "householdId"

    init() {
        if let s = UserDefaults.standard.string(forKey: Self.householdKey) { householdId = UUID(uuidString: s) }
        loadSnapshot()
    }

    var api: SupabaseAPI? {
        guard Config.isConfigured, let householdId else { return nil }
        return SupabaseAPI(baseURL: Config.supabaseURL, key: Config.supabaseKey, householdId: householdId)
    }

    var pendingChanges: Int { outbox.count }

    // MARK: - Haushalt

    func createHousehold() {
        setHousehold(UUID())
        for name in StapleMatcher.defaults { addStaple(name) }
    }

    func joinHousehold(_ id: UUID) {
        setHousehold(id)
        Task { await sync(full: true) }
    }

    func leaveHousehold() {
        stopPolling()
        householdId = nil
        UserDefaults.standard.removeObject(forKey: Self.householdKey)
        items = []; recipes = []; plan = []; staples = []; outbox = []
        saveSnapshot()
    }

    private func setHousehold(_ id: UUID) {
        householdId = id
        UserDefaults.standard.set(id.uuidString, forKey: Self.householdKey)
        items = []; recipes = []; plan = []; staples = []; outbox = []
        saveSnapshot()
    }

    // MARK: - Einkaufsliste

    var openItems: [ShoppingItem] { items.filter { !$0.checked } }

    var checkedItems: [ShoppingItem] {
        items.filter(\.checked).sorted { ($0.checkedAt ?? .distantPast) > ($1.checkedAt ?? .distantPast) }
    }

    /// Offene Artikel nach Supermarkt-Abteilung gruppiert.
    var openItemsByCategory: [(category: Category, items: [ShoppingItem])] {
        let groups = Dictionary(grouping: openItems, by: \.categoryValue)
        return Category.allCases.compactMap { c in
            guard let list = groups[c], !list.isEmpty else { return nil }
            return (c, list.sorted { $0.createdAt < $1.createdAt })
        }
    }

    private func normalized(_ name: String) -> String {
        name.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Fügt einen Artikel hinzu. Steht er schon auf der Liste, werden die Mengen zusammengefasst;
    /// war er bereits abgehakt, wird er wieder aktiviert.
    @discardableResult
    func addItem(name rawName: String, quantity: String = "", note: String = "", source: String = "") -> ShoppingItem? {
        guard let householdId else { return nil }
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return nil }
        let key = normalized(name)

        if var existing = items.first(where: { !$0.checked && normalized($0.name) == key }) {
            existing.quantity = Quantity.combine(existing.quantity, quantity)
            if !source.isEmpty, !existing.source.contains(source) {
                existing.source = existing.source.isEmpty ? source : "\(existing.source), \(source)"
            }
            if !note.isEmpty, existing.note.isEmpty { existing.note = note }
            save(existing)
            return existing
        }
        if var existing = items.first(where: { $0.checked && normalized($0.name) == key }) {
            existing.checked = false
            existing.checkedAt = nil
            existing.quantity = quantity
            existing.note = note
            existing.source = source
            existing.createdAt = Date()
            save(existing)
            return existing
        }
        let category = Catalog.category(for: name)
        let item = ShoppingItem(householdId: householdId, name: name.prefix(1).uppercased() + name.dropFirst(),
                                quantity: quantity, note: note, category: category.rawValue, source: source)
        save(item)
        return item
    }

    /// Für Sprachbefehle: "Brot, 2 Liter Milch und Eier" → drei Artikel.
    @discardableResult
    func addItems(fromSpoken text: String, source: String) -> [String] {
        let pieces = text
            .replacingOccurrences(of: " und ", with: ",")
            .replacingOccurrences(of: " sowie ", with: ",")
            .replacingOccurrences(of: " plus ", with: ",")
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var added: [String] = []
        for piece in pieces {
            if let ing = IngredientParser.parse(piece) {
                addItem(name: ing.name, quantity: ing.quantityText(), source: source)
                added.append(ing.name)
            }
        }
        return added
    }

    func toggle(_ item: ShoppingItem) {
        var item = item
        item.checked.toggle()
        item.checkedAt = item.checked ? Date() : nil
        if !item.checked { item.createdAt = Date() }
        save(item)
    }

    func update(_ item: ShoppingItem) { save(item) }

    func delete(_ item: ShoppingItem) { remove(item) }

    func clearChecked() {
        for item in checkedItems { remove(item) }
    }

    // MARK: - Rezepte

    func save(recipe: Recipe) { save(recipe) }

    func delete(recipe: Recipe) {
        for entry in plan where entry.recipeId == recipe.id {
            var e = entry
            e.recipeId = nil
            save(e)
        }
        remove(recipe)
    }

    func recipe(id: UUID?) -> Recipe? {
        guard let id else { return nil }
        return recipes.first { $0.id == id }
    }

    // MARK: - Wochenplan

    func entries(on day: Date) -> [MealPlanEntry] {
        let key = DayFormat.string(day)
        return plan.filter { $0.day == key }.sorted { $0.createdAt < $1.createdAt }
    }

    func addPlanEntry(day: Date, title: String, recipe: Recipe?, servings: Int) {
        guard let householdId else { return }
        save(MealPlanEntry(householdId: householdId, day: DayFormat.string(day), recipeId: recipe?.id,
                           title: title, servings: servings))
    }

    func remove(entry: MealPlanEntry) { remove(entry) }

    /// Übernimmt ausgewählte Zutaten (bereits skaliert) auf die Einkaufsliste.
    func addIngredients(_ ingredients: [Ingredient], scale: Double, source: String) {
        for ing in ingredients {
            addItem(name: displayName(for: ing.name), quantity: ing.quantityText(scale: scale, forShopping: true), source: source)
        }
    }

    /// "Zwiebel(n)" → "Zwiebeln", "Tomaten, geschälte" → "Tomaten, geschälte"
    func displayName(for ingredientName: String) -> String {
        ingredientName
            .replacingOccurrences(of: "(n)", with: "n")
            .replacingOccurrences(of: "(e)", with: "e")
            .replacingOccurrences(of: "(s)", with: "s")
            .replacingOccurrences(of: "(en)", with: "en")
            .trimmingCharacters(in: .whitespaces)
    }

    // MARK: - Grundvorrat

    var stapleNames: [String] { staples.map(\.name) }

    func isStaple(_ ingredient: Ingredient) -> Bool {
        StapleMatcher.isStaple(ingredient.name, staples: stapleNames)
    }

    func addStaple(_ name: String) {
        guard let householdId else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !staples.contains(where: { normalized($0.name) == normalized(trimmed) }) else { return }
        save(Staple(householdId: householdId, name: trimmed))
    }

    func remove(staple: Staple) { remove(staple) }

    // MARK: - Lokale Änderungen

    private func save<T: SyncRecord>(_ record: T) {
        var record = record
        record.updatedAt = Date()
        apply(record)
        enqueue(PendingOp(table: T.table, kind: .upsert, recordId: record.id, payload: Self.payload(for: record)))
    }

    private func remove<T: SyncRecord>(_ record: T) {
        drop(T.self, id: record.id)
        enqueue(PendingOp(table: T.table, kind: .delete, recordId: record.id))
    }

    private func apply<T: SyncRecord>(_ record: T) {
        mutate(T.self) { list in
            if let i = list.firstIndex(where: { $0.id == record.id }) { list[i] = record } else { list.append(record) }
        }
    }

    private func drop<T: SyncRecord>(_ type: T.Type, id: UUID) {
        mutate(T.self) { list in list.removeAll { $0.id == id } }
    }

    private func mutate<T: SyncRecord>(_ type: T.Type, _ change: (inout [T]) -> Void) {
        switch type {
        case is ShoppingItem.Type: var l = items as! [T]; change(&l); items = l as! [ShoppingItem]
        case is Recipe.Type: var l = recipes as! [T]; change(&l); recipes = l as! [Recipe]
        case is MealPlanEntry.Type: var l = plan as! [T]; change(&l); plan = l as! [MealPlanEntry]
        case is Staple.Type: var l = staples as! [T]; change(&l); staples = l as! [Staple]
        default: break
        }
    }

    private static func payload<T: SyncRecord>(for record: T) -> Data? {
        guard let data = try? SupabaseAPI.encoder.encode(record),
              var object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        for column in T.nullableColumns where object[column] == nil { object[column] = NSNull() }
        return try? JSONSerialization.data(withJSONObject: object)
    }

    private func enqueue(_ op: PendingOp) {
        // Ältere, noch nicht gesendete Änderungen desselben Datensatzes sind überholt.
        outbox.removeAll { $0.recordId == op.recordId && $0.table == op.table }
        outbox.append(op)
        saveSnapshot()
        Task { await sync() }
    }

    // MARK: - Synchronisation

    func startPolling() {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            await self?.sync(full: true)
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                await self?.sync()
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    /// Sendet die Warteschlange und lädt den aktuellen Stand.
    /// Die Liste wird bei jedem Aufruf geladen, Rezepte/Plan/Vorrat höchstens alle 30 Sekunden.
    func sync(full: Bool = false) async {
        guard let api else { return }
        if isSyncing {
            resyncRequested = true
            fullResyncRequested = fullResyncRequested || full
            return
        }
        isSyncing = true
        defer { isSyncing = false }
        var full = full
        repeat {
            resyncRequested = false
            if syncState != .ok { syncState = .syncing }
            do {
                try await flushOutbox(api)
                items = merged(try await api.fetchAll(ShoppingItem.self))
                if full || fullResyncRequested || Date().timeIntervalSince(lastFullSync) > 30 {
                    fullResyncRequested = false
                    recipes = merged(try await api.fetchAll(Recipe.self))
                    plan = merged(try await api.fetchAll(MealPlanEntry.self))
                    staples = merged(try await api.fetchAll(Staple.self))
                    lastFullSync = Date()
                }
                lastSync = Date()
                syncState = .ok
                saveSnapshot()
            } catch let error as APIError where error.isPermanent {
                syncState = .error(error.localizedDescription)
            } catch {
                syncState = .offline(error.localizedDescription)
            }
            full = false
        } while resyncRequested
    }

    private func flushOutbox(_ api: SupabaseAPI) async throws {
        while let op = outbox.first {
            do {
                switch op.kind {
                case .upsert:
                    if let payload = op.payload { try await api.upsert(table: op.table, json: payload) }
                case .delete:
                    try await api.delete(table: op.table, id: op.recordId)
                }
            } catch let error as APIError where error.isPermanent {
                // Vom Server abgelehnte Änderung verwerfen, damit die Warteschlange nicht hängt.
                outbox.removeAll { $0.id == op.id }
                saveSnapshot()
                throw error
            }
            outbox.removeAll { $0.id == op.id }
            saveSnapshot()
        }
    }

    /// Serverstand plus noch nicht gesendete lokale Änderungen.
    private func merged<T: SyncRecord>(_ remote: [T]) -> [T] {
        var result = remote
        for op in outbox where op.table == T.table {
            switch op.kind {
            case .delete:
                result.removeAll { $0.id == op.recordId }
            case .upsert:
                guard let data = op.payload, let record = try? SupabaseAPI.decoder.decode(T.self, from: data) else { continue }
                if let i = result.firstIndex(where: { $0.id == record.id }) { result[i] = record } else { result.append(record) }
            }
        }
        return result
    }

    // MARK: - Lokaler Zwischenspeicher

    private struct Snapshot: Codable {
        var items: [ShoppingItem]
        var recipes: [Recipe]
        var plan: [MealPlanEntry]
        var staples: [Staple]
        var outbox: [PendingOp]
    }

    private static var snapshotURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("einkauf.json")
    }

    private func loadSnapshot() {
        guard let data = try? Data(contentsOf: Self.snapshotURL),
              let s = try? SupabaseAPI.decoder.decode(Snapshot.self, from: data) else { return }
        items = s.items; recipes = s.recipes; plan = s.plan; staples = s.staples; outbox = s.outbox
    }

    private func saveSnapshot() {
        let s = Snapshot(items: items, recipes: recipes, plan: plan, staples: staples, outbox: outbox)
        if let data = try? SupabaseAPI.encoder.encode(s) { try? data.write(to: Self.snapshotURL, options: .atomic) }
    }
}
