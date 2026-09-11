/**
 * Einstellungen: Familie, Haendler, Standardempfaenger, Apple-Erinnerungen
 * sowie Sicherung und Wiederherstellung aller lokalen Daten.
 */
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Merchant } from '../../domain/types';
import { createMerchant, deleteMerchant, saveMerchant, savePerson, saveSettings } from '../../data/repositories';
import { exportBackup, restoreBackup, validateBackup } from '../../data/backup';
import type { RestoreMode } from '../../data/backup';
import type { ValidationIssue } from '../../domain/mealSchema';
import { downloadBlob } from '../../services/share';
import { useApp, useAppData } from '../store';
import { PERSON_COLOR_KEYS, personColors } from '../theme';

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="mt-1 text-sm text-[color:var(--color-muted)]">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MerchantRow({ merchant }: { merchant: Merchant }) {
  const { notify } = useApp();
  const [name, setName] = useState(merchant.name);

  return (
    <li className="flex flex-wrap items-center gap-2">
      <input
        aria-label={`Name des Händlers ${merchant.name}`}
        className="tap min-w-[12rem] flex-1 rounded-xl border border-[color:var(--color-line)] px-3"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          const trimmed = name.trim();
          if (!trimmed) {
            setName(merchant.name);
            return;
          }
          if (trimmed !== merchant.name) void saveMerchant({ ...merchant, name: trimmed });
        }}
      />
      <button
        type="button"
        className="tap rounded-xl border border-[color:var(--color-line)] px-3 text-sm font-semibold"
        onClick={() => void saveMerchant({ ...merchant, active: !merchant.active })}
      >
        {merchant.active ? 'Aktiv' : 'Inaktiv'}
      </button>
      <button
        type="button"
        className="tap rounded-xl px-3 text-sm font-semibold text-[color:var(--color-terracotta-dark)]"
        onClick={() => {
          if (!window.confirm(`„${merchant.name}“ löschen? Zutaten dieses Händlers werden auf „Unklar“ gesetzt.`)) return;
          void deleteMerchant(merchant.id).then(() => notify(`„${merchant.name}“ gelöscht.`, 'info'));
        }}
      >
        Löschen
      </button>
    </li>
  );
}

export function SettingsView() {
  const { notify } = useApp();
  const { persons, merchants, settings } = useAppData();
  const [newMerchant, setNewMerchant] = useState('');
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('replace');
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    try {
      const backup = await exportBackup();
      downloadBlob(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
        `Wochenplan-Sicherung_${new Date().toISOString().slice(0, 10)}.json`,
      );
      notify('Sicherung erstellt.', 'success');
    } catch (error) {
      console.error(error);
      notify('Die Sicherung konnte nicht erstellt werden.', 'error');
    }
  };

  const handleRestore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIssues(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch (error) {
      setIssues([{ path: file.name, message: `Die Datei ist kein gültiges JSON: ${(error as Error).message}` }]);
      return;
    }

    const result = validateBackup(parsed);
    if (!result.ok) {
      setIssues(result.errors);
      notify('Wiederherstellung abgebrochen – es wurde nichts verändert.', 'error');
      return;
    }
    if (
      restoreMode === 'replace' &&
      !window.confirm('Alle aktuellen Daten in diesem Browser werden durch die Sicherung ersetzt. Fortfahren?')
    ) {
      return;
    }

    try {
      await restoreBackup(result.value, restoreMode);
      setIssues(result.warnings.length > 0 ? result.warnings : null);
      notify(`Wiederhergestellt: ${result.value.meals.length} Gerichte, ${result.value.weekPlans.length} Wochen.`, 'success');
    } catch (error) {
      console.error(error);
      notify('Die Wiederherstellung ist fehlgeschlagen.', 'error');
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <h1 className="mb-4 text-2xl font-bold">Einstellungen</h1>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Familie" description="Diese Personen lassen sich einem Gericht zuordnen.">
          <ul className="space-y-2">
            {persons.map((person) => (
              <li key={person.id} className="flex flex-wrap items-center gap-2">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full font-bold ${personColors(person.colorKey).solid}`}>
                  {person.initials}
                </span>
                <input
                  aria-label={`Name von ${person.name}`}
                  className="tap min-w-[9rem] flex-1 rounded-xl border border-[color:var(--color-line)] px-3"
                  defaultValue={person.name}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== person.name) void savePerson({ ...person, name });
                  }}
                />
                <input
                  aria-label={`Kürzel von ${person.name}`}
                  maxLength={3}
                  className="tap w-16 rounded-xl border border-[color:var(--color-line)] px-2 text-center"
                  defaultValue={person.initials}
                  onBlur={(event) => {
                    const initials = event.target.value.trim().toUpperCase();
                    if (initials && initials !== person.initials) void savePerson({ ...person, initials });
                  }}
                />
                <select
                  aria-label={`Farbe von ${person.name}`}
                  className="tap rounded-xl border border-[color:var(--color-line)] px-2"
                  value={person.colorKey}
                  onChange={(event) => void savePerson({ ...person, colorKey: event.target.value })}
                >
                  {PERSON_COLOR_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Händler"
          description="„Unklar“ ist kein eigener Eintrag: Zutaten ohne bekannten Händler landen automatisch in dieser Gruppe."
        >
          <ul className="space-y-2">
            {merchants.map((merchant) => (
              <MerchantRow key={merchant.id} merchant={merchant} />
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor="new-merchant">
              Neuer Händler
            </label>
            <input
              id="new-merchant"
              className="tap flex-1 rounded-xl border border-[color:var(--color-line)] px-3"
              placeholder="Neuer Händler…"
              value={newMerchant}
              onChange={(event) => setNewMerchant(event.target.value)}
            />
            <button
              type="button"
              disabled={!newMerchant.trim()}
              className="tap rounded-xl bg-[color:var(--color-sage)] px-4 font-semibold text-white disabled:opacity-40"
              onClick={() => {
                void createMerchant(newMerchant).then(() => {
                  notify(`„${newMerchant.trim()}“ hinzugefügt.`, 'success');
                  setNewMerchant('');
                });
              }}
            >
              Hinzufügen
            </button>
          </div>
        </Section>

        <Section title="Teilen und Erinnerungen">
          <label className="block">
            <span className="block text-sm font-semibold">Liste in Apple Erinnerungen</span>
            <input
              className="tap w-full rounded-xl border border-[color:var(--color-line)] px-3"
              defaultValue={settings.appleReminderListName}
              onBlur={(event) => void saveSettings({ ...settings, appleReminderListName: event.target.value.trim() })}
            />
          </label>
          <label className="mt-3 block">
            <span className="block text-sm font-semibold">Name des Apple-Kurzbefehls</span>
            <input
              className="tap w-full rounded-xl border border-[color:var(--color-line)] px-3"
              defaultValue={settings.appleShortcutName}
              onBlur={(event) => void saveSettings({ ...settings, appleShortcutName: event.target.value.trim() })}
            />
          </label>
          <p className="mt-3 text-sm text-[color:var(--color-muted)]">
            Die App verschickt selbst keine Mails. „Teilen“ übergibt die Einkaufsliste als PDF an das
            Teilen-Menü des Geräts – dort lässt sich auf dem iPad Mail, Nachrichten oder was sonst
            gewünscht ist auswählen. Wie der Kurzbefehl für Apple Erinnerungen eingerichtet wird, steht
            in <code>docs/APPLE_SHORTCUT.md</code>.
          </p>
        </Section>

        <Section
          title="Daten sichern"
          description="Alle Daten liegen ausschließlich in diesem Browser. Eine regelmäßige Sicherung schützt vor Datenverlust bei Browser- oder Gerätewechsel."
        >
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleBackup()} className="tap rounded-xl bg-[color:var(--color-terracotta)] px-5 font-semibold text-white">
              Sicherung herunterladen
            </button>
            <input ref={restoreInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void handleRestore(e)} />
            <button type="button" onClick={() => restoreInput.current?.click()} className="tap rounded-xl border border-[color:var(--color-line)] px-5 font-semibold">
              Sicherung einspielen
            </button>
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">Beim Einspielen</legend>
            <label className="mt-1 flex items-center gap-2">
              <input type="radio" name="restore-mode" checked={restoreMode === 'replace'} onChange={() => setRestoreMode('replace')} />
              <span>Alles ersetzen</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="restore-mode" checked={restoreMode === 'merge'} onChange={() => setRestoreMode('merge')} />
              <span>Zusammenführen (vorhandene Einträge bleiben erhalten)</span>
            </label>
          </fieldset>

          {issues && issues.length > 0 && (
            <div role="alert" className="mt-4 rounded-xl border border-[color:var(--color-terracotta)] bg-[#fdeceb] p-4">
              <ul className="space-y-1 text-sm">
                {issues.slice(0, 10).map((issue, index) => (
                  <li key={index}>
                    <code className="opacity-70">{issue.path}</code> – {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
