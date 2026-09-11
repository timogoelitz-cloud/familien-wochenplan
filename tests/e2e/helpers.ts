import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Startet die App mit leerer Datenbank, damit Tests unabhaengig voneinander sind. */
export async function openFreshApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    const databases = await indexedDB.databases?.();
    await Promise.all(
      (databases ?? []).map(
        (entry) =>
          new Promise<void>((resolve) => {
            if (!entry.name) return resolve();
            const request = indexedDB.deleteDatabase(entry.name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          }),
      ),
    );
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Wochenplan' })).toBeVisible();
}

export async function goToView(page: Page, name: 'Wochenplan' | 'Einkaufsliste' | 'Gerichte' | 'Einstellungen') {
  await page.getByRole('button', { name, exact: true }).click();
}

/** Laedt die mitgelieferten Demo-Gerichte ueber die Oberflaeche. */
export async function loadDemoMeals(page: Page): Promise<void> {
  await goToView(page, 'Gerichte');
  await page.getByTestId('load-demo').click();
  await expect(page.getByRole('heading', { name: 'DEMO: Nudeln mit Tomatensauce' })).toBeVisible();
}

/** Tag-Element anhand des Wochentags (0 = Montag). */
export function day(page: Page, index: number) {
  return page.locator(`[data-day-index="${index}"]`);
}

/**
 * Oeffnet die Personenauswahl der n-ten Gerichtskarte eines Tages.
 * Die Karte hat zwei Knoepfe (Aufklappen und Entfernen) -- hier wird gezielt
 * der erste angesprochen.
 */
export function assignmentCard(page: Page, dayIndex: number, nth = 0) {
  return day(page, dayIndex).locator('[data-testid^="assignment-"]').nth(nth);
}

export async function openAssignment(page: Page, dayIndex: number, nth = 0): Promise<void> {
  await assignmentCard(page, dayIndex, nth).locator('button').first().click();
}

/**
 * Zieht ein Element auf ein Ziel.
 * dnd-kit reagiert nicht auf einen einzelnen Sprung, deshalb wird die
 * Mausbewegung in mehreren Schritten ausgefuehrt.
 */
export async function dragTo(page: Page, source: string, target: string): Promise<void> {
  const from = page.locator(source);
  const to = page.locator(target);
  const fromBox = await from.boundingBox();
  const toBox = await to.boundingBox();
  if (!fromBox || !toBox) throw new Error('Quelle oder Ziel nicht sichtbar');

  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      fromBox.x + fromBox.width / 2 + ((toBox.x + toBox.width / 2 - fromBox.x - fromBox.width / 2) * i) / steps,
      fromBox.y + fromBox.height / 2 + ((toBox.y + toBox.height / 2 - fromBox.y - fromBox.height / 2) * i) / steps,
    );
  }
  await page.mouse.up();
}
