/**
 * Anwendungsweiter Zustand und Datenzugriff.
 *
 * Die Daten kommen ueber `useLiveQuery` direkt aus IndexedDB: jede Aenderung
 * an der Datenbank aktualisiert die Oberflaeche, egal von welcher Ansicht aus
 * sie ausgeloest wurde. Dadurch braucht es keinen zweiten Zustandsspeicher,
 * der mit der Datenbank synchron gehalten werden muesste.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { ensureSeeded } from '../data/repositories';
import { defaultSettings } from '../data/defaults';
import type { AppSettings, ID, Meal, MealAssignment, Merchant, Person, WeekId, WeekPlan } from '../domain/types';
import { currentWeekId } from '../domain/week';

export type ViewName = 'plan' | 'shopping' | 'meals' | 'settings';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

interface AppContextValue {
  weekId: WeekId;
  setWeekId: (weekId: WeekId) => void;
  view: ViewName;
  setView: (view: ViewName) => void;
  /** Fuer die Tipp-Alternative zum Ziehen: vorgemerktes Gericht. */
  armedMealId: ID | null;
  setArmedMealId: (id: ID | null) => void;
  toasts: Toast[];
  notify: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

let toastCounter = 0;

export function AppProvider({ children }: { children: ReactNode }) {
  const [weekId, setWeekId] = useState<WeekId>(() => currentWeekId());
  const [view, setView] = useState<ViewName>('plan');
  const [armedMealId, setArmedMealId] = useState<ID | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: Toast['tone'] = 'info') => {
      toastCounter += 1;
      const id = toastCounter;
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismissToast(id), tone === 'error' ? 8000 : 3500);
    },
    [dismissToast],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      weekId,
      setWeekId,
      view,
      setView,
      armedMealId,
      setArmedMealId,
      toasts,
      notify,
      dismissToast,
    }),
    [weekId, view, armedMealId, toasts, notify, dismissToast],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp muss innerhalb von <AppProvider> verwendet werden.');
  return context;
}

/* ------------------------------- Datenhooks ------------------------------ */

export interface AppData {
  persons: Person[];
  merchants: Merchant[];
  meals: Meal[];
  settings: AppSettings;
  ready: boolean;
  /** Gesetzt, wenn der lokale Speicher nicht nutzbar ist. */
  storageError: string | null;
}

/**
 * Uebersetzt ein Speicherproblem in eine Anweisung, mit der man etwas anfangen
 * kann. Ohne diese Meldung haenge die App stumm in "Daten werden geladen ..." --
 * genau der weisse Bildschirm, den es nicht geben soll.
 */
function describeStorageError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const hint =
    'Alle Daten dieser App liegen im lokalen Speicher des Browsers. Ohne ihn kann nichts gespeichert werden.';

  if (name === 'QuotaExceededError') {
    return `Der Speicher dieses Browsers ist voll. ${hint} Bitte Speicherplatz freigeben und die Seite neu laden.`;
  }
  if (name === 'SecurityError' || name === 'InvalidStateError') {
    return `Der Browser verweigert den Zugriff auf den lokalen Speicher. Das passiert im privaten Modus und wenn Website-Daten blockiert sind. ${hint} Bitte ein normales Fenster verwenden und in den Safari-Einstellungen unter „Datenschutz“ das Blockieren von Cookies bzw. Website-Daten deaktivieren.`;
  }
  return `Der lokale Speicher (IndexedDB) ist nicht erreichbar. Das passiert vor allem im privaten Modus von Safari oder wenn Website-Daten blockiert sind. ${hint} Bitte ein normales Browserfenster verwenden und die Seite neu laden.`;
}

export function useAppData(): AppData {
  const [seeded, setSeeded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // IndexedDB kann in Safari nicht nur scheitern, sondern schlicht nie
    // antworten. Deshalb ein Zeitlimit statt eines endlosen Ladezustands.
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('Zeitueberschreitung')), 8000);
    });

    Promise.race([ensureSeeded(), timeout])
      .then(() => {
        if (!cancelled) setStorageError(null);
      })
      .catch((error: unknown) => {
        console.error('Lokaler Speicher nicht nutzbar', error);
        if (!cancelled) setStorageError(describeStorageError(error));
      })
      .finally(() => {
        if (!cancelled) setSeeded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const result = useLiveQuery(async () => {
    const [persons, merchants, meals, settings] = await Promise.all([
      db.persons.toArray(),
      db.merchants.toArray(),
      db.meals.toArray(),
      db.settings.get('app'),
    ]);
    return {
      persons: persons.sort((a, b) => a.order - b.order),
      merchants: merchants.sort((a, b) => a.order - b.order),
      meals: meals.sort((a, b) => a.name.localeCompare(b.name, 'de-DE')),
      settings: settings ?? defaultSettings(),
    };
  }, [seeded]);

  return {
    persons: result?.persons ?? [],
    merchants: result?.merchants ?? [],
    meals: result?.meals ?? [],
    settings: result?.settings ?? defaultSettings(),
    ready: seeded && result !== undefined,
    storageError,
  };
}

export interface WeekData {
  assignments: MealAssignment[];
  plan: WeekPlan | null;
  ready: boolean;
}

export function useWeek(weekId: WeekId): WeekData {
  const result = useLiveQuery(async () => {
    const [assignments, plan] = await Promise.all([
      db.assignments.where('weekId').equals(weekId).toArray(),
      db.weekPlans.get(weekId),
    ]);
    return {
      assignments: assignments.sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position),
      plan: plan ?? null,
    };
  }, [weekId]);

  return {
    assignments: result?.assignments ?? [],
    plan: result?.plan ?? null,
    ready: result !== undefined,
  };
}

/** Bequemer Zugriff: Gericht-ID -> Gericht. */
export function useMealMap(meals: Meal[]): Map<ID, Meal> {
  return useMemo(() => new Map(meals.map((meal) => [meal.id, meal])), [meals]);
}
