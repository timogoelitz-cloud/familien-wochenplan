/**
 * Validierung und Normalisierung importierter Gerichte.
 *
 * Dieses Modul ist die einzige Stelle, an der externe Daten (Datei-Import,
 * spaeter GPT-Ausgabe) in das interne Datenmodell gelangen. Es gilt:
 * ungueltige Daten werden NICHT importiert, und der Nutzer bekommt eine
 * verstaendliche deutsche Meldung, was genau falsch ist.
 *
 * Das zugehoerige oeffentliche Schema liegt in `data/meal.schema.json`.
 */
import type { Meal, MealIngredient, Quantity, Unit } from './types';
import { UNITS } from './types';
import { isKnownUnit } from './units';
import { newIngredientId, newMealId, nowISO } from './ids';

export interface ValidationIssue {
  /** Pfad in der Eingabe, z. B. "meals[2].ingredients[0].unit". */
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };

/** Eingabeformat eines Gerichts, wie es importiert werden darf. */
export interface MealImportInput {
  name: string;
  description?: string;
  recipe?: string;
  image?: string | null;
  servings?: number;
  tags?: string[];
  active?: boolean;
  demo?: boolean;
  ingredients: Array<{
    name: string;
    amount: number;
    unit: string;
    merchant?: string | null;
    category?: string;
    packageSize?: { amount: number; unit: string } | null;
    note?: string;
  }>;
}

export interface MealImportFile {
  format?: string;
  version?: number;
  meals: MealImportInput[];
}

export const MEAL_IMPORT_FORMAT = 'familien-wochenplan/meals';
export const MEAL_IMPORT_VERSION = 1;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Deutsche Dezimalkomma-Schreibweise aus GPT-Ausgaben tolerieren.
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Aufloesung eines Haendlernamens zu einer Haendler-ID.
 * Unbekannte Namen werden bewusst nicht erfunden, sondern auf `null`
 * ("Unklar") abgebildet und als Warnung gemeldet.
 */
export type MerchantResolver = (name: string) => string | null;

function parseQuantity(
  raw: unknown,
  path: string,
  errors: ValidationIssue[],
): Quantity | null {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) {
    errors.push({ path, message: 'Packungsgroesse muss ein Objekt mit "amount" und "unit" sein.' });
    return null;
  }
  const amount = asFiniteNumber(raw.amount);
  const unitRaw = asString(raw.unit);
  if (amount === null || amount <= 0) {
    errors.push({ path: `${path}.amount`, message: 'Packungsgroesse braucht eine Menge groesser 0.' });
    return null;
  }
  if (!unitRaw || !isKnownUnit(unitRaw)) {
    errors.push({
      path: `${path}.unit`,
      message: `Unbekannte Einheit "${unitRaw ?? ''}". Erlaubt: ${UNITS.join(', ')}.`,
    });
    return null;
  }
  return { amount, unit: unitRaw };
}

function parseIngredient(
  raw: unknown,
  path: string,
  resolveMerchant: MerchantResolver,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): MealIngredient | null {
  if (!isPlainObject(raw)) {
    errors.push({ path, message: 'Zutat muss ein Objekt sein.' });
    return null;
  }
  const name = asString(raw.name);
  if (!name) {
    errors.push({ path: `${path}.name`, message: 'Zutat braucht einen Namen.' });
    return null;
  }

  const unitRaw = asString(raw.unit);
  if (!unitRaw || !isKnownUnit(unitRaw)) {
    errors.push({
      path: `${path}.unit`,
      message: `Unbekannte Einheit "${unitRaw ?? ''}" bei "${name}". Erlaubt: ${UNITS.join(', ')}.`,
    });
    return null;
  }
  const unit: Unit = unitRaw;

  const amount = asFiniteNumber(raw.amount);
  if (amount === null) {
    errors.push({ path: `${path}.amount`, message: `Menge bei "${name}" fehlt oder ist keine Zahl.` });
    return null;
  }
  if (amount < 0) {
    errors.push({ path: `${path}.amount`, message: `Menge bei "${name}" darf nicht negativ sein.` });
    return null;
  }

  let merchantId: string | null = null;
  const merchantName = asString(raw.merchant);
  if (merchantName) {
    merchantId = resolveMerchant(merchantName);
    if (!merchantId) {
      warnings.push({
        path: `${path}.merchant`,
        message: `Haendler "${merchantName}" ist nicht bekannt - "${name}" wird "Unklar" zugeordnet.`,
      });
    }
  }

  const packageSize = parseQuantity(raw.packageSize, `${path}.packageSize`, errors);

  const ingredient: MealIngredient = {
    id: newIngredientId(),
    name,
    amount,
    unit,
    merchantId,
    packageSize,
  };
  const category = asString(raw.category);
  if (category) ingredient.category = category;
  const note = asString(raw.note);
  if (note) ingredient.note = note;
  return ingredient;
}

/** Validiert ein einzelnes Gericht und erzeugt frische IDs. */
export function parseMeal(
  raw: unknown,
  path: string,
  resolveMerchant: MerchantResolver,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): Meal | null {
  if (!isPlainObject(raw)) {
    errors.push({ path, message: 'Gericht muss ein Objekt sein.' });
    return null;
  }
  const name = asString(raw.name);
  if (!name) {
    errors.push({ path: `${path}.name`, message: 'Gericht braucht einen Namen.' });
    return null;
  }
  if (!Array.isArray(raw.ingredients)) {
    errors.push({ path: `${path}.ingredients`, message: `"${name}": "ingredients" muss eine Liste sein.` });
    return null;
  }
  if (raw.ingredients.length === 0) {
    warnings.push({ path: `${path}.ingredients`, message: `"${name}" hat keine Zutaten.` });
  }

  const errorsBefore = errors.length;
  const ingredients: MealIngredient[] = [];
  raw.ingredients.forEach((item, index) => {
    const parsed = parseIngredient(
      item,
      `${path}.ingredients[${index}]`,
      resolveMerchant,
      errors,
      warnings,
    );
    if (parsed) ingredients.push(parsed);
  });
  if (errors.length > errorsBefore) return null;

  const timestamp = nowISO();
  const meal: Meal = {
    id: newMealId(),
    name,
    ingredients,
    active: typeof raw.active === 'boolean' ? raw.active : true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const description = asString(raw.description);
  if (description) meal.description = description;
  const recipe = asString(raw.recipe);
  if (recipe) meal.recipe = recipe;
  const image = asString(raw.image);
  if (image) meal.image = image;
  const servings = asFiniteNumber(raw.servings);
  if (servings !== null && servings > 0) meal.servings = servings;
  if (Array.isArray(raw.tags)) {
    const tags = raw.tags.map(asString).filter((t): t is string => Boolean(t));
    if (tags.length) meal.tags = tags;
  }
  if (raw.demo === true) meal.demo = true;
  return meal;
}

/**
 * Validiert eine komplette Import-Datei.
 * Akzeptiert sowohl `{ meals: [...] }` als auch eine blanke Liste von Gerichten
 * oder ein einzelnes Gericht -- GPT-Ausgaben schwanken hier erfahrungsgemaess.
 */
export function parseMealImport(
  input: unknown,
  resolveMerchant: MerchantResolver,
): ValidationResult<Meal[]> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  let rawMeals: unknown[];
  if (Array.isArray(input)) {
    rawMeals = input;
  } else if (isPlainObject(input) && Array.isArray(input.meals)) {
    if (typeof input.format === 'string' && input.format !== MEAL_IMPORT_FORMAT) {
      warnings.push({
        path: 'format',
        message: `Unerwartetes Format "${input.format}". Erwartet: "${MEAL_IMPORT_FORMAT}".`,
      });
    }
    rawMeals = input.meals;
  } else if (isPlainObject(input) && typeof input.name === 'string') {
    rawMeals = [input];
  } else {
    return {
      ok: false,
      errors: [
        {
          path: '',
          message:
            'Die Datei enthaelt keine Gerichte. Erwartet wird { "meals": [ ... ] } oder eine Liste von Gerichten.',
        },
      ],
      warnings,
    };
  }

  if (rawMeals.length === 0) {
    return { ok: false, errors: [{ path: 'meals', message: 'Die Liste der Gerichte ist leer.' }], warnings };
  }

  const meals: Meal[] = [];
  rawMeals.forEach((raw, index) => {
    const meal = parseMeal(raw, `meals[${index}]`, resolveMerchant, errors, warnings);
    if (meal) meals.push(meal);
  });

  if (errors.length > 0) return { ok: false, errors, warnings };
  return { ok: true, value: meals, warnings };
}

/** Exportformat fuer Gerichte (Gegenstueck zu parseMealImport). */
export function serializeMeals(
  meals: Meal[],
  merchantName: (id: string | null) => string | null,
): MealImportFile {
  return {
    format: MEAL_IMPORT_FORMAT,
    version: MEAL_IMPORT_VERSION,
    meals: meals.map((meal) => ({
      name: meal.name,
      ...(meal.description ? { description: meal.description } : {}),
      ...(meal.recipe ? { recipe: meal.recipe } : {}),
      ...(meal.image ? { image: meal.image } : {}),
      ...(meal.servings ? { servings: meal.servings } : {}),
      ...(meal.tags?.length ? { tags: meal.tags } : {}),
      ...(meal.demo ? { demo: true } : {}),
      active: meal.active,
      ingredients: meal.ingredients.map((ingredient) => ({
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        merchant: merchantName(ingredient.merchantId),
        ...(ingredient.category ? { category: ingredient.category } : {}),
        ...(ingredient.packageSize ? { packageSize: ingredient.packageSize } : {}),
        ...(ingredient.note ? { note: ingredient.note } : {}),
      })),
    })),
  };
}
