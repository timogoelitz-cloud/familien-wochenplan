import { describe, expect, it } from 'vitest';
import { aggregateDemand, aggregationKey, normalizeIngredientName } from '../../src/domain/aggregate';
import type { DemandLine } from '../../src/domain/types';
import { exactAmount } from '../../src/domain/types';

function line(
  partial: Omit<Partial<DemandLine>, 'amount'> &
    Pick<DemandLine, 'ingredientName' | 'unit'> & { amount: number | DemandLine['amount'] },
): DemandLine {
  return {
    merchantId: 'mer_kueck',
    packageSize: null,
    mealId: 'meal_1',
    mealName: 'Testgericht',
    date: '2026-09-14',
    ...partial,
    amount: typeof partial.amount === 'number' ? exactAmount(partial.amount) : partial.amount,
  };
}

/** Nur die summierten Positionen -- kuerzt die Tests unten ab. */
function items(lines: DemandLine[]) {
  return aggregateDemand(lines).items;
}

describe('Namensnormalisierung', () => {
  it('vereinheitlicht Schreibweise und Leerraum', () => {
    expect(normalizeIngredientName('  Spaghetti ')).toBe('spaghetti');
    expect(normalizeIngredientName('SPAGHETTI')).toBe('spaghetti');
    expect(normalizeIngredientName('Rote  Zwiebeln')).toBe('rote zwiebeln');
  });

  it('vereinheitlicht Umlaut-Schreibweisen', () => {
    expect(normalizeIngredientName('Möhren')).toBe(normalizeIngredientName('Moehren'));
    expect(normalizeIngredientName('Weißkohl')).toBe(normalizeIngredientName('Weisskohl'));
  });

  it('verschmilzt NICHT unterschiedliche Produkte', () => {
    expect(normalizeIngredientName('Tomaten')).not.toBe(normalizeIngredientName('Tomatenmark'));
    expect(normalizeIngredientName('Nudeln')).not.toBe(normalizeIngredientName('Nudelsauce'));
  });
});

describe('Zutatenaggregation', () => {
  it('fuehrt gleiche Zutaten zusammen (Beispiel aus der Aufgabenstellung)', () => {
    const result = items([
      line({ ingredientName: 'Nudeln', amount: 500, unit: 'g', mealName: 'Gericht A' }),
      line({ ingredientName: 'Nudeln', amount: 300, unit: 'g', mealName: 'Gericht B' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.amount).toBe(800);
    expect(result[0]!.unit).toBe('g');
    expect(result[0]!.sources).toHaveLength(2);
  });

  it('rechnet kompatible Einheiten um', () => {
    const result = items([
      line({ ingredientName: 'Mehl', amount: 1, unit: 'kg' }),
      line({ ingredientName: 'Mehl', amount: 500, unit: 'g' }),
    ]);
    expect(result).toHaveLength(1);
    // 1500 g werden als 1,5 kg angezeigt.
    expect(result[0]!.amount).toBe(1.5);
    expect(result[0]!.unit).toBe('kg');
  });

  it('bleibt unter 1000 g bei Gramm', () => {
    const result = items([line({ ingredientName: 'Mehl', amount: 800, unit: 'g' })]);
    expect(result[0]!.unit).toBe('g');
    expect(result[0]!.amount).toBe(800);
  });

  it('fuehrt unterschiedliche Einheiten NICHT faelschlich zusammen', () => {
    const result = items([
      line({ ingredientName: 'Tomaten', amount: 400, unit: 'g' }),
      line({ ingredientName: 'Tomaten', amount: 2, unit: 'Dose' }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('trennt Masse und Volumen', () => {
    const result = items([
      line({ ingredientName: 'Sahne', amount: 200, unit: 'g' }),
      line({ ingredientName: 'Sahne', amount: 200, unit: 'ml' }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('trennt unterschiedliche Stueckeinheiten', () => {
    const result = items([
      line({ ingredientName: 'Tomaten', amount: 1, unit: 'Dose' }),
      line({ ingredientName: 'Tomaten', amount: 1, unit: 'Glas' }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('trennt nach Haendler', () => {
    const result = items([
      line({ ingredientName: 'Nudeln', amount: 500, unit: 'g', merchantId: 'mer_kueck' }),
      line({ ingredientName: 'Nudeln', amount: 500, unit: 'g', merchantId: 'mer_aldi' }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('fuehrt unterschiedlich geschriebene gleiche Zutaten zusammen', () => {
    const result = items([
      line({ ingredientName: 'Möhren', amount: 300, unit: 'g' }),
      line({ ingredientName: 'moehren', amount: 200, unit: 'g' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.amount).toBe(500);
    // Der zuerst erfasste Anzeigename bleibt erhalten.
    expect(result[0]!.name).toBe('Möhren');
  });

  it('uebernimmt die Packungsgroesse und rechnet Packungen', () => {
    const result = items([
      line({ ingredientName: 'Spaghetti', amount: 500, unit: 'g', packageSize: { amount: 500, unit: 'g' } }),
      line({ ingredientName: 'Spaghetti', amount: 300, unit: 'g' }),
    ]);
    expect(result[0]!.amount).toBe(800);
    expect(result[0]!.packaging?.packages).toBe(2);
    expect(result[0]!.packaging?.surplus).toBe(200);
  });

  it('ignoriert Zeilen ohne Menge', () => {
    const result = items([
      line({ ingredientName: 'Salz', amount: 0, unit: 'g' }),
      line({ ingredientName: 'Nudeln', amount: 500, unit: 'g' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Nudeln');
  });

  it('erzeugt stabile Schluessel', () => {
    const a = aggregationKey('Nudeln', 'g', 'mer_kueck');
    const b = aggregationKey('  nudeln  ', 'kg', 'mer_kueck');
    expect(a).toBe(b); // gleiche Dimension -> gleicher Schluessel
    expect(aggregationKey('Nudeln', 'Stk', 'mer_kueck')).not.toBe(a);
    expect(aggregationKey('Nudeln', 'g', null)).not.toBe(a);
  });
});
