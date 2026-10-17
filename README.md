# Einkauf 🛒

Gemeinsame Einkaufsliste mit Wochenplaner für zwei (oder mehr) iPhones, ähnlich wie Bring und Choosy.
**Komplett kostenlos und ohne Ablaufdatum:** Die App ist eine Web-App, die man auf den Home-Bildschirm legt.

- **Einkaufsliste** als Kacheln, automatisch nach Supermarkt-Abteilungen sortiert. Antippen heißt gekauft, lange drücken öffnet die Bearbeitung, unter „Zuletzt gekauft“ holt ein Tippen den Artikel zurück.
- **Live-Abgleich** zwischen beiden Handys (alle 5 Sekunden). Ohne Netz wird gespeichert und später nachgereicht.
- **Siri:** „Hey Siri, Einkauf“ → „Was soll auf die Einkaufsliste?“ → „Brot und zwei Liter Milch“
- **Alexa:** „Alexa, öffne Einkauf und schreibe Brot auf die Liste“
- **Rezepte:** Chefkoch durchsuchen, Links von Chefkoch und anderen Rezeptseiten importieren oder eigene Rezepte anlegen.
- **Wochenplan:** Gericht für einen Tag einplanen → Zutaten landen passend zur Portionenzahl auf der Liste. Der **Grundvorrat** (Salz, Pfeffer, Öl, Mehl …) wird weggelassen und ist in der App anpassbar.

```
web/                Web-App (React + TypeScript) – das, was ihr benutzt
backend/schema.sql  Datenbank für Supabase
backend/functions/  Edge Function "chefkoch" (Weiterleitung zu Chefkoch)
alexa/              Alexa-Skill
Einkauf/            Native iOS-App (optional, braucht 99 €/Jahr für Dauerbetrieb)
```

Alles läuft auf kostenlosen Diensten: **Supabase** (Datenbank), **Netlify** (Webseite), **Alexa-hosted Skill**.

---

## Einrichtung (einmalig, ca. 30 Minuten)

### 1. Supabase – die gemeinsame Datenbank

1. Auf [supabase.com](https://supabase.com) kostenlos registrieren, **New project** anlegen (Region: Frankfurt).
2. Links **SQL Editor** öffnen, den kompletten Inhalt von [`backend/schema.sql`](backend/schema.sql) einfügen und **Run** klicken.
3. Links **Edge Functions** → **Deploy a new function** → **Via Editor**:
   - Name: `chefkoch`
   - Inhalt von [`backend/functions/chefkoch/index.ts`](backend/functions/chefkoch/index.ts) einfügen → **Deploy**
   - In den Einstellungen der Funktion **„Verify JWT“ / „Enforce JWT verification“ ausschalten** und speichern.
4. Unter **Project Settings → API Keys** kopieren:
   - die **Project URL**, z. B. `https://abcdefgh.supabase.co`
   - den **publishable**-Key (oder den älteren **anon public**-Key)
5. Beide Werte in [`web/src/config.ts`](web/src/config.ts) eintragen.

> Im Free Tier pausiert Supabase ein Projekt erst nach 7 Tagen ohne jede Nutzung. Bei einer Einkaufsliste passiert das praktisch nie. Falls doch: im Dashboard auf „Restore“ klicken.

### 2. Web-App bauen und online stellen

Auf dem Mac im Terminal:

```bash
cd web && npm install && npm run build
```

Danach liegt die fertige App im Ordner `web/dist`.

**Online stellen mit Netlify (kostenlos):**
1. Auf [netlify.com](https://app.netlify.com) kostenlos registrieren.
2. **Add new site → Deploy manually** und den Ordner `web/dist` ins Browserfenster ziehen.
3. Unter *Site configuration → Change site name* einen Namen wählen, z. B. `unser-einkauf` → `https://unser-einkauf.netlify.app`

Für ein Update: `npm run build` und den neuen `dist`-Ordner unter *Deploys* erneut hineinziehen.
(Cloudflare Pages oder GitHub Pages funktionieren genauso.)

### 3. Auf die iPhones bringen

1. **Dein iPhone:** Die Netlify-Adresse in **Safari** öffnen → **Neuen Haushalt anlegen** → unten **Teilen → Zum Home-Bildschirm**.
2. **Ihr iPhone:** Bei dir in der App **Mehr → Haushalt teilen**. Sie scannt den QR-Code mit der Kamera, öffnet den Link in Safari und wählt dort ebenfalls **Teilen → Zum Home-Bildschirm**.

Fertig. Beide haben jetzt ein „Einkauf“-Icon. Die App öffnet sich im Vollbild und zeigt dieselbe Liste.

> Falls die Home-Bildschirm-App nach dem Hinzufügen wieder „Haushalt beitreten“ zeigt: unter **Haushalt beitreten** den Code einfügen (vorher unter *Mehr → Haushalt teilen* kopieren).

### 4. Siri

In der App unter **Mehr → Siri & Alexa einrichten** steht eine Schritt-für-Schritt-Anleitung für einen Kurzbefehl. Alle Werte lassen sich dort per Knopfdruck kopieren. Der Kurzbefehl muss auf **jedem** iPhone einmal angelegt werden.

| Sprachbefehl | Ergebnis |
|---|---|
| „Hey Siri, Einkauf“ | Siri fragt nach → „Brot, Butter und zwei Liter Milch“ → „Brot, Butter und Milch stehen auf der Liste.“ |
| „Hey Siri, Was steht auf der Liste“ (optionaler 2. Kurzbefehl) | Siri liest die Liste vor |

Der Kurzbefehl schreibt direkt in die Datenbank, auch wenn die App gar nicht geöffnet ist.

### 5. Alexa (ca. 10 Minuten)

Genutzt wird ein **Alexa-hosted Skill**. Er ist kostenlos, braucht kein AWS-Konto und bleibt privat für eure Echo-Geräte.

1. [developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask) mit dem Amazon-Konto öffnen, das auch eure Echos nutzen.
2. **Create Skill**: Name `Einkauf`, Sprache **German (DE)**, Typ **Other → Custom**, Hosting **Alexa-hosted (Node.js)**, Vorlage **Start from Scratch**.
3. **Build → Interaction Model → JSON Editor**: Inhalt von [`alexa/interactionModels/custom/de-DE.json`](alexa/interactionModels/custom/de-DE.json) einfügen, dann **Save** und **Build Skill**.
4. Tab **Code**:
   - `index.js` und `package.json` durch die Dateien aus [`alexa/lambda/`](alexa/lambda) ersetzen.
   - Neue Dateien `shopping.js` und `config.js` anlegen (Inhalt aus [`alexa/lambda/`](alexa/lambda)).
   - In `config.js` Supabase-URL, Key und den **Haushalts-Code** eintragen (*Mehr → Haushalt teilen*).
   - **Deploy** klicken.
5. Tab **Test**: „Skill testing is enabled in“ auf **Development** stellen.

Danach funktioniert auf jedem Echo eures Kontos:

- „Alexa, öffne Einkauf und schreibe Brot auf die Liste“
- „Alexa, sag Einkauf, ich brauche Milch und Eier“
- „Alexa, frag Einkauf, was auf der Liste steht“

Lehnt die Konsole den einwortigen Aufrufnamen `einkauf` ab, im JSON `"invocationName"` z. B. auf `"unser einkauf"` ändern.

---

## Gut zu wissen

**Datenschutz:** Jeder Haushalt hat einen zufälligen Code (UUID). Nur wer ihn kennt, kann die Daten lesen oder ändern. Das erzwingt Row Level Security in der Datenbank. Den Code also nur deiner Freundin geben.

**Chefkoch** hat keine offizielle Schnittstelle. Die App nutzt dieselbe wie die Chefkoch-App, über die Edge Function als Zwischenstation. Ändert Chefkoch etwas, funktioniert der **Import per Link** weiterhin: Er liest die standardisierten Rezeptdaten, die fast alle Rezeptseiten einbetten. Die Rezepte sind nur für den privaten Gebrauch gedacht.

**Grundvorrat** (*Mehr → Grundvorrat*): Diese Zutaten sind beim Einplanen abgewählt, lassen sich aber antippen und trotzdem übernehmen. „Öl“ erfasst Olivenöl und Rapsöl, „Brühe“ erfasst Gemüsebrühe. Zuckerschoten oder Essiggurken werden dagegen nicht weggelassen.

## Entwicklung

```bash
cd web
npm run dev      # lokaler Server
npx vitest run   # Tests (Parser, Grundvorrat, Mengen, Abteilungen)
npm run lint
```

Die native iOS-App unter `Einkauf/` nutzt dieselbe Datenbank und lässt sich parallel verwenden, zum Beispiel wenn ihr später doch das Apple Developer Program nutzt.
