import Foundation

/// Zugangsdaten zum eigenen Supabase-Projekt (siehe README, Schritt 1).
/// Den "anon"/"publishable" Key darf man in die App einbauen. Geschützt werden die Daten
/// durch den Haushalts-Code und Row Level Security.
enum Config {
    static let supabaseURL = "https://DEIN-PROJEKT.supabase.co"
    static let supabaseKey = "DEIN-ANON-ODER-PUBLISHABLE-KEY"

    static var isConfigured: Bool {
        !supabaseURL.contains("DEIN-PROJEKT") && !supabaseKey.hasPrefix("DEIN-")
    }
}
