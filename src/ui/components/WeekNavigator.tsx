import { useState } from 'react';
import { currentWeekId, formatWeekLabel, formatWeekRange, isoWeeksInYear, makeWeekId, parseWeekId, shiftWeek } from '../../domain/week';
import type { WeekId } from '../../domain/types';

interface Props {
  weekId: WeekId;
  onChange: (weekId: WeekId) => void;
}

/** Kalendersteuerung: eine Woche zurueck/vor, zurueck zu heute, freie Auswahl. */
export function WeekNavigator({ weekId, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { isoYear, isoWeek } = parseWeekId(weekId);
  const isCurrent = weekId === currentWeekId();

  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        className="tap rounded-xl border border-[color:var(--color-line)] bg-white px-3 text-xl font-bold hover:bg-[color:var(--color-parchment)]"
        onClick={() => onChange(shiftWeek(weekId, -1))}
        aria-label="Vorige Woche"
      >
        ‹
      </button>

      <button
        type="button"
        className="tap min-w-[15rem] rounded-xl border border-[color:var(--color-line)] bg-white px-4 py-1.5 text-left hover:bg-[color:var(--color-parchment)]"
        onClick={() => setPickerOpen((open) => !open)}
        aria-expanded={pickerOpen}
        aria-label={`Woche wählen, aktuell ${formatWeekLabel(weekId)}`}
      >
        <span className="block text-lg leading-tight font-bold">{formatWeekLabel(weekId)}</span>
        <span className="block text-sm leading-tight text-[color:var(--color-muted)]">{formatWeekRange(weekId)}</span>
      </button>

      <button
        type="button"
        className="tap rounded-xl border border-[color:var(--color-line)] bg-white px-3 text-xl font-bold hover:bg-[color:var(--color-parchment)]"
        onClick={() => onChange(shiftWeek(weekId, 1))}
        aria-label="Nächste Woche"
      >
        ›
      </button>

      {!isCurrent && (
        <button
          type="button"
          className="tap rounded-xl bg-[color:var(--color-sage)] px-4 font-semibold text-white"
          onClick={() => onChange(currentWeekId())}
        >
          Heute
        </button>
      )}

      {pickerOpen && (
        <div className="absolute top-full left-0 z-40 mt-2 w-72 rounded-2xl border border-[color:var(--color-line)] bg-white p-4 shadow-xl">
          <label className="block text-sm font-semibold" htmlFor="week-year">
            Jahr
          </label>
          <input
            id="week-year"
            type="number"
            className="tap mt-1 w-full rounded-xl border border-[color:var(--color-line)] px-3"
            value={isoYear}
            min={2000}
            max={2100}
            onChange={(event) => {
              const year = Number(event.target.value);
              if (!Number.isInteger(year) || year < 2000 || year > 2100) return;
              const maxWeek = isoWeeksInYear(year);
              onChange(makeWeekId(year, Math.min(isoWeek, maxWeek)));
            }}
          />
          <label className="mt-3 block text-sm font-semibold" htmlFor="week-number">
            Kalenderwoche (1–{isoWeeksInYear(isoYear)})
          </label>
          <input
            id="week-number"
            type="number"
            className="tap mt-1 w-full rounded-xl border border-[color:var(--color-line)] px-3"
            value={isoWeek}
            min={1}
            max={isoWeeksInYear(isoYear)}
            onChange={(event) => {
              const week = Number(event.target.value);
              if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(isoYear)) return;
              onChange(makeWeekId(isoYear, week));
            }}
          />
          <button
            type="button"
            className="tap mt-4 w-full rounded-xl bg-[color:var(--color-ink)] font-semibold text-white"
            onClick={() => setPickerOpen(false)}
          >
            Fertig
          </button>
        </div>
      )}
    </div>
  );
}
