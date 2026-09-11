import type { Person } from '../../domain/types';
import { personColors } from '../theme';

interface Props {
  person: Person;
  selected?: boolean;
  onToggle?: () => void;
  size?: 'sm' | 'md';
}

/**
 * Personen-Chip. Als Schalter (mit onToggle) oder als reine Anzeige.
 * Der Zustand wird nicht nur ueber Farbe vermittelt, sondern zusaetzlich
 * ueber ein Haken-Symbol und aria-pressed.
 */
export function PersonChip({ person, selected = false, onToggle, size = 'md' }: Props) {
  const colors = personColors(person.colorKey);
  const padding = size === 'sm' ? 'px-2.5 py-1 text-sm' : 'px-3.5 py-2 text-base';

  if (!onToggle) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-semibold ${padding} ${colors.chip} ${colors.chipText}`}
      >
        {person.name}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`${person.name} ${selected ? 'abwählen' : 'auswählen'}`}
      className={`tap inline-flex items-center gap-1.5 rounded-full border-2 font-semibold transition-colors ${padding} ${
        selected
          ? `${colors.solid} border-transparent`
          : `border-dashed border-[color:var(--color-line)] bg-white text-[color:var(--color-muted)]`
      }`}
    >
      <span aria-hidden="true" className="text-xs">
        {selected ? '✓' : '+'}
      </span>
      {person.name}
    </button>
  );
}

/** Kompakte Darstellung der zugeordneten Personen auf einer Gerichtskarte. */
export function PersonBadges({ persons }: { persons: Person[] }) {
  if (persons.length === 0) {
    return <span className="text-sm text-[color:var(--color-muted)]">Niemand zugeordnet</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {persons.map((person) => {
        const colors = personColors(person.colorKey);
        return (
          <span
            key={person.id}
            title={person.name}
            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold ${colors.solid}`}
          >
            {person.initials}
          </span>
        );
      })}
    </span>
  );
}
