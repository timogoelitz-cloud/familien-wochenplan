/**
 * Teilen der Einkaufsliste.
 *
 * Bewusste Einschraenkung: Version 1 laeuft ohne Server. Ein echter
 * Mailversand wuerde Zugangsdaten im Browser erfordern -- das waere unsicher
 * und wird deshalb NICHT gebaut. Stattdessen:
 *   1. Web Share API mit Datei (iPadOS/Safari: PDF an Mail, Nachrichten, ... uebergeben)
 *   2. Web Share API ohne Datei (nur Text)
 *   3. mailto: mit vorbereitetem Text
 *   4. Download des PDF
 * Die Schnittstelle `MailProvider` weiter unten beschreibt, wie ein spaeterer
 * serverseitiger Versand angebunden wuerde, ohne heute etwas vorzutaeuschen.
 */
import type { AppSettings, ShoppingList } from '../domain/types';
import { formatQuantity } from '../domain/units';
import { formatDateDE } from '../domain/week';
import { shoppingListFileName, shoppingListPdfBlob } from './pdf';

export type ShareOutcome =
  | { kind: 'shared-file' }
  | { kind: 'shared-text' }
  | { kind: 'downloaded'; fileName: string }
  | { kind: 'cancelled' };

/** Loest einen Download im Browser aus. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Erst nach dem Klick freigeben, sonst bricht Safari den Download ab.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Einkaufsliste als schlichter Text, z. B. fuer Nachrichten oder die Zwischenablage. */
export function shoppingListAsText(list: ShoppingList): string {
  const lines: string[] = [
    `Einkaufsliste KW ${list.isoWeek}/${list.isoYear}`,
    `${formatDateDE(list.startDate)} – ${formatDateDE(list.endDate)}`,
    '',
  ];
  for (const group of list.groups) {
    if (group.items.length === 0) continue;
    lines.push(group.merchantName.toUpperCase());
    for (const item of group.items) {
      const packaging = item.packaging
        ? ` (${item.packaging.packages} × ${formatQuantity(item.packaging.packageSize.amount, item.packaging.packageSize.unit)})`
        : '';
      lines.push(`- ${item.name} – ${formatQuantity(item.amount, item.unit)}${packaging}`);
    }
    lines.push('');
  }
  if (list.groups.every((group) => group.items.length === 0)) {
    lines.push('Für diese Woche gibt es nichts einzukaufen.');
  }
  return lines.join('\n').trimEnd();
}

/**
 * Zeilenformat fuer Apple Erinnerungen.
 * Eine Zeile je Artikel -- genau das Format, das ein Kurzbefehl mit
 * "Text teilen" -> "Text aufteilen (nach Zeilen)" -> "Erinnerung hinzufuegen"
 * erwartet. Siehe docs/APPLE_SHORTCUT.md.
 */
export function shoppingListAsReminderLines(list: ShoppingList): string {
  const lines: string[] = [];
  for (const group of list.groups) {
    for (const item of group.items) {
      const packaging = item.packaging ? ` (${item.packaging.packages} × ${formatQuantity(item.packaging.packageSize.amount, item.packaging.packageSize.unit)})` : '';
      const merchant = group.merchantName ? ` [${group.merchantName}]` : '';
      lines.push(`${item.name} – ${formatQuantity(item.amount, item.unit)}${packaging}${merchant}`);
    }
  }
  return lines.join('\n');
}

function canShareFiles(files: File[]): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function' &&
    navigator.canShare({ files })
  );
}

/**
 * Teilt die Einkaufsliste als PDF. Faellt geordnet zurueck, wenn der Browser
 * das Teilen von Dateien nicht unterstuetzt (z. B. Desktop-Firefox).
 */
export async function shareShoppingList(list: ShoppingList): Promise<ShareOutcome> {
  const blob = await shoppingListPdfBlob(list);
  const fileName = shoppingListFileName(list);
  const title = `Einkaufsliste KW ${list.isoWeek}/${list.isoYear}`;

  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (canShareFiles([file])) {
    try {
      await navigator.share({ files: [file], title });
      return { kind: 'shared-file' };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return { kind: 'cancelled' };
      // Sonstiger Fehler: nicht aufgeben, sondern herunterladen.
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text: shoppingListAsText(list) });
      return { kind: 'shared-text' };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return { kind: 'cancelled' };
    }
  }

  downloadBlob(blob, fileName);
  return { kind: 'downloaded', fileName };
}

/** Oeffnet das Mailprogramm mit vorbereitetem Betreff und Text. */
export function openMailDraft(list: ShoppingList, settings: AppSettings): void {
  const subject = `Einkaufsliste KW ${list.isoWeek}/${list.isoYear}`;
  const body = `${shoppingListAsText(list)}\n\n(Das PDF bitte separat anhängen – der Browser darf Anhänge nicht selbst setzen.)`;
  const href = `mailto:${encodeURIComponent(settings.defaultShareEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
}

/** Kopiert Text in die Zwischenablage, mit Fallback fuer aeltere Browser. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Weiter zum Fallback.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Vorbereitung fuer spaeteren serverseitigen Mailversand.
 * Heute gibt es bewusst KEINE Implementierung -- ein Versand im Frontend
 * waere nur mit hinterlegten Zugangsdaten moeglich und damit unsicher.
 * ------------------------------------------------------------------ */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  attachments?: Array<{ fileName: string; mimeType: string; blob: Blob }>;
}

export interface MailProvider {
  readonly name: string;
  /** true, wenn der Provider konfiguriert und einsatzbereit ist. */
  isConfigured(): boolean;
  send(message: MailMessage): Promise<void>;
}

/** Platzhalter-Provider: meldet ehrlich, dass noch kein Versand eingerichtet ist. */
export const notConfiguredMailProvider: MailProvider = {
  name: 'nicht eingerichtet',
  isConfigured: () => false,
  async send() {
    throw new Error(
      'Es ist kein Mailversand eingerichtet. Version 1 läuft ohne Server; bitte die Einkaufsliste teilen oder herunterladen.',
    );
  },
};
