import SwiftUI

struct OnboardingView: View {
    @Environment(AppStore.self) private var store
    @State private var code = ""
    @State private var showJoin = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Text("🛒").font(.system(size: 80))
            Text("Einkauf").font(.largeTitle.bold())
            Text("Gemeinsame Einkaufsliste und Wochenplan – für euch beide.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            if !Config.isConfigured {
                Label("Supabase ist noch nicht eingerichtet. Trage URL und Key in Config.swift ein (siehe README).",
                      systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .padding()
                    .background(.orange.opacity(0.15), in: .rect(cornerRadius: 12))
            }
            Spacer()

            Button {
                store.createHousehold()
                store.startPolling()
            } label: {
                Text("Neuen Haushalt anlegen").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Button {
                showJoin = true
            } label: {
                Text("Haushalt beitreten").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)

            Text("Zum Beitreten den QR-Code vom anderen iPhone (Mehr → Haushalt teilen) mit der Kamera scannen oder den Code einfügen.")
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(24)
        .tint(.green)
        .alert("Haushalt beitreten", isPresented: $showJoin) {
            TextField("Haushalts-Code", text: $code)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Beitreten") {
                if let id = HouseholdCode.parse(code) {
                    store.joinHousehold(id)
                    store.startPolling()
                }
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Füge den Code oder Link ein, den du vom anderen iPhone bekommen hast.")
        }
    }
}

enum HouseholdCode {
    /// Akzeptiert den reinen Code oder den einkauf://join?h=… Link.
    static func parse(_ text: String) -> UUID? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let id = UUID(uuidString: trimmed) { return id }
        if let range = trimmed.range(of: "h=") {
            return UUID(uuidString: String(trimmed[range.upperBound...].prefix(36)))
        }
        return nil
    }

    static func link(_ id: UUID) -> String {
        "einkauf://join?h=\(id.uuidString.lowercased())"
    }
}
