/**
 * Sicherung und Wiederherstellung aller lokalen Daten.
 *
 * Weil die App bewusst ohne Server laeuft, ist der Export die einzige
 * Absicherung gegen Datenverlust (geloeschte Browserdaten, Geraetewechsel).
 * Deshalb wird beim Import streng validiert und im Fehlerfall NICHTS
 * geschrieben -- ein halb eingespieltes Backup waere schlimmer als keines.
 */
import { db } from './db';
import type { AppSettings, BackupFile, Meal, MealAssignment, Merchant, Person, WeekPlan } from '../domain/types';
import { BACKUP_FORMAT, BACKUP_VERSION } from '../domain/types';
import type { ValidationIssue, ValidationResult } from '../domain/mealSchema';
import { defaultSettings } from './defaults';

export async function exportBackup(): Promise<BackupFile> {
  const [persons, merchants, meals, assignments, weekPlans, settings] = await Promise.all([
    db.persons.toArray(),
    db.merchants.toArray(),
    db.meals.toArray(),
    db.assignments.toArray(),
    db.weekPlans.toArray(),
    db.settings.get('app'),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { persons, merchants, meals, assignments, weekPlans, settings: settings ?? null },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireArray(
  container: Record<string, unknown>,
  key: string,
  errors: ValidationIssue[],
): unknown[] {
  const value = container[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push({ path: `data.${key}`, message: `"${key}" muss eine Liste sein.` });
    return [];
  }
  return value;
}

function requireIdedObjects<T>(
  items: unknown[],
  key: string,
  errors: ValidationIssue[],
): T[] {
  const result: T[] = [];
  items.forEach((item, index) => {
    if (!isPlainObject(item) || typeof item.id !== 'string' || item.id.length === 0) {
      errors.push({ path: `data.${key}[${index}]`, message: `Eintrag ${index + 1} in "${key}" hat keine gueltige ID.` });
      return;
    }
    result.push(item as T);
  });
  return result;
}

export interface BackupContents {
  persons: Person[];
  merchants: Merchant[];
  meals: Meal[];
  assignments: MealAssignment[];
  weekPlans: WeekPlan[];
  settings: AppSettings | null;
}

/** Prueft eine Backup-Datei vollstaendig, bevor irgendetwas geschrieben wird. */
export function validateBackup(input: unknown): ValidationResult<BackupContents> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: [{ path: '', message: 'Die Datei enthaelt kein JSON-Objekt.' }], warnings };
  }
  if (input.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      errors: [
        {
          path: 'format',
          message: `Das ist keine Sicherung dieser App (erwartet "${BACKUP_FORMAT}", gefunden "${String(input.format ?? 'nichts')}").`,
        },
      ],
      warnings,
    };
  }
  if (typeof input.version === 'number' && input.version > BACKUP_VERSION) {
    return {
      ok: false,
      errors: [
        {
          path: 'version',
          message: `Die Sicherung stammt aus einer neueren App-Version (${input.version}). Bitte App aktualisieren.`,
        },
      ],
      warnings,
    };
  }
  if (!isPlainObject(input.data)) {
    return { ok: false, errors: [{ path: 'data', message: '"data" fehlt oder ist kein Objekt.' }], warnings };
  }

  const data = input.data;
  const persons = requireIdedObjects<Person>(requireArray(data, 'persons', errors), 'persons', errors);
  const merchants = requireIdedObjects<Merchant>(requireArray(data, 'merchants', errors), 'merchants', errors);
  const meals = requireIdedObjects<Meal>(requireArray(data, 'meals', errors), 'meals', errors);
  const assignments = requireIdedObjects<MealAssignment>(
    requireArray(data, 'assignments', errors),
    'assignments',
    errors,
  );
  const weekPlans = requireIdedObjects<WeekPlan>(requireArray(data, 'weekPlans', errors), 'weekPlans', errors);

  for (const [index, meal] of meals.entries()) {
    if (typeof meal.name !== 'string' || meal.name.trim() === '') {
      errors.push({ path: `data.meals[${index}].name`, message: `Gericht ${index + 1} hat keinen Namen.` });
    }
    if (!Array.isArray(meal.ingredients)) {
      errors.push({ path: `data.meals[${index}].ingredients`, message: `Gericht "${meal.name}" hat keine Zutatenliste.` });
    }
  }

  const mealIds = new Set(meals.map((meal) => meal.id));
  const orphaned = assignments.filter((assignment) => !mealIds.has(assignment.mealId));
  if (orphaned.length > 0) {
    warnings.push({
      path: 'data.assignments',
      message: `${orphaned.length} Zuordnung(en) verweisen auf geloeschte Gerichte und werden uebersprungen.`,
    });
  }

  if (errors.length > 0) return { ok: false, errors, warnings };

  const settings = isPlainObject(data.settings) ? ({ ...data.settings, id: 'app' } as AppSettings) : null;
  return {
    ok: true,
    value: {
      persons,
      merchants,
      meals,
      assignments: assignments.filter((assignment) => mealIds.has(assignment.mealId)),
      weekPlans,
      settings,
    },
    warnings,
  };
}

export type RestoreMode = 'replace' | 'merge';

/**
 * Spielt eine geprueft gueltige Sicherung ein.
 *  - "replace": alle vorhandenen Daten werden ersetzt.
 *  - "merge":   vorhandene Eintraege werden anhand ihrer ID aktualisiert,
 *               fremde Eintraege bleiben erhalten.
 */
export async function restoreBackup(contents: BackupContents, mode: RestoreMode): Promise<void> {
  // Array-Form: Dexie akzeptiert als Einzelargumente nur bis zu sechs Tabellen.
  await db.transaction(
    'rw',
    [db.persons, db.merchants, db.meals, db.assignments, db.weekPlans, db.settings],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.persons.clear(),
          db.merchants.clear(),
          db.meals.clear(),
          db.assignments.clear(),
          db.weekPlans.clear(),
        ]);
      }
      await db.persons.bulkPut(contents.persons);
      await db.merchants.bulkPut(contents.merchants);
      await db.meals.bulkPut(contents.meals);
      await db.assignments.bulkPut(contents.assignments);
      await db.weekPlans.bulkPut(contents.weekPlans);
      await db.settings.put(contents.settings ?? defaultSettings());
    },
  );
}
