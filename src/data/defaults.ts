/**
 * Startstammdaten.
 *
 * Enthaelt ausschliesslich Angaben, die in der Aufgabenstellung ausdruecklich
 * genannt sind (Familienmitglieder, Haendlernamen, Standardempfaenger).
 * Es werden hier keine Rezepte, Zutaten oder Produkt-Haendler-Zuordnungen
 * erfunden -- die echten Gerichte kommen ueber den Import.
 */
import type { AppSettings, Merchant, Person } from '../domain/types';
import { nowISO } from '../domain/ids';

export const DEFAULT_PERSONS: Person[] = [
  { id: 'per_timo', name: 'Timo', initials: 'TI', colorKey: 'ocean', active: true, order: 0 },
  { id: 'per_sandra', name: 'Sandra', initials: 'SA', colorKey: 'berry', active: true, order: 1 },
  { id: 'per_mika', name: 'Mika', initials: 'MI', colorKey: 'leaf', active: true, order: 2 },
  { id: 'per_thore', name: 'Thore', initials: 'TH', colorKey: 'sun', active: true, order: 3 },
];

/**
 * Bekannte Haendler. "Unklar" ist bewusst KEIN Datensatz, sondern wird im
 * Datenmodell durch `merchantId === null` dargestellt -- so gibt es nur eine
 * einzige Repraesentation des unbekannten Haendlers.
 */
export const DEFAULT_MERCHANTS: Merchant[] = [
  { id: 'mer_kueck', name: 'Kück Biomarkt', order: 0, active: true },
  { id: 'mer_aldi', name: 'ALDI', order: 1, active: true },
  { id: 'mer_dm', name: 'dm', order: 2, active: true },
  { id: 'mer_lei', name: 'Naturschlachterei Lei', order: 3, active: true },
  { id: 'mer_nahundgut', name: 'Nah & Gut', order: 4, active: true },
  { id: 'mer_biolandhof', name: 'Biolandhof', order: 5, active: true },
  { id: 'mer_musswessels', name: 'Musswessels', order: 6, active: true },
  { id: 'mer_sonstige', name: 'Sonstige', order: 7, active: true },
];

export function defaultSettings(): AppSettings {
  return {
    id: 'app',
    appleReminderListName: 'Einkaufen',
    appleShortcutName: 'Einkaufsliste uebernehmen',
    updatedAt: nowISO(),
  };
}
