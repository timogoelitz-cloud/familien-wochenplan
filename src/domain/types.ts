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

/** Eine Zutat innerhalb eines Gerichts. */
export interface MealIngredient {
  id: ID;
  /** Anzeigename, z. B. "Spaghetti". */
  name: string;
  amount: number;
  unit: Unit;
  /** Bevorzugter Haendler. Leer => wird der Gruppe "Unklar" zugeordnet. */
  merchantId: ID | null;
  /** Optionale Warengruppe, z. B. "Trockenware". */
  category?: string;
  /** Optionale Packungsgroesse, z. B. 500 g. */
  packageSize?: Quantity | null;
  note?: string;
}

/** Ein Gericht mit Rezept und Zutaten. */
export interface Meal {
  id: ID;
  name: string;
  description?: string;
  /** Freitext-Zubereitung. */
  recipe?: string;
  /** Bild als Data-URL (Upload) oder externe URL. */
  image?: string | null;
  /** Typische Familienmenge, auf die sich die Zutatenmengen beziehen. */
  servings?: number;
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
  amount: number;
  unit: Unit;
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
  /** Bedarf in der gewaehlten Anzeigeeinheit. */
  amount: number;
  unit: Unit;
  merchantId: ID | null;
  category?: string;
  packaging: PackagingResult | null;
  /** Woraus sich der Bedarf zusammensetzt (fuer die Detailanzeige). */
  sources: Array<{ mealName: string; date: ISODate; amount: number; unit: Unit }>;
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
