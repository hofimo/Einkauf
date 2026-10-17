# Einkauf 🛒

Gemeinsame Einkaufsliste mit Wochenplaner für zwei (oder mehr) iPhones, ähnlich wie Bring und Choosy.

- **Einkaufsliste** als Kacheln, automatisch nach Supermarkt-Abteilungen sortiert. Antippen heißt gekauft, unter „Zuletzt gekauft“ holt ein Tippen den Artikel zurück auf die Liste.
- **Live-Abgleich** zwischen beiden iPhones (alle 5 Sekunden). Änderungen ohne Netz werden gespeichert und später nachgereicht.
- **Siri:** „Hey Siri, schreib etwas auf Einkauf“ → „Brot und zwei Liter Milch“
- **Alexa:** „Alexa, öffne Einkauf und schreibe Brot auf die Liste“
- **Rezepte:** Chefkoch durchsuchen, Links von Chefkoch und anderen Rezeptseiten importieren oder eigene Rezepte anlegen.
- **Wochenplan:** Gericht für einen Tag einplanen → Zutaten landen passend zur Portionenzahl auf der Liste. Der **Grundvorrat** (Salz, Pfeffer, Öl, Mehl …) wird dabei weggelassen und ist in der App anpassbar.

```
Einkauf/            iOS-App (SwiftUI, iOS 18+)
  App/              Einstieg, Config.swift (Supabase-Zugang)
  Models/           Datenmodelle, Zutaten-Parser, Abteilungen, Grundvorrat
  Services/         AppStore (lokaler Speicher + Sync), Supabase, Chefkoch-Import
  Views/            Oberflächen
  Intents/          Siri / Kurzbefehle
backend/schema.sql  Datenbank für Supabase
alexa/              Alexa-Skill (Interaction Model + Lambda)
```

## Warum Supabase und nicht iCloud?

Damit **Alexa** auf die Liste schreiben kann, muss sie auf einem Server liegen, den auch Amazon erreicht. Eine private iCloud-Datenbank geht dafür nicht. Supabase ist kostenlos (Free Tier), und beide iPhones sowie der Alexa-Skill nutzen dieselbe Datenbank.

Zugriffsschutz: Jeder Haushalt hat einen zufälligen Code (UUID). Nur wer diesen Code kennt, kann die Daten lesen oder ändern (Row Level Security in `schema.sql`).

---

## Einrichtung

### 1. Supabase (ca. 5 Minuten)

1. Auf [supabase.com](https://supabase.com) kostenlos registrieren und ein neues Projekt anlegen (Region: Frankfurt).
2. Links **SQL Editor** öffnen, den Inhalt von [`backend/schema.sql`](backend/schema.sql) einfügen und auf **Run** klicken.
3. Unter **Project Settings → API** (bzw. „API Keys“) zwei Werte kopieren:
   - **Project URL**, z. B. `https://abcdefgh.supabase.co`
   - **anon public** oder **publishable** Key
4. Beide Werte in [`Einkauf/App/Config.swift`](Einkauf/App/Config.swift) eintragen.

> Hinweis: Im Free Tier pausiert Supabase Projekte nach 7 Tagen ohne jede Nutzung. Bei einer täglich genutzten Einkaufsliste passiert das praktisch nie. Falls doch, im Dashboard auf „Restore“ klicken.

### 2. App aufs iPhone bringen

Dafür braucht es einen Mac mit **Xcode 16 oder neuer** (kostenlos im App Store).

1. `Einkauf.xcodeproj` öffnen.
2. Links das Projekt „Einkauf“ → Target „Einkauf“ → **Signing & Capabilities**: unter *Team* die eigene Apple-ID wählen. Falls Xcode meckert, die *Bundle Identifier* ändern (z. B. `de.deinname.Einkauf`).
3. iPhone per Kabel anschließen, oben als Ziel auswählen und auf ▶︎ klicken.
4. Auf dem iPhone: *Einstellungen → Allgemein → VPN & Geräteverwaltung* → dem Entwickler vertrauen. Bei iOS 16 und neuer zusätzlich den *Entwicklermodus* einschalten.

**Für das iPhone deiner Freundin** gibt es zwei Wege:
- **Kostenlose Apple-ID:** Ihr iPhone ebenfalls per Kabel anschließen und installieren. Die App läuft dann **7 Tage** und muss danach neu installiert werden.
- **Apple Developer Program (99 €/Jahr):** Die App ist ein Jahr gültig, und über **TestFlight** kann sie die App ohne Kabel installieren und Updates bekommen. Für den Dauerbetrieb ist das die bequeme Lösung.

### 3. Haushalt verbinden

1. Auf deinem iPhone: **Neuen Haushalt anlegen**.
2. **Mehr → Haushalt teilen** zeigt einen QR-Code.
3. Auf ihrem iPhone die **Kamera-App** auf den QR-Code richten und den Link öffnen. Sie ist dann im selben Haushalt.
   (Alternativ den Code per Nachricht schicken und unter „Haushalt beitreten“ einfügen.)

### 4. Siri

Funktioniert ohne Einrichtung, sobald die App installiert und einmal geöffnet wurde:

| Sprachbefehl | Ergebnis |
|---|---|
| „Hey Siri, schreib etwas auf Einkauf“ | Siri fragt nach → „Brot, Butter und zwei Liter Milch“ |
| „Hey Siri, Einkauf ergänzen“ | wie oben |
| „Hey Siri, was steht auf Einkauf?“ | Siri liest die Liste vor |

Siri erlaubt bei App-Befehlen keinen frei gesprochenen Artikel direkt im ersten Satz. Deshalb fragt sie kurz nach. Wer es in einem Satz will, kann sich in der **Kurzbefehle-App** eigene Kurzbefehle mit der Aktion „Auf die Einkaufsliste setzen“ bauen.

### 5. Alexa (ca. 10 Minuten)

Genutzt wird ein **Alexa-hosted Skill**. Er ist kostenlos und braucht kein AWS-Konto. Der Skill bleibt privat und läuft nur auf euren Echo-Geräten, solange er mit demselben Amazon-Konto verbunden ist.

1. [developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask) mit dem Amazon-Konto öffnen, das auch eure Echos nutzen.
2. **Create Skill**: Name `Einkauf`, Sprache **German (DE)**, Typ **Other → Custom**, Hosting **Alexa-hosted (Node.js)**, Vorlage **Start from Scratch**.
3. **Build → Interaction Model → JSON Editor**: den Inhalt von [`alexa/interactionModels/custom/de-DE.json`](alexa/interactionModels/custom/de-DE.json) einfügen, dann **Save** und **Build Skill**.
4. Tab **Code**:
   - `index.js` und `package.json` durch die Dateien aus [`alexa/lambda/`](alexa/lambda) ersetzen.
   - Neue Dateien `shopping.js` und `config.js` anlegen (Inhalt aus [`alexa/lambda/`](alexa/lambda)).
   - In `config.js` Supabase-URL, Key und den **Haushalts-Code** eintragen (in der App unter *Mehr → Haushalt teilen*).
   - **Deploy** klicken.
5. Tab **Test**: oben „Skill testing is enabled in“ auf **Development** stellen.

Danach funktioniert auf jedem Echo in eurem Konto:

- „Alexa, öffne Einkauf und schreibe Brot auf die Liste“
- „Alexa, sag Einkauf, ich brauche Milch und Eier“
- „Alexa, frag Einkauf, was auf der Liste steht“
- „Alexa, öffne Einkauf“ → „Was soll auf die Einkaufsliste?“ → „Brot“ → „Noch etwas?“ → „Käse“ → „Fertig“

Sollte die Konsole den einwortigen Aufrufnamen `einkauf` ablehnen, im JSON `"invocationName"` z. B. auf `"unser einkauf"` ändern.

---

## Chefkoch

Chefkoch hat keine offizielle API. Die App nutzt dieselbe Schnittstelle wie die Chefkoch-App. Daraus kommen Suche, Bilder, Portionen und sauber getrennte Zutaten. Sollte Chefkoch das ändern, funktioniert der **Import per Link** weiterhin: Er liest die standardisierten Rezeptdaten (schema.org), die Chefkoch und fast alle anderen Rezeptseiten einbetten (Lecker, Kitchen Stories, eat smarter …).

Die Rezepte sind nur für den privaten Gebrauch gedacht.

## Grundvorrat

Unter **Mehr → Grundvorrat** steht, was ihr immer zu Hause habt. Beim Einplanen eines Gerichts sind diese Zutaten abgewählt, lassen sich aber per Tippen trotzdem auf die Liste setzen. Die Erkennung versteht zusammengesetzte Wörter: „Öl“ erfasst Olivenöl und Rapsöl, „Brühe“ erfasst Gemüsebrühe. Zuckerschoten oder Essiggurken werden dagegen nicht weggelassen.

## Stand und Ideen

- [ ] In Xcode bauen und auf echten Geräten testen. Beim Erstellen stand kein Xcode zur Verfügung: Der Code ist gegen das macOS-SDK typgeprüft, die Logik (Parser, Chefkoch-Import, Alexa-Skill) ist getestet.
- [ ] Share-Extension: in Safari oder der Chefkoch-App „Teilen → Einkauf“
- [ ] Widget mit der aktuellen Liste
- [ ] Push statt Polling (Supabase Realtime)
