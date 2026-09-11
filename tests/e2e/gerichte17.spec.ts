import { expect, test } from '@playwright/test';
import { day, goToView, openAssignment, openFreshApp } from './helpers';

async function loadSeed(page: import('@playwright/test').Page) {
  await goToView(page, 'Gerichte');
  await page.getByTestId('load-seed').click();
  await expect(page.getByRole('heading', { name: '1. Nudeln mit Tomatensauce' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openFreshApp(page);
});

test('lädt alle 17 Gerichte mit ihrer Nummerierung', async ({ page }) => {
  await loadSeed(page);
  await expect(page.getByRole('heading', { name: /^\d+\. / })).toHaveCount(17);
  await expect(page.getByRole('heading', { name: '17. Pizza Margherita oder Spinatpizza' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '9. Nudeln mit Bolognese / Hackfleischgericht' })).toBeVisible();
});

test('legt beim zweiten Laden keine Duplikate an', async ({ page }) => {
  await loadSeed(page);
  await page.getByTestId('load-seed').click();
  await expect(page.getByText('Alle 17 Gerichte sind bereits vorhanden.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^\d+\. / })).toHaveCount(17);
});

test('setzt bei „Reis oder Kartoffeln" nur die gewählte Beilage auf die Liste', async ({ page }) => {
  await loadSeed(page);
  await goToView(page, 'Wochenplan');

  const pool = page.getByRole('region', { name: 'Unsere Gerichte' });
  await pool.getByRole('button', { name: /Hähnchen mit Kartoffeln oder Reis/ }).first().click();
  await day(page, 0).getByRole('button', { name: 'Hier einsetzen' }).click();

  // Standard ist Kartoffeln.
  await goToView(page, 'Einkaufsliste');
  await expect(page.getByRole('region', { name: 'Unklar' })).toContainText('Kartoffeln');
  await expect(page.getByRole('region', { name: 'Unklar' })).not.toContainText('Reis');

  // Auf Reis umstellen.
  await goToView(page, 'Wochenplan');
  await openAssignment(page, 0);
  await day(page, 0).getByRole('button', { name: 'Reis', exact: true }).click();

  await goToView(page, 'Einkaufsliste');
  await expect(page.getByRole('region', { name: 'Unklar' })).toContainText('Reis');
  await expect(page.getByRole('region', { name: 'Unklar' })).not.toContainText('Kartoffeln');
});

test('zeigt Mengenbereiche als Bereich und summiert sie korrekt', async ({ page }) => {
  await loadSeed(page);
  await goToView(page, 'Wochenplan');

  const pool = page.getByRole('region', { name: 'Unsere Gerichte' });
  // Gericht 1 und 9 bringen beide 700–800 ml passierte Tomaten mit.
  await pool.getByRole('button', { name: /1\. Nudeln mit Tomatensauce/ }).first().click();
  await day(page, 0).getByRole('button', { name: 'Hier einsetzen' }).click();
  await pool.getByRole('button', { name: /9\. Nudeln mit Bolognese/ }).first().click();
  await day(page, 2).getByRole('button', { name: 'Hier einsetzen' }).click();

  await goToView(page, 'Einkaufsliste');
  const tomaten = page.locator('li').filter({ hasText: 'Passierte Tomaten' }).first();
  await expect(tomaten).toContainText('1,4–1,6 l');
});

test('führt Öl und Gewürze nicht in der Kaufliste, sondern unter „Bitte nachsehen"', async ({ page }) => {
  await loadSeed(page);
  await goToView(page, 'Wochenplan');
  const pool = page.getByRole('region', { name: 'Unsere Gerichte' });
  await pool.getByRole('button', { name: /1\. Nudeln mit Tomatensauce/ }).first().click();
  await day(page, 0).getByRole('button', { name: 'Hier einsetzen' }).click();

  await goToView(page, 'Einkaufsliste');
  const nachsehen = page.getByRole('region', { name: 'Bitte im Vorrat nachsehen' });
  await expect(nachsehen).toBeVisible();
  await expect(nachsehen).toContainText('Öl');
  await expect(page.getByRole('region', { name: 'Unklar' })).not.toContainText('Öl');
});

test('nimmt optionale Zutaten erst auf, wenn sie gewählt sind', async ({ page }) => {
  await loadSeed(page);
  await goToView(page, 'Wochenplan');
  const pool = page.getByRole('region', { name: 'Unsere Gerichte' });
  await pool.getByRole('button', { name: /1\. Nudeln mit Tomatensauce/ }).first().click();
  await day(page, 0).getByRole('button', { name: 'Hier einsetzen' }).click();

  await goToView(page, 'Einkaufsliste');
  await expect(page.locator('main')).not.toContainText('Geriebener Käse');

  await goToView(page, 'Wochenplan');
  await openAssignment(page, 0);
  await day(page, 0).getByRole('button', { name: /Geriebener Käse/ }).click();

  await goToView(page, 'Einkaufsliste');
  await expect(page.locator('main')).toContainText('Geriebener Käse');
});

test('Beispiel aus der Vorgabe: Sandras Salat bringt kein Hackfleisch mit', async ({ page }) => {
  await loadSeed(page);
  await goToView(page, 'Wochenplan');
  const pool = page.getByRole('region', { name: 'Unsere Gerichte' });

  // Timo, Mika, Thore: Gericht 9
  await pool.getByRole('button', { name: /9\. Nudeln mit Bolognese/ }).first().click();
  await day(page, 0).getByRole('button', { name: 'Hier einsetzen' }).click();
  await openAssignment(page, 0, 0);
  for (const person of ['Timo', 'Mika', 'Thore']) {
    await day(page, 0).getByRole('button', { name: `${person} auswählen` }).click();
  }
  await openAssignment(page, 0, 0);

  // Sandra: Gericht 7
  await pool.getByRole('button', { name: /7\. Salat mit Käse/ }).first().click();
  await day(page, 0).getByRole('button', { name: 'Hier einsetzen' }).click();
  await openAssignment(page, 0, 1);
  await day(page, 0).getByRole('button', { name: 'Sandra auswählen' }).click();

  await goToView(page, 'Einkaufsliste');
  const liste = page.locator('main');
  await expect(liste).toContainText('Rinderhack');
  await expect(liste).toContainText('Käse');
  // Fisch ist bei Gericht 7 nicht vorgewaehlt.
  await expect(page.getByRole('region', { name: 'Unklar' })).not.toContainText('Fisch');
});
