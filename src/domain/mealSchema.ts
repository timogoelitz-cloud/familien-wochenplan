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
import type { AmountSpec, Meal, MealChoiceGroup, MealIngredient, Quantity, Unit } from './types';
import { AMOUNT_OPEN, UNITS, exactAmount, rangeAmount } from './types';
import { isKnownUnit } from './units';
import { newChoiceGroupId, newChoiceOptionId, newIngredientId, newMealId, nowISO } from './ids';

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
  number?: number;
  name: string;
  description?: string;
  recipe?: string;
  image?: string | null;
  /** null = Portionsbasis ausdruecklich nicht beziffert. */
  servings?: number | null;
  cookingTime?: string;
  tags?: string[];
  active?: boolean;
  demo?: boolean;
  choiceGroups?: Array<{
    key: string;
    name: string;
    mode?: 'one' | 'any';
    options: Array<{ key: string; label: string }>;
    default?: string[];
  }>;
  ingredients: Array<{
    name: string;
    /** Zahl, {min,max} oder "offen"/null fuer unbezifferte Mengen. */
    amount?: number | string | { min: number; max: number } | null;
    unit: string;
    merchant?: string | null;
    category?: string;
    packageSize?: { amount: number; unit: string } | null;
    note?: string;
    optional?: boolean;
    /** Verweis auf choiceGroups[].key und options[].key. */
    choiceGroup?: string;
    choiceOption?: string;
    /** Oel, Gewuerze: nur Bestandspruefung, nie aufsummiert. */
    pantryStaple?: boolean;
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

/**
 * Liest eine Mengenangabe. Erlaubt sind:
 *   42            -> exakt
 *   "700-800"     -> Bereich (auch mit Gedankenstrich)
 *   {min,max}     -> Bereich
 *   null / "offen" / fehlend -> Menge offen
 *
 * Eine fehlende Menge wird bewusst NICHT zu 0, sondern zu "offen": Oel und
 * Gewuerze sollen nicht als "0 g" auf der Einkaufsliste landen.
 */
function parseAmountSpec(
  raw: unknown,
  path: string,
  name: string,
  errors: ValidationIssue[],
): AmountSpec | null {
  if (raw === null || raw === undefined) return AMOUNT_OPEN;

  if (isPlainObject(raw)) {
    const min = asFiniteNumber(raw.min);
    const max = asFiniteNumber(raw.max);
    if (min === null || max === null) {
      errors.push({ path, message: `Mengenbereich bei "${name}" braucht "min" und "max" als Zahlen.` });
      return null;
    }
    if (min < 0 || max < 0) {
      errors.push({ path, message: `Menge bei "${name}" darf nicht negativ sein.` });
      return null;
    }
    if (min > max) {
      errors.push({ path, message: `Bei "${name}" ist die Untergrenze groesser als die Obergrenze.` });
      return null;
    }
    return min === max ? exactAmount(max) : rangeAmount(min, max);
  }

  if (typeof raw === 'string') {
    const text = raw.trim().toLowerCase();
    if (text === '' || text === 'offen' || text === 'menge offen' || text === 'nach bedarf') {
      return AMOUNT_OPEN;
    }
    // "700-800", "700 - 800", "700–800"
    const rangeMatch = /^([0-9]+(?:[.,][0-9]+)?)\s*[-–—]\s*([0-9]+(?:[.,][0-9]+)?)$/.exec(text);
    if (rangeMatch) {
      const min = Number(rangeMatch[1]!.replace(',', '.'));
      const max = Number(rangeMatch[2]!.replace(',', '.'));
      if (Number.isFinite(min) && Number.isFinite(max) && min <= max) {
        return min === max ? exactAmount(max) : rangeAmount(min, max);
      }
    }
  }

  const single = asFiniteNumber(raw);
  if (single === null) {
    errors.push({
      path,
      message: `Menge bei "${name}" ist weder eine Zahl noch ein Bereich wie "700-800". Fuer unbezifferte Mengen "offen" eintragen.`,
    });
    return null;
  }
  if (single < 0) {
    errors.push({ path, message: `Menge bei "${name}" darf nicht negativ sein.` });
    return null;
  }
  return exactAmount(single);
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

  const amount = parseAmountSpec(raw.amount, `${path}.amount`, name, errors);
  if (amount === null) return null;

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
  if (raw.optional === true) ingredient.optional = true;
  if (raw.pantryStaple === true) ingredient.pantryStaple = true;
  const groupKey = asString(raw.choiceGroup);
  const optionKey = asString(raw.choiceOption);
  if (groupKey && optionKey) {
    // Die Schluessel werden spaeter in parseMeal auf echte IDs abgebildet.
    ingredient.choiceGroupId = groupKey;
    ingredient.choiceOptionId = optionKey;
  } else if (groupKey || optionKey) {
    errors.push({
      path: `${path}.choiceGroup`,
      message: `Bei "${name}" muessen "choiceGroup" und "choiceOption" gemeinsam angegeben werden.`,
    });
    return null;
  }
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

  // Auswahlgruppen zuerst: die Zutaten verweisen ueber Schluessel darauf.
  const groups: MealChoiceGroup[] = [];
  const groupIdByKey = new Map<string, string>();
  const optionIdByKey = new Map<string, string>();
  if (raw.choiceGroups !== undefined) {
    if (!Array.isArray(raw.choiceGroups)) {
      errors.push({ path: `${path}.choiceGroups`, message: `"${name}": "choiceGroups" muss eine Liste sein.` });
      return null;
    }
    raw.choiceGroups.forEach((groupRaw, index) => {
      const groupPath = `${path}.choiceGroups[${index}]`;
      if (!isPlainObject(groupRaw)) {
        errors.push({ path: groupPath, message: 'Auswahlgruppe muss ein Objekt sein.' });
        return;
      }
      const key = asString(groupRaw.key);
      const groupName = asString(groupRaw.name);
      if (!key || !groupName) {
        errors.push({ path: groupPath, message: 'Auswahlgruppe braucht "key" und "name".' });
        return;
      }
      if (!Array.isArray(groupRaw.options) || groupRaw.options.length === 0) {
        errors.push({ path: `${groupPath}.options`, message: `Auswahlgruppe "${groupName}" braucht Optionen.` });
        return;
      }
      const groupId = newChoiceGroupId();
      groupIdByKey.set(key, groupId);

      const options: MealChoiceGroup['options'] = [];
      groupRaw.options.forEach((optionRaw, optionIndex) => {
        if (!isPlainObject(optionRaw)) {
          errors.push({ path: `${groupPath}.options[${optionIndex}]`, message: 'Option muss ein Objekt sein.' });
          return;
        }
        const optionKey = asString(optionRaw.key);
        const label = asString(optionRaw.label);
        if (!optionKey || !label) {
          errors.push({ path: `${groupPath}.options[${optionIndex}]`, message: 'Option braucht "key" und "label".' });
          return;
        }
        const optionId = newChoiceOptionId();
        optionIdByKey.set(`${key}::${optionKey}`, optionId);
        options.push({ id: optionId, label });
      });

      const mode = groupRaw.mode === 'any' ? 'any' : 'one';
      const defaults = Array.isArray(groupRaw.default)
        ? groupRaw.default
            .map((d) => (typeof d === 'string' ? optionIdByKey.get(`${key}::${d}`) : undefined))
            .filter((id): id is string => Boolean(id))
        : [];
      groups.push({
        id: groupId,
        name: groupName,
        mode,
        options,
        // Ohne ausdrueckliche Vorauswahl ist bei "genau eine" die erste Option gesetzt.
        defaultOptionIds: defaults.length > 0 ? defaults : mode === 'one' && options[0] ? [options[0].id] : [],
      });
    });
  }

  const ingredients: MealIngredient[] = [];
  raw.ingredients.forEach((item, index) => {
    const parsed = parseIngredient(
      item,
      `${path}.ingredients[${index}]`,
      resolveMerchant,
      errors,
      warnings,
    );
    if (!parsed) return;
    // Schluessel -> echte IDs aufloesen.
    if (parsed.choiceGroupId) {
      const groupKey = parsed.choiceGroupId;
      const optionKey = parsed.choiceOptionId!;
      const groupId = groupIdByKey.get(groupKey);
      const optionId = optionIdByKey.get(`${groupKey}::${optionKey}`);
      if (!groupId || !optionId) {
        errors.push({
          path: `${path}.ingredients[${index}].choiceGroup`,
          message: `"${parsed.name}" verweist auf die unbekannte Auswahl "${groupKey}/${optionKey}".`,
        });
        return;
      }
      parsed.choiceGroupId = groupId;
      parsed.choiceOptionId = optionId;
    }
    ingredients.push(parsed);
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
  // servings: null bedeutet ausdruecklich "Portionsbasis nicht beziffert".
  if (raw.servings === null) {
    meal.servings = null;
  } else {
    const servings = asFiniteNumber(raw.servings);
    if (servings !== null && servings > 0) meal.servings = servings;
  }
  const number = asFiniteNumber(raw.number);
  if (number !== null && Number.isInteger(number) && number > 0) meal.number = number;
  const cookingTime = asString(raw.cookingTime);
  if (cookingTime) meal.cookingTime = cookingTime;
  if (groups.length > 0) meal.choiceGroups = groups;
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
    meals: meals.map((meal) => {
      // Stabile Schluessel je Gericht, damit der Export wieder importierbar ist.
      const groupKey = new Map<string, string>();
      const optionKey = new Map<string, string>();
      (meal.choiceGroups ?? []).forEach((group, groupIndex) => {
        groupKey.set(group.id, `g${groupIndex + 1}`);
        group.options.forEach((option, optionIndex) => {
          optionKey.set(option.id, `o${optionIndex + 1}`);
        });
      });

      const serializeAmount = (spec: AmountSpec): number | string | { min: number; max: number } | null => {
        if (spec.kind === 'open') return null;
        if (spec.kind === 'range') return { min: spec.min, max: spec.max };
        return spec.value;
      };

      const entry: MealImportInput = {
        name: meal.name,
        active: meal.active,
        ingredients: meal.ingredients.map((ingredient) => ({
          name: ingredient.name,
          amount: serializeAmount(ingredient.amount),
          unit: ingredient.unit,
          merchant: merchantName(ingredient.merchantId),
          ...(ingredient.category ? { category: ingredient.category } : {}),
          ...(ingredient.packageSize ? { packageSize: ingredient.packageSize } : {}),
          ...(ingredient.note ? { note: ingredient.note } : {}),
          ...(ingredient.optional ? { optional: true } : {}),
          ...(ingredient.pantryStaple ? { pantryStaple: true } : {}),
          ...(ingredient.choiceGroupId && ingredient.choiceOptionId
            ? {
                choiceGroup: groupKey.get(ingredient.choiceGroupId) ?? ingredient.choiceGroupId,
                choiceOption: optionKey.get(ingredient.choiceOptionId) ?? ingredient.choiceOptionId,
              }
            : {}),
        })),
      };

      if (meal.number !== undefined) entry.number = meal.number;
      if (meal.description) entry.description = meal.description;
      if (meal.recipe) entry.recipe = meal.recipe;
      if (meal.image) entry.image = meal.image;
      if (meal.cookingTime) entry.cookingTime = meal.cookingTime;
      if (meal.servings !== undefined) entry.servings = meal.servings;
      if (meal.tags?.length) entry.tags = meal.tags;
      if (meal.demo) entry.demo = true;
      if (meal.choiceGroups?.length) {
        entry.choiceGroups = meal.choiceGroups.map((group) => ({
          key: groupKey.get(group.id)!,
          name: group.name,
          mode: group.mode,
          options: group.options.map((option) => ({
            key: optionKey.get(option.id)!,
            label: option.label,
          })),
          default: group.defaultOptionIds.map((id) => optionKey.get(id)!).filter(Boolean),
        }));
      }
      return entry;
    }),
  };
}
