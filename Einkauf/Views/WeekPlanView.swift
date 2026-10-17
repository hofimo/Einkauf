import SwiftUI

struct WeekPlanView: View {
    @Environment(AppStore.self) private var store
    @State private var weekStart = DayFormat.startOfWeek(Date())
    @State private var pickingDay: PickDay?

    struct PickDay: Identifiable {
        let date: Date
        var id: Date { date }
    }

    private var days: [Date] {
        (0..<7).compactMap { DayFormat.calendar.date(byAdding: .day, value: $0, to: weekStart) }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(days, id: \.self) { day in
                    Section {
                        ForEach(store.entries(on: day)) { entry in
                            PlanEntryRow(entry: entry)
                        }
                        .onDelete { offsets in
                            let entries = store.entries(on: day)
                            for i in offsets { store.remove(entry: entries[i]) }
                        }
                        Button {
                            pickingDay = PickDay(date: day)
                        } label: {
                            Label("Gericht planen", systemImage: "plus")
                                .font(.callout)
                        }
                    } header: {
                        HStack {
                            Text(day.formatted(.dateTime.weekday(.wide).locale(Locale(identifier: "de_DE"))))
                            Spacer()
                            Text(day.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: "de_DE"))))
                        }
                        .foregroundStyle(DayFormat.calendar.isDateInToday(day) ? .green : .secondary)
                    }
                }
            }
            .navigationTitle(weekTitle)
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: UUID.self) { id in RecipeDetailView(recipeId: id) }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { shiftWeek(-1) } label: { Image(systemName: "chevron.left") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { shiftWeek(1) } label: { Image(systemName: "chevron.right") }
                }
                ToolbarItem(placement: .bottomBar) {
                    if weekStart != DayFormat.startOfWeek(Date()) {
                        Button("Diese Woche") { weekStart = DayFormat.startOfWeek(Date()) }
                    }
                }
            }
            .refreshable { await store.sync(full: true) }
            .sheet(item: $pickingDay) { pick in
                RecipePickerView(day: pick.date)
            }
        }
    }

    private var weekTitle: String {
        let week = DayFormat.calendar.component(.weekOfYear, from: weekStart)
        if weekStart == DayFormat.startOfWeek(Date()) { return "Diese Woche (KW \(week))" }
        return "KW \(week)"
    }

    private func shiftWeek(_ delta: Int) {
        if let d = DayFormat.calendar.date(byAdding: .weekOfYear, value: delta, to: weekStart) { weekStart = d }
    }
}

struct PlanEntryRow: View {
    @Environment(AppStore.self) private var store
    let entry: MealPlanEntry

    var body: some View {
        if let recipe = store.recipe(id: entry.recipeId) {
            NavigationLink(value: recipe.id) { content(recipe: recipe) }
        } else {
            content(recipe: nil)
        }
    }

    private func content(recipe: Recipe?) -> some View {
        HStack(spacing: 12) {
            RecipeImage(url: recipe?.imageUrl)
                .frame(width: 44, height: 44)
                .clipShape(.rect(cornerRadius: 8))
            VStack(alignment: .leading) {
                Text(entry.title).font(.body.weight(.medium))
                if recipe != nil {
                    Text("\(entry.servings) Portionen").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}

/// Auswahl eines Rezepts (oder eines freien Eintrags) für einen Tag.
struct RecipePickerView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let day: Date
    @State private var search = ""
    @State private var freeText = ""

    private var filtered: [Recipe] {
        let list = store.recipes.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        guard !search.isEmpty else { return list }
        return list.filter { $0.title.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("Ohne Rezept, z. B. „Reste“ oder „Essen gehen“", text: $freeText)
                        Button("OK") {
                            store.addPlanEntry(day: day, title: freeText, recipe: nil, servings: 2)
                            dismiss()
                        }
                        .disabled(freeText.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                Section {
                    NavigationLink {
                        ChefkochSearchView()
                    } label: {
                        Label("Neues Gericht auf Chefkoch suchen", systemImage: "magnifyingglass")
                    }
                }
                Section("Unsere Rezepte") {
                    if store.recipes.isEmpty {
                        Text("Noch keine Rezepte gespeichert.").foregroundStyle(.secondary)
                    }
                    ForEach(filtered) { recipe in
                        NavigationLink {
                            PlanRecipeForm(recipe: recipe, servings: recipe.servings, day: day, onDone: { dismiss() })
                        } label: {
                            RecipeRow(recipe: recipe)
                        }
                    }
                }
            }
            .searchable(text: $search, prompt: "Rezept suchen")
            .navigationTitle(day.formatted(.dateTime.weekday(.wide).day().month().locale(Locale(identifier: "de_DE"))))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
            }
        }
    }
}

/// Sheet: Rezept einplanen (Tag wählen) – z. B. aus der Rezeptansicht.
struct PlanRecipeView: View {
    @Environment(\.dismiss) private var dismiss
    let recipe: Recipe
    let servings: Int

    var body: some View {
        NavigationStack {
            PlanRecipeForm(recipe: recipe, servings: servings, day: nil, onDone: { dismiss() })
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                }
        }
    }
}

/// Tag und Portionen wählen, Zutaten prüfen und auf die Einkaufsliste übernehmen.
/// Grundvorrat (Salz, Pfeffer …) ist vorab abgewählt.
struct PlanRecipeForm: View {
    @Environment(AppStore.self) private var store
    let recipe: Recipe
    @State var servings: Int
    let fixedDay: Date?
    let onDone: () -> Void

    @State private var day: Date
    @State private var selected: Set<UUID> = []
    @State private var addToList = true

    init(recipe: Recipe, servings: Int, day: Date?, onDone: @escaping () -> Void) {
        self.recipe = recipe
        self._servings = State(initialValue: servings)
        self.fixedDay = day
        self.onDone = onDone
        self._day = State(initialValue: day ?? Date())
    }

    private var scale: Double { Double(servings) / Double(max(recipe.servings, 1)) }

    var body: some View {
        Form {
            Section {
                if fixedDay == nil {
                    DatePicker("Tag", selection: $day, displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "de_DE"))
                }
                Stepper("\(servings) Portionen", value: $servings, in: 1...20)
                Toggle("Zutaten auf die Einkaufsliste", isOn: $addToList)
            }
            if addToList {
                Section {
                    ForEach(recipe.ingredients) { ing in
                        Button {
                            if selected.contains(ing.id) { selected.remove(ing.id) } else { selected.insert(ing.id) }
                        } label: {
                            HStack {
                                Image(systemName: selected.contains(ing.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(selected.contains(ing.id) ? .green : .secondary)
                                Text(store.displayName(for: ing.name))
                                    .foregroundStyle(selected.contains(ing.id) ? .primary : .secondary)
                                Spacer()
                                if store.isStaple(ing) {
                                    Text("Vorrat").font(.caption2).foregroundStyle(.secondary)
                                }
                                Text(ing.quantityText(scale: scale, forShopping: true))
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    Text("Zutaten (\(selected.count) von \(recipe.ingredients.count))")
                } footer: {
                    Text("Grundvorrat ist abgewählt. Was ihr zu Hause habt, einfach antippen. Den Grundvorrat pflegt ihr unter „Mehr“.")
                }
            }
        }
        .navigationTitle(recipe.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Einplanen", action: commit).bold()
            }
        }
        .onAppear {
            if selected.isEmpty {
                selected = Set(recipe.ingredients.filter { !store.isStaple($0) }.map(\.id))
            }
        }
    }

    private func commit() {
        store.addPlanEntry(day: fixedDay ?? day, title: recipe.title, recipe: recipe, servings: servings)
        if addToList {
            let chosen = recipe.ingredients.filter { selected.contains($0.id) }
            store.addIngredients(chosen, scale: scale, source: recipe.title)
        }
        onDone()
    }
}
