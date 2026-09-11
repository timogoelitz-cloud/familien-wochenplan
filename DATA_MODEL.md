# Datenmodell

Alle Typen sind in [`src/domain/types.ts`](src/domain/types.ts) definiert und dort kommentiert.
Diese Datei erklärt die Zusammenhänge und die Gründe hinter dem Entwurf.

## Grundregeln

1. **IDs hängen nie am Namen.** Sie werden mit `crypto.randomUUID()` erzeugt und tragen ein Präfix
   (`meal_`, `asg_`, `ing_`, …). Ein Gericht umzubenennen zerstört deshalb keine Wochenpläne.
2. **Datumsangaben sind ISO-Strings** (`"2026-09-14"`), keine `Date`-Objekte. `Date` in der
   Datenbank bringt Zeitzonen-Überraschungen mit – ein Datum ist hier ein Kalendertag, kein Zeitpunkt.
3. **Kalenderwochen sind Strings** im Format `"2026-W38"` (ISO-Jahr + ISO-Woche). Damit ist die
   Woche sortierbar, als Primärschlüssel nutzbar und über Jahresgrenzen eindeutig.
4. **Ein unbekannter Händler ist `null`**, kein eigener Datensatz.

## Entitäten

```
Person ─────────┐
                │ (personIds)
                ▼
Meal ◄──────── MealAssignment ──────► WeekPlan
 │              (mealId)   (weekId)      │
 │ enthält                               │ enthält
 ▼                                       ▼
MealIngredient ──► Merchant        ShoppingLineState
    (merchantId)                   (Vorrat / abgehakt)

AppSettings  (Singleton)
```

### Person

Timo, Sandra, Mika, Thore. Enthält `initials` und `colorKey` für die farbigen Chips sowie `order`
für die Reihenfolge in der Oberfläche. Personen werden nie gelöscht, nur über `active` ausgeblendet –
sonst würden historische Wochenpläne unlesbar.

### Merchant

Händler als eigene Stammdaten (`Kück Biomarkt`, `ALDI`, `dm`, `Naturschlachterei Lei`, `Nah & Gut`,
`Biolandhof`, `Musswessels`, `Sonstige`), frei erweiterbar. Beim Löschen eines Händlers setzt
`deleteMerchant` alle betroffenen Zutaten auf `null` – es kann keine Zutat mit toter Händler-ID geben.

### Meal und MealIngredient

Ein Gericht trägt Name, Beschreibung, Rezept, Bild, `servings` (typische Familienmenge) und seine
Zutaten als eingebettetes Array. Eingebettet statt eigene Tabelle, weil Zutaten nie unabhängig vom
Gericht bearbeitet werden – ein Gericht ist die natürliche Einheit beim Laden, Speichern, Exportieren.

Eine `MealIngredient` hat `name`, `amount`, `unit`, `merchantId`, optional `packageSize`,
`category` und `note`.

`packageSize` ist eine eigene `Quantity` (Menge + Einheit), nicht nur eine Zahl: Eine Zutat kann in
`kg` geführt sein, während die Packung in `g` angegeben ist. Die Packungsrechnung verlangt lediglich,
dass beide Einheiten in derselben *Dimension* liegen (siehe unten).

`demo: true` markiert Testgerichte. Sie tragen zusätzlich „DEMO“ im Namen und dürfen nie mit den
17 echten Familiengerichten verwechselt werden.

### MealAssignment – das Kernstück

Die geforderte Beziehung **Datum → Gericht → Personen**:

```ts
interface MealAssignment {
  id: ID;
  weekId: WeekId;      // "2026-W38", denormalisiert für schnelles Laden einer Woche
  date: ISODate;       // "2026-09-14"
  mealId: ID;
  personIds: ID[];     // Mehrfachauswahl
  position: number;    // Reihenfolge innerhalb des Tages
  note?: string;
}
```

Warum eine eigene Entität statt eines Feldes am Tag oder am Gericht:

- **Mehrere Gerichte pro Tag** sind einfach mehrere Assignments mit gleichem `date` – genau der
  geforderte Fall „Spaghetti für Timo, Mika und Thore *und* Salat für Sandra“.
- **Dasselbe Gericht mehrfach pro Woche** funktioniert, weil die Identität an der Zuordnung hängt,
  nicht am Gericht.
- **Personen hängen an der Zuordnung, nicht am Gericht.** Wer mitisst, ist eine Eigenschaft dieser
  Mahlzeit an diesem Tag, nicht des Rezepts.
- **Verschieben** ist ein Feldwechsel (`date`, `weekId`, neue `position`) statt Löschen und Neuanlegen –
  die Personenzuordnung bleibt dabei erhalten.

`weekId` ist bewusst redundant (es ließe sich aus `date` berechnen). Es ist indiziert und macht
„alle Gerichte dieser Woche“ zu einer einzigen Indexabfrage.

### WeekPlan

Kopfsatz je Woche, Primärschlüssel ist die `WeekId`. Er enthält **nicht** die Gerichte, sondern den
Zustand der Einkaufsliste:

```ts
lineStates: Record<string, { inPantry: boolean; checked: boolean }>
```

Der Schlüssel ist der Aggregationsschlüssel einer Einkaufszeile (siehe unten). Dadurch bleiben Vorrat
und Haken pro Woche getrennt, überleben das Schließen der App, und ein geänderter Wochenplan macht
sie nicht ungültig: Zeilen, die es nicht mehr gibt, werden schlicht ignoriert.

### AppSettings

Singleton mit `id: 'app'`: Standard-Mailadresse (`sandra@example.com`), Name der
Apple-Erinnerungen-Liste (`Einkaufen`) und Name des Kurzbefehls.

## Einheiten und Dimensionen

Jede Einheit gehört zu einer **Dimension**, und nur innerhalb einer Dimension wird umgerechnet:

| Dimension | Einheiten | Basis |
| --- | --- | --- |
| `mass` | `g`, `kg` | g |
| `volume` | `ml`, `l` | ml |
| `count:Stk`, `count:Pck`, `count:Dose`, `count:Glas`, `count:Bund`, `count:Scheibe` | je eine | sich selbst |
| `spoon:EL`, `spoon:TL` | je eine | sich selbst |
| `pinch`, `unspecified` | `Prise`, `nach Bedarf` | sich selbst |

Masse und Volumen werden **nie** ineinander umgerechnet – die Dichte hängt vom Produkt ab.
Jede Stückeinheit ist ihre eigene Dimension: eine Dose ist kein Glas. `EL` wird nicht in `ml`
umgerechnet, weil das nur eine Näherung wäre.

## Von der Woche zur Einkaufsliste

```
MealAssignment[]  (eine Woche)
      │  buildDemandLines()        Gericht auflösen, Zutaten flach ausrollen
      ▼
DemandLine[]
      │  aggregateDemand()         gleiche Zutaten zusammenführen
      ▼
ShoppingListItem[]                 + calculatePackages()
      │  Vorratsfilter (lineStates.inPantry)
      ▼
      │  groupByMerchant()
      ▼
ShoppingGroup[]  ->  ShoppingList
```

**Aggregationsschlüssel:**

```
normalisierterName | Dimension | merchantId
```

Beispiel: `spaghetti|mass|mer_kueck`

Normalisiert werden nur Groß-/Kleinschreibung, Leerraum, umschließende Satzzeichen und
Umlautvarianten (`Möhren` = `Moehren`). Bewusst **keine** Singular-/Plural- oder Wortstamm-Reduktion:
`Tomaten` und `Tomatenmark` müssen getrennt bleiben.

Weil die Dimension Teil des Schlüssels ist, ergibt sich automatisch das gewünschte Verhalten:

| Fall | Ergebnis |
| --- | --- |
| 500 g + 300 g Nudeln | 800 g – zusammengeführt |
| 1 kg + 500 g Mehl | 1,5 kg – umgerechnet und zusammengeführt |
| 400 g + 2 Dosen Tomaten | getrennt (andere Dimension) |
| 200 g + 200 ml Sahne | getrennt (Masse ≠ Volumen) |
| Nudeln bei Kück + Nudeln bei ALDI | getrennt (anderer Händler) |

Derselbe Schlüssel wird in `WeekPlan.lineStates` verwendet – deshalb bleibt ein Haken an der
richtigen Zeile, auch wenn die Liste neu berechnet wird.

## Packungsberechnung

```
Bedarf 800 g, Packung 500 g
  -> packages        = ceil(800 / 500) = 2
  -> purchasedAmount = 1000 g
  -> surplus         = 200 g
```

Gerechnet wird immer in der Basiseinheit der Dimension, mit einer Rundungstoleranz gegen
Fließkomma-Artefakte (`0.1 + 0.2` darf keine vierte Packung auslösen). Liegt die Packungsgröße in
einer anderen Dimension als der Bedarf (Bedarf in `Stk`, Packung in `g`), liefert die Funktion `null`
und die Liste zeigt nur den Bedarf – lieber keine Angabe als eine falsche.

## Speicherung (IndexedDB via Dexie)

| Tabelle | Schlüssel | Indizes |
| --- | --- | --- |
| `persons` | `id` | `order` |
| `merchants` | `id` | `order` |
| `meals` | `id` | `name`, `active` |
| `assignments` | `id` | `weekId`, `date`, `mealId`, `[date+position]` |
| `weekPlans` | `id` (= `WeekId`) | – |
| `settings` | `id` (immer `"app"`) | – |

## Sicherung

`exportBackup()` schreibt alle sechs Tabellen in eine JSON-Datei mit `format`- und `version`-Feld.
`validateBackup()` prüft Format, Version und jeden Datensatz **vollständig, bevor etwas geschrieben
wird**; Zuordnungen auf zwischenzeitlich gelöschte Gerichte werden mit Hinweis übersprungen.
Beim Einspielen gibt es zwei Modi: *ersetzen* oder *zusammenführen* (nach ID).

Das Format der Gericht-Import-Datei ist separat in [`data/meal.schema.json`](data/meal.schema.json)
als JSON Schema beschrieben – das ist die Schnittstelle für den späteren GPT-Import.
