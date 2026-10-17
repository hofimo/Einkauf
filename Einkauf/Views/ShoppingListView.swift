import SwiftUI

/// Einkaufsliste im Stil von Bring: Kacheln nach Abteilung, Antippen = gekauft.
struct ShoppingListView: View {
    @Environment(AppStore.self) private var store
    @State private var input = ""
    @State private var editing: ShoppingItem?
    @State private var showChecked = true
    @FocusState private var inputFocused: Bool

    private let columns = [GridItem(.adaptive(minimum: 104), spacing: 8)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if !suggestions.isEmpty {
                        suggestionGrid
                    } else if store.openItems.isEmpty {
                        emptyState
                    }

                    ForEach(store.openItemsByCategory, id: \.category) { group in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(group.category.rawValue)
                                .font(.headline)
                                .foregroundStyle(.secondary)
                            LazyVGrid(columns: columns, spacing: 8) {
                                ForEach(group.items) { item in
                                    ItemTile(item: item, style: .open)
                                        .onTapGesture { withAnimation(.snappy) { store.toggle(item) } }
                                        .contextMenu { contextMenu(for: item) }
                                }
                            }
                        }
                    }

                    if !store.checkedItems.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Button {
                                withAnimation { showChecked.toggle() }
                            } label: {
                                HStack {
                                    Text("Zuletzt gekauft").font(.headline)
                                    Image(systemName: showChecked ? "chevron.down" : "chevron.right").font(.caption)
                                    Spacer()
                                }
                                .foregroundStyle(.secondary)
                            }
                            if showChecked {
                                LazyVGrid(columns: columns, spacing: 8) {
                                    ForEach(store.checkedItems.prefix(30)) { item in
                                        ItemTile(item: item, style: .checked)
                                            .onTapGesture { withAnimation(.snappy) { store.toggle(item) } }
                                            .contextMenu { contextMenu(for: item) }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding()
            }
            .scrollDismissesKeyboard(.immediately)
            .safeAreaInset(edge: .top) { inputBar }
            .navigationTitle("Einkaufsliste")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { SyncBadge() }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Gekaufte entfernen", systemImage: "trash", role: .destructive) { store.clearChecked() }
                            .disabled(store.checkedItems.isEmpty)
                        ShareLink(item: shareText) { Label("Liste teilen", systemImage: "square.and.arrow.up") }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .refreshable { await store.sync(full: true) }
            .sheet(item: $editing) { item in
                ItemEditView(item: item)
                    .presentationDetents([.medium, .large])
            }
        }
    }

    private var inputBar: some View {
        HStack {
            Image(systemName: "plus.circle.fill").foregroundStyle(.green).font(.title2)
            TextField("Was brauchst du?", text: $input)
                .focused($inputFocused)
                .submitLabel(.done)
                .onSubmit(addInput)
            if !input.isEmpty {
                Button("Hinzufügen", action: addInput).bold()
            }
        }
        .padding(12)
        .background(.regularMaterial, in: .rect(cornerRadius: 14))
        .padding(.horizontal)
        .padding(.bottom, 4)
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Text("🎉").font(.system(size: 48))
            Text("Alles erledigt").font(.title3.bold())
            Text("Tippe oben etwas ein, sag „Hey Siri, schreib etwas auf Einkauf“ oder plane Gerichte im Wochenplan.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    /// Vorschläge passend zur Eingabe: früher gekaufte Artikel und häufige Lebensmittel.
    private var suggestions: [String] {
        let query = input.trimmingCharacters(in: .whitespaces).lowercased()
        guard !query.isEmpty else { return [] }
        let open = Set(store.openItems.map { $0.name.lowercased() })
        var seen = Set<String>()
        let candidates = store.checkedItems.map(\.name) + Catalog.suggestions
        let matches = candidates.filter { name in
            let lower = name.lowercased()
            return lower.contains(query) && !open.contains(lower) && seen.insert(lower).inserted
        }
        let typed = input.trimmingCharacters(in: .whitespaces)
        let exact = matches.contains { $0.lowercased() == query }
        return Array(((exact ? [] : [typed]) + matches).prefix(9))
    }

    private var suggestionGrid: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(suggestions, id: \.self) { name in
                let category = Catalog.category(for: name)
                VStack(spacing: 4) {
                    Text(Catalog.emoji(for: name, category: category)).font(.title)
                    Text(name).font(.footnote.weight(.medium)).lineLimit(2).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, minHeight: 84)
                .padding(6)
                .background(Color.green.opacity(0.12), in: .rect(cornerRadius: 12))
                .onTapGesture {
                    store.addItems(fromSpoken: name, source: "")
                    input = ""
                }
            }
        }
    }

    @ViewBuilder
    private func contextMenu(for item: ShoppingItem) -> some View {
        Button("Bearbeiten", systemImage: "pencil") { editing = item }
        Button("Löschen", systemImage: "trash", role: .destructive) { store.delete(item) }
    }

    private func addInput() {
        let text = input.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        store.addItems(fromSpoken: text, source: "")
        input = ""
        inputFocused = true
    }

    private var shareText: String {
        store.openItemsByCategory.map { group in
            ([group.category.rawValue + ":"] + group.items.map { item in
                "• " + item.name + (item.quantity.isEmpty ? "" : " (\(item.quantity))")
            }).joined(separator: "\n")
        }.joined(separator: "\n\n")
    }
}

struct ItemTile: View {
    enum Style { case open, checked }
    let item: ShoppingItem
    let style: Style

    var body: some View {
        VStack(spacing: 2) {
            Text(Catalog.emoji(for: item.name, category: item.categoryValue))
                .font(.title)
                .grayscale(style == .checked ? 1 : 0)
            Text(item.name)
                .font(.footnote.weight(.semibold))
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.8)
            if !item.quantity.isEmpty || !item.note.isEmpty {
                Text([item.quantity, item.note].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption2)
                    .lineLimit(1)
                    .opacity(0.85)
            }
        }
        .foregroundStyle(style == .open ? Color.white : Color.primary)
        .frame(maxWidth: .infinity, minHeight: 92)
        .padding(6)
        .background(style == .open ? Color.green.gradient : Color.secondary.opacity(0.15).gradient,
                    in: .rect(cornerRadius: 12))
        .overlay(alignment: .topTrailing) {
            if !item.source.isEmpty, style == .open {
                Image(systemName: item.source == "Alexa" || item.source == "Siri" ? "mic.fill" : "fork.knife")
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.8))
                    .padding(6)
            }
        }
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityHint(style == .open ? "Als gekauft markieren" : "Wieder auf die Liste setzen")
    }
}

struct ItemEditView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var item: ShoppingItem

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $item.name)
                TextField("Menge (z. B. 500 g)", text: $item.quantity)
                TextField("Notiz (z. B. Bio, Marke)", text: $item.note)
                Picker("Abteilung", selection: $item.category) {
                    ForEach(Category.allCases) { c in
                        Text("\(c.emoji) \(c.rawValue)").tag(c.rawValue)
                    }
                }
                if !item.source.isEmpty {
                    LabeledContent("Für", value: item.source)
                }
                Section {
                    Button("Löschen", role: .destructive) {
                        store.delete(item)
                        dismiss()
                    }
                }
            }
            .navigationTitle("Artikel")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { item.category = item.categoryValue.rawValue }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Sichern") {
                        store.update(item)
                        dismiss()
                    }
                    .disabled(item.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

struct SyncBadge: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        switch store.syncState {
        case .offline:
            Label("Offline\(store.pendingChanges > 0 ? " (\(store.pendingChanges))" : "")", systemImage: "wifi.slash")
                .font(.caption)
                .foregroundStyle(.orange)
        case let .error(message):
            Label("Fehler", systemImage: "exclamationmark.triangle")
                .font(.caption)
                .foregroundStyle(.red)
                .help(message)
        default:
            EmptyView()
        }
    }
}
