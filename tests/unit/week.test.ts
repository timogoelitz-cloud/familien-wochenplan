import { describe, expect, it } from 'vitest';
import {
  addDaysISO,
  currentWeekId,
  formatDateDE,
  formatWeekLabel,
  formatWeekRange,
  isoWeekOf,
  isoWeeksInYear,
  makeWeekId,
  parseISODate,
  parseWeekId,
  shiftWeek,
  startOfISOWeekByNumber,
  toISODate,
  utcDate,
  weekDates,
  weekIdOfISODate,
  weekdayName,
} from '../../src/domain/week';

describe('ISO-Datum', () => {
  it('parst und formatiert verlustfrei', () => {
    expect(toISODate(parseISODate('2026-09-14'))).toBe('2026-09-14');
  });

  it('weist ungueltige Datumsangaben zurueck', () => {
    expect(() => parseISODate('2026-02-30')).toThrow();
    expect(() => parseISODate('14.09.2026')).toThrow();
    expect(() => parseISODate('2026-9-4')).toThrow();
  });

  it('rechnet ueber Monats- und Jahresgrenzen', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2024-02-28', 1)).toBe('2024-02-29'); // Schaltjahr
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('ISO-Kalenderwoche', () => {
  it('bestimmt die Woche aus der Aufgabenstellung', () => {
    // 14.09.2026 ist ein Montag und liegt in KW 38.
    expect(isoWeekOf(utcDate(2026, 9, 14))).toEqual({ isoYear: 2026, isoWeek: 38 });
    expect(weekIdOfISODate('2026-09-14')).toBe('2026-W38');
    expect(formatWeekLabel('2026-W38')).toBe('KW 38');
    expect(formatWeekRange('2026-W38')).toBe('14.09.2026 – 20.09.2026');
  });

  it('ordnet Sonntag noch der ablaufenden Woche zu', () => {
    expect(weekIdOfISODate('2026-09-20')).toBe('2026-W38');
    expect(weekIdOfISODate('2026-09-21')).toBe('2026-W39');
  });

  it('behandelt den Jahreswechsel nach ISO 8601', () => {
    // KW 1 von 2026 beginnt bereits am 29.12.2025.
    expect(weekIdOfISODate('2025-12-29')).toBe('2026-W01');
    expect(weekIdOfISODate('2026-01-01')).toBe('2026-W01');
    // Der 31.12.2024 gehoert bereits zu KW 1 des Jahres 2025.
    expect(weekIdOfISODate('2024-12-31')).toBe('2025-W01');
    // Der 01.01.2027 gehoert noch zu KW 53 von 2026.
    expect(weekIdOfISODate('2027-01-01')).toBe('2026-W53');
  });

  it('kennt Jahre mit 53 Wochen', () => {
    expect(isoWeeksInYear(2026)).toBe(53);
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2020)).toBe(53);
  });

  it('liefert Montag als ersten Tag der Woche', () => {
    expect(toISODate(startOfISOWeekByNumber(2026, 38))).toBe('2026-09-14');
    expect(toISODate(startOfISOWeekByNumber(2026, 1))).toBe('2025-12-29');
  });

  it('liefert sieben Tage von Montag bis Sonntag', () => {
    const dates = weekDates('2026-W38');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-09-14');
    expect(dates[6]).toBe('2026-09-20');
    expect(weekdayName(dates[0]!)).toBe('Montag');
    expect(weekdayName(dates[6]!)).toBe('Sonntag');
  });
});

describe('Wochenwechsel', () => {
  it('blaettert vor und zurueck', () => {
    expect(shiftWeek('2026-W38', 1)).toBe('2026-W39');
    expect(shiftWeek('2026-W38', -1)).toBe('2026-W37');
    expect(shiftWeek('2026-W38', 0)).toBe('2026-W38');
  });

  it('blaettert korrekt ueber den Jahreswechsel', () => {
    // 2026 hat 53 Wochen -- nach KW 53 kommt KW 1 des Jahres 2027.
    expect(shiftWeek('2026-W52', 1)).toBe('2026-W53');
    expect(shiftWeek('2026-W53', 1)).toBe('2027-W01');
    expect(shiftWeek('2027-W01', -1)).toBe('2026-W53');
    // 2025 hat nur 52 Wochen.
    expect(shiftWeek('2025-W52', 1)).toBe('2026-W01');
    expect(shiftWeek('2026-W01', -1)).toBe('2025-W52');
  });

  it('ist ueber viele Schritte umkehrbar', () => {
    let week = '2026-W38';
    for (let i = 0; i < 120; i += 1) week = shiftWeek(week, 1);
    for (let i = 0; i < 120; i += 1) week = shiftWeek(week, -1);
    expect(week).toBe('2026-W38');
  });

  it('weist unmoegliche Wochen-IDs zurueck', () => {
    expect(() => parseWeekId('2025-W53')).toThrow(); // 2025 hat nur 52 Wochen
    expect(() => parseWeekId('2026-W00')).toThrow();
    expect(() => parseWeekId('KW38')).toThrow();
    expect(makeWeekId(2026, 3)).toBe('2026-W03');
  });
});

describe('aktuelle Woche', () => {
  it('leitet die Woche aus der lokalen Gerätezeit ab', () => {
    // Lokale Zeit spaet am Abend darf nicht in den Folgetag kippen.
    const monday = new Date(2026, 8, 14, 23, 30, 0);
    expect(currentWeekId(monday)).toBe('2026-W38');
    const sundayNight = new Date(2026, 8, 20, 23, 59, 0);
    expect(currentWeekId(sundayNight)).toBe('2026-W38');
  });
});

describe('deutsche Formatierung', () => {
  it('formatiert Datumsangaben zweistellig', () => {
    expect(formatDateDE('2026-01-05')).toBe('05.01.2026');
  });
});
