/**
 * Packungsberechnung.
 *
 * Beispiel: Bedarf 800 g, Packungsgroesse 500 g
 *   -> 2 Packungen, Einkauf 1000 g, Ueberbestand 200 g.
 */
import type { PackagingResult, Quantity, Unit } from './types';
import { dimensionOf, fromBase, roundTo, toBase } from './units';

/**
 * Berechnet, wie viele Packungen fuer einen Bedarf gekauft werden muessen.
 *
 * Gibt `null` zurueck, wenn keine sinnvolle Rechnung moeglich ist:
 *  - keine Packungsgroesse hinterlegt
 *  - Packungsgroesse <= 0
 *  - Packungseinheit liegt in einer anderen Dimension als der Bedarf
 *    (z. B. Bedarf in Stueck, Packung in Gramm)
 */
export function calculatePackages(
  demandAmount: number,
  demandUnit: Unit,
  packageSize: Quantity | null | undefined,
): PackagingResult | null {
  if (!packageSize) return null;
  if (!(packageSize.amount > 0)) return null;
  if (dimensionOf(packageSize.unit) !== dimensionOf(demandUnit)) return null;
  if (!(demandAmount > 0)) return null;

  const demandBase = toBase(demandAmount, demandUnit);
  const packageBase = toBase(packageSize.amount, packageSize.unit);

  // Float-Toleranz, damit 3 x 0,1 l nicht faelschlich zu 4 Packungen aufrundet.
  const raw = demandBase / packageBase;
  const packages = Math.ceil(roundTo(raw, 6));

  const purchasedBase = packages * packageBase;
  return {
    packages,
    packageSize: { amount: packageSize.amount, unit: packageSize.unit },
    purchasedAmount: roundTo(fromBase(purchasedBase, demandUnit), 3),
    surplus: roundTo(fromBase(purchasedBase - demandBase, demandUnit), 3),
  };
}
