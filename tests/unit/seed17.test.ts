/**
 * Prueft unsere 17 echten Familiengerichte gegen den echten Importpfad.
 * Diese Datei ist die Quelle der Wahrheit fuer die Gerichte-Stammdaten --
 * ein Fehler darin faellt sonst erst beim Einkaufen auf.
 */
import { describe, expect, it } from 'vitest';
import seed from '../../data/meals.seed.json';
import { parseMealImport } from '../../src/domain/mealSchema';
import { buildShoppingList } from '../../src/domain/shoppingList';
import { DEFAULT_MERCHANTS } from '../../src/data/defaults';
import type { Meal, MealAssignment } from '../../src/domain/types';

const resolveMerchant = (name: string) =>
  DEFAULT_MERCHANTS.find((m) => m.name.toLowerCase() === name.toLowerCase().trim())?.id ?? null;

const parsed = parseMealImport(seed, resolveMerchant);
if (!parsed.ok) {
  throw new Error(
    'meals.seed.json ist ungueltig:\n' + parsed.errors.map((e) => `${e.path}: ${e.message}`).join('\n'),
  );
}
const meals: Meal[] = parsed.value;

function assign(meal: Meal, date = '2026-09-14', overrides: Partial<MealAssignment> = {}): MealAssignment {
  return {
    id: `a_${meal.id}`,
    weekId: '2026-W38',
    date,
    mealId: meal.id,
    personIds: [],
    position: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function listFor(assignments: MealAssignment[]) {
  return buildShoppingList({
    weekId: '2026-W38',
    assignments,
    meals,
    merchants: DEFAULT_MERCHANTS,
    lineStates: {},
  });
}

const byNumber = (n: number): Meal => {
  const meal = meals.find((m) => m.number === n);
  if (!meal) throw new Error(`Gericht ${n} fehlt`);
  return meal;
};

describe('Die 17 Gerichte', () => {
  it('werden vollstaendig und fehlerfrei importiert', () => {
    expect(meals).toHaveLength(17);
    expect(parsed.ok && parsed.warnings).toEqual([]);
  });

  it('behalten die Nummerierung 1 bis 17', () => {
    expect(meals.map((m) => m.number).sort((a, b) => a! - b!)).toEqual(
      Array.from({ length: 17 }, (_, i) => i + 1),
    );
  });

  it('tragen die vereinbarten Namen', () => {
    expect(byNumber(1).name).toBe('Nudeln mit Tomatensauce');
    expect(byNumber(9).name).toBe('Nudeln mit Bolognese / Hackfleischgericht');
    expect(byNumber(17).name).toBe('Pizza Margherita oder Spinatpizza');
  });

  it('haben durchweg benannte Zutaten und gueltige IDs', () => {
    for (const meal of meals) {
      expect(meal.ingredients.length).toBeGreaterThan(0);
      for (const ingredient of meal.ingredients) {
        expect(ingredient.name.trim()).not.toBe('');
        expect(ingredient.id).toMatch(/^ing_/);
      }
    }
  });

  it('erfindet keine Haendlerzuordnungen', () => {
    // Bezugsquellen sind uns nicht bekannt und bleiben deshalb offen.
    for (const meal of meals) {
      for (const ingredient of meal.ingredients) {
        expect(ingredient.merchantId).toBeNull();
      }
    }
  });
});

describe('Mengenangaben', () => {
  it('erhaelt Mengenbereiche als Bereich', () => {
    const tomaten = byNumber(1).ingredients.find((i) => i.name === 'Passierte Tomaten');
    expect(tomaten?.amount).toEqual({ kind: 'range', min: 700, max: 800 });
  });

  it('macht aus unbezifferten Zutaten "offen" und nicht 0', () => {
    const oel = byNumber(1).ingredients.find((i) => i.name === 'Öl');
    expect(oel?.amount).toEqual({ kind: 'open' });
    expect(oel?.pantryStaple).toBe(true);
  });

  it('haelt die Portionsbasis fest, wo sie bekannt ist', () => {
    expect(byNumber(1).servings).toBe(4);
    expect(byNumber(13).servings).toBe(2);
  });

  it('markiert nicht bezifferte Portionsbasen ausdruecklich als offen', () => {
    // 14 und 15: Basis war in unserer Liste nie beziffert.
    expect(byNumber(14).servings).toBeNull();
    expect(byNumber(15).servings).toBeNull();
  });
});

describe('Varianten und Alternativen', () => {
  it('setzt bei "Reis oder Kartoffeln" nur die gewaehlte Beilage auf die Liste', () => {
    const meal = byNumber(10);
    const beilage = meal.choiceGroups!.find((g) => g.name === 'Beilage')!;
    const reis = beilage.options.find((o) => o.label === 'Reis')!;

    const mitKartoffeln = listFor([assign(meal)]);
    const namenK = mitKartoffeln.allItems.map((i) => i.name);
    expect(namenK).toContain('Kartoffeln');
    expect(namenK).not.toContain('Reis');

    const mitReis = listFor([assign(meal, '2026-09-14', { choices: { [beilage.id]: [reis.id] } })]);
    const namenR = mitReis.allItems.map((i) => i.name);
    expect(namenR).toContain('Reis');
    expect(namenR).not.toContain('Kartoffeln');
  });

  it('trennt Fertigprodukt und selbst gekochte Variante (Nasi Goreng)', () => {
    const meal = byNumber(14);
    const gruppe = meal.choiceGroups![0]!;
    const selbst = gruppe.options.find((o) => o.label.startsWith('B'))!;

    const fertig = listFor([assign(meal)]);
    expect(fertig.allItems.map((i) => i.name)).toEqual(['Nasi Goreng (Fertigprodukt)']);

    const gekocht = listFor([assign(meal, '2026-09-14', { choices: { [gruppe.id]: [selbst.id] } })]);
    const namen = gekocht.allItems.map((i) => i.name);
    expect(namen).toContain('Reis (trocken)');
    expect(namen).not.toContain('Nasi Goreng (Fertigprodukt)');
  });

  it('haelt normale Nudeln und Dinkelnudeln getrennt', () => {
    const meal = byNumber(1);
    const gruppe = meal.choiceGroups![0]!;
    const dinkel = gruppe.options.find((o) => o.label.startsWith('Dinkel'))!;

    const normal = listFor([assign(meal)]);
    expect(normal.allItems.map((i) => i.name)).toContain('Nudeln');

    const mitDinkel = listFor([assign(meal, '2026-09-14', { choices: { [gruppe.id]: [dinkel.id] } })]);
    const namen = mitDinkel.allItems.map((i) => i.name);
    expect(namen).toContain('Dinkelnudeln');
    expect(namen).not.toContain('Nudeln');
  });

  it('laesst optionale Zutaten weg, solange sie nicht gewaehlt sind', () => {
    const meal = byNumber(1);
    const kaese = meal.ingredients.find((i) => i.name === 'Geriebener Käse')!;
    expect(kaese.optional).toBe(true);

    const ohne = listFor([assign(meal)]);
    expect(ohne.allItems.map((i) => i.name)).not.toContain('Geriebener Käse');
    // Auch nicht im Vorratsblock, denn sie wurde nicht gewaehlt.
    expect(ohne.pantryChecks.map((i) => i.name)).not.toContain('Geriebener Käse');

    const mit = listFor([assign(meal, '2026-09-14', { optionalIngredientIds: [kaese.id] })]);
    expect(mit.pantryChecks.concat(mit.allItems).map((i) => i.name)).toContain('Geriebener Käse');
  });
});

describe('Einkaufsliste aus echten Gerichten', () => {
  it('fuehrt Nudeln aus Gericht 1 und 9 zusammen und behaelt den Bereich', () => {
    const list = listFor([assign(byNumber(1), '2026-09-14'), assign(byNumber(9), '2026-09-16')]);

    const nudeln = list.allItems.find((i) => i.name === 'Nudeln');
    // 500 g + 500 g = 1000 g, als 1 kg angezeigt.
    expect(nudeln?.amountUpper).toBe(1);
    expect(nudeln?.unit).toBe('kg');

    const tomaten = list.allItems.find((i) => i.name === 'Passierte Tomaten');
    // 700-800 ml zweimal = 1,4-1,6 l.
    expect(tomaten?.isRange).toBe(true);
    expect(tomaten?.amount).toBeCloseTo(1.4);
    expect(tomaten?.amountUpper).toBeCloseTo(1.6);
    expect(tomaten?.unit).toBe('l');
  });

  it('summiert Oel und Gewuerze nicht, sondern listet sie zur Bestandspruefung', () => {
    const list = listFor([assign(byNumber(1), '2026-09-14'), assign(byNumber(9), '2026-09-16')]);
    expect(list.allItems.map((i) => i.name)).not.toContain('Öl');
    expect(list.pantryChecks.map((i) => i.name)).toContain('Öl');
  });

  it('plant fuer Sandras Salat kein Hackfleisch ein (Beispiel aus der Vorgabe)', () => {
    // Timo, Mika, Thore essen Gericht 9, Sandra Gericht 7.
    const bolo = assign(byNumber(9), '2026-09-14', {
      id: 'a_bolo',
      personIds: ['per_timo', 'per_mika', 'per_thore'],
    });
    const salat = assign(byNumber(7), '2026-09-14', {
      id: 'a_salat',
      position: 1,
      personIds: ['per_sandra'],
    });
    const list = listFor([bolo, salat]);
    const namen = list.allItems.map((i) => i.name);

    expect(namen).toContain('Rinderhack');
    expect(namen).toContain('Käse');
    // Der Salat bringt kein Fleisch mit; Fisch ist nicht vorgewaehlt.
    expect(namen).not.toContain('Fisch');

    const hack = list.allItems.find((i) => i.name === 'Rinderhack');
    expect(hack?.sources).toHaveLength(1);
    expect(hack?.sources[0]!.mealName).toContain('9.');
  });

  it('laesst Hackfleisch weg, wenn die fleischlose Variante gewaehlt ist', () => {
    const meal = byNumber(9);
    const gruppe = meal.choiceGroups![0]!;
    const ohne = gruppe.options.find((o) => o.label.includes('Ohne'))!;
    const list = listFor([assign(meal, '2026-09-14', { choices: { [gruppe.id]: [ohne.id] } })]);
    expect(list.allItems.map((i) => i.name)).not.toContain('Rinderhack');
    expect(list.allItems.map((i) => i.name)).toContain('Nudeln');
  });

  it('ordnet alles der Gruppe "Unklar" zu, solange keine Haendler bekannt sind', () => {
    const list = listFor([assign(byNumber(5))]);
    expect(list.groups).toHaveLength(1);
    expect(list.groups[0]!.merchantName).toBe('Unklar');
  });
});
