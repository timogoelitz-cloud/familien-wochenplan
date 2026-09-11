/**
 * Repository-Schicht: der einzige Weg, wie die UI an Daten kommt.
 * Geschaeftslogik liegt in `src/domain`, Persistenz hier.
 */
import { db } from './db';
import { DEFAULT_MERCHANTS, DEFAULT_PERSONS, defaultSettings } from './defaults';
import type {
  AppSettings,
  ID,
  Meal,
  MealAssignment,
  Merchant,
  Person,
  ShoppingLineState,
  WeekId,
  WeekPlan,
} from '../domain/types';
import { newAssignmentId, newMerchantId, nowISO } from '../domain/ids';
import { parseWeekId, weekRange } from '../domain/week';

/** Legt Stammdaten an, falls die Datenbank noch leer ist. Idempotent. */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.persons, db.merchants, db.settings, async () => {
    if ((await db.persons.count()) === 0) await db.persons.bulkAdd(DEFAULT_PERSONS);
    if ((await db.merchants.count()) === 0) await db.merchants.bulkAdd(DEFAULT_MERCHANTS);
    if (!(await db.settings.get('app'))) await db.settings.add(defaultSettings());
  });
}

/* ------------------------------- Personen ------------------------------- */

export async function listPersons(): Promise<Person[]> {
  const persons = await db.persons.toArray();
  return persons.sort((a, b) => a.order - b.order);
}

export async function savePerson(person: Person): Promise<void> {
  await db.persons.put(person);
}

/* -------------------------------- Haendler ------------------------------- */

export async function listMerchants(): Promise<Merchant[]> {
  const merchants = await db.merchants.toArray();
  return merchants.sort((a, b) => a.order - b.order);
}

export async function createMerchant(name: string): Promise<Merchant> {
  const existing = await listMerchants();
  const merchant: Merchant = {
    id: newMerchantId(),
    name: name.trim(),
    order: existing.length,
    active: true,
  };
  await db.merchants.add(merchant);
  return merchant;
}

export async function saveMerchant(merchant: Merchant): Promise<void> {
  await db.merchants.put(merchant);
}

/**
 * Loescht einen Haendler. Zutaten, die ihn verwenden, fallen auf "Unklar"
 * zurueck -- es darf nie eine Zutat mit einer toten Haendler-ID geben.
 */
export async function deleteMerchant(id: ID): Promise<void> {
  await db.transaction('rw', db.merchants, db.meals, async () => {
    await db.merchants.delete(id);
    const meals = await db.meals.toArray();
    const touched = meals.filter((meal) =>
      meal.ingredients.some((ingredient) => ingredient.merchantId === id),
    );
    for (const meal of touched) {
      await db.meals.put({
        ...meal,
        ingredients: meal.ingredients.map((ingredient) =>
          ingredient.merchantId === id ? { ...ingredient, merchantId: null } : ingredient,
        ),
        updatedAt: nowISO(),
      });
    }
  });
}

/* -------------------------------- Gerichte ------------------------------- */

export async function listMeals(): Promise<Meal[]> {
  const meals = await db.meals.toArray();
  return meals.sort((a, b) => a.name.localeCompare(b.name, 'de-DE'));
}

export async function getMeal(id: ID): Promise<Meal | undefined> {
  return db.meals.get(id);
}

export async function saveMeal(meal: Meal): Promise<void> {
  await db.meals.put({ ...meal, updatedAt: nowISO() });
}

export async function addMeals(meals: Meal[]): Promise<void> {
  await db.meals.bulkPut(meals);
}

/** Loescht ein Gericht samt aller Zuordnungen in allen Wochen. */
export async function deleteMeal(id: ID): Promise<void> {
  await db.transaction('rw', db.meals, db.assignments, async () => {
    await db.meals.delete(id);
    await db.assignments.where('mealId').equals(id).delete();
  });
}

/* ------------------------------ Wochenplaene ----------------------------- */

export async function getOrCreateWeekPlan(weekId: WeekId): Promise<WeekPlan> {
  const existing = await db.weekPlans.get(weekId);
  if (existing) return existing;

  const { isoYear, isoWeek } = parseWeekId(weekId);
  const { start, end } = weekRange(weekId);
  const timestamp = nowISO();
  const plan: WeekPlan = {
    id: weekId,
    isoYear,
    isoWeek,
    startDate: start,
    endDate: end,
    lineStates: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  // put statt add: bei parallelem Anlegen gewinnt einfach der letzte Schreiber.
  await db.weekPlans.put(plan);
  return plan;
}

export async function listAssignments(weekId: WeekId): Promise<MealAssignment[]> {
  const assignments = await db.assignments.where('weekId').equals(weekId).toArray();
  return assignments.sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position);
}

/** Haengt ein Gericht an einen Tag an (immer als letzter Eintrag des Tages). */
export async function addAssignment(
  weekId: WeekId,
  date: string,
  mealId: ID,
  personIds: ID[] = [],
): Promise<MealAssignment> {
  const sameDay = await db.assignments.where('date').equals(date).toArray();
  const position = sameDay.reduce((max, item) => Math.max(max, item.position), -1) + 1;
  const timestamp = nowISO();
  const assignment: MealAssignment = {
    id: newAssignmentId(),
    weekId,
    date,
    mealId,
    personIds,
    position,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.transaction('rw', db.assignments, db.weekPlans, async () => {
    await getOrCreateWeekPlan(weekId);
    await db.assignments.add(assignment);
  });
  return assignment;
}

export async function updateAssignment(
  id: ID,
  patch: Partial<Pick<MealAssignment, 'personIds' | 'note' | 'position' | 'date' | 'weekId'>>,
): Promise<void> {
  const existing = await db.assignments.get(id);
  if (!existing) return;
  await db.assignments.put({ ...existing, ...patch, updatedAt: nowISO() });
}

export async function removeAssignment(id: ID): Promise<void> {
  await db.assignments.delete(id);
}

/** Verschiebt eine Zuordnung auf einen anderen Tag (ggf. in eine andere Woche). */
export async function moveAssignment(id: ID, targetDate: string, targetWeekId: WeekId): Promise<void> {
  await db.transaction('rw', db.assignments, db.weekPlans, async () => {
    const existing = await db.assignments.get(id);
    if (!existing) return;
    if (existing.date === targetDate) return;
    await getOrCreateWeekPlan(targetWeekId);
    const sameDay = await db.assignments.where('date').equals(targetDate).toArray();
    const position = sameDay.reduce((max, item) => Math.max(max, item.position), -1) + 1;
    await db.assignments.put({
      ...existing,
      date: targetDate,
      weekId: targetWeekId,
      position,
      updatedAt: nowISO(),
    });
  });
}

export async function togglePerson(assignmentId: ID, personId: ID): Promise<void> {
  const existing = await db.assignments.get(assignmentId);
  if (!existing) return;
  const personIds = existing.personIds.includes(personId)
    ? existing.personIds.filter((id) => id !== personId)
    : [...existing.personIds, personId];
  await db.assignments.put({ ...existing, personIds, updatedAt: nowISO() });
}

/* --------------------------- Einkaufslisten-Zustand ---------------------- */

export async function setLineState(
  weekId: WeekId,
  key: string,
  patch: Partial<ShoppingLineState>,
): Promise<void> {
  await db.transaction('rw', db.weekPlans, async () => {
    const plan = await getOrCreateWeekPlan(weekId);
    const current = plan.lineStates[key] ?? { inPantry: false, checked: false };
    await db.weekPlans.put({
      ...plan,
      lineStates: { ...plan.lineStates, [key]: { ...current, ...patch } },
      updatedAt: nowISO(),
    });
  });
}

/** Setzt alle Vorratsmarkierungen einer Woche zurueck. */
export async function resetPantry(weekId: WeekId): Promise<void> {
  await db.transaction('rw', db.weekPlans, async () => {
    const plan = await getOrCreateWeekPlan(weekId);
    const lineStates = Object.fromEntries(
      Object.entries(plan.lineStates).map(([key, state]) => [key, { ...state, inPantry: false }]),
    );
    await db.weekPlans.put({ ...plan, lineStates, updatedAt: nowISO() });
  });
}

/** Setzt alle Haken der Einkaufsliste einer Woche zurueck. */
export async function resetChecked(weekId: WeekId): Promise<void> {
  await db.transaction('rw', db.weekPlans, async () => {
    const plan = await getOrCreateWeekPlan(weekId);
    const lineStates = Object.fromEntries(
      Object.entries(plan.lineStates).map(([key, state]) => [key, { ...state, checked: false }]),
    );
    await db.weekPlans.put({ ...plan, lineStates, updatedAt: nowISO() });
  });
}

/* ------------------------------ Einstellungen ---------------------------- */

export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get('app')) ?? defaultSettings();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ ...settings, updatedAt: nowISO() });
}
