import { expect, test } from '@playwright/test';
import { goToView, loadDemoMeals, openFreshApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await openFreshApp(page);
});

test('lehnt eine fehlerhafte Import-Datei ab, ohne etwas zu speichern', async ({ page }) => {
  await goToView(page, 'Gerichte');

  await page.setInputFiles('input[type="file"]', {
    name: 'kaputt.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ meals: [{ name: 'Falsche Einheit', ingredients: [{ name: 'Mehl', amount: 1, unit: 'Sack' }] }] }),
    ),
  });

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Der Import wurde abgebrochen');
  await expect(alert).toContainText('Sack');
  // Nichts gespeichert: die Ansicht zeigt weiterhin den Leerzustand.
  await expect(page.getByRole('heading', { name: 'Noch keine Gerichte' })).toBeVisible();
});

test('meldet ungültiges JSON verständlich', async ({ page }) => {
  await goToView(page, 'Gerichte');
  await page.setInputFiles('input[type="file"]', {
    name: 'kaputt.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ das ist kein json'),
  });
  await expect(page.getByRole('alert')).toContainText('kein gültiges JSON');
});

test('importiert eine gültige Datei und ordnet Händler zu', async ({ page }) => {
  await goToView(page, 'Gerichte');
  await page.setInputFiles('input[type="file"]', {
    name: 'gerichte.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'familien-wochenplan/meals',
        version: 1,
        meals: [
          {
            name: 'Linseneintopf',
            servings: 4,
            ingredients: [
              { name: 'Linsen', amount: 500, unit: 'g', merchant: 'Kück Biomarkt', packageSize: { amount: 250, unit: 'g' } },
              { name: 'Suppengemüse', amount: 1, unit: 'Bund', merchant: 'Unbekannter Laden' },
            ],
          },
        ],
      }),
    ),
  });

  await expect(page.getByRole('heading', { name: 'Linseneintopf' })).toBeVisible();
  // Unbekannter Haendler wird nicht geraten, sondern als Hinweis gemeldet.
  await expect(page.getByRole('alert')).toContainText('Unbekannter Laden');
});

test('Sicherung herunterladen und Gerichte deaktivieren', async ({ page }) => {
  await loadDemoMeals(page);

  await goToView(page, 'Einstellungen');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sicherung herunterladen' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Wochenplan-Sicherung_\d{4}-\d{2}-\d{2}\.json$/);

  // Deaktivierte Gerichte verschwinden aus dem Wochenplan-Pool, bleiben aber erhalten.
  await goToView(page, 'Gerichte');
  const card = page.locator('li').filter({ hasText: 'DEMO: Großer Salat' });
  await card.getByRole('button', { name: 'Deaktivieren' }).click();
  await expect(card.getByRole('button', { name: 'Aktivieren' })).toBeVisible();

  await goToView(page, 'Wochenplan');
  await expect(page.getByRole('button', { name: /DEMO: Großer Salat/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /DEMO: Nudelauflauf/ })).toBeVisible();
});

test('neuer Händler steht sofort im Gericht-Editor zur Verfügung', async ({ page }) => {
  await goToView(page, 'Einstellungen');
  await page.getByPlaceholder('Neuer Händler…').fill('Hofladen Meyer');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();

  await goToView(page, 'Gerichte');
  await page.getByRole('button', { name: '+ Neues Gericht' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '+ Zutat' }).click();
  await expect(page.getByRole('dialog').getByLabel('Zutat 1 – Händler')).toContainText('Hofladen Meyer');
});
