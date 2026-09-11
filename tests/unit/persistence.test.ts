/**
 * Persistenz gegen eine echte IndexedDB-Implementierung (fake-indexeddb).
 * Deckt genau das ab, was im Alltag weh tut: gespeicherte Plaene duerfen
 * beim erneuten Oeffnen nicht verschwinden.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/db';
import {
  addAssignment,
  addMeals,
  createMerchant,
  deleteMeal,
  deleteMerchant,
  ensureSeeded,
  getOrCreateWeekPlan,
  listAssignments,
  listMerchants,
  listPersons,
  moveAssignment,
  removeAssignment,
  resetChecked,
  resetPantry,
  setLineState,
  togglePerson,
} from '../../src/data/repositories';
import { exportBackup, restoreBackup, validateBackup } from '../../src/data/backup';
import type { Meal } from '../../src/domain/types';
import { BACKUP_FORMAT } from '../../src/domain/types';

const testMeal: Meal = {
  id: 'meal_test',
  name: 'Testgericht',
  ingredients: [
    { id: 'i1', name: 'Nudeln', amount: 500, unit: 'g', merchantId: 'mer_kueck', packageSize: { amount: 500, unit: 'g' } },
  ],
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(async () => {
  await Promise.all([
    db.persons.clear(),
    db.merchants.clear(),
    db.meals.clear(),
    db.assignments.clear(),
    db.weekPlans.clear(),
    db.settings.clear(),
  ]);
});

describe('Stammdaten', () => {
  it('legt Familie und Haendler genau einmal an', async () => {
    await ensureSeeded();
    await ensureSeeded();
    const persons = await listPersons();
    expect(persons.map((p) => p.name)).toEqual(['Timo', 'Sandra', 'Mika', 'Thore']);
    const merchants = await listMerchants();
    expect(merchants.map((m) => m.name)).toContain('Kück Biomarkt');
    expect(merchants.filter((m) => m.name === 'ALDI')).toHaveLength(1);
  });

  it('setzt Zutaten auf "Unklar", wenn ihr Haendler geloescht wird', async () => {
    await ensureSeeded();
    await addMeals([testMeal]);
    await deleteMerchant('mer_kueck');
    const meal = await db.meals.get('meal_test');
    expect(meal?.ingredients[0]!.merchantId).toBeNull();
  });

  it('legt neue Haendler mit fortlaufender Sortierung an', async () => {
    await ensureSeeded();
    const created = await createMerchant('Hofladen Meyer');
    const merchants = await listMerchants();
    expect(merchants[merchants.length - 1]!.id).toBe(created.id);
  });
});

describe('Wochenplan-Persistenz', () => {
  it('speichert Zuordnungen und liest sie wieder aus', async () => {
    await ensureSeeded();
    await addMeals([testMeal]);
    await addAssignment('2026-W38', '2026-09-14', 'meal_test', ['per_timo']);
    const reloaded = await listAssignments('2026-W38');
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]!.personIds).toEqual(['per_timo']);
  });

  it('erlaubt mehrere Gerichte am selben Tag und vergibt Positionen', async () => {
    await ensureSeeded();
    await addMeals([testMeal, { ...testMeal, id: 'meal_salat', name: 'Salat' }]);
    await addAssignment('2026-W38', '2026-09-14', 'meal_test');
    await addAssignment('2026-W38', '2026-09-14', 'meal_salat');
    const assignments = await listAssignments('2026-W38');
    expect(assignments).toHaveLength(2);
    expect(assignments.map((a) => a.position)).toEqual([0, 1]);
  });

  it('erlaubt dasselbe Gericht mehrfach in einer Woche', async () => {
    await ensureSeeded();
    await addMeals([testMeal]);
    await addAssignment('2026-W38', '2026-09-14', 'meal_test');
    await addAssignment('2026-W38', '2026-09-17', 'meal_test');
    expect(await listAssignments('2026-W38')).toHaveLength(2);
  });

  it('trennt die Wochen sauber voneinander', async () => {
    await ensureSeeded();
    await addMeals([testMeal]);
    await addAssignment('2026-W38', '2026-09-14', 'meal_test');
    await addAssignment('2026-W39', '2026-09-21', 'meal_test');
    expect(await listAssignments('2026-W38')).toHaveLength(1);
    expect(await listAssignments('2026-W39')).toHaveLength(1);
  });

  it('verschiebt ein Gericht auf einen anderen Tag', async () => {
    await ensureSeeded();
    await addMeals([testMeal]);
    const assignment = await addAssignment('2026-W38', '2026-09-14', 'meal_test');
    await moveAssignment(assignment.id, '2026-09-16', '2026-W38');
    const assignments = await listAssignments('2026-W38');
    expect(assignments[0]!.date).toBe('2026-09-16');
  });

  it('verschiebt ein Gericht auch in eine andere Woche', async () => {
    await ensureSeeded();
    await addMeals([testMeal]);
    const assignment = await addAssignment('2026-W38', '2026-09-14', 'meal_test');
    await moveAssignment(assignment.id, '2026-09-21', '2026-W39');
    expect(await listAssignments('2026-W38')).toHaveLength(0);
    expect(await listAssignments('2026-W39')).toHaveLength(1);
  });

  it('schaltet Personen an und aus', async () => {
    await ensureSeeded();
    await addMeals([testMeal]);
    const assignment = await addAssignment('2026-W38', '2026-09-14', 'meal_test');
    await togglePerson(assignment.id, 'per_mika');
    await togglePerson(assignment.id, 'per_thore');
    expect((await db.assignments.get(assignment.id))?.personIds).toEqual(['per_mika', 'per_thore']);
    await togglePerson(assignment.id, 'per_mika');
    expect((await db.assignments.get(assignment.id))?.personIds).toEqual(['per_thore']);
  });

  it('entfernt ein Gericht wieder von einem Tag', async () => {
    await ensureSeeded();
    await addMeals([testMeal]);
    const assignment = await addAssignment('2026-W38', '2026-09-14', 'meal_test');
    await removeAssignment(assignment.id);
    expect(await listAssignments('2026-W38')).toHaveLength(0);
  });

  it('raeumt Zuordnungen mit auf, wenn ein Gericht geloescht wird', async () => {
    await ensureSeeded();
    await addMeals([testMeal]);
    await addAssignment('2026-W38', '2026-09-14', 'meal_test');
    await deleteMeal('meal_test');
    expect(await listAssignments('2026-W38')).toHaveLength(0);
  });
});

describe('Einkaufslisten-Zustand', () => {
  it('merkt sich Vorrat und Haken pro Woche', async () => {
    await setLineState('2026-W38', 'nudeln|mass|mer_kueck', { inPantry: true });
    await setLineState('2026-W38', 'nudeln|mass|mer_kueck', { checked: true });
    const plan = await getOrCreateWeekPlan('2026-W38');
    expect(plan.lineStates['nudeln|mass|mer_kueck']).toEqual({ inPantry: true, checked: true });
  });

  it('setzt Vorrat und Haken getrennt zurueck', async () => {
    await setLineState('2026-W38', 'k1', { inPantry: true, checked: true });
    await resetPantry('2026-W38');
    let plan = await getOrCreateWeekPlan('2026-W38');
    expect(plan.lineStates.k1).toEqual({ inPantry: false, checked: true });
    await resetChecked('2026-W38');
    plan = await getOrCreateWeekPlan('2026-W38');
    expect(plan.lineStates.k1).toEqual({ inPantry: false, checked: false });
  });

  it('haelt die Wochen getrennt', async () => {
    await setLineState('2026-W38', 'k1', { checked: true });
    const other = await getOrCreateWeekPlan('2026-W39');
    expect(other.lineStates.k1).toBeUndefined();
  });
});

describe('Sicherung und Wiederherstellung', () => {
  it('exportiert und spielt vollstaendig zurueck', async () => {
    await ensureSeeded();
    await addMeals([testMeal]);
    await addAssignment('2026-W38', '2026-09-14', 'meal_test', ['per_timo', 'per_mika']);
    await setLineState('2026-W38', 'k1', { inPantry: true });

    const backup = await exportBackup();
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.data.meals).toHaveLength(1);

    // Totalverlust simulieren (z. B. Browserwechsel).
    await Promise.all([db.meals.clear(), db.assignments.clear(), db.weekPlans.clear()]);
    expect(await listAssignments('2026-W38')).toHaveLength(0);

    const checked = validateBackup(JSON.parse(JSON.stringify(backup)));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    await restoreBackup(checked.value, 'replace');

    const assignments = await listAssignments('2026-W38');
    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.personIds).toEqual(['per_timo', 'per_mika']);
    expect((await getOrCreateWeekPlan('2026-W38')).lineStates.k1?.inPantry).toBe(true);
    expect(await db.meals.count()).toBe(1);
  });

  it('lehnt fremde Dateien ab, ohne etwas zu schreiben', async () => {
    await ensureSeeded();
    await addMeals([testMeal]);
    const result = validateBackup({ format: 'etwas-anderes', data: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain('keine Sicherung dieser App');
    expect(await db.meals.count()).toBe(1);
  });

  it('lehnt Sicherungen neuerer App-Versionen ab', () => {
    const result = validateBackup({ format: BACKUP_FORMAT, version: 99, data: {} });
    expect(result.ok).toBe(false);
  });

  it('warnt vor verwaisten Zuordnungen und laesst sie weg', () => {
    const result = validateBackup({
      format: BACKUP_FORMAT,
      version: 1,
      data: {
        persons: [],
        merchants: [],
        meals: [],
        assignments: [{ id: 'a1', mealId: 'weg', weekId: '2026-W38', date: '2026-09-14', personIds: [], position: 0 }],
        weekPlans: [],
        settings: null,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assignments).toHaveLength(0);
    expect(result.warnings[0]!.message).toContain('geloeschte Gerichte');
  });

  it('behaelt beim Zusammenfuehren vorhandene Gerichte', async () => {
    await ensureSeeded();
    await addMeals([{ ...testMeal, id: 'meal_eigen', name: 'Eigenes' }]);
    const result = validateBackup({
      format: BACKUP_FORMAT,
      version: 1,
      data: { persons: [], merchants: [], meals: [testMeal], assignments: [], weekPlans: [], settings: null },
    });
    if (!result.ok) throw new Error('sollte gueltig sein');
    await restoreBackup(result.value, 'merge');
    expect(await db.meals.count()).toBe(2);
  });
});
