import AppIntents

/// "Hey Siri, schreib etwas auf Einkauf" → "Was soll auf die Einkaufsliste?" → "Brot und Milch"
struct AddItemIntent: AppIntent {
    static let title: LocalizedStringResource = "Auf die Einkaufsliste setzen"
    static let description = IntentDescription("Fügt einen oder mehrere Artikel zur gemeinsamen Einkaufsliste hinzu.")
    static let openAppWhenRun = false

    @Parameter(title: "Artikel", requestValueDialog: IntentDialog("Was soll auf die Einkaufsliste?"))
    var item: String

    static var parameterSummary: some ParameterSummary {
        Summary("\(\.$item) auf die Einkaufsliste setzen")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let store = AppStore.shared
        guard store.householdId != nil else {
            return .result(dialog: "Öffne zuerst die Einkauf-App und richte euren Haushalt ein.")
        }
        let added = store.addItems(fromSpoken: item, source: "Siri")
        await store.sync()
        guard !added.isEmpty else { return .result(dialog: "Das habe ich nicht verstanden.") }
        return .result(dialog: "\(ListFormatter.localizedString(byJoining: added)) steht auf der Liste.")
    }
}

/// "Hey Siri, was steht auf Einkauf?"
struct ReadListIntent: AppIntent {
    static let title: LocalizedStringResource = "Einkaufsliste vorlesen"
    static let description = IntentDescription("Liest die offenen Artikel der Einkaufsliste vor.")
    static let openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let store = AppStore.shared
        await store.sync()
        let names = store.openItems.map(\.name)
        guard !names.isEmpty else { return .result(dialog: "Die Einkaufsliste ist leer.") }
        let count = names.count == 1 ? "einen Artikel" : "\(names.count) Artikel"
        return .result(dialog: "Auf der Liste stehen \(count): \(ListFormatter.localizedString(byJoining: names)).")
    }
}

struct EinkaufShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddItemIntent(),
            phrases: [
                "Schreib etwas auf \(.applicationName)",
                "Schreibe etwas auf \(.applicationName)",
                "Etwas auf \(.applicationName) setzen",
                "\(.applicationName) ergänzen",
                "Füge etwas zu \(.applicationName) hinzu",
                "Neuer Eintrag in \(.applicationName)",
            ],
            shortTitle: "Artikel hinzufügen",
            systemImageName: "cart.badge.plus"
        )
        AppShortcut(
            intent: ReadListIntent(),
            phrases: [
                "Was steht auf \(.applicationName)",
                "Lies \(.applicationName) vor",
            ],
            shortTitle: "Liste vorlesen",
            systemImageName: "list.bullet"
        )
    }
}
