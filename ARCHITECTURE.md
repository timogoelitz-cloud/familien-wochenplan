# Architektur

## Leitgedanke

Die App ist **local-first**: Sie funktioniert vollständig ohne Server, ohne Konto und ohne
Internetverbindung. Alles liegt in der IndexedDB des Browsers. Version 1 verzichtet bewusst auf
Hosting, Cloud-Dienste und Benutzerkonten – die Struktur lässt einen späteren Wechsel aber zu,
ohne die Geschäftslogik anfassen zu müssen.

## Schichten

```
┌──────────────────────────────────────────────────────┐
│  src/ui           React-Komponenten, Zustand, Design │
│                   kennt Domain und Data              │
├──────────────────────────────────────────────────────┤
│  src/services     PDF, Teilen, Zwischenablage        │
│                   kennt nur Domain                   │
├──────────────────────────────────────────────────────┤
│  src/data         Dexie/IndexedDB, Repositories,     │
│                   Sicherung – kennt nur Domain       │
├──────────────────────────────────────────────────────┤
│  src/domain       Typen und reine Geschäftslogik     │
│                   kennt nichts (kein React, kein DB) │
└──────────────────────────────────────────────────────┘
```

Die Abhängigkeiten zeigen ausschließlich nach unten. `src/domain` enthält keinen einzigen Import aus
React oder Dexie – deshalb lässt sich die gesamte Rechenlogik (Kalenderwochen, Zutatenaggregation,
Packungsgrößen) ohne Browser und ohne Datenbank testen. Genau dort sitzen auch die Fehler, die im
Alltag weh tun: eine falsch gerundete Packungszahl merkt man erst im Laden.

## Projektstruktur

```
src/
  domain/                reine Logik, vollständig unit-getestet
    types.ts             alle Entitäten
    week.ts              ISO-Kalenderwochen, Datumsformatierung
    units.ts             Einheiten, Dimensionen, Umrechnung
    aggregate.ts         Zusammenführen gleicher Zutaten
    packaging.ts         Bedarf -> Anzahl Packungen
    shoppingList.ts      Wochenplan -> gruppierte Einkaufsliste
    mealSchema.ts        Validierung importierter Gerichte
    ids.ts               ID-Erzeugung
  data/
    db.ts                Dexie-Schema
    defaults.ts          Startstammdaten (Familie, Händler)
    repositories.ts      einziger Datenzugriff für die UI
    backup.ts            Sicherung und Wiederherstellung
  services/
    pdf.ts               Einkaufsliste als A4-PDF (jsPDF, lazy geladen)
    share.ts             Web Share API, Download, mailto, Zwischenablage
  ui/
    store.tsx            App-Zustand + Live-Daten aus IndexedDB
    theme.ts             Farben für Personen und Wochentage
    components/          wiederverwendbare Bausteine
    views/               Wochenplan, Einkaufsliste, Gerichte, Einstellungen
data/                    Import-Schema, Beispiel, Platzhalter für die 17 Gerichte
prompts/                 Prompt für die spätere GPT-Erzeugung von Gerichten
tests/unit/              Vitest
tests/e2e/               Playwright (Desktop + iPad-Profil)
```

## Technikauswahl

| Baustein | Wahl | Warum |
| --- | --- | --- |
| Framework | React + TypeScript (strict) | verbreitet, gut typisierbar, langfristig wartbar |
| Build | Vite | schneller Start, `--host` für den iPad-Zugriff |
| Speicher | IndexedDB via **Dexie** | mehr Platz als `localStorage`, transaktional, Bilder als Data-URL möglich |
| Reaktivität | `dexie-react-hooks` (`useLiveQuery`) | die Datenbank *ist* der Zustand – kein zweiter Speicher, der auseinanderlaufen kann |
| Drag & Drop | **dnd-kit** | eigener Touch-Sensor, arbeitet mit Pointer-Events, kein HTML5-DnD (auf iOS Safari unbrauchbar) |
| CSS | Tailwind CSS v4 | konsistente Abstände/Größen, keine separate CSS-Pflege |
| PDF | **jsPDF** | erzeugt PDFs rein lokal, ohne Serveraufruf |
| Tests | Vitest + Playwright | Vitest teilt sich die Vite-Konfiguration; Playwright fährt ein echtes iPad-Profil |

## Bewusste Entscheidungen

**Die Datenbank ist die einzige Quelle der Wahrheit.** Änderungen gehen immer über
`src/data/repositories.ts` in die IndexedDB; die Oberfläche aktualisiert sich über `useLiveQuery`
von selbst. Deshalb zeigt der Wochenplan sofort ein neues Gericht an, das gerade in der
Gerichte-Ansicht angelegt wurde – ohne Synchronisationscode.

**Zutaten werden nur konservativ zusammengeführt.** Zusammengefasst wird bei gleichem
normalisiertem Namen, gleicher *Dimension* der Einheit und gleichem Händler. Masse und Volumen
werden nie ineinander umgerechnet (die Dichte hängt vom Produkt ab), und jede Stückeinheit
(`Stk`, `Dose`, `Glas`, …) bildet ihre eigene Dimension. `400 g Tomaten` und `2 Dosen Tomaten`
bleiben getrennt. Bei der Namensnormalisierung werden nur Schreibweise, Leerraum und
Umlautvarianten vereinheitlicht – keine Singular-/Plural-Reduktion, weil sonst leicht
unterschiedliche Produkte verschmelzen („Tomaten“ und „Tomatenmark“).

**„Unklar“ ist kein Datensatz.** Ein unbekannter Händler wird durch `merchantId === null`
dargestellt, nicht durch einen zusätzlichen Händler-Eintrag. So gibt es genau eine Repräsentation
statt zweier, die auseinanderlaufen könnten. Wird ein Händler gelöscht, fallen seine Zutaten
automatisch auf `null` zurück – es kann keine Zutat mit toter Händler-ID geben.

**Zwei gleichwertige Wege zum Zuordnen.** Ziehen *und* Tippen. Das Tippen ist nicht nur die
barrierefreie Alternative, sondern auf dem iPad oft der schnellere Weg. Der Touch-Sensor startet
das Ziehen erst nach kurzem Halten (180 ms), damit die Tagesliste weiter normal scrollbar bleibt.

**Import ist alles oder nichts.** `parseMealImport` und `validateBackup` prüfen erst vollständig und
schreiben erst danach. Ein halb eingespieltes Backup wäre schlimmer als gar keines. Fehler werden
gesammelt und mit Pfadangabe gemeldet (`meals[3].ingredients[1].unit`), nicht einzeln nacheinander.

**Kein Mailversand im Frontend.** Er bräuchte Zugangsdaten im Browser, die jeder auslesen könnte.
Stattdessen Web Share API mit PDF; die Schnittstelle `MailProvider` in `src/services/share.ts`
beschreibt, wie ein späterer serverseitiger Versand andockt – ohne heute etwas vorzutäuschen.

**jsPDF wird erst beim ersten PDF geladen.** Die Bibliothek wiegt rund 400 kB; der Wochenplan
braucht sie nicht. Das halbiert die Startgröße auf dem iPad.

**Keine erfundenen Rezeptdaten.** Die 17 echten Familiengerichte lagen bei der Entwicklung nicht
vollständig vor und wurden deshalb nicht rekonstruiert. Stattdessen gibt es einen geprüften
Importweg und klar als **DEMO** gekennzeichnete Testgerichte.

## Spätere Erweiterungen

Die Architektur hält diese Wege offen, ohne heute Komplexität dafür einzubauen:

- **Portionsgenaue Mengen.** `Meal.servings` und `MealAssignment.personIds` sind gespeichert. Eine
  spätere Skalierung träfe ausschließlich `buildDemandLines` in `src/domain/shoppingList.ts`.
- **Serverbetrieb / Synchronisation.** Nur `src/data/` müsste ausgetauscht werden; Domain und UI
  bleiben unberührt.
- **KI-Bildgenerierung.** Das Datenmodell unterstützt Bilder bereits (Upload als Data-URL oder URL).
  Ein Anbieter wäre als Service nach dem Muster von `MailProvider` zu ergänzen – ohne Schlüssel im
  Code.
- **Haushaltskosten.** Bewusst nicht vorbereitet. Preise, Kassenzettel und Budgets hätten das
  Datenmodell ohne heutigen Nutzen belastet.
