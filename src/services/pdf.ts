/**
 * PDF-Erzeugung der Einkaufsliste -- vollstaendig lokal im Browser (jsPDF).
 * Es werden keine Daten an einen Server gesendet.
 *
 * Layout: A4 hoch, klare Haendlerbereiche, echte Kaestchen zum Abhaken,
 * Menge und Packungsangabe rechts, Kalenderwoche und Zeitraum im Kopf.
 */
import type { jsPDF } from 'jspdf';
import type { ShoppingList, ShoppingListItem } from '../domain/types';
import { formatQuantity } from '../domain/units';
import { formatDateDE } from '../domain/week';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Dateiname im Format "Einkaufsliste_KW38_2026.pdf". */
export function shoppingListFileName(list: ShoppingList): string {
  return `Einkaufsliste_KW${String(list.isoWeek).padStart(2, '0')}_${list.isoYear}.pdf`;
}

/** Zweite Zeile einer Position: Packungsangabe inkl. Überbestand. */
function packagingLine(item: ShoppingListItem): string | null {
  if (!item.packaging) return null;
  const { packages, packageSize, surplus } = item.packaging;
  const base = `Einkauf: ${packages} × ${formatQuantity(packageSize.amount, packageSize.unit)}`;
  if (surplus > 0) return `${base}   Überbestand: ${formatQuantity(surplus, item.unit)}`;
  return base;
}

/**
 * jsPDF wird erst beim ersten PDF geladen (rund 400 kB). Das haelt den Start
 * der App auf dem iPad schnell -- der Wochenplan braucht die Bibliothek nicht.
 */
export async function createShoppingListPdf(list: ShoppingList): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const newPageIfNeeded = (needed: number): boolean => {
    if (y + needed > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      y = MARGIN;
      return true;
    }
    return false;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Einkaufsliste', MARGIN, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(90);
  doc.text(`KW ${list.isoWeek} / ${list.isoYear}`, PAGE_WIDTH - MARGIN, y + 1, { align: 'right' });
  doc.text(`${formatDateDE(list.startDate)} – ${formatDateDE(list.endDate)}`, PAGE_WIDTH - MARGIN, y + 7, {
    align: 'right',
  });
  doc.setTextColor(0);
  y += 12;
  doc.setDrawColor(200);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;

  const totalItems = list.groups.reduce((sum, group) => sum + group.items.length, 0);
  if (totalItems === 0) {
    doc.setFontSize(12);
    doc.setTextColor(120);
    doc.text('Für diese Woche gibt es nichts einzukaufen.', MARGIN, y + 4);
    return doc;
  }

  for (const group of list.groups) {
    if (group.items.length === 0) continue;
    newPageIfNeeded(20);

    doc.setFillColor(244, 237, 225);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.text(group.merchantName.toUpperCase(), MARGIN + 3, y + 6.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(
      `${group.items.length} Position${group.items.length === 1 ? '' : 'en'}`,
      PAGE_WIDTH - MARGIN - 3,
      y + 6.2,
      { align: 'right' },
    );
    doc.setTextColor(0);
    y += 13;

    for (const item of group.items) {
      const extra = packagingLine(item);
      if (newPageIfNeeded(extra ? 11 : 7.5)) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(120);
        doc.text(`${group.merchantName.toUpperCase()} (Fortsetzung)`, MARGIN, y + 4);
        doc.setTextColor(0);
        y += 9;
      }

      doc.setDrawColor(90);
      doc.setLineWidth(0.35);
      doc.roundedRect(MARGIN + 1, y, 4.5, 4.5, 0.7, 0.7);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      const amountText = formatQuantity(item.amount, item.unit);
      const amountWidth = doc.getTextWidth(amountText);
      const nameWidth = Math.max(CONTENT_WIDTH - 10 - amountWidth - 4, 30);
      const nameLines = doc.splitTextToSize(item.name, nameWidth) as string[];
      doc.text(nameLines[0] ?? item.name, MARGIN + 8, y + 3.8);

      doc.setFont('helvetica', 'normal');
      doc.text(amountText, PAGE_WIDTH - MARGIN - 1, y + 3.8, { align: 'right' });
      y += 5.5;

      if (extra) {
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(extra, MARGIN + 8, y + 2.4);
        doc.setTextColor(0);
        y += 4.5;
      }

      doc.setDrawColor(228);
      doc.setLineWidth(0.2);
      doc.line(MARGIN + 8, y + 1, PAGE_WIDTH - MARGIN, y + 1);
      y += 3;
    }
    y += 5;
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(150);
    doc.text('Familien-Wochenplan', MARGIN, PAGE_HEIGHT - 8);
    doc.text(`Seite ${page} von ${pageCount}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 8, { align: 'right' });
  }

  return doc;
}

export async function shoppingListPdfBlob(list: ShoppingList): Promise<Blob> {
  const doc = await createShoppingListPdf(list);
  return doc.output('blob');
}
