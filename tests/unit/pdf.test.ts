/**
 * PDF- und Textausgabe. Die PDF-Erzeugung laeuft rein lokal; hier wird
 * geprueft, dass sie ueberhaupt ein brauchbares Dokument liefert und dass
 * der Dateiname der Vorgabe entspricht.
 */
import { describe, expect, it } from 'vitest';
import { createShoppingListPdf, shoppingListFileName, shoppingListPdfBlob } from '../../src/services/pdf';
import { shoppingListAsReminderLines, shoppingListAsText } from '../../src/services/share';
import { buildShoppingList } from '../../src/domain/shoppingList';
import type { Meal, MealAssignment, Merchant } from '../../src/domain/types';
import { exactAmount } from '../../src/domain/types';

const merchants: Merchant[] = [
  { id: 'mer_kueck', name: 'Kück Biomarkt', order: 0, active: true },
  { id: 'mer_aldi', name: 'ALDI', order: 1, active: true },
];

const meal: Meal = {
  id: 'meal_1',
  name: 'Testgericht mit Umlauten: Möhren & Weißkohl',
  ingredients: [
    { id: 'i1', name: 'Spaghetti', amount: exactAmount(800), unit: 'g', merchantId: 'mer_kueck', packageSize: { amount: 500, unit: 'g' } },
    { id: 'i2', name: 'Möhren', amount: exactAmount(500), unit: 'g', merchantId: 'mer_aldi' },
    { id: 'i3', name: 'Salz', amount: exactAmount(1), unit: 'Prise', merchantId: null },
  ],
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const assignment: MealAssignment = {
  id: 'a1',
  weekId: '2026-W38',
  date: '2026-09-14',
  mealId: 'meal_1',
  personIds: [],
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function list(assignments: MealAssignment[] = [assignment]) {
  return buildShoppingList({ weekId: '2026-W38', assignments, meals: [meal], merchants, lineStates: {} });
}

describe('PDF', () => {
  it('benennt die Datei nach Kalenderwoche und Jahr', () => {
    expect(shoppingListFileName(list())).toBe('Einkaufsliste_KW38_2026.pdf');
  });

  it('erzeugt ein PDF mit Kopfdaten und allen Haendlergruppen', async () => {
    const doc = await createShoppingListPdf(list());
    const text = doc.output('datauristring');
    expect(text.startsWith('data:application/pdf')).toBe(true);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('erzeugt einen nicht-leeren Blob', async () => {
    const blob = await shoppingListPdfBlob(list());
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);
  });

  it('kommt mit einer leeren Woche zurecht, statt zu scheitern', async () => {
    const doc = await createShoppingListPdf(list([]));
    expect(doc.getNumberOfPages()).toBe(1);
  });
});

describe('Textausgaben', () => {
  it('gibt die Liste nach Haendlern gruppiert aus', () => {
    const text = shoppingListAsText(list());
    expect(text).toContain('Einkaufsliste KW 38/2026');
    expect(text).toContain('14.09.2026 – 20.09.2026');
    expect(text).toContain('KÜCK BIOMARKT');
    expect(text).toContain('Spaghetti – 800 g (2 × 500 g)');
    expect(text).toContain('UNKLAR');
  });

  it('erzeugt fuer Apple Erinnerungen eine Zeile je Artikel', () => {
    const lines = shoppingListAsReminderLines(list()).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('[');
    expect(lines.some((line) => line.includes('Unklar'))).toBe(true);
  });

  it('sagt bei leerer Woche verstaendlich Bescheid', () => {
    expect(shoppingListAsText(list([]))).toContain('nichts einzukaufen');
    expect(shoppingListAsReminderLines(list([]))).toBe('');
  });
});
