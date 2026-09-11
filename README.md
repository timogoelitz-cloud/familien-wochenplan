# Familien-Wochenplan

Wochenplanung für das Mittagessen mit automatischer Einkaufsliste – für Timo, Sandra, Mika und Thore.

Die App läuft **vollständig lokal** im Browser. Kein Server, kein Konto, keine Cloud, keine laufenden
Kosten. Alle Daten liegen in der IndexedDB des jeweiligen Browsers.

> **Wichtig:** Weil alles lokal liegt, ist die Funktion **Einstellungen → Daten sichern** die einzige
> Absicherung gegen Datenverlust. Nach dem Anlegen der Gerichte einmal sichern – und danach ab und zu.

---

## Schnellstart

```bash
npm install
npm run dev
```

Danach im Browser öffnen:

```
http://localhost:5173
```

Beim ersten Start ist der Gerichte-Pool leer. Zwei Wege weiter:

- **Gerichte → Importieren** – unsere echten Rezepte aus `data/meals.seed.json` einspielen
  (siehe [Die 17 echten Gerichte](#die-17-echten-gerichte)).
- **Gerichte → „Demo-Gerichte laden“** – drei Beispielgerichte zum Ausprobieren. Sie sind mit
  **DEMO** gekennzeichnet und lassen sich jederzeit wieder löschen.

## Auf dem iPad öffnen

Der Dev-Server lauscht bereits auf allen Netzwerkschnittstellen (`0.0.0.0`), es ist also keine
zusätzliche Konfiguration nötig. Mac und iPad müssen im **selben WLAN** sein.

**1. Lokale IP-Adresse des Rechners herausfinden**

macOS – im Terminal:

```bash
ipconfig getifaddr en0    # WLAN
ipconfig getifaddr en1    # falls en0 leer bleibt (z. B. bei LAN-Adapter)
```

Alternativ: Systemeinstellungen → Netzwerk → WLAN → Details → TCP/IP → „IP-Adresse“.

Windows – in der Eingabeaufforderung:

```cmd
ipconfig
```

Dort unter dem WLAN-Adapter die Zeile „IPv4-Adresse“ ablesen.

Das Ergebnis sieht z. B. so aus: `192.168.178.42`.

**2. Auf dem iPad in Safari aufrufen**

```
http://192.168.178.42:5173
```

(Die IP durch die eigene ersetzen, der Port bleibt `5173`.)

Beim Start gibt `npm run dev` diese Adresse auch selbst unter **„Network:“** aus – meist reicht es,
sie dort abzulesen.

**3. Zum Homescreen hinzufügen (optional)**

In Safari auf **Teilen → Zum Home-Bildschirm**. Die App startet dann im Vollbild ohne Browserleiste,
wie eine eigene App.

> Der Dev-Server muss dabei auf dem Mac laufen. Für dauerhafte Nutzung ohne laufenden Mac siehe
> [Später einmal](#später-einmal) am Ende dieser Datei.

**Wenn das iPad die Seite nicht erreicht:**

- Firewall auf dem Mac prüfen (Systemeinstellungen → Netzwerk → Firewall) – eingehende Verbindungen
  für Node erlauben.
- Sicherstellen, dass beide Geräte im selben WLAN sind (nicht Gast-WLAN, nicht Mobilfunk).
- `http://` verwenden, nicht `https://`.

---

## Bedienung

### Wochenplan

Die App öffnet immer die **aktuelle Kalenderwoche**, z. B. „KW 38 · 14.09.2026 – 20.09.2026“.
Links stehen Montag bis Sonntag, rechts der Gerichte-Pool.

Ein Gericht auf einen Tag legen – **zwei gleichwertige Wege**:

| Weg | Vorgehen |
| --- | --- |
| **Ziehen** | Gerichtskarte greifen und auf den Tag ziehen. Auf dem iPad: kurz halten, dann ziehen (das kurze Halten sorgt dafür, dass normales Scrollen weiter funktioniert). |
| **Tippen** | Gericht antippen → es wird vorgemerkt → beim gewünschten Tag auf **„Hier einsetzen“** tippen. |

Weiter:

- **Mehrere Gerichte pro Tag** sind ausdrücklich vorgesehen – z. B. Spaghetti für Timo, Mika und
  Thore und dazu Salat für Sandra.
- **Personen zuordnen:** auf die Gerichtskarte im Tag tippen, dann die Personen auswählen.
- **Verschieben:** eine bereits eingeplante Karte auf einen anderen Tag ziehen.
- **Entfernen:** das **×** auf der Karte.
- **Woche wechseln:** ‹ / › oder auf die Wochenanzeige tippen und Jahr/KW frei wählen. **Heute**
  springt zurück zur aktuellen Woche.

Jede Änderung wird sofort gespeichert.

### Einkaufsliste

Aus allen Gerichten der Woche entsteht die Liste automatisch:

1. Zutaten gleichen Namens werden **zusammengefasst** (500 g + 300 g Nudeln = 800 g).
2. Bei hinterlegter **Packungsgröße** wird die Packungszahl berechnet:
   *Bedarf 800 g · Einkauf 2 × 500 g · Überbestand 200 g*.
3. **Vorrat prüfen** (Reiter 1): alles abhaken, was schon da ist – es verschwindet aus der Kaufliste.
4. **Einkaufen** (Reiter 2): nach Händlern gruppiert abhaken. Der Stand bleibt pro Woche gespeichert.

Zusammengefasst wird nur bei gleichem Produktnamen, gleicher Einheiten-Dimension **und** gleichem
Händler. `400 g Tomaten` und `2 Dosen Tomaten` bleiben deshalb bewusst getrennt.

Über **„woher?“** lässt sich zu jedem Posten aufklappen, aus welchen Gerichten er stammt.

### Teilen

| Knopf | Was passiert |
| --- | --- |
| **PDF** | Erzeugt `Einkaufsliste_KW38_2026.pdf` (A4, druckfertig, mit Kästchen zum Abhaken). |
| **Teilen** | Öffnet das iPadOS-Teilen-Menü mit dem PDF. Dort lässt sich **Mail** wählen – das PDF hängt dann schon dran. Kann der Browser keine Dateien teilen (z. B. Desktop-Firefox), wird das PDF stattdessen heruntergeladen. |
| **Mail** | Öffnet das Mailprogramm mit vorbereitetem Betreff und Listentext an die in den Einstellungen hinterlegte Adresse. Anhänge kann ein Browser dabei nicht selbst setzen – dafür ist **Teilen** der bessere Weg. |
| **In Apple Erinnerungen** | Kopiert die Liste im passenden Format in die Zwischenablage. Einrichtung des Kurzbefehls: [`docs/APPLE_SHORTCUT.md`](docs/APPLE_SHORTCUT.md). |

Ein **automatischer Mailversand ist bewusst nicht eingebaut.** Er bräuchte Zugangsdaten im Browser,
die dort jeder auslesen könnte. Die Schnittstelle für einen späteren serverseitigen Versand ist in
`src/services/share.ts` (`MailProvider`) vorbereitet.

### Gerichte

Anlegen, bearbeiten, deaktivieren, löschen. Je Zutat: Menge, Einheit, Händler, Packungsgröße und
optional eine Warengruppe. Bilder per Datei-Upload oder URL.

**Deaktivieren statt löschen:** deaktivierte Gerichte verschwinden aus dem Pool, bleiben aber mit
allen Daten erhalten. Löschen entfernt das Gericht auch aus allen Wochenplänen.

### Einstellungen

Familienmitglieder (Name, Kürzel, Farbe), Händler, Standard-Mailadresse, Name der Apple-Erinnerungen-Liste
sowie **Daten sichern / wiederherstellen**.

---

## Die 17 echten Gerichte

Unsere 17 Familiengerichte sind **bewusst nicht** im Code hinterlegt: Die vollständigen Zutaten,
Mengen und Händlerzuordnungen lagen bei der Entwicklung nicht vor, und geratene Rezeptdaten wären in
einer Einkaufsliste schlimmer als gar keine.

**So kommen sie hinein:**

1. `data/meals.seed.json` öffnen (die Datei ist vorbereitet und enthält eine leere `meals`-Liste).
2. Die Gerichte dort eintragen. Format: [`data/meal.schema.json`](data/meal.schema.json),
   ausgefülltes Beispiel: [`data/meals.example.json`](data/meals.example.json).
3. In der App: **Gerichte → Importieren** → Datei auswählen.

Die App prüft die Datei vorher vollständig. Stimmt etwas nicht, wird **nichts** importiert und
genau angezeigt, welches Feld das Problem verursacht (z. B. `meals[3].ingredients[1].unit`).

Bequemer geht es mit einem Sprachmodell: [`prompts/create-meal.md`](prompts/create-meal.md) enthält
einen fertigen Prompt, der aus einem Rezepttext direkt gültiges JSON erzeugt.

---

## Entwicklung

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Dev-Server auf `0.0.0.0:5173` (im WLAN erreichbar) |
| `npm run build` | Produktionsbuild nach `dist/` |
| `npm run preview` | Produktionsbuild lokal ausliefern |
| `npm test` | Unit-Tests (Vitest) |
| `npm run test:watch` | Unit-Tests im Watch-Modus |
| `npm run test:e2e` | End-to-End-Tests (Playwright, Desktop + iPad-Profil) |
| `npm run typecheck` | TypeScript prüfen |

Vor dem ersten `npm run test:e2e` einmalig:

```bash
npx playwright install chromium
```

**Getestet wird unter anderem:** ISO-Wochen samt Jahreswechsel, Zusammenführen von Zutaten,
Nicht-Zusammenführen unterschiedlicher Einheiten, Packungsberechnung, Vorratsfilter,
Händlergruppierung, Persistenz, Import-Validierung sowie die kompletten Abläufe
„Gericht anlegen → einplanen → Personen wählen → Einkaufsliste → abhaken → Woche wechseln“.

Weitere Dokumentation:

- [`ARCHITECTURE.md`](ARCHITECTURE.md) – Aufbau, Projektstruktur, bewusste Entscheidungen
- [`DATA_MODEL.md`](DATA_MODEL.md) – Entitäten, Beziehungen, Speicherung
- [`docs/APPLE_SHORTCUT.md`](docs/APPLE_SHORTCUT.md) – Übergabe an Apple Erinnerungen

---

## Später einmal

Nichts davon ist für Version 1 nötig; die Architektur lässt es aber zu:

- **Hosting/Domain** – `npm run build` erzeugt statische Dateien, die auf jedem Webspace liegen
  können. Dann wäre die App auch ohne laufenden Mac erreichbar.
- **Automatischer Mailversand** – braucht einen kleinen Server. Schnittstelle: `MailProvider`
  in `src/services/share.ts`.
- **GPT-Rezeptimport** – Prompt liegt bereit, der Importweg ist fertig.
- **GPT-Bildgenerierung** – das Datenmodell unterstützt Bilder bereits; es fehlt nur der Anbieter.
- **Apple Erinnerungen** – heute über Kurzbefehl + Zwischenablage; eine direkte API gibt es für
  Web-Apps nicht.
- **Portionsgenaue Mengen** – `servings` und die Personenzuordnung sind gespeichert, werden für die
  Mengenberechnung aber bewusst noch nicht verwendet.
