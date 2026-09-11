import { describe, expect, it } from 'vitest';
import { parseMealImport, serializeMeals } from '../../src/domain/mealSchema';

const merchants = new Map([
  ['kück biomarkt', 'mer_kueck'],
  ['aldi', 'mer_aldi'],
]);
const resolve = (name: string) => merchants.get(name.toLowerCase().trim()) ?? null;

const valid = {
  format: 'familien-wochenplan/meals',
  version: 1,
  meals: [
    {
      name: 'Spaghetti mit Hackfleisch',
      description: 'Klassiker',
      recipe: 'Nudeln kochen, Hackfleisch anbraten.',
      servings: 4,
      ingredients: [
        { name: 'Spaghetti', amount: 800, unit: 'g', merchant: 'Kück Biomarkt', packageSize: { amount: 500, unit: 'g' } },
        { name: 'Hackfleisch', amount: 500, unit: 'g', merchant: 'ALDI' },
      ],
    },
  ],
};

describe('Gericht-Import', () => {
  it('importiert eine gueltige Datei', () => {
    const result = parseMealImport(valid, resolve);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    const meal = result.value[0]!;
    expect(meal.name).toBe('Spaghetti mit Hackfleisch');
    expect(meal.servings).toBe(4);
    expect(meal.ingredients[0]!.merchantId).toBe('mer_kueck');
    expect(meal.ingredients[0]!.packageSize).toEqual({ amount: 500, unit: 'g' });
    expect(meal.active).toBe(true);
  });

  it('vergibt frische, nicht vom Namen abgeleitete IDs', () => {
    const a = parseMealImport(valid, resolve);
    const b = parseMealImport(valid, resolve);
    if (!a.ok || !b.ok) throw new Error('Import sollte gelingen');
    expect(a.value[0]!.id).not.toBe(b.value[0]!.id);
    expect(a.value[0]!.id).not.toContain('Spaghetti');
  });

  it('akzeptiert auch eine blanke Liste und ein einzelnes Gericht', () => {
    expect(parseMealImport(valid.meals, resolve).ok).toBe(true);
    expect(parseMealImport(valid.meals[0], resolve).ok).toBe(true);
  });

  it('erfindet keine Haendler, sondern warnt und setzt "Unklar"', () => {
    const result = parseMealImport(
      { meals: [{ name: 'Test', ingredients: [{ name: 'X', amount: 1, unit: 'Stk', merchant: 'Unbekannter Laden' }] }] },
      resolve,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.ingredients[0]!.merchantId).toBeNull();
    expect(result.warnings[0]!.message).toContain('Unbekannter Laden');
  });

  it('lehnt unbekannte Einheiten mit klarer Meldung ab', () => {
    const result = parseMealImport(
      { meals: [{ name: 'Test', ingredients: [{ name: 'Mehl', amount: 1, unit: 'Sack' }] }] },
      resolve,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain('Sack');
    expect(result.errors[0]!.path).toBe('meals[0].ingredients[0].unit');
  });

  it('lehnt Gerichte ohne Namen ab', () => {
    const result = parseMealImport({ meals: [{ ingredients: [] }] }, resolve);
    expect(result.ok).toBe(false);
  });

  it('lehnt fehlende oder unlesbare Mengen ab', () => {
    const noAmount = parseMealImport({ meals: [{ name: 'T', ingredients: [{ name: 'Mehl', unit: 'g' }] }] }, resolve);
    expect(noAmount.ok).toBe(false);
    const negative = parseMealImport(
      { meals: [{ name: 'T', ingredients: [{ name: 'Mehl', amount: -5, unit: 'g' }] }] },
      resolve,
    );
    expect(negative.ok).toBe(false);
  });

  it('toleriert deutsche Dezimalkommata aus Sprachmodell-Ausgaben', () => {
    const result = parseMealImport(
      { meals: [{ name: 'T', ingredients: [{ name: 'Sahne', amount: '0,2', unit: 'l' }] }] },
      resolve,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.ingredients[0]!.amount).toBeCloseTo(0.2);
  });

  it('lehnt voellig falsche Strukturen verstaendlich ab', () => {
    const result = parseMealImport({ irgendwas: true }, resolve);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain('meals');
  });

  it('meldet alle Fehler auf einmal, nicht nur den ersten', () => {
    const result = parseMealImport(
      {
        meals: [
          { name: 'A', ingredients: [{ name: 'X', amount: 1, unit: 'Sack' }] },
          { name: 'B', ingredients: [{ name: 'Y', amount: 1, unit: 'Eimer' }] },
        ],
      },
      resolve,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('importiert nichts, wenn ein Gericht fehlerhaft ist', () => {
    const result = parseMealImport(
      { meals: [valid.meals[0], { name: 'Kaputt', ingredients: [{ name: 'X', amount: 1, unit: 'Sack' }] }] },
      resolve,
    );
    expect(result.ok).toBe(false);
  });

  it('ist mit dem eigenen Export rundlauffaehig', () => {
    const imported = parseMealImport(valid, resolve);
    if (!imported.ok) throw new Error('Import sollte gelingen');
    const names = new Map([['mer_kueck', 'Kück Biomarkt'], ['mer_aldi', 'ALDI']]);
    const exported = serializeMeals(imported.value, (id) => (id ? (names.get(id) ?? null) : null));
    const reimported = parseMealImport(exported, resolve);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.value[0]!.ingredients[0]!.merchantId).toBe('mer_kueck');
    expect(reimported.value[0]!.ingredients[0]!.amount).toBe(800);
  });
});
