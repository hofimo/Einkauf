import CoreImage.CIFilterBuiltins
import SwiftUI

struct SettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var newStaple = ""
    @State private var confirmLeave = false

    var body: some View {
        NavigationStack {
            Form {
                if let id = store.householdId {
                    Section {
                        NavigationLink {
                            ShareHouseholdView(householdId: id)
                        } label: {
                            Label("Haushalt teilen", systemImage: "person.2")
                        }
                    } footer: {
                        Text("Damit deine Freundin dieselbe Liste sieht: auf ihrem iPhone den QR-Code scannen.")
                    }
                }

                Section {
                    ForEach(store.staples.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }) { staple in
                        Text(staple.name)
                    }
                    .onDelete { offsets in
                        let sorted = store.staples.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                        for i in offsets { store.remove(staple: sorted[i]) }
                    }
                    HStack {
                        TextField("Hinzufügen …", text: $newStaple)
                            .onSubmit(addStaple)
                        Button("Hinzufügen", action: addStaple).disabled(newStaple.isEmpty)
                    }
                } header: {
                    Text("Grundvorrat")
                } footer: {
                    Text("Diese Zutaten habt ihr immer zu Hause. Sie werden beim Einplanen von Gerichten nicht auf die Liste gesetzt. „Öl“ erfasst auch Olivenöl, Rapsöl usw.")
                }

                Section("Sprachsteuerung") {
                    NavigationLink {
                        VoiceHelpView()
                    } label: {
                        Label("Siri & Alexa", systemImage: "mic")
                    }
                }

                Section("Synchronisation") {
                    LabeledContent("Status", value: statusText)
                    if let last = store.lastSync {
                        LabeledContent("Zuletzt", value: last.formatted(date: .omitted, time: .standard))
                    }
                    Button("Jetzt synchronisieren") { Task { await store.sync(full: true) } }
                }

                Section {
                    Button("Haushalt verlassen", role: .destructive) { confirmLeave = true }
                }
            }
            .navigationTitle("Mehr")
            .confirmationDialog("Haushalt auf diesem iPhone verlassen?", isPresented: $confirmLeave, titleVisibility: .visible) {
                Button("Verlassen", role: .destructive) { store.leaveHousehold() }
            } message: {
                Text("Die Daten bleiben auf dem Server. Mit dem Haushalts-Code kannst du wieder beitreten.")
            }
        }
    }

    private var statusText: String {
        switch store.syncState {
        case .idle: "–"
        case .syncing: "Synchronisiere …"
        case .ok: store.pendingChanges == 0 ? "Aktuell" : "\(store.pendingChanges) ausstehend"
        case .offline: "Offline – \(store.pendingChanges) Änderungen warten"
        case let .error(m): m
        }
    }

    private func addStaple() {
        store.addStaple(newStaple)
        newStaple = ""
    }
}

struct ShareHouseholdView: View {
    let householdId: UUID

    private var link: String { HouseholdCode.link(householdId) }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Text("Auf dem anderen iPhone die Kamera-App öffnen und diesen Code scannen. Die Einkauf-App muss dort installiert sein.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                if let image = qrCode(link) {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 240, height: 240)
                        .padding()
                        .background(.white, in: .rect(cornerRadius: 16))
                }
                Text("Oder den Code kopieren und unter „Haushalt beitreten“ einfügen:")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Text(householdId.uuidString.lowercased())
                    .font(.footnote.monospaced())
                    .textSelection(.enabled)
                HStack {
                    Button("Kopieren", systemImage: "doc.on.doc") {
                        UIPasteboard.general.string = householdId.uuidString.lowercased()
                    }
                    ShareLink(item: link) { Label("Senden", systemImage: "square.and.arrow.up") }
                }
                .buttonStyle(.bordered)

                Text("Diesen Code brauchst du auch für den Alexa-Skill (siehe README).")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
        .navigationTitle("Haushalt teilen")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func qrCode(_ string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

struct VoiceHelpView: View {
    var body: some View {
        List {
            Section {
                Text("„Hey Siri, schreib etwas auf Einkauf“\n→ Siri fragt: „Was soll auf die Einkaufsliste?“\n→ „Brot und zwei Liter Milch“")
                Text("„Hey Siri, was steht auf Einkauf?“")
            } header: {
                Text("Siri")
            } footer: {
                Text("Funktioniert sofort nach der Installation, auch auf dem Sperrbildschirm und mit AirPods. In der Kurzbefehle-App findest du die Aktionen unter „Einkauf“.")
            }
            Section {
                Text("„Alexa, öffne Einkauf und schreibe Brot auf die Liste“")
                Text("„Alexa, sag Einkauf, ich brauche Milch und Eier“")
                Text("„Alexa, frag Einkauf, was auf der Liste steht“")
            } header: {
                Text("Alexa")
            } footer: {
                Text("Dafür muss einmalig der Alexa-Skill eingerichtet werden (Anleitung im README, Ordner „alexa“).")
            }
        }
        .navigationTitle("Siri & Alexa")
    }
}
