/**
 * Aufbau der Einkaufsliste einer Woche:
 * Zuordnungen -> Bedarfszeilen -> Aggregation -> Vorratsfilter -> Haendlergruppen.
 */
import type {
  DemandLine,
  ID,
  Meal,
  MealAssignment,
  MealIngredient,
  Merchant,
  ShoppingGroup,
  ShoppingLineState,
  ShoppingList,
  ShoppingListItem,
  WeekId,
} from './types';
import { aggregateDemand } from './aggregate';
import { parseWeekId, weekRange } from './week';

export const UNKNOWN_MERCHANT_LABEL = 'Unklar';

const DEFAULT_STATE: ShoppingLineState = { inPantry: false, checked: false };

/**
 * Welche Optionen gelten fuer diese Zuordnung? Ohne eigene Auswahl greift die
 * Vorauswahl des Gerichts.
 */
export function effectiveChoices(meal: Meal, assignment: MealAssignment): Record<ID, ID[]> {
  const result: Record<ID, ID[]> = {};
  for (const group of meal.choiceGroups ?? []) {
    const chosen = assignment.choices?.[group.id];
    result[group.id] = chosen ?? group.defaultOptionIds;
  }
  return result;
}

/**
 * Entscheidet, ob eine Zutat fuer diese Zuordnung eingekauft werden muss.
 *
 * Zwei Faelle schliessen sie aus:
 *  - Sie ist optional und wurde nicht dazugewaehlt.
 *  - Sie gehoert zu einer Auswahlgruppe, deren Option nicht gewaehlt ist.
 *    So landet bei "Reis oder Kartoffeln" nur die gewaehlte Beilage auf der Liste.
 */
export function isIngredientSelected(
  ingredient: MealIngredient,
  choices: Record<ID, ID[]>,
  optionalIds: ID[],
): boolean {
  if (ingredient.optional && !optionalIds.includes(ingredient.id)) return false;
  if (ingredient.choiceGroupId) {
    const selected = choices[ingredient.choiceGroupId] ?? [];
    if (!ingredient.choiceOptionId) return false;
    if (!selected.includes(ingredient.choiceOptionId)) return false;
  }
  return true;
}

/** Wandelt die Gerichte einer Woche in flache Bedarfszeilen um. */
export function buildDemandLines(
  assignments: MealAssignment[],
  mealsById: Map<ID, Meal>,
): DemandLine[] {
  const lines: DemandLine[] = [];
  const sorted = [...assignments].sort(
    (a, b) => a.date.localeCompare(b.date) || a.position - b.position,
  );
  for (const assignment of sorted) {
    const meal = mealsById.get(assignment.mealId);
    if (!meal) continue; // Gericht wurde geloescht -- Zuordnung stillschweigend ueberspringen.
    const choices = effectiveChoices(meal, assignment);
    const optionalIds = assignment.optionalIngredientIds ?? [];

    for (const ingredient of meal.ingredients) {
      if (!isIngredientSelected(ingredient, choices, optionalIds)) continue;
      const line: DemandLine = {
        ingredientName: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        merchantId: ingredient.merchantId ?? null,
        packageSize: ingredient.packageSize ?? null,
        mealId: meal.id,
        mealName: meal.number ? `${meal.number}. ${meal.name}` : meal.name,
        date: assignment.date,
      };
      if (ingredient.category) line.category = ingredient.category;
      if (ingredient.pantryStaple) line.pantryStaple = true;
      lines.push(line);
    }
  }
  return lines;
}

/** Gruppiert Positionen nach Haendler, in der Reihenfolge der Stammdaten. */
export function groupByMerchant(
  items: ShoppingListItem[],
  merchants: Merchant[],
): ShoppingGroup[] {
  const order = new Map<string, number>();
  merchants.forEach((m, index) => order.set(m.id, index));
  const nameOf = new Map<string, string>(merchants.map((m) => [m.id, m.name]));

  const groups = new Map<string, ShoppingGroup>();
  for (const item of items) {
    const id = item.merchantId ?? '';
    let group = groups.get(id);
    if (!group) {
      group = {
        merchantId: item.merchantId,
        merchantName: (item.merchantId && nameOf.get(item.merchantId)) || UNKNOWN_MERCHANT_LABEL,
        items: [],
      };
      groups.set(id, group);
    }
    group.items.push(item);
  }

  const result = [...groups.values()];
  result.sort((a, b) => {
    // "Unklar" bzw. unbekannte Haendler immer ans Ende.
    const rankA = a.merchantId ? (order.get(a.merchantId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    const rankB = b.merchantId ? (order.get(b.merchantId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    return a.merchantName.localeCompare(b.merchantName, 'de-DE');
  });
  for (const group of result) {
    group.items.sort((a, b) => a.name.localeCompare(b.name, 'de-DE'));
  }
  return result;
}

export interface BuildShoppingListOptions {
  weekId: WeekId;
  assignments: MealAssignment[];
  meals: Meal[];
  merchants: Merchant[];
  lineStates: Record<string, ShoppingLineState>;
  /** true = als vorhanden markierte Artikel ausblenden (Standard fuer Einkauf/PDF). */
  hidePantryItems?: boolean;
}

export function buildShoppingList(options: BuildShoppingListOptions): ShoppingList {
  const { weekId, assignments, meals, merchants, lineStates, hidePantryItems = true } = options;
  const { isoYear, isoWeek } = parseWeekId(weekId);
  const { start, end } = weekRange(weekId);

  const mealsById = new Map(meals.map((meal) => [meal.id, meal]));
  const aggregated = aggregateDemand(buildDemandLines(assignments, mealsById));

  const withState = (item: Omit<ShoppingListItem, 'state'>): ShoppingListItem => ({
    ...item,
    state: lineStates[item.key] ?? DEFAULT_STATE,
  });

  const allItems: ShoppingListItem[] = aggregated.items.map(withState);
  const pantryChecks: ShoppingListItem[] = aggregated.pantryChecks.map(withState);

  const visible = hidePantryItems ? allItems.filter((item) => !item.state.inPantry) : allItems;

  return {
    weekId,
    isoYear,
    isoWeek,
    startDate: start,
    endDate: end,
    groups: groupByMerchant(visible, merchants),
    allItems,
    pantryChecks: pantryChecks.sort((a, b) => a.name.localeCompare(b.name, 'de-DE')),
  };
}

/** Zaehlt offene und erledigte Positionen (ohne Vorratsartikel). */
export function shoppingProgress(list: ShoppingList): { done: number; total: number } {
  const items = list.groups.flatMap((group) => group.items);
  return {
    done: items.filter((item) => item.state.checked).length,
    total: items.length,
  };
}
