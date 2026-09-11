/**
 * ISO-8601 Kalenderwochen (Montag = erster Tag, Woche 1 enthaelt den 4. Januar).
 *
 * Alle Berechnungen laufen bewusst in UTC und ueber "YYYY-MM-DD"-Strings.
 * Damit sind sie unabhaengig von Zeitzone und Sommerzeit des Geraets --
 * ein lokales `new Date("2026-09-14")` kann je nach Zone auf den Vortag fallen,
 * deshalb wird hier nirgends lokale Datumsarithmetik verwendet.
 */
import type { ISODate, WeekId } from './types';

export const WEEKDAY_NAMES = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
] as const;

export const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

const MS_PER_DAY = 86_400_000;

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

/** Baut ein UTC-Date aus Jahr/Monat(1-12)/Tag. */
export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Formatiert ein Date als ISO-Datum "YYYY-MM-DD" (UTC-Anteile). */
export function toISODate(date: Date): ISODate {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Parst "YYYY-MM-DD" zu einem UTC-Date. Wirft bei ungueltigem Format. */
export function parseISODate(value: ISODate): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new Error(`Ungueltiges ISO-Datum: ${value}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = utcDate(year, month, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Ungueltiges ISO-Datum: ${value}`);
  }
  return date;
}

/** Heutiges Datum als ISO-Datum, bezogen auf die lokale Zeit des Geraets. */
export function todayISO(now: Date = new Date()): ISODate {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function addDaysISO(value: ISODate, days: number): ISODate {
  return toISODate(addDays(parseISODate(value), days));
}

/** ISO-Wochentag: Montag = 1 ... Sonntag = 7. */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/** Montag der ISO-Woche, in der `date` liegt. */
export function startOfISOWeek(date: Date): Date {
  return addDays(date, 1 - isoWeekday(date));
}

/**
 * ISO-Jahr und -Woche eines Datums.
 * Das ISO-Jahr kann vom Kalenderjahr abweichen (z. B. 2026-12-31 -> 2027-W01).
 */
export function isoWeekOf(date: Date): { isoYear: number; isoWeek: number } {
  // Donnerstag der laufenden Woche bestimmt das ISO-Jahr.
  const thursday = addDays(startOfISOWeek(date), 3);
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = addDays(startOfISOWeek(utcDate(isoYear, 1, 4)), 3);
  const isoWeek = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
  return { isoYear, isoWeek };
}

/** Anzahl ISO-Wochen eines ISO-Jahres (52 oder 53). */
export function isoWeeksInYear(isoYear: number): number {
  return isoWeekOf(utcDate(isoYear, 12, 28)).isoWeek;
}

/** Montag einer ISO-Woche. */
export function startOfISOWeekByNumber(isoYear: number, isoWeek: number): Date {
  return addDays(startOfISOWeek(utcDate(isoYear, 1, 4)), (isoWeek - 1) * 7);
}

export function makeWeekId(isoYear: number, isoWeek: number): WeekId {
  return `${pad(isoYear, 4)}-W${pad(isoWeek)}`;
}

export function parseWeekId(weekId: WeekId): { isoYear: number; isoWeek: number } {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!m) throw new Error(`Ungueltige Wochen-ID: ${weekId}`);
  const isoYear = Number(m[1]);
  const isoWeek = Number(m[2]);
  if (isoWeek < 1 || isoWeek > isoWeeksInYear(isoYear)) {
    throw new Error(`Woche ${isoWeek} existiert in ${isoYear} nicht`);
  }
  return { isoYear, isoWeek };
}

export function weekIdOfDate(date: Date): WeekId {
  const { isoYear, isoWeek } = isoWeekOf(date);
  return makeWeekId(isoYear, isoWeek);
}

export function weekIdOfISODate(value: ISODate): WeekId {
  return weekIdOfDate(parseISODate(value));
}

/** Wochen-ID der aktuellen Woche (lokale Gerätezeit). */
export function currentWeekId(now: Date = new Date()): WeekId {
  return weekIdOfISODate(todayISO(now));
}

/** Die sieben Tage (Mo..So) einer Woche als ISO-Daten. */
export function weekDates(weekId: WeekId): ISODate[] {
  const { isoYear, isoWeek } = parseWeekId(weekId);
  const monday = startOfISOWeekByNumber(isoYear, isoWeek);
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(monday, i)));
}

/** Verschiebt eine Wochen-ID um `delta` Wochen (auch ueber Jahresgrenzen). */
export function shiftWeek(weekId: WeekId, delta: number): WeekId {
  const { isoYear, isoWeek } = parseWeekId(weekId);
  const monday = startOfISOWeekByNumber(isoYear, isoWeek);
  return weekIdOfDate(addDays(monday, delta * 7));
}

export function weekRange(weekId: WeekId): { start: ISODate; end: ISODate } {
  const dates = weekDates(weekId);
  return { start: dates[0]!, end: dates[6]! };
}

/* ----------------------------- Formatierung ----------------------------- */

/** "14.09.2026" */
export function formatDateDE(value: ISODate): string {
  const d = parseISODate(value);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** "14.09." */
export function formatDayMonthDE(value: ISODate): string {
  const d = parseISODate(value);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.`;
}

/** "KW 38" */
export function formatWeekLabel(weekId: WeekId): string {
  const { isoWeek } = parseWeekId(weekId);
  return `KW ${isoWeek}`;
}

/** "14.09.2026 – 20.09.2026" */
export function formatWeekRange(weekId: WeekId): string {
  const { start, end } = weekRange(weekId);
  return `${formatDateDE(start)} – ${formatDateDE(end)}`;
}

/** Wochentagsname eines Datums, z. B. "Montag". */
export function weekdayName(value: ISODate): string {
  return WEEKDAY_NAMES[isoWeekday(parseISODate(value)) - 1]!;
}
