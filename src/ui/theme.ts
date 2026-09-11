/** Farbzuordnung fuer Personen und Wochentage. */

export interface ColorSet {
  /** Hintergrund fuer Chips. */
  chip: string;
  /** Text auf dem Chip. */
  chipText: string;
  /** Kraeftige Variante fuer aktive Zustaende. */
  solid: string;
  /** Akzentlinie. */
  accent: string;
}

export const PERSON_COLORS: Record<string, ColorSet> = {
  ocean: { chip: 'bg-[#e3eef7]', chipText: 'text-[#28587f]', solid: 'bg-[#3f7cac] text-white', accent: 'border-[#3f7cac]' },
  berry: { chip: 'bg-[#f8e6ef]', chipText: 'text-[#8a3a60]', solid: 'bg-[#b5527f] text-white', accent: 'border-[#b5527f]' },
  leaf: { chip: 'bg-[#e8f2e0]', chipText: 'text-[#44682e]', solid: 'bg-[#5b8c3e] text-white', accent: 'border-[#5b8c3e]' },
  sun: { chip: 'bg-[#fbf0d8]', chipText: 'text-[#8a6210]', solid: 'bg-[#d99a1f] text-white', accent: 'border-[#d99a1f]' },
  slate: { chip: 'bg-[#eceae7]', chipText: 'text-[#57514c]', solid: 'bg-[#77706a] text-white', accent: 'border-[#77706a]' },
};

export const PERSON_COLOR_KEYS = Object.keys(PERSON_COLORS);

export function personColors(colorKey: string): ColorSet {
  return PERSON_COLORS[colorKey] ?? PERSON_COLORS.slate!;
}

/** Dezente, unterscheidbare Farbe je Wochentag (Index 0 = Montag). */
export const WEEKDAY_TINTS = [
  { bar: 'bg-[#e07a5f]', soft: 'bg-[#fdf0ec]' },
  { bar: 'bg-[#d99a1f]', soft: 'bg-[#fdf6e7]' },
  { bar: 'bg-[#5b8c3e]', soft: 'bg-[#f0f6ea]' },
  { bar: 'bg-[#6b9080]', soft: 'bg-[#eef4f1]' },
  { bar: 'bg-[#3f7cac]', soft: 'bg-[#ecf3f9]' },
  { bar: 'bg-[#b5527f]', soft: 'bg-[#fbeef4]' },
  { bar: 'bg-[#8a6fb0]', soft: 'bg-[#f3eff9]' },
] as const;

export function weekdayTint(index: number) {
  return WEEKDAY_TINTS[index] ?? WEEKDAY_TINTS[0];
}
