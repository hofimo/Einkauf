import SwiftUI

struct ChefkochSearchView: View {
    @State private var query = ""
    @State private var results: [RecipeImporter.SearchResult] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        List {
            if let error {
                Text(error).foregroundStyle(.red)
            }
            ForEach(results) { result in
                NavigationLink {
                    ChefkochPreviewView(result: result)
                } label: {
                    HStack(spacing: 12) {
                        RecipeImage(url: result.imageURL?.absoluteString)
                            .frame(width: 72, height: 54)
                            .clipShape(.rect(cornerRadius: 8))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(result.title).font(.body.weight(.medium)).lineLimit(2)
                            HStack(spacing: 8) {
                                if result.votes > 0 {
                                    Label(String(format: "%.1f (%d)", result.rating, result.votes), systemImage: "star.fill")
                                }
                                if result.minutes > 0 {
                                    Label("\(result.minutes) Min.", systemImage: "clock")
                                }
                                if result.isPremium {
                                    Text("Plus")
                                }
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .labelStyle(.titleAndIcon)
                        }
                    }
                }
            }
        }
        .overlay {
            if loading {
                ProgressView()
            } else if results.isEmpty && !query.isEmpty && error == nil {
                ContentUnavailableView.search(text: query)
            } else if results.isEmpty {
                ContentUnavailableView("Chefkoch durchsuchen", systemImage: "magnifyingglass",
                                       description: Text("z. B. „Lasagne“, „Linsencurry“ oder „schnelle Pasta“"))
            }
        }
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Gericht suchen")
        .onSubmit(of: .search) { Task { await runSearch() } }
        .navigationTitle("Chefkoch")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func runSearch() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        loading = true
        error = nil
        defer { loading = false }
        do {
            results = try await RecipeImporter.search(q)
        } catch {
            self.error = "Suche fehlgeschlagen: \(error.localizedDescription)"
            results = []
        }
    }
}

/// Vorschau eines Chefkoch-Rezepts vor dem Speichern.
struct ChefkochPreviewView: View {
    @Environment(AppStore.self) private var store
    let result: RecipeImporter.SearchResult
    @State private var draft: RecipeImporter.Draft?
    @State private var error: String?
    @State private var planning: Recipe?

    private var alreadySaved: Recipe? {
        store.recipes.first { $0.chefkochId == result.id }
    }

    var body: some View {
        List {
            RecipeImage(url: draft?.imageURL ?? result.imageURL?.absoluteString)
                .frame(height: 200)
                .clipped()
                .listRowInsets(EdgeInsets())

            if let error {
                Text(error).foregroundStyle(.red)
            }

            if let draft {
                Section {
                    if let saved = alreadySaved {
                        Label("In euren Rezepten gespeichert", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Button("Zum Wochenplan hinzufügen", systemImage: "calendar.badge.plus") { planning = saved }
                    } else {
                        Button("In unsere Rezepte übernehmen", systemImage: "square.and.arrow.down") { save(draft) }
                        Button("Speichern und einplanen", systemImage: "calendar.badge.plus") {
                            planning = save(draft)
                        }
                    }
                }
                Section("Zutaten für \(draft.servings) Portionen") {
                    IngredientList(ingredients: draft.ingredients)
                }
                if !draft.instructions.isEmpty {
                    Section("Zubereitung") { Text(draft.instructions).font(.callout) }
                }
            } else if error == nil {
                HStack { Spacer(); ProgressView(); Spacer() }
            }
        }
        .navigationTitle(result.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do { draft = try await RecipeImporter.chefkochRecipe(id: result.id) }
            catch { self.error = "Rezept konnte nicht geladen werden: \(error.localizedDescription)" }
        }
        .sheet(item: $planning) { recipe in
            PlanRecipeView(recipe: recipe, servings: recipe.servings)
        }
    }

    @discardableResult
    private func save(_ draft: RecipeImporter.Draft) -> Recipe? {
        guard let hid = store.householdId else { return nil }
        let recipe = draft.recipe(householdId: hid)
        store.save(recipe: recipe)
        return recipe
    }
}
