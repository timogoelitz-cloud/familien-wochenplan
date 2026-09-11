/**
 * Zusammenfuehren gleicher Zutaten ueber alle Gerichte einer Woche.
 *
 * Zusammengefasst wird nur, wenn *alle* drei Merkmale uebereinstimmen:
 *   1. normalisierter Produktname
 *   2. Dimension der Einheit (Masse / Volumen / eine konkrete Stueckeinheit)
 *   3. Haendler
 *
 * Damit werden 500 g + 300 g Nudeln zu 800 g, aber 200 g Tomaten und
 * 2 Dosen Tomaten bleiben getrennt -- das sind unterschiedliche Produkte.
 *
 * Mengenbereiche bleiben Bereiche: Unter- und Obergrenzen werden getrennt
 * addiert, damit aus "700-800 ml" und "500 ml" korrekt "1,2-1,3 l" wird und
 * nicht ein erfundener Einzelwert.
 */
import type { AmountSpec, DemandLine, ShoppingListItem, Quantity, Unit } from './types';
import { amountMax, amountMin } from './types';
import { calculatePackages } from './packaging';
import { baseUnitOf, dimensionOf, displayUnitFor, fromBase, roundTo, toBase } from './units';

/**
 * Normalisiert einen Produktnamen fuer den Vergleich.
 *
 * Bewusst konservativ: Gross-/Kleinschreibung, Leerraum, Umlaut-Schreibweise
 * ("Moehren" == "Möhren") und umschliessende Satzzeichen werden vereinheitlicht.
 * Es findet *keine* Singular-/Plural- oder Wortstamm-Reduktion statt, damit
 * nicht versehentlich unterschiedliche Produkte verschmelzen.
 */
export function normalizeIngredientName(name: string): string {
  return name
    .normalize('NFC')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[.,;:!?]+$/g, '')
    .replace(/^[.,;:!?]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stabiler Aggregationsschluessel. Wird auch fuer Vorrat/Abhaken persistiert. */
export function aggregationKey(name: string, unit: Unit, merchantId: string | null): string {
  return `${normalizeIngredientName(name)}|${dimensionOf(unit)}|${merchantId ?? ''}`;
}

interface Bucket {
  key: string;
  name: string;
  baseMin: number;
  baseMax: number;
  isRange: boolean;
  baseUnit: Unit;
  merchantId: string | null;
  category?: string;
  packageSize?: Quantity | null;
  sources: ShoppingListItem['sources'];
}

function emptyBucket(line: DemandLine, key: string): Bucket {
  return {
    key,
    name: line.ingredientName.trim(),
    baseMin: 0,
    baseMax: 0,
    isRange: false,
    baseUnit: baseUnitOf(line.unit),
    merchantId: line.merchantId,
    category: line.category,
    packageSize: line.packageSize ?? null,
    sources: [],
  };
}

function addSource(bucket: Bucket, line: DemandLine): void {
  bucket.sources.push({
    mealName: line.mealName,
    date: line.date,
    amount: line.amount,
    unit: line.unit,
  });
  if (!bucket.packageSize && line.packageSize) bucket.packageSize = line.packageSize;
  if (!bucket.category && line.category) bucket.category = line.category;
}

function finish(bucket: Bucket): Omit<ShoppingListItem, 'state'> {
  const unit = displayUnitFor(bucket.baseMax, bucket.baseUnit);
  const amount = roundTo(fromBase(bucket.baseMin, unit), 3);
  const amountUpper = roundTo(fromBase(bucket.baseMax, unit), 3);
  const item: Omit<ShoppingListItem, 'state'> = {
    key: bucket.key,
    name: bucket.name,
    amount,
    amountUpper,
    isRange: bucket.isRange && amountUpper !== amount,
    unit,
    merchantId: bucket.merchantId,
    // Eingekauft wird nach der Obergrenze -- lieber etwas uebrig als zu wenig.
    packaging: calculatePackages(amountUpper, unit, bucket.packageSize),
    sources: bucket.sources,
  };
  if (bucket.category) item.category = bucket.category;
  return item;
}

/** Zutat ohne bezifferte Menge? Die wird nie summiert. */
function isUnquantified(amount: AmountSpec): boolean {
  return amount.kind === 'open';
}

export interface AggregationResult {
  /** Aufsummierte Positionen mit bezifferter Menge. */
  items: Array<Omit<ShoppingListItem, 'state'>>;
  /** Vorratsartikel und unbezifferte Zutaten, nur zur Bestandspruefung. */
  pantryChecks: Array<Omit<ShoppingListItem, 'state'>>;
}

/**
 * Fuehrt Bedarfszeilen zusammen und berechnet Mengen sowie Packungen.
 * Die Reihenfolge der Eingabe bestimmt die Reihenfolge der Ausgabe.
 */
export function aggregateDemand(lines: DemandLine[]): AggregationResult {
  const buckets = new Map<string, Bucket>();
  const pantry = new Map<string, Bucket>();

  for (const line of lines) {
    const key = aggregationKey(line.ingredientName, line.unit, line.merchantId);
    const unquantified = isUnquantified(line.amount) || line.pantryStaple === true;

    if (unquantified) {
      // Oel, Gewuerze, Wasser: nur merken, dass es gebraucht wird.
      let bucket = pantry.get(key);
      if (!bucket) {
        bucket = emptyBucket(line, key);
        pantry.set(key, bucket);
      }
      addSource(bucket, line);
      continue;
    }

    const min = amountMin(line.amount);
    const max = amountMax(line.amount);
    if (min === null || max === null) continue;
    if (!(max > 0)) continue;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = emptyBucket(line, key);
      buckets.set(key, bucket);
    }
    bucket.baseMin += toBase(min, line.unit);
    bucket.baseMax += toBase(max, line.unit);
    if (line.amount.kind === 'range') bucket.isRange = true;
    addSource(bucket, line);
  }

  return {
    items: [...buckets.values()].map(finish),
    pantryChecks: [...pantry.values()].map(finish),
  };
}
