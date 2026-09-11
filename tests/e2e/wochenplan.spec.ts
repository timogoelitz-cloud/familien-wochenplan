import { expect, test } from '@playwright/test';
import { day, dragTo, goToView, loadDemoMeals, openAssignment, openFreshApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await openFreshApp(page);
});

test('zeigt beim Start die aktuelle Woche mit allen sieben Tagen', async ({ page }) => {
  await expect(page.getByRole('region', { name: /Montag/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /Sonntag/ })).toBeVisible();
  await expect(page.locator('[data-day-index]')).toHaveCount(7);
  // "Heute" erscheint nur, wenn eine andere als die aktuelle Woche offen ist.
  await expect(page.getByRole('button', { name: 'Heute' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Unsere Gerichte' })).toBeVisible();
});

test('Gericht von Hand anlegen', async ({ page }) => {
  await goToView(page, 'Gerichte');
  await page.getByRole('button', { name: '+ Neues Gericht' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Kartoffelsuppe');
  await dialog.getByRole('button', { name: '+ Zutat' }).click();
  await dialog.getByLabel('Zutat 1 – Name').fill('Kartoffeln');
  await dialog.getByLabel('Zutat 1 – Menge').fill('1000');
  await dialog.getByLabel('Zutat 1 – Einheit').selectOption('g');
  await dialog.getByRole('button', { name: 'Speichern' }).click();

  await expect(page.getByRole('heading', { name: 'Kartoffelsuppe' })).toBeVisible();

  // Das neue Gericht steht sofort im Pool des Wochenplans zur Verfuegung.
  await goToView(page, 'Wochenplan');
  await expect(page.getByRole('button', { name: /Kartoffelsuppe/ })).toBeVisible();
});

test('Gericht per Tippen einem Tag zuordnen und Personen auswählen', async ({ page }) => {
  await loadDemoMeals(page);
  await goToView(page, 'Wochenplan');

  // Schritt 1: Gericht antippen (vormerken).
  await page.getByRole('button', { name: /DEMO: Nudeln mit Tomatensauce/ }).click();
  await expect(page.getByText(/vorgemerkt/)).toBeVisible();

  // Schritt 2: Tag antippen.
  await day(page, 0).getByRole('button', { name: 'Hier einsetzen' }).click();
  await expect(day(page, 0).getByText('DEMO: Nudeln mit Tomatensauce')).toBeVisible();

  // Personen zuordnen.
  await openAssignment(page, 0);
  await day(page, 0).getByRole('button', { name: 'Timo auswählen' }).click();
  await day(page, 0).getByRole('button', { name: 'Mika auswählen' }).click();
  await expect(day(page, 0).getByRole('button', { name: 'Timo abwählen' })).toBeVisible();
  await expect(day(page, 0).getByRole('button', { name: 'Mika abwählen' })).toBeVisible();
  await expect(day(page, 0).getByRole('button', { name: 'Sandra auswählen' })).toBeVisible();
});

test('zweites Gericht am selben Tag hinzufügen', async ({ page }) => {
  await loadDemoMeals(page);
  await goToView(page, 'Wochenplan');

  await page.getByRole('button', { name: /DEMO: Nudeln mit Tomatensauce/ }).click();
  await day(page, 0).getByRole('button', { name: 'Hier einsetzen' }).click();

  await page.getByRole('button', { name: /DEMO: Großer Salat/ }).click();
  await day(page, 0).getByRole('button', { name: 'Hier einsetzen' }).click();

  await expect(day(page, 0).getByText('DEMO: Nudeln mit Tomatensauce')).toBeVisible();
  await expect(day(page, 0).getByText('DEMO: Großer Salat')).toBeVisible();
});

test('Gericht per Drag & Drop auf einen Tag ziehen', async ({ page }) => {
  await loadDemoMeals(page);
  await goToView(page, 'Wochenplan');

  const card = page.locator('[data-testid^="pool-meal-"]').first();
  await dragTo(page, `[data-testid="${await card.getAttribute('data-testid')}"]`, '[data-day-index="2"]');

  await expect(day(page, 2).locator('[data-testid^="assignment-"]')).toHaveCount(1);
});

test('Gericht von einem Tag auf einen anderen verschieben und wieder entfernen', async ({ page }) => {
  await loadDemoMeals(page);
  await goToView(page, 'Wochenplan');

  await page.getByRole('button', { name: /DEMO: Großer Salat/ }).click();
  await day(page, 0).getByRole('button', { name: 'Hier einsetzen' }).click();
  await expect(day(page, 0).locator('[data-testid^="assignment-"]')).toHaveCount(1);

  const assignment = await day(page, 0).locator('[data-testid^="assignment-"]').getAttribute('data-testid');
  await dragTo(page, `[data-testid="${assignment}"]`, '[data-day-index="4"]');
  await expect(day(page, 0).locator('[data-testid^="assignment-"]')).toHaveCount(0);
  await expect(day(page, 4).locator('[data-testid^="assignment-"]')).toHaveCount(1);

  await day(page, 4).getByRole('button', { name: /von diesem Tag entfernen/ }).click();
  await expect(day(page, 4).locator('[data-testid^="assignment-"]')).toHaveCount(0);
});

test('Woche wechseln und gespeicherte Woche wieder öffnen', async ({ page }) => {
  await loadDemoMeals(page);
  await goToView(page, 'Wochenplan');

  await page.getByRole('button', { name: /DEMO: Nudeln mit Tomatensauce/ }).click();
  await day(page, 0).getByRole('button', { name: 'Hier einsetzen' }).click();
  await expect(day(page, 0).getByText('DEMO: Nudeln mit Tomatensauce')).toBeVisible();

  // Naechste Woche ist leer ...
  await page.getByRole('button', { name: 'Nächste Woche' }).click();
  await expect(day(page, 0).locator('[data-testid^="assignment-"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Heute' })).toBeVisible();

  // ... und die urspruengliche Woche ist beim Zurueckblaettern noch da.
  await page.getByRole('button', { name: 'Vorige Woche' }).click();
  await expect(day(page, 0).getByText('DEMO: Nudeln mit Tomatensauce')).toBeVisible();

  // Auch nach einem kompletten Neuladen der App (IndexedDB-Persistenz).
  await page.reload();
  await expect(day(page, 0).getByText('DEMO: Nudeln mit Tomatensauce')).toBeVisible();
});
