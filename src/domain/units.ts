/**
 * Einheiten-Logik fuer die Zutatenaggregation.
 *
 * Kernidee: Zwei Mengen duerfen nur zusammengefasst werden, wenn sie in
 * derselben *Dimension* liegen. Innerhalb einer Dimension wird ueber einen
 * Faktor auf eine Basiseinheit umgerechnet.
 *
 * Bewusst NICHT umgerechnet wird zwischen Masse und Volumen (Dichte ist
 * produktabhaengig) und zwischen Stueckeinheiten (1 Dose ist nicht 1 Glas).
 * Jede Stueck-/Hausmass-Einheit bildet daher ihre eigene Dimension.
 */
import type { Unit } from './types';

export type Dimension = string;

interface UnitInfo {
  dimension: Dimension;
  /** Faktor zur Basiseinheit der Dimension. */
  factor: number;
  base: Unit;
}

const UNIT_TABLE: Record<Unit, UnitInfo> = {
  g: { dimension: 'mass', factor: 1, base: 'g' },
  kg: { dimension: 'mass', factor: 1000, base: 'g' },
  ml: { dimension: 'volume', factor: 1, base: 'ml' },
  l: { dimension: 'volume', factor: 1000, base: 'ml' },
  Stk: { dimension: 'count:Stk', factor: 1, base: 'Stk' },
  Pck: { dimension: 'count:Pck', factor: 1, base: 'Pck' },
  Dose: { dimension: 'count:Dose', factor: 1, base: 'Dose' },
  Glas: { dimension: 'count:Glas', factor: 1, base: 'Glas' },
  Bund: { dimension: 'count:Bund', factor: 1, base: 'Bund' },
  Scheibe: { dimension: 'count:Scheibe', factor: 1, base: 'Scheibe' },
  EL: { dimension: 'spoon:EL', factor: 1, base: 'EL' },
  TL: { dimension: 'spoon:TL', factor: 1, base: 'TL' },
  Prise: { dimension: 'pinch', factor: 1, base: 'Prise' },
  'nach Bedarf': { dimension: 'unspecified', factor: 1, base: 'nach Bedarf' },
};

export function isKnownUnit(value: string): value is Unit {
  return Object.prototype.hasOwnProperty.call(UNIT_TABLE, value);
}

export function unitInfo(unit: Unit): UnitInfo {
  const info = UNIT_TABLE[unit];
  if (!info) throw new Error(`Unbekannte Einheit: ${unit}`);
  return info;
}

export function dimensionOf(unit: Unit): Dimension {
  return unitInfo(unit).dimension;
}

export function baseUnitOf(unit: Unit): Unit {
  return unitInfo(unit).base;
}

/** Menge auf die Basiseinheit der Dimension umrechnen. */
export function toBase(amount: number, unit: Unit): number {
  return amount * unitInfo(unit).factor;
}

/** Menge aus der Basiseinheit in eine Zieleinheit derselben Dimension umrechnen. */
export function fromBase(baseAmount: number, unit: Unit): number {
  return baseAmount / unitInfo(unit).factor;
}

/** Koennen zwei Einheiten verlustfrei zusammengefasst werden? */
export function isCompatible(a: Unit, b: Unit): boolean {
  return dimensionOf(a) === dimensionOf(b);
}

/**
 * Waehlt die angenehmste Anzeigeeinheit fuer eine Basismenge.
 * 1200 g -> 1,2 kg;  800 g -> 800 g;  1500 ml -> 1,5 l.
 */
export function displayUnitFor(baseAmount: number, base: Unit): Unit {
  if (base === 'g' && Math.abs(baseAmount) >= 1000) return 'kg';
  if (base === 'ml' && Math.abs(baseAmount) >= 1000) return 'l';
  return base;
}

/** Rundet kaufmaennisch auf `digits` Nachkommastellen und entfernt Float-Rauschen. */
export function roundTo(value: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Zahl in deutscher Schreibweise, ohne ueberfluessige Nachkommastellen. */
export function formatNumberDE(value: number): string {
  const rounded = roundTo(value, 2);
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(rounded);
}

/** "800 g", "1,2 kg", "2 Stk" */
export function formatQuantity(amount: number, unit: Unit): string {
  if (unit === 'nach Bedarf') return 'nach Bedarf';
  return `${formatNumberDE(amount)} ${unit}`;
}

/**
 * Menge als Bereich: "700-800 ml". Bei gleichen Grenzen wird nur ein Wert
 * ausgegeben, damit aus "500-500 g" nicht unnoetig ein Bereich wird.
 */
export function formatRange(min: number, max: number, unit: Unit): string {
  if (unit === 'nach Bedarf') return 'nach Bedarf';
  if (roundTo(min, 3) === roundTo(max, 3)) return formatQuantity(max, unit);
  return `${formatNumberDE(min)}–${formatNumberDE(max)} ${unit}`;
}

/** Formatiert eine Mengenangabe samt Einheit, inklusive Bereichen und "offen". */
export function formatAmountSpec(
  spec: { kind: 'exact'; value: number } | { kind: 'range'; min: number; max: number } | { kind: 'open' },
  unit: Unit,
): string {
  if (spec.kind === 'open') return 'Menge offen';
  if (spec.kind === 'range') return formatRange(spec.min, spec.max, unit);
  return formatQuantity(spec.value, unit);
}
