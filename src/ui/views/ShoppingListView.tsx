/**
 * Einkaufsliste einer Woche: Vorratspruefung, nach Haendlern gruppiertes
 * Abhaken, PDF und Teilen.
 */
import { useMemo, useState } from 'react';
import { buildShoppingList, shoppingProgress } from '../../domain/shoppingList';
import { formatQuantity } from '../../domain/units';
import { formatWeekLabel, formatWeekRange, weekdayName } from '../../domain/week';
import type { ShoppingListItem } from '../../domain/types';
import { resetChecked, resetPantry, setLineState } from '../../data/repositories';
import { shoppingListFileName, shoppingListPdfBlob } from '../../services/pdf';
import {
  copyToClipboard,
  downloadBlob,
  shareShoppingList,
  shoppingListAsReminderLines,
} from '../../services/share';
import { useApp, useAppData, useWeek } from '../store';
import { WeekNavigator } from '../components/WeekNavigator';

type Mode = 'pantry' | 'shop';

function ItemRow({
  item,
  mode,
  onToggle,
}: {
  item: ShoppingListItem;
  mode: Mode;
  onToggle: () => void;
}) {
  const [showSources, setShowSources] = useState(false);
  const checked = mode === 'pantry' ? item.state.inPantry : item.state.checked;

  return (
    <li className="border-b border-[color:var(--color-line)] last:border-b-0">
      <div className="flex items-start gap-3 py-1">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={onToggle}
          data-testid={`item-${item.key}`}
          className="tap flex flex-1 items-start gap-3 rounded-xl px-2 text-left hover:bg-[color:var(--color-parchment)]"
        >
          <span
            aria-hidden="true"
            className={`mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold transition-colors ${
              checked
                ? 'border-[color:var(--color-sage)] bg-[color:var(--color-sage)] text-white'
                : 'border-[color:var(--color-line)] bg-white'
            }`}
          >
            {checked ? '✓' : ''}
          </span>
          <span className="min-w-0 flex-1 py-1.5">
            <span className={`block font-semibold ${checked && mode === 'shop' ? 'text-[color:var(--color-muted)] line-through' : ''}`}>
              {item.name}
            </span>
            {item.packaging && (
              <span className="block text-sm text-[color:var(--color-muted)]">
                Einkauf: {item.packaging.packages} × {formatQuantity(item.packaging.packageSize.amount, item.packaging.packageSize.unit)}
                {item.packaging.surplus > 0 && ` · Überbestand: ${formatQuantity(item.packaging.surplus, item.unit)}`}
              </span>
            )}
          </span>
          <span className="shrink-0 py-1.5 text-right font-bold whitespace-nowrap">
            {formatQuantity(item.amount, item.unit)}
          </span>
        </button>
        <button
          type="button"
          className="tap shrink-0 px-2 text-sm text-[color:var(--color-muted)] underline"
          aria-expanded={showSources}
          onClick={() => setShowSources((open) => !open)}
        >
          woher?
        </button>
      </div>
      {showSources && (
        <ul className="mb-2 ml-11 space-y-0.5 text-sm text-[color:var(--color-muted)]">
          {item.sources.map((source, index) => (
            <li key={`${source.mealName}-${source.date}-${index}`}>
              {weekdayName(source.date)}: {source.mealName} – {formatQuantity(source.amount, source.unit)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function ShoppingListView() {
  const { weekId, setWeekId, notify } = useApp();
  const { meals, merchants, settings } = useAppData();
  const { assignments, plan } = useWeek(weekId);
  const [mode, setMode] = useState<Mode>('shop');
  const [busy, setBusy] = useState(false);

  const list = useMemo(
    () =>
      buildShoppingList({
        weekId,
        assignments,
        meals,
        merchants,
        lineStates: plan?.lineStates ?? {},
        // In der Vorratspruefung muessen auch die bereits abgehakten
        // Artikel sichtbar bleiben, sonst kann man sie nicht zuruecknehmen.
        hidePantryItems: mode === 'shop',
      }),
    [assignments, meals, merchants, mode, plan?.lineStates, weekId],
  );

  const printList = useMemo(
    () => buildShoppingList({ weekId, assignments, meals, merchants, lineStates: plan?.lineStates ?? {} }),
    [assignments, meals, merchants, plan?.lineStates, weekId],
  );

  const progress = shoppingProgress(list);
  const pantryCount = list.allItems.filter((item) => item.state.inPantry).length;
  const isEmpty = list.allItems.length === 0;

  const handleShare = async () => {
    setBusy(true);
    try {
      const outcome = await shareShoppingList(printList);
      if (outcome.kind === 'downloaded') {
        notify(`Dein Browser kann keine Dateien teilen – „${outcome.fileName}“ wurde heruntergeladen.`, 'info');
      } else if (outcome.kind === 'shared-file' || outcome.kind === 'shared-text') {
        notify('Einkaufsliste geteilt.', 'success');
      }
    } catch (error) {
      console.error(error);
      notify('Das Teilen hat nicht geklappt. Bitte das PDF herunterladen.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handlePdf = async () => {
    setBusy(true);
    try {
      downloadBlob(await shoppingListPdfBlob(printList), shoppingListFileName(printList));
      notify('PDF erstellt.', 'success');
    } catch (error) {
      console.error(error);
      notify('Das PDF konnte nicht erzeugt werden.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleReminders = async () => {
    const text = shoppingListAsReminderLines(printList);
    if (!text) {
      notify('Es gibt nichts zu übertragen.', 'info');
      return;
    }
    const ok = await copyToClipboard(text);
    notify(
      ok
        ? `Liste kopiert. Jetzt den Kurzbefehl „${settings.appleShortcutName}“ starten – er legt die Einträge in „${settings.appleReminderListName}“ an.`
        : 'Kopieren nicht möglich. Bitte den Text manuell markieren.',
      ok ? 'success' : 'error',
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="no-print flex flex-wrap items-center justify-between gap-3">
        <WeekNavigator weekId={weekId} onChange={setWeekId} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void handlePdf()} disabled={isEmpty || busy} className="tap rounded-xl border border-[color:var(--color-line)] bg-white px-4 font-semibold disabled:opacity-40">
            PDF
          </button>
          <button type="button" onClick={() => void handleShare()} disabled={isEmpty || busy} className="tap rounded-xl bg-[color:var(--color-terracotta)] px-4 font-semibold text-white disabled:opacity-40">
            {busy ? 'Einen Moment…' : 'Teilen'}
          </button>
          <button type="button" onClick={() => void handleReminders()} disabled={isEmpty} className="tap rounded-xl border border-[color:var(--color-line)] bg-white px-4 font-semibold disabled:opacity-40">
            In Apple Erinnerungen
          </button>
        </div>
      </header>

      <div className="no-print flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Ansicht" className="flex rounded-xl border border-[color:var(--color-line)] bg-white p-1">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'pantry'}
            onClick={() => setMode('pantry')}
            className={`tap rounded-lg px-4 font-semibold ${mode === 'pantry' ? 'bg-[color:var(--color-ink)] text-white' : ''}`}
          >
            1. Vorrat prüfen
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'shop'}
            onClick={() => setMode('shop')}
            className={`tap rounded-lg px-4 font-semibold ${mode === 'shop' ? 'bg-[color:var(--color-ink)] text-white' : ''}`}
          >
            2. Einkaufen
          </button>
        </div>

        {mode === 'shop' ? (
          <>
            <span className="text-sm font-semibold text-[color:var(--color-muted)]">
              {progress.done} von {progress.total} erledigt
              {pantryCount > 0 && ` · ${pantryCount} im Vorrat`}
            </span>
            {progress.done > 0 && (
              <button type="button" onClick={() => void resetChecked(weekId)} className="text-sm underline">
                Haken zurücksetzen
              </button>
            )}
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-[color:var(--color-muted)]">
              {pantryCount} als vorhanden markiert
            </span>
            {pantryCount > 0 && (
              <button type="button" onClick={() => void resetPantry(weekId)} className="text-sm underline">
                Vorrat zurücksetzen
              </button>
            )}
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <h1 className="mb-3 hidden text-2xl font-bold print:block">
          Einkaufsliste {formatWeekLabel(weekId)} · {formatWeekRange(weekId)}
        </h1>

        {isEmpty && (
          <p className="card p-6 text-[color:var(--color-muted)]">
            Für {formatWeekLabel(weekId)} sind noch keine Gerichte eingeplant. Lege im Wochenplan Gerichte
            an – die Einkaufsliste entsteht dann automatisch.
          </p>
        )}

        {!isEmpty && list.groups.length === 0 && (
          <p className="card p-6 text-[color:var(--color-muted)]">
            Alles bereits im Vorrat – es muss nichts eingekauft werden.
          </p>
        )}

        <div className="space-y-4">
          {list.groups.map((group) => (
            <section key={group.merchantId ?? 'unklar'} className="card overflow-hidden" aria-label={group.merchantName}>
              <h2 className="flex items-baseline justify-between bg-[color:var(--color-parchment)] px-4 py-2.5 text-base font-bold tracking-wide uppercase">
                {group.merchantName}
                <span className="text-sm font-semibold normal-case opacity-60">
                  {group.items.length} Position{group.items.length === 1 ? '' : 'en'}
                </span>
              </h2>
              <ul className="px-2">
                {group.items.map((item) => (
                  <ItemRow
                    key={item.key}
                    item={item}
                    mode={mode}
                    onToggle={() =>
                      void setLineState(
                        weekId,
                        item.key,
                        mode === 'pantry'
                          ? { inPantry: !item.state.inPantry }
                          : { checked: !item.state.checked },
                      )
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
