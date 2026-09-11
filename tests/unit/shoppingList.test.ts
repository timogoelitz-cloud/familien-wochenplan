import { describe, expect, it } from 'vitest';
import { buildShoppingList, groupByMerchant, shoppingProgress } from '../../src/domain/shoppingList';
import { aggregationKey } from '../../src/domain/aggregate';
import type { Meal, MealAssignment, Merchant, ShoppingListItem } from '../../src/domain/types';
import { exactAmount } from '../../src/domain/types';

const merchants: Merchant[] = [
  { id: 'mer_kueck', name: 'Kück Biomarkt', order: 0, active: true },
  { id: 'mer_aldi', name: 'ALDI', order: 1, active: true },
  { id: 'mer_dm', name: 'dm', order: 2, active: true },
];

function meal(id: string, name: string, ingredients: Meal['ingredients']): Meal {
  return {
    id,
    name,
    ingredients,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const spaghetti = meal('meal_spaghetti', 'Spaghetti', [
  { id: 'i1', name: 'Spaghetti', amount: exactAmount(500), unit: 'g', merchantId: 'mer_kueck', packageSize: { amount: 500, unit: 'g' } },
  { id: 'i2', name: 'Hackfleisch', amount: exactAmount(400), unit: 'g', merchantId: null },
]);

const auflauf = meal('meal_auflauf', 'Auflauf', [
  { id: 'i3', name: 'Spaghetti', amount: exactAmount(300), unit: 'g', merchantId: 'mer_kueck', packageSize: { amount: 500, unit: 'g' } },
  { id: 'i4', name: 'Shampoo', amount: exactAmount(1), unit: 'Stk', merchantId: 'mer_dm' },
]);

function assignment(id: string, date: string, mealId: string, position = 0): MealAssignment {
  return {
    id,
    weekId: '2026-W38',
    date,
    mealId,
    personIds: [],
    position,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('Einkaufsliste aufbauen', () => {
  it('fuehrt Zutaten ueber mehrere Gerichte und Tage zusammen', () => {
    const list = buildShoppingList({
      weekId: '2026-W38',
      assignments: [assignment('a1', '2026-09-14', 'meal_spaghetti'), assignment('a2', '2026-09-16', 'meal_auflauf')],
      meals: [spaghetti, auflauf],
      merchants,
      lineStates: {},
    });
    const pasta = list.allItems.find((item) => item.name === 'Spaghetti');
    expect(pasta?.amount).toBe(800);
    expect(pasta?.packaging?.packages).toBe(2);
    expect(pasta?.sources).toHaveLength(2);
  });

  it('uebernimmt Kalenderwoche und Datumsbereich', () => {
    const list = buildShoppingList({
      weekId: '2026-W38',
      assignments: [],
      meals: [],
      merchants,
      lineStates: {},
    });
    expect(list.isoWeek).toBe(38);
    expect(list.isoYear).toBe(2026);
    expect(list.startDate).toBe('2026-09-14');
    expect(list.endDate).toBe('2026-09-20');
  });

  it('zaehlt dasselbe Gericht an zwei Tagen doppelt', () => {
    const list = buildShoppingList({
      weekId: '2026-W38',
      assignments: [assignment('a1', '2026-09-14', 'meal_spaghetti'), assignment('a2', '2026-09-17', 'meal_spaghetti')],
      meals: [spaghetti],
      merchants,
      lineStates: {},
    });
    const pasta = list.allItems.find((item) => item.name === 'Spaghetti');
    // 500 g + 500 g = 1000 g, wird als 1 kg angezeigt.
    expect(pasta?.amount).toBe(1);
    expect(pasta?.unit).toBe('kg');
    expect(pasta?.packaging?.packages).toBe(2);
    const hack = list.allItems.find((item) => item.name === 'Hackfleisch');
    expect(hack?.amount).toBe(800);
    expect(hack?.unit).toBe('g');
  });

  it('ueberspringt Zuordnungen auf geloeschte Gerichte, ohne zu scheitern', () => {
    const list = buildShoppingList({
      weekId: '2026-W38',
      assignments: [assignment('a1', '2026-09-14', 'meal_geloescht')],
      meals: [spaghetti],
      merchants,
      lineStates: {},
    });
    expect(list.allItems).toHaveLength(0);
  });
});

describe('Vorratsfilter', () => {
  const key = aggregationKey('Spaghetti', 'g', 'mer_kueck');

  it('blendet vorhandene Artikel aus der Kaufliste aus', () => {
    const list = buildShoppingList({
      weekId: '2026-W38',
      assignments: [assignment('a1', '2026-09-14', 'meal_spaghetti')],
      meals: [spaghetti],
      merchants,
      lineStates: { [key]: { inPantry: true, checked: false } },
    });
    const visible = list.groups.flatMap((group) => group.items).map((item) => item.name);
    expect(visible).not.toContain('Spaghetti');
    expect(visible).toContain('Hackfleisch');
    // In allItems bleibt der Artikel sichtbar, damit man ihn zuruecksetzen kann.
    expect(list.allItems.map((item) => item.name)).toContain('Spaghetti');
  });

  it('kann den Vorratsfilter abschalten', () => {
    const list = buildShoppingList({
      weekId: '2026-W38',
      assignments: [assignment('a1', '2026-09-14', 'meal_spaghetti')],
      meals: [spaghetti],
      merchants,
      lineStates: { [key]: { inPantry: true, checked: false } },
      hidePantryItems: false,
    });
    expect(list.groups.flatMap((group) => group.items).map((item) => item.name)).toContain('Spaghetti');
  });
});

describe('Haendlergruppierung', () => {
  it('gruppiert nach Haendler in Stammdatenreihenfolge', () => {
    const list = buildShoppingList({
      weekId: '2026-W38',
      assignments: [assignment('a1', '2026-09-14', 'meal_spaghetti'), assignment('a2', '2026-09-15', 'meal_auflauf')],
      meals: [spaghetti, auflauf],
      merchants,
      lineStates: {},
    });
    expect(list.groups.map((group) => group.merchantName)).toEqual(['Kück Biomarkt', 'dm', 'Unklar']);
  });

  it('stellt "Unklar" immer ans Ende', () => {
    const items = [
      { merchantId: null, name: 'B' },
      { merchantId: 'mer_aldi', name: 'A' },
    ] as ShoppingListItem[];
    const groups = groupByMerchant(items, merchants);
    expect(groups[groups.length - 1]!.merchantName).toBe('Unklar');
  });

  it('sortiert Artikel innerhalb einer Gruppe alphabetisch', () => {
    const items = [
      { merchantId: 'mer_aldi', name: 'Zucker' },
      { merchantId: 'mer_aldi', name: 'Äpfel' },
      { merchantId: 'mer_aldi', name: 'Mehl' },
    ] as ShoppingListItem[];
    const groups = groupByMerchant(items, merchants);
    expect(groups[0]!.items.map((item) => item.name)).toEqual(['Äpfel', 'Mehl', 'Zucker']);
  });

  it('behandelt unbekannte Haendler-IDs wie "Unklar"', () => {
    const items = [{ merchantId: 'mer_weg', name: 'A' }] as ShoppingListItem[];
    const groups = groupByMerchant(items, merchants);
    expect(groups[0]!.merchantName).toBe('Unklar');
  });
});

describe('Fortschritt', () => {
  it('zaehlt abgehakte Positionen ohne Vorratsartikel', () => {
    const key = aggregationKey('Spaghetti', 'g', 'mer_kueck');
    const list = buildShoppingList({
      weekId: '2026-W38',
      assignments: [assignment('a1', '2026-09-14', 'meal_spaghetti')],
      meals: [spaghetti],
      merchants,
      lineStates: { [key]: { inPantry: false, checked: true } },
    });
    expect(shoppingProgress(list)).toEqual({ done: 1, total: 2 });
  });
});
