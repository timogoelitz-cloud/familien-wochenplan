/**
 * Gerichte verwalten: anlegen, bearbeiten, deaktivieren, loeschen,
 * Zutaten samt Haendler und Packungsgroesse pflegen, Bild hinterlegen,
 * sowie Import und Export im dokumentierten JSON-Format.
 */
import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { AmountSpec, Meal, MealIngredient, Merchant, Unit } from '../../domain/types';
import { AMOUNT_OPEN, UNITS, exactAmount, rangeAmount } from '../../domain/types';
import { newIngredientId, newMealId, nowISO } from '../../domain/ids';
import { parseMealImport, serializeMeals } from '../../domain/mealSchema';
import type { ValidationIssue } from '../../domain/mealSchema';
import { addMeals, addMealsWithoutDuplicates, deleteMeal, saveMeal } from '../../data/repositories';
// Unsere 17 Familiengerichte. Fest mitgebaut (rund 29 kB), damit sie auch
// offline und ohne Dateiauswahl auf dem iPad verfuegbar sind.
import seedMeals from '../../../data/meals.seed.json';
import { downloadBlob } from '../../services/share';
import { useApp, useAppData } from '../store';

const MAX_IMAGE_BYTES = 1_500_000;

function emptyMeal(): Meal {
  const timestamp = nowISO();
  return {
    id: newMealId(),
    name: '',
    ingredients: [],
    servings: 4,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function emptyIngredient(): MealIngredient {
  // Von Hand angelegte Zutaten haben fast immer eine Zahl. "Menge offen" bleibt
  // ueber die Auswahl erreichbar, ist aber bewusst nicht der Standard.
  return { id: newIngredientId(), name: '', amount: exactAmount(0), unit: 'g', merchantId: null, packageSize: null };
}

/* ------------------------------ Zutatenzeile ----------------------------- */

function IngredientRow({
  ingredient,
  index,
  merchants,
  onChange,
  onRemove,
}: {
  ingredient: MealIngredient;
  index: number;
  merchants: Merchant[];
  onChange: (next: MealIngredient) => void;
  onRemove: () => void;
}) {
  const packageSize = ingredient.packageSize;
  const field = (label: string) => `Zutat ${index + 1} – ${label}`;

  return (
    <li className="rounded-xl border border-[color:var(--color-line)] bg-white p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[10rem] flex-1">
          <span className="block text-xs font-semibold text-[color:var(--color-muted)]">Zutat</span>
          <input
            aria-label={field('Name')}
            className="tap w-full rounded-lg border border-[color:var(--color-line)] px-2"
            value={ingredient.name}
            placeholder="z. B. Spaghetti"
            onChange={(event) => onChange({ ...ingredient, name: event.target.value })}
          />
        </label>

        <label className="w-28">
          <span className="block text-xs font-semibold text-[color:var(--color-muted)]">Art</span>
          <select
            aria-label={field('Mengenart')}
            className="tap w-full rounded-lg border border-[color:var(--color-line)] px-2"
            value={ingredient.amount.kind}
            onChange={(event) => {
              const kind = event.target.value as AmountSpec['kind'];
              const current = ingredient.amount;
              if (kind === 'open') return onChange({ ...ingredient, amount: AMOUNT_OPEN });
              if (kind === 'exact') {
                const value = current.kind === 'range' ? current.max : current.kind === 'exact' ? current.value : 0;
                return onChange({ ...ingredient, amount: exactAmount(value) });
              }
              const base = current.kind === 'exact' ? current.value : current.kind === 'range' ? current.min : 0;
              const top = current.kind === 'range' ? current.max : base;
              return onChange({ ...ingredient, amount: rangeAmount(base, top) });
            }}
          >
            <option value="exact">feste Menge</option>
            <option value="range">Bereich</option>
            <option value="open">Menge offen</option>
          </select>
        </label>

        {ingredient.amount.kind === 'exact' && (
          <label className="w-24">
            <span className="block text-xs font-semibold text-[color:var(--color-muted)]">Menge</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              aria-label={field('Menge')}
              className="tap w-full rounded-lg border border-[color:var(--color-line)] px-2"
              value={ingredient.amount.value}
              onChange={(event) => onChange({ ...ingredient, amount: exactAmount(Number(event.target.value)) })}
            />
          </label>
        )}

        {ingredient.amount.kind === 'range' && (
          <>
            <label className="w-20">
              <span className="block text-xs font-semibold text-[color:var(--color-muted)]">von</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                aria-label={field('Menge von')}
                className="tap w-full rounded-lg border border-[color:var(--color-line)] px-2"
                value={ingredient.amount.min}
                onChange={(event) =>
                  onChange({
                    ...ingredient,
                    amount: rangeAmount(Number(event.target.value), (ingredient.amount as { max: number }).max),
                  })
                }
              />
            </label>
            <label className="w-20">
              <span className="block text-xs font-semibold text-[color:var(--color-muted)]">bis</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                aria-label={field('Menge bis')}
                className="tap w-full rounded-lg border border-[color:var(--color-line)] px-2"
                value={ingredient.amount.max}
                onChange={(event) =>
                  onChange({
                    ...ingredient,
                    amount: rangeAmount((ingredient.amount as { min: number }).min, Number(event.target.value)),
                  })
                }
              />
            </label>
          </>
        )}

        <label className="w-28">
          <span className="block text-xs font-semibold text-[color:var(--color-muted)]">Einheit</span>
          <select
            aria-label={field('Einheit')}
            className="tap w-full rounded-lg border border-[color:var(--color-line)] px-2"
            value={ingredient.unit}
            onChange={(event) => onChange({ ...ingredient, unit: event.target.value as Unit })}
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[9rem] flex-1">
          <span className="block text-xs font-semibold text-[color:var(--color-muted)]">Händler</span>
          <select
            aria-label={field('Händler')}
            className="tap w-full rounded-lg border border-[color:var(--color-line)] px-2"
            value={ingredient.merchantId ?? ''}
            onChange={(event) => onChange({ ...ingredient, merchantId: event.target.value || null })}
          >
            <option value="">Unklar</option>
            {merchants.map((merchant) => (
              <option key={merchant.id} value={merchant.id}>
                {merchant.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Zutat ${ingredient.name || 'ohne Namen'} entfernen`}
          className="tap rounded-lg border border-[color:var(--color-line)] px-3 text-lg text-[color:var(--color-muted)]"
        >
          ×
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="w-32">
          <span className="block text-xs font-semibold text-[color:var(--color-muted)]">Packung</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            aria-label={field('Packungsgröße')}
            placeholder="z. B. 500"
            className="tap w-full rounded-lg border border-[color:var(--color-line)] px-2"
            value={packageSize?.amount ?? ''}
            onChange={(event) => {
              const amount = event.target.value === '' ? null : Number(event.target.value);
              onChange({
                ...ingredient,
                packageSize:
                  amount === null || !(amount > 0)
                    ? null
                    : { amount, unit: packageSize?.unit ?? ingredient.unit },
              });
            }}
          />
        </label>
        <label className="w-28">
          <span className="block text-xs font-semibold text-[color:var(--color-muted)]">Pack-Einheit</span>
          <select
            aria-label={field('Packungseinheit')}
            className="tap w-full rounded-lg border border-[color:var(--color-line)] px-2 disabled:opacity-40"
            disabled={!packageSize}
            value={packageSize?.unit ?? ingredient.unit}
            onChange={(event) =>
              packageSize && onChange({ ...ingredient, packageSize: { ...packageSize, unit: event.target.value as Unit } })
            }
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={ingredient.optional === true}
            onChange={(event) => onChange({ ...ingredient, optional: event.target.checked || undefined })}
          />
          <span className="text-xs font-semibold text-[color:var(--color-muted)]">optional</span>
        </label>
        <label className="flex items-center gap-2 pb-1" title="Öl, Gewürze: erscheint nur zur Bestandsprüfung, wird nie aufsummiert">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={ingredient.pantryStaple === true}
            onChange={(event) => onChange({ ...ingredient, pantryStaple: event.target.checked || undefined })}
          />
          <span className="text-xs font-semibold text-[color:var(--color-muted)]">Vorrat</span>
        </label>
        <label className="min-w-[8rem] flex-1">
          <span className="block text-xs font-semibold text-[color:var(--color-muted)]">Warengruppe (optional)</span>
          <input
            aria-label={field('Warengruppe')}
            className="tap w-full rounded-lg border border-[color:var(--color-line)] px-2"
            value={ingredient.category ?? ''}
            placeholder="z. B. Trockenware"
            onChange={(event) => onChange({ ...ingredient, category: event.target.value || undefined })}
          />
        </label>
      </div>
    </li>
  );
}

/* ------------------------------ Gericht-Editor --------------------------- */

function MealEditor({ meal, merchants, onClose }: { meal: Meal; merchants: Merchant[]; onClose: () => void }) {
  const { notify } = useApp();
  const [draft, setDraft] = useState<Meal>(meal);
  const [error, setError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<Meal>) => setDraft((current) => ({ ...current, ...patch }));

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Bitte eine Bilddatei auswählen.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Das Bild ist größer als 1,5 MB. Bitte ein kleineres Bild wählen.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update({ image: String(reader.result) });
      setError(null);
    };
    reader.onerror = () => setError('Das Bild konnte nicht gelesen werden.');
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const name = draft.name.trim();
    if (!name) {
      setError('Das Gericht braucht einen Namen.');
      return;
    }
    const incomplete = draft.ingredients.filter((item) => !item.name.trim());
    if (incomplete.length > 0) {
      setError('Jede Zutat braucht einen Namen. Leere Zutaten bitte entfernen.');
      return;
    }
    await saveMeal({ ...draft, name, ingredients: draft.ingredients.map((i) => ({ ...i, name: i.name.trim() })) });
    notify(`„${name}“ gespeichert.`, 'success');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={meal.name ? `${meal.name} bearbeiten` : 'Neues Gericht'}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6"
    >
      <div className="card animate-pop-in w-full max-w-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{meal.name ? 'Gericht bearbeiten' : 'Neues Gericht'}</h2>
          <button type="button" onClick={onClose} className="tap rounded-xl px-3 text-2xl" aria-label="Schließen">
            ×
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-[#fdeceb] px-4 py-3 font-semibold text-[color:var(--color-terracotta-dark)]">
            {error}
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="block text-sm font-semibold">Name</span>
            <input
              className="tap w-full rounded-xl border border-[color:var(--color-line)] px-3"
              value={draft.name}
              placeholder="z. B. Spaghetti mit Hackfleisch"
              onChange={(event) => update({ name: event.target.value })}
            />
          </label>

          <label className="sm:col-span-2">
            <span className="block text-sm font-semibold">Kurzbeschreibung (optional)</span>
            <input
              className="tap w-full rounded-xl border border-[color:var(--color-line)] px-3"
              value={draft.description ?? ''}
              onChange={(event) => update({ description: event.target.value || undefined })}
            />
          </label>

          <label>
            <span className="block text-sm font-semibold">Portionen (typische Familienmenge)</span>
            <input
              type="number"
              min={1}
              className="tap w-full rounded-xl border border-[color:var(--color-line)] px-3"
              value={draft.servings ?? 4}
              onChange={(event) => update({ servings: Number(event.target.value) || undefined })}
            />
          </label>

          <div>
            <span className="block text-sm font-semibold">Bild</span>
            <div className="mt-1 flex items-center gap-2">
              {draft.image && <img src={draft.image} alt="" className="h-11 w-11 rounded-lg object-cover" />}
              <input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={handleImage} />
              <button
                type="button"
                className="tap rounded-xl border border-[color:var(--color-line)] px-3 text-sm font-semibold"
                onClick={() => imageInput.current?.click()}
              >
                Datei wählen
              </button>
              {draft.image && (
                <button type="button" className="tap px-2 text-sm underline" onClick={() => update({ image: null })}>
                  entfernen
                </button>
              )}
            </div>
          </div>

          <label className="sm:col-span-2">
            <span className="block text-sm font-semibold">Bild-URL (optional, statt Upload)</span>
            <input
              className="tap w-full rounded-xl border border-[color:var(--color-line)] px-3"
              value={draft.image?.startsWith('data:') ? '' : (draft.image ?? '')}
              placeholder="https://…"
              onChange={(event) => update({ image: event.target.value || null })}
            />
          </label>

          <label className="sm:col-span-2">
            <span className="block text-sm font-semibold">Rezept / Zubereitung</span>
            <textarea
              rows={5}
              className="w-full rounded-xl border border-[color:var(--color-line)] px-3 py-2"
              value={draft.recipe ?? ''}
              onChange={(event) => update({ recipe: event.target.value || undefined })}
            />
          </label>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Zutaten</h3>
            <button
              type="button"
              className="tap rounded-xl bg-[color:var(--color-sage)] px-4 font-semibold text-white"
              onClick={() => update({ ingredients: [...draft.ingredients, emptyIngredient()] })}
            >
              + Zutat
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {draft.ingredients.length === 0 && (
              <li className="rounded-xl bg-[color:var(--color-parchment)] p-4 text-sm text-[color:var(--color-muted)]">
                Noch keine Zutaten. Ohne Zutaten erscheint dieses Gericht nicht auf der Einkaufsliste.
              </li>
            )}
            {draft.ingredients.map((ingredient, index) => (
              <IngredientRow
                key={ingredient.id}
                ingredient={ingredient}
                index={index}
                merchants={merchants}
                onChange={(next) =>
                  update({ ingredients: draft.ingredients.map((item, i) => (i === index ? next : item)) })
                }
                onRemove={() => update({ ingredients: draft.ingredients.filter((_, i) => i !== index) })}
              />
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="tap rounded-xl border border-[color:var(--color-line)] px-5 font-semibold">
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            className="tap rounded-xl bg-[color:var(--color-terracotta)] px-6 font-semibold text-white"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Liste --------------------------------- */

export function MealsView() {
  const { notify } = useApp();
  const { meals, merchants } = useAppData();
  const [editing, setEditing] = useState<Meal | null>(null);
  const [search, setSearch] = useState('');
  const [issues, setIssues] = useState<{ errors: ValidationIssue[]; warnings: ValidationIssue[] } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const merchantByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const merchant of merchants) map.set(merchant.name.toLowerCase().trim(), merchant.id);
    return map;
  }, [merchants]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? meals.filter((meal) => meal.name.toLowerCase().includes(query)) : meals;
  }, [meals, search]);

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIssues(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch (error) {
      setIssues({
        errors: [{ path: file.name, message: `Die Datei ist kein gültiges JSON: ${(error as Error).message}` }],
        warnings: [],
      });
      return;
    }

    const result = parseMealImport(parsed, (name) => merchantByName.get(name.toLowerCase().trim()) ?? null);
    if (!result.ok) {
      // Bewusst nichts schreiben: lieber gar kein Import als ein halber.
      setIssues({ errors: result.errors, warnings: result.warnings });
      notify('Import abgebrochen – es wurde nichts gespeichert.', 'error');
      return;
    }

    await addMeals(result.value);
    setIssues(result.warnings.length > 0 ? { errors: [], warnings: result.warnings } : null);
    notify(`${result.value.length} Gericht(e) importiert.`, 'success');
  };

  /** Laedt unsere 17 Familiengerichte, ohne vorhandene doppelt anzulegen. */
  const handleLoadSeed = async () => {
    setIssues(null);
    const result = parseMealImport(seedMeals, (name) => merchantByName.get(name.toLowerCase().trim()) ?? null);
    if (!result.ok) {
      setIssues({ errors: result.errors, warnings: result.warnings });
      notify('Die Gerichte konnten nicht geladen werden.', 'error');
      return;
    }
    const { added, skipped } = await addMealsWithoutDuplicates(result.value);
    if (added.length === 0) {
      notify('Alle 17 Gerichte sind bereits vorhanden.', 'info');
    } else {
      notify(
        `${added.length} Gericht(e) geladen${skipped.length > 0 ? `, ${skipped.length} waren schon da` : ''}.`,
        'success',
      );
    }
  };

  /**
   * Laedt die mitgelieferten Demo-Gerichte. Sie sind als `demo: true` markiert
   * und tragen "DEMO" im Namen -- sie duerfen nie mit den 17 echten
   * Familiengerichten verwechselt werden.
   */
  const handleLoadDemo = async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}meals.demo.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = parseMealImport(await response.json(), (name) => merchantByName.get(name.toLowerCase().trim()) ?? null);
      if (!result.ok) {
        setIssues({ errors: result.errors, warnings: result.warnings });
        return;
      }
      await addMeals(result.value);
      notify(`${result.value.length} Demo-Gerichte geladen. Sie sind mit „DEMO“ gekennzeichnet.`, 'success');
    } catch (error) {
      console.error(error);
      notify('Die Demo-Gerichte konnten nicht geladen werden.', 'error');
    }
  };

  const handleExport = () => {
    const names = new Map(merchants.map((merchant) => [merchant.id, merchant.name]));
    const payload = serializeMeals(meals, (id) => (id ? (names.get(id) ?? null) : null));
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      `Gerichte_${new Date().toISOString().slice(0, 10)}.json`,
    );
    notify('Gerichte exportiert.', 'success');
  };

  const handleDelete = async (meal: Meal) => {
    const confirmed = window.confirm(
      `„${meal.name}“ endgültig löschen?\n\nDas Gericht wird auch aus allen Wochenplänen entfernt. Zum Ausblenden ohne Datenverlust lieber „deaktivieren“ verwenden.`,
    );
    if (!confirmed) return;
    await deleteMeal(meal.id);
    notify(`„${meal.name}“ gelöscht.`, 'info');
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Gerichte</h1>
        <div className="flex flex-wrap gap-2">
          <input ref={importInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void handleImportFile(e)} />
          <button type="button" onClick={() => importInput.current?.click()} className="tap rounded-xl border border-[color:var(--color-line)] bg-white px-4 font-semibold">
            Importieren
          </button>
          <button type="button" onClick={handleExport} disabled={meals.length === 0} className="tap rounded-xl border border-[color:var(--color-line)] bg-white px-4 font-semibold disabled:opacity-40">
            Exportieren
          </button>
          <button
            type="button"
            onClick={() => void handleLoadSeed()}
            data-testid="load-seed"
            className="tap rounded-xl border border-[color:var(--color-line)] bg-white px-4 font-semibold"
          >
            Unsere 17 Gerichte
          </button>
          <button type="button" onClick={() => setEditing(emptyMeal())} className="tap rounded-xl bg-[color:var(--color-terracotta)] px-5 font-semibold text-white">
            + Neues Gericht
          </button>
        </div>
      </header>

      {issues && (issues.errors.length > 0 || issues.warnings.length > 0) && (
        <div
          role="alert"
          className={`rounded-2xl border p-4 ${issues.errors.length > 0 ? 'border-[color:var(--color-terracotta)] bg-[#fdeceb]' : 'border-[color:var(--color-line)] bg-[#fbf6e8]'}`}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-bold">
              {issues.errors.length > 0 ? 'Der Import wurde abgebrochen' : 'Import mit Hinweisen abgeschlossen'}
            </h2>
            <button type="button" onClick={() => setIssues(null)} className="tap px-2 text-xl" aria-label="Hinweise schließen">
              ×
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {issues.errors.slice(0, 12).map((issue, index) => (
              <li key={`e${index}`}>
                <code className="opacity-70">{issue.path}</code> – {issue.message}
              </li>
            ))}
            {issues.errors.length > 12 && <li>… und {issues.errors.length - 12} weitere Fehler.</li>}
            {issues.warnings.slice(0, 12).map((issue, index) => (
              <li key={`w${index}`} className="opacity-80">
                Hinweis: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="sr-only" htmlFor="meal-admin-search">
        Gericht suchen
      </label>
      <input
        id="meal-admin-search"
        type="search"
        placeholder="Gericht suchen…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="tap w-full max-w-md rounded-xl border border-[color:var(--color-line)] bg-white px-3"
      />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {meals.length === 0 && (
          <div className="card p-6">
            <h2 className="text-lg font-bold">Noch keine Gerichte</h2>
            <p className="mt-2 text-[color:var(--color-muted)]">
              Lege ein Gericht von Hand an oder importiere eure Rezepte als JSON-Datei. Das erwartete Format
              steht in <code>data/meal.schema.json</code>, eine Beispieldatei liegt unter{' '}
              <code>data/meals.example.json</code>. Unsere 17 echten Gerichte gehören in{' '}
              <code>data/meals.seed.json</code>.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleLoadSeed()}
                className="tap rounded-xl bg-[color:var(--color-terracotta)] px-5 font-semibold text-white"
              >
                Unsere 17 Gerichte laden
              </button>
              <button
                type="button"
                onClick={() => void handleLoadDemo()}
                data-testid="load-demo"
                className="tap rounded-xl border border-[color:var(--color-line)] px-5 font-semibold"
              >
                Demo-Gerichte laden
              </button>
            </div>
          </div>
        )}

        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((meal) => (
            <li key={meal.id} className={`card flex flex-col p-4 ${meal.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-3">
                {meal.image ? (
                  <img src={meal.image} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[color:var(--color-parchment)] text-3xl">
                    🍽️
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold">
                    {meal.number ? <span className="opacity-60">{meal.number}. </span> : null}
                    {meal.name}
                  </h2>
                  {meal.demo && (
                    <span className="mt-1 inline-block rounded-full bg-[color:var(--color-parchment)] px-2 py-0.5 text-xs font-bold">
                      DEMO
                    </span>
                  )}
                  <p className="text-sm text-[color:var(--color-muted)]">
                    {meal.ingredients.length} Zutat{meal.ingredients.length === 1 ? '' : 'en'}
                    {meal.servings ? ` · ${meal.servings} Portionen` : ''}
                  </p>
                  {meal.description && <p className="mt-1 line-clamp-2 text-sm">{meal.description}</p>}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditing(meal)} className="tap rounded-lg border border-[color:var(--color-line)] px-3 text-sm font-semibold">
                  Bearbeiten
                </button>
                <button
                  type="button"
                  onClick={() => void saveMeal({ ...meal, active: !meal.active })}
                  className="tap rounded-lg border border-[color:var(--color-line)] px-3 text-sm font-semibold"
                >
                  {meal.active ? 'Deaktivieren' : 'Aktivieren'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(meal)}
                  className="tap rounded-lg px-3 text-sm font-semibold text-[color:var(--color-terracotta-dark)]"
                >
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {editing && <MealEditor meal={editing} merchants={merchants} onClose={() => setEditing(null)} />}
    </div>
  );
}
