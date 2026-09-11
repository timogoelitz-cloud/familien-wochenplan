/**
 * Lokale Datenbank (IndexedDB via Dexie).
 *
 * Version 1 laeuft vollstaendig lokal im Browser. Es gibt bewusst keinen
 * Server, kein Konto und keine Cloud-Synchronisation. Die Repository-Schicht
 * darueber kapselt alle Zugriffe, damit ein spaeterer Wechsel auf eine
 * entfernte Datenquelle nur diese eine Schicht betrifft.
 */
import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  MealAssignment,
  Meal,
  Merchant,
  Person,
  WeekPlan,
} from '../domain/types';

export class WochenplanDB extends Dexie {
  persons!: Table<Person, string>;
  merchants!: Table<Merchant, string>;
  meals!: Table<Meal, string>;
  assignments!: Table<MealAssignment, string>;
  weekPlans!: Table<WeekPlan, string>;
  settings!: Table<AppSettings, string>;

  constructor(name = 'familien-wochenplan') {
    super(name);
    this.version(1).stores({
      persons: 'id, order',
      merchants: 'id, order',
      meals: 'id, name, active',
      assignments: 'id, weekId, date, mealId, [date+position]',
      weekPlans: 'id',
      settings: 'id',
    });
  }
}

export const db = new WochenplanDB();
