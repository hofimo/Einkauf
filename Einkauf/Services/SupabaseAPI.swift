import Foundation

enum APIError: LocalizedError {
    case notConfigured
    case http(Int, String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Supabase ist noch nicht eingerichtet (Config.swift)."
        case let .http(code, body): "Serverfehler \(code): \(body.prefix(200))"
        }
    }

    /// 4xx-Fehler werden nicht wiederholt, alles andere (Netzwerk, 5xx) schon.
    var isPermanent: Bool {
        if case let .http(code, _) = self { return (400..<500).contains(code) && code != 408 && code != 429 }
        return false
    }
}

/// Minimaler Client für die PostgREST-Schnittstelle von Supabase.
struct SupabaseAPI: Sendable {
    let baseURL: String
    let key: String
    let householdId: UUID

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(DateCoding.formatter.string(from: date))
        }
        return e
    }()

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            guard let date = DateCoding.parse(s) else {
                throw DecodingError.dataCorruptedError(in: c, debugDescription: "Ungültiges Datum: \(s)")
            }
            return date
        }
        return d
    }()

    private func request(_ path: String, method: String = "GET", body: Data? = nil, prefer: String? = nil) -> URLRequest {
        var r = URLRequest(url: URL(string: "\(baseURL)/rest/v1/\(path)")!)
        r.httpMethod = method
        r.timeoutInterval = 15
        r.setValue(key, forHTTPHeaderField: "apikey")
        // Alte anon-Keys sind JWTs und gehören zusätzlich in den Authorization-Header.
        if key.hasPrefix("eyJ") { r.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization") }
        r.setValue(householdId.uuidString.lowercased(), forHTTPHeaderField: "x-household-id")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let prefer { r.setValue(prefer, forHTTPHeaderField: "Prefer") }
        r.httpBody = body
        return r
    }

    private func send(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw APIError.http(code, String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    func fetchAll<T: SyncRecord>(_ type: T.Type) async throws -> [T] {
        let hid = householdId.uuidString.lowercased()
        let data = try await send(request("\(T.table)?select=*&household_id=eq.\(hid)&order=created_at.asc"))
        return try Self.decoder.decode([T].self, from: data)
    }

    func upsert(table: String, json: Data) async throws {
        _ = try await send(request(table, method: "POST", body: json, prefer: "resolution=merge-duplicates,return=minimal"))
    }

    func delete(table: String, id: UUID) async throws {
        _ = try await send(request("\(table)?id=eq.\(id.uuidString.lowercased())", method: "DELETE", prefer: "return=minimal"))
    }
}

enum DateCoding {
    nonisolated(unsafe) static let formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    nonisolated(unsafe) private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Postgres liefert z. B. "2026-10-17T14:03:12.123456+00:00" (bis zu 6 Nachkommastellen).
    static func parse(_ s: String) -> Date? {
        if let d = formatter.date(from: s) ?? plain.date(from: s) { return d }
        // Nachkommastellen auf 3 kürzen
        if let dot = s.firstIndex(of: ".") {
            let afterDot = s[s.index(after: dot)...]
            let digits = afterDot.prefix { $0.isNumber }
            let tail = afterDot.dropFirst(digits.count)
            let trimmed = String(s[..<dot]) + "." + String(digits.prefix(3)).padding(toLength: 3, withPad: "0", startingAt: 0) + tail
            return formatter.date(from: trimmed)
        }
        return nil
    }
}
