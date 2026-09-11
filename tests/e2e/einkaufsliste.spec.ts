import { expect, test } from '@playwright/test';
import { day, goToView, loadDemoMeals, openFreshApp } from './helpers';

/** Legt zwei Demo-Gerichte mit gemeinsamen Zutaten in die Woche. */
async function planWeek(page: import('@playwright/test').Page) {
  await loadDemoMeals(page);
  await goToView(page, 'Wochenplan');
  await page.getByRole('button', { name: /DEMO: Nudeln mit Tomatensauce/ }).click();
  await day(page, 0).getByRole('button', { name: 'Hier einsetzen' }).click();
  await page.getByRole('button', { name: /DEMO: Nudelauflauf/ }).click();
  await day(page, 2).getByRole('button', { name: 'Hier einsetzen' }).click();
}

test.beforeEach(async ({ page }) => {
  await openFreshApp(page);
});

test('erzeugt die Einkaufsliste, fasst Zutaten zusammen und rechnet Packungen', async ({ page }) => {
  await planWeek(page);
  await goToView(page, 'Einkaufsliste');

  const kueck = page.getByRole('region', { name: 'Kück Biomarkt' });
  await expect(kueck).toBeVisible();

  // 500 g + 300 g Spaghetti = 800 g, mit 500-g-Packungen sind das 2 Packungen.
  const spaghetti = kueck.locator('li').filter({ hasText: 'Spaghetti' }).first();
  await expect(spaghetti).toContainText('800 g');
  await expect(spaghetti).toContainText('2 × 500 g');
  await expect(spaghetti).toContainText('Überbestand: 200 g');

  // Zutaten ohne Händler landen in der Gruppe "Unklar", die immer zuletzt steht.
  const groupNames = await page.locator('section[aria-label] > h2').allTextContents();
  expect(groupNames[groupNames.length - 1]).toContain('Unklar');
});

test('zeigt, aus welchen Gerichten sich ein Posten zusammensetzt', async ({ page }) => {
  await planWeek(page);
  await goToView(page, 'Einkaufsliste');

  const spaghetti = page.locator('li').filter({ hasText: 'Spaghetti' }).first();
  await spaghetti.getByRole('button', { name: 'woher?' }).click();
  await expect(spaghetti).toContainText('DEMO: Nudeln mit Tomatensauce');
  await expect(spaghetti).toContainText('DEMO: Nudelauflauf');
});

test('Artikel abhaken und Haken zurücksetzen', async ({ page }) => {
  await planWeek(page);
  await goToView(page, 'Einkaufsliste');

  await expect(page.getByText(/0 von \d+ erledigt/)).toBeVisible();

  const first = page.getByRole('checkbox').first();
  await first.click();
  await expect(first).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/1 von \d+ erledigt/)).toBeVisible();

  // Der Haken überlebt einen Wechsel der Ansicht und ein Neuladen.
  await goToView(page, 'Wochenplan');
  await goToView(page, 'Einkaufsliste');
  await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await goToView(page, 'Einkaufsliste');
  await expect(page.getByText(/1 von \d+ erledigt/)).toBeVisible();

  await page.getByRole('button', { name: 'Haken zurücksetzen' }).click();
  await expect(page.getByText(/0 von \d+ erledigt/)).toBeVisible();
});

test('Vorratsprüfung blendet vorhandene Artikel aus der Kaufliste aus', async ({ page }) => {
  await planWeek(page);
  await goToView(page, 'Einkaufsliste');

  const before = await page.getByRole('checkbox').count();

  await page.getByRole('tab', { name: '1. Vorrat prüfen' }).click();
  await page.locator('li').filter({ hasText: 'Spaghetti' }).first().getByRole('checkbox').click();
  await expect(page.getByText('1 als vorhanden markiert')).toBeVisible();

  await page.getByRole('tab', { name: '2. Einkaufen' }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(before - 1);
  await expect(page.locator('section[aria-label]')).not.toContainText('Spaghetti');
  await expect(page.getByText(/1 im Vorrat/)).toBeVisible();

  // Zuruecksetzen bringt den Artikel wieder in die Kaufliste.
  await page.getByRole('tab', { name: '1. Vorrat prüfen' }).click();
  await page.getByRole('button', { name: 'Vorrat zurücksetzen' }).click();
  await page.getByRole('tab', { name: '2. Einkaufen' }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(before);
});

test('leere Woche erklärt verständlich, was zu tun ist', async ({ page }) => {
  await goToView(page, 'Einkaufsliste');
  await expect(page.getByText(/noch keine Gerichte eingeplant/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF' })).toBeDisabled();
});

test('erzeugt ein PDF mit korrektem Dateinamen', async ({ page }) => {
  await planWeek(page);
  await goToView(page, 'Einkaufsliste');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Einkaufsliste_KW\d{2}_\d{4}\.pdf$/);
});
