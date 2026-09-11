/**
 * Zentrale Datentypen der Anwendung.
 *
 * Grundsaetze:
 *  - IDs sind opak und niemals aus Namen abgeleitet (Umbenennen darf nichts zerstoeren).
 *  - Datumsangaben werden als ISO-Datum "YYYY-MM-DD" gespeichert (keine Date-Objekte in der DB).
 *  - Die Struktur ist so angelegt, dass spaeter portionsbasiert gerechnet werden kann
 *    (Meal.servings + MealAssignment.personIds sind bereits vorhanden, werden in v1
 *    aber bewusst nicht zur Mengenskalierung verwendet).
 */

/** Opake Entitaets-ID. */
export type ID = string;

/** ISO-Datum, Format "YYYY-MM-DD". */
export type ISODate = string;

/** Kennung einer ISO-Kalenderwoche, Format "2026-W38". */
export type WeekId = string;

/** Unterstuetzte Mengeneinheiten. */
export const UNITS = [
  'g',
  'kg',
  'ml',
  'l',
  'Stk',
  'Pck',
  'Dose',
  'Glas',
  'Bund',
  'Scheibe',
  'EL',
  'TL',
  'Prise',
  'nach Bedarf',
] as const;

export type Unit = (typeof UNITS)[number];

/** Familienmitglied. */
export interface Person {
  id: ID;
  name: string;
  /** Kurzform fuer Chips/Avatare, z. B. "TI". */
  initials: string;
  /** Tailwind-unabhaengiger Farbschluessel, siehe ui/theme.ts */
  colorKey: string;
  active: boolean;
  order: number;
}

/** Haendler / Einkaufsort. Stammdaten, frei erweiterbar. */
export interface Merchant {
  id: ID;
  name: string;
  order: number;
  active: boolean;
  /** Systemeintrag "Unklar" darf nicht geloescht werden. */
  system?: boolean;
}

/** Menge mit Einheit. */
export interface Quantity {
  amount: number;
  unit: Unit;
}

/**
 * Mengenangabe einer Zutat. Bewusst drei Faelle statt einer blanken Zahl:
 *
 *  - `exact` : "500 g Nudeln"
 *  - `range` : "700-800 ml passierte Tomaten" -- Planungsrichtwerte, die nicht
 *              auf einen Wert zusammengestaucht werden duerfen
 *  - `open`  : "Etwas Oel", "Kraeuter und Gewuerze" -- bewusst unbeziffert.
 *              Solche Zutaten werden NICHT aufsummiert, sondern erscheinen in
 *              der Einkaufsliste als eigener Block zur Bestandspruefung. Eine
 *              erfundene Zahl waere schlimmer als gar keine.
 */
export type AmountSpec =
  | { kind: 'exact'; value: number }
  | { kind: 'range'; min: number; max: number }
  | { kind: 'open' };

export const AMOUNT_OPEN: AmountSpec = { kind: 'open' };

export function exactAmount(value: number): AmountSpec {
  return { kind: 'exact', value };
}

export function rangeAmount(min: number, max: number): AmountSpec {
  return { kind: 'range', min, max };
}

/** Untergrenze einer Menge (fuer `open`: null). */
export function amountMin(spec: AmountSpec): number | null {
  if (spec.kind === 'exact') return spec.value;
  if (spec.kind === 'range') return spec.min;
  return null;
}

/** Obergrenze einer Menge. Nach ihr wird eingekauft -- lieber etwas uebrig. */
export function amountMax(spec: AmountSpec): number | null {
  if (spec.kind === 'exact') return spec.value;
  if (spec.kind === 'range') return spec.max;
  return null;
}

/**
 * Auswahlgruppe innerhalb eines Gerichts, z. B. "Beilage: Reis oder Kartoffeln"
 * oder "Teig: selbst gemacht oder fertig".
 *
 * Nur die Zutaten der gewaehlten Option kommen auf die Einkaufsliste.
 */
export interface MealChoiceGroup {
  id: ID;
  /** Ueberschrift, z. B. "Beilage". */
  name: string;
  /** 'one' = genau eine Option, 'any' = beliebig viele (auch keine). */
  mode: 'one' | 'any';
  options: Array<{ id: ID; label: string }>;
  /** Vorauswahl, wenn ein Gericht einem Tag zugeordnet wird. */
  defaultOptionIds: ID[];
}

/** Eine Zutat innerhalb eines Gerichts. */
export interface MealIngredient {
  id: ID;
  /** Anzeigename, z. B. "Spaghetti". */
  name: string;
  amount: AmountSpec;
  unit: Unit;
  /** Bevorzugter Haendler. Leer => wird der Gruppe "Unklar" zugeordnet. */
  merchantId: ID | null;
  /** Optionale Warengruppe, z. B. "Trockenware". */
  category?: string;
  /** Optionale Packungsgroesse, z. B. 500 g. */
  packageSize?: Quantity | null;
  note?: string;
  /**
   * Zutat ist optional ("Optional: geriebener Kaese"). Sie zaehlt nur, wenn
   * sie bei der Zuordnung ausdruecklich dazugewaehlt wird.
   */
  optional?: boolean;
  /** Gehoert zu dieser Auswahlgruppe (siehe MealChoiceGroup). */
  choiceGroupId?: ID;
  /** Gehoert innerhalb der Gruppe zu dieser Option. */
  choiceOptionId?: ID;
  /**
   * Vorratsartikel wie Oel, Salz oder Gewuerze. Wird nie aufsummiert, sondern
   * nur zur Bestandspruefung angezeigt -- man kauft kein Salz je Gericht.
   */
  pantryStaple?: boolean;
}

/** Ein Gericht mit Rezept und Zutaten. */
export interface Meal {
  id: ID;
  /**
   * Feste Nummer aus unserer Gerichteliste (1-17). Bleibt dauerhaft erhalten,
   * auch wenn das Gericht umbenannt oder umsortiert wird.
   */
  number?: number;
  name: string;
  description?: string;
  /** Freitext-Zubereitung. */
  recipe?: string;
  /** Bild als Data-URL (Upload) oder externe URL. */
  image?: string | null;
  /**
   * Personenzahl, auf die sich die Mengen beziehen.
   * `null` bedeutet ausdruecklich "nicht beziffert" -- dann wird nie
   * automatisch hochgerechnet, weil die Basis unbekannt ist.
   */
  servings?: number | null;
  /** Ungefaehre Zubereitungsdauer als Freitext, z. B. "ca. 20 Minuten". */
  cookingTime?: string;
  /** Auswahlgruppen (Beilage, Teig, Variante ...). */
  choiceGroups?: MealChoiceGroup[];
  ingredients: MealIngredient[];
  tags?: string[];
  /** Klar gekennzeichnete Demo-Daten, die nicht aus echten Familienrezepten stammen. */
  demo?: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Zuordnung: Datum -> Gericht -> Personen.
 * Ein Tag kann beliebig viele Assignments haben (mehrere Gerichte pro Tag).
 * Dasselbe Gericht darf in einer Woche mehrfach vorkommen.
 */
export interface MealAssignment {
  id: ID;
  weekId: WeekId;
  date: ISODate;
  mealId: ID;
  personIds: ID[];
  /**
   * Getroffene Auswahl je Auswahlgruppe: Gruppen-ID -> gewaehlte Options-IDs.
   * Fehlt ein Eintrag, gilt die Vorauswahl des Gerichts.
   */
  choices?: Record<ID, ID[]>;
  /** IDs optionaler Zutaten, die ausdruecklich dazugewaehlt wurden. */
  optionalIngredientIds?: ID[];
  /** Sortierung innerhalb eines Tages. */
  position: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** Zustand einer Einkaufslisten-Zeile, persistiert pro Woche. */
export interface ShoppingLineState {
  /** Artikel ist bereits im Vorrat vorhanden -> nicht kaufen. */
  inPantry: boolean;
  /** Artikel wurde im Laden abgehakt. */
  checked: boolean;
}

/**
 * Wochenplan-Kopfsatz. Die eigentlichen Gerichte haengen als MealAssignment
 * am Datum; hier liegt der Zustand der Einkaufsliste dieser Woche.
 */
export interface WeekPlan {
  id: WeekId;
  isoYear: number;
  isoWeek: number;
  /** Montag dieser Woche. */
  startDate: ISODate;
  /** Sonntag dieser Woche. */
  endDate: ISODate;
  /** Schluessel ist der stabile Aggregationsschluessel einer Einkaufszeile. */
  lineStates: Record<string, ShoppingLineState>;
  createdAt: string;
  updatedAt: string;
}

/** Anwendungseinstellungen (Singleton, id === "app"). */
export interface AppSettings {
  id: 'app';
  /** Name der Ziel-Liste in Apple Erinnerungen. */
  appleReminderListName: string;
  /** Optionaler Apple-Kurzbefehl-Name fuer die Uebergabe. */
  appleShortcutName: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * Abgeleitete Typen der Einkaufsliste (nicht persistiert, ausser lineStates)
 * ------------------------------------------------------------------ */

/** Einzelner Bedarfsposten, bevor aggregiert wird. */
export interface DemandLine {
  ingredientName: string;
  amount: AmountSpec;
  unit: Unit;
  /** Vorratsartikel (Oel, Gewuerze): nur Bestandspruefung, keine Summe. */
  pantryStaple?: boolean;
  merchantId: ID | null;
  packageSize?: Quantity | null;
  category?: string;
  mealId: ID;
  mealName: string;
  date: ISODate;
}

/** Packungsrechnung fuer eine aggregierte Zeile. */
export interface PackagingResult {
  /** Anzahl zu kaufender Packungen. */
  packages: number;
  packageSize: Quantity;
  /** Tatsaechlich gekaufte Gesamtmenge in der Bedarfseinheit. */
  purchasedAmount: number;
  /** Ueberbestand = gekauft - Bedarf. */
  surplus: number;
}

/** Aggregierte Einkaufslisten-Zeile. */
export interface ShoppingListItem {
  /** Stabiler Schluessel: Name + Dimension + Haendler. */
  key: string;
  name: string;
  /**
   * Untergrenze des Bedarfs in der Anzeigeeinheit. Bei reinen Festmengen
   * identisch mit `amountMax`.
   */
  amount: number;
  /** Obergrenze des Bedarfs. Nach ihr wird die Packungszahl berechnet. */
  amountUpper: number;
  /** true, wenn sich der Bedarf aus mindestens einem Bereich ergibt. */
  isRange: boolean;
  unit: Unit;
  merchantId: ID | null;
  category?: string;
  packaging: PackagingResult | null;
  /** Woraus sich der Bedarf zusammensetzt (fuer die Detailanzeige). */
  sources: Array<{ mealName: string; date: ISODate; amount: AmountSpec; unit: Unit }>;
  state: ShoppingLineState;
}

/** Nach Haendler gruppierte Einkaufsliste. */
export interface ShoppingGroup {
  merchantId: ID | null;
  merchantName: string;
  items: ShoppingListItem[];
}

export interface ShoppingList {
  weekId: WeekId;
  isoYear: number;
  isoWeek: number;
  startDate: ISODate;
  endDate: ISODate;
  groups: ShoppingGroup[];
  /** Alle Zeilen, auch die als "vorhanden" markierten. */
  allItems: ShoppingListItem[];
  /**
   * Zutaten ohne bezifferte Menge (Oel, Gewuerze, Wasser) sowie Vorratsartikel.
   * Sie werden nicht aufsummiert, sondern nur zum Nachsehen aufgefuehrt.
   */
  pantryChecks: ShoppingListItem[];
}

/* ------------------------------------------------------------------ *
 * Backup / Import
 * ------------------------------------------------------------------ */

export const BACKUP_FORMAT = 'familien-wochenplan/backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: {
    persons: Person[];
    merchants: Merchant[];
    meals: Meal[];
    assignments: MealAssignment[];
    weekPlans: WeekPlan[];
    settings: AppSettings | null;
  };
}
