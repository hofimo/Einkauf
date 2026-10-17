import SwiftUI

@main
struct EinkaufApp: App {
    @State private var store = AppStore.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .onOpenURL(perform: handle)
        }
        .onChange(of: scenePhase, initial: true) { _, phase in
            if phase == .active, store.householdId != nil {
                store.startPolling()
            } else if phase == .background {
                store.stopPolling()
            }
        }
    }

    /// einkauf://join?h=<Haushalts-Code> – z. B. über den QR-Code in den Einstellungen.
    private func handle(_ url: URL) {
        guard url.scheme == "einkauf", url.host == "join",
              let value = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                  .queryItems?.first(where: { $0.name == "h" })?.value,
              let id = UUID(uuidString: value) else { return }
        if store.householdId != id {
            store.joinHousehold(id)
            store.startPolling()
        }
    }
}

struct RootView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        if store.householdId == nil {
            OnboardingView()
        } else {
            TabView {
                Tab("Einkauf", systemImage: "cart") { ShoppingListView() }
                Tab("Wochenplan", systemImage: "calendar") { WeekPlanView() }
                Tab("Rezepte", systemImage: "book") { RecipesView() }
                Tab("Mehr", systemImage: "gearshape") { SettingsView() }
            }
            .tint(.green)
        }
    }
}
