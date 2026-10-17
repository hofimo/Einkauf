import SwiftUI

struct RecipesView: View {
    @Environment(AppStore.self) private var store
    @State private var search = ""
    @State private var sheet: Sheet?

    enum Sheet: String, Identifiable {
        case new, importLink
        var id: String { rawValue }
    }

    private var filtered: [Recipe] {
        let list = store.recipes.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        guard !search.isEmpty else { return list }
        return list.filter {
            $0.title.localizedCaseInsensitiveContains(search)
                || $0.ingredients.contains { $0.name.localizedCaseInsensitiveContains(search) }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink {
                        ChefkochSearchView()
                    } label: {
                        Label("Auf Chefkoch suchen", systemImage: "magnifyingglass")
                    }
                }
                Section(store.recipes.isEmpty ? "" : "Unsere Rezepte") {
                    ForEach(filtered) { recipe in
                        NavigationLink(value: recipe.id) {
                            RecipeRow(recipe: recipe)
                        }
                    }
                    .onDelete { offsets in
                        for i in offsets { store.delete(recipe: filtered[i]) }
                    }
                }
            }
            .overlay {
                if store.recipes.isEmpty {
                    ContentUnavailableView {
                        Label("Noch keine Rezepte", systemImage: "book")
                    } description: {
                        Text("Such ein Gericht auf Chefkoch, importiere einen Link oder leg ein eigenes Rezept an.")
                    }
                    .padding(.top, 120)
                }
            }
            .searchable(text: $search, prompt: "Rezept oder Zutat")
            .navigationTitle("Rezepte")
            .navigationDestination(for: UUID.self) { id in
                RecipeDetailView(recipeId: id)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Eigenes Rezept", systemImage: "square.and.pencil") { sheet = .new }
                        Button("Aus Link importieren", systemImage: "link") { sheet = .importLink }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(item: $sheet) { sheet in
                switch sheet {
                case .new:
                    if let hid = store.householdId {
                        RecipeEditView(recipe: Recipe(householdId: hid, title: ""), isNew: true)
                    }
                case .importLink:
                    ImportLinkView()
                }
            }
        }
    }
}

struct RecipeRow: View {
    let recipe: Recipe

    var body: some View {
        HStack(spacing: 12) {
            RecipeImage(url: recipe.imageUrl)
                .frame(width: 56, height: 56)
                .clipShape(.rect(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 2) {
                Text(recipe.title).font(.body.weight(.medium)).lineLimit(2)
                Text("\(recipe.ingredients.count) Zutaten · \(recipe.servings) Portionen")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct RecipeImage: View {
    let url: String?

    var body: some View {
        if let url, let u = URL(string: url) {
            AsyncImage(url: u) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    placeholder
                }
            }
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        ZStack {
            Color.green.opacity(0.15)
            Image(systemName: "fork.knife").foregroundStyle(.green)
        }
    }
}

// MARK: - Detail

struct RecipeDetailView: View {
    @Environment(AppStore.self) private var store
    let recipeId: UUID
    @State private var editing = false
    @State private var planning = false
    @State private var servings = 2

    var body: some View {
        if let recipe = store.recipe(id: recipeId) {
            List {
                if recipe.imageUrl != nil {
                    RecipeImage(url: recipe.imageUrl)
                        .frame(height: 220)
                        .clipped()
                        .listRowInsets(EdgeInsets())
                }
                Section {
                    Button {
                        planning = true
                    } label: {
                        Label("Zum Wochenplan hinzufügen", systemImage: "calendar.badge.plus")
                    }
                }
                Section {
                    Stepper("\(servings) Portionen", value: $servings, in: 1...20)
                    IngredientList(ingredients: recipe.ingredients,
                                   scale: Double(servings) / Double(max(recipe.servings, 1)))
                } header: {
                    Text("Zutaten")
                }
                if !recipe.instructions.isEmpty {
                    Section("Zubereitung") {
                        Text(recipe.instructions).font(.callout)
                    }
                }
                if let source = recipe.sourceUrl, let url = URL(string: source) {
                    Section {
                        Link(destination: url) {
                            Label(recipe.chefkochId != nil ? "Auf Chefkoch öffnen" : "Originalrezept öffnen",
                                  systemImage: "safari")
                        }
                    }
                }
            }
            .navigationTitle(recipe.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                Button("Bearbeiten") { editing = true }
            }
            .onAppear { servings = recipe.servings }
            .sheet(isPresented: $editing) {
                RecipeEditView(recipe: recipe, isNew: false)
            }
            .sheet(isPresented: $planning) {
                PlanRecipeView(recipe: recipe, servings: servings)
            }
        } else {
            ContentUnavailableView("Rezept nicht gefunden", systemImage: "book")
        }
    }
}

struct IngredientList: View {
    @Environment(AppStore.self) private var store
    let ingredients: [Ingredient]
    var scale: Double = 1

    var body: some View {
        ForEach(Array(groups.enumerated()), id: \.offset) { _, group in
            if !group.name.isEmpty {
                Text(group.name).font(.subheadline.bold()).foregroundStyle(.secondary)
            }
            ForEach(group.items) { ing in
                HStack(alignment: .firstTextBaseline) {
                    Text(ing.quantityText(scale: scale))
                        .frame(width: 80, alignment: .trailing)
                        .foregroundStyle(.secondary)
                    VStack(alignment: .leading) {
                        Text(ing.name)
                        if !ing.note.isEmpty {
                            Text(ing.note).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    if store.isStaple(ing) {
                        Text("Vorrat").font(.caption2).padding(.horizontal, 6).padding(.vertical, 2)
                            .background(.secondary.opacity(0.15), in: .capsule)
                    }
                }
            }
        }
    }

    private var groups: [(name: String, items: [Ingredient])] {
        var result: [(name: String, items: [Ingredient])] = []
        for ing in ingredients {
            if let last = result.indices.last, result[last].name == ing.group {
                result[last].items.append(ing)
            } else {
                result.append((ing.group, [ing]))
            }
        }
        return result
    }
}

// MARK: - Bearbeiten

struct RecipeEditView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var recipe: Recipe
    let isNew: Bool
    @State private var ingredientText = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name des Gerichts", text: $recipe.title)
                    Stepper("\(recipe.servings) Portionen", value: $recipe.servings, in: 1...20)
                }
                Section {
                    TextEditor(text: $ingredientText)
                        .frame(minHeight: 180)
                        .font(.body.monospaced())
                } header: {
                    Text("Zutaten")
                } footer: {
                    Text("Eine Zutat pro Zeile, z. B. „500 g Hackfleisch“, „2 Zwiebeln“, „1 Prise Salz“. Grundvorrat wie Salz und Pfeffer wird beim Planen automatisch weggelassen.")
                }
                Section("Zubereitung") {
                    TextEditor(text: $recipe.instructions).frame(minHeight: 140)
                }
                Section("Link (optional)") {
                    TextField("https://…", text: Binding(
                        get: { recipe.sourceUrl ?? "" },
                        set: { recipe.sourceUrl = $0.isEmpty ? nil : $0 }))
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                }
            }
            .navigationTitle(isNew ? "Neues Rezept" : "Rezept bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Sichern", action: save)
                        .disabled(recipe.title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                ingredientText = recipe.ingredients.map(\.displayLine).joined(separator: "\n")
            }
        }
    }

    private func save() {
        // Unveränderte Zeilen behalten ihre Gruppen und Details (z. B. von Chefkoch)
        let existing = Dictionary(recipe.ingredients.map { ($0.displayLine, $0) }, uniquingKeysWith: { a, _ in a })
        recipe.ingredients = ingredientText
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .compactMap { line in existing[line] ?? IngredientParser.parse(line) }
        store.save(recipe: recipe)
        dismiss()
    }
}

// MARK: - Import per Link

struct ImportLinkView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var link = ""
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://www.chefkoch.de/rezepte/…", text: $link, axis: .vertical)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    PasteButton(payloadType: String.self) { strings in
                        if let s = strings.first { link = s }
                    }
                } footer: {
                    Text("Funktioniert mit Chefkoch und den meisten anderen Rezeptseiten.")
                }
                if let error {
                    Text(error).foregroundStyle(.red)
                }
            }
            .navigationTitle("Rezept importieren")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if loading {
                        ProgressView()
                    } else {
                        Button("Importieren") { Task { await importLink() } }.disabled(link.isEmpty)
                    }
                }
            }
        }
    }

    private func importLink() async {
        guard let hid = store.householdId else { return }
        loading = true
        defer { loading = false }
        do {
            let draft = try await RecipeImporter.importRecipe(from: link)
            store.save(recipe: draft.recipe(householdId: hid))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
