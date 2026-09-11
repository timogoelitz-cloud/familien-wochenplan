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
 */
import type { DemandLine, ShoppingListItem, Quantity, Unit } from './types';
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
  baseAmount: number;
  baseUnit: Unit;
  merchantId: string | null;
  category?: string;
  packageSize?: Quantity | null;
  sources: ShoppingListItem['sources'];
}

/**
 * Fuehrt Bedarfszeilen zusammen und berechnet Mengen sowie Packungen.
 * Die Reihenfolge der Eingabe bestimmt die Reihenfolge der Ausgabe.
 */
export function aggregateDemand(lines: DemandLine[]): Array<Omit<ShoppingListItem, 'state'>> {
  const buckets = new Map<string, Bucket>();

  for (const line of lines) {
    if (!(line.amount > 0) && line.unit !== 'nach Bedarf') continue;
    const key = aggregationKey(line.ingredientName, line.unit, line.merchantId);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        name: line.ingredientName.trim(),
        baseAmount: 0,
        baseUnit: baseUnitOf(line.unit),
        merchantId: line.merchantId,
        category: line.category,
        packageSize: line.packageSize ?? null,
        sources: [],
      };
      buckets.set(key, bucket);
    }
    bucket.baseAmount += toBase(line.amount, line.unit);
    // Erste hinterlegte Packungsgroesse gewinnt; spaetere Abweichungen werden
    // ignoriert, damit die Rechnung deterministisch bleibt.
    if (!bucket.packageSize && line.packageSize) bucket.packageSize = line.packageSize;
    if (!bucket.category && line.category) bucket.category = line.category;
    bucket.sources.push({
      mealName: line.mealName,
      date: line.date,
      amount: line.amount,
      unit: line.unit,
    });
  }

  return [...buckets.values()].map((bucket) => {
    const unit = displayUnitFor(bucket.baseAmount, bucket.baseUnit);
    const amount = roundTo(fromBase(bucket.baseAmount, unit), 3);
    const item: Omit<ShoppingListItem, 'state'> = {
      key: bucket.key,
      name: bucket.name,
      amount,
      unit,
      merchantId: bucket.merchantId,
      packaging: calculatePackages(amount, unit, bucket.packageSize),
      sources: bucket.sources,
    };
    if (bucket.category) item.category = bucket.category;
    return item;
  });
}
