import { describe, expect, it } from 'vitest';
import { calculatePackages } from '../../src/domain/packaging';

describe('Packungsberechnung', () => {
  it('rechnet das Beispiel aus der Aufgabenstellung', () => {
    // Bedarf 800 g, Packung 500 g -> 2 Packungen, 1000 g gekauft, 200 g uebrig.
    const result = calculatePackages(800, 'g', { amount: 500, unit: 'g' });
    expect(result).toEqual({
      packages: 2,
      packageSize: { amount: 500, unit: 'g' },
      purchasedAmount: 1000,
      surplus: 200,
    });
  });

  it('rundet immer auf', () => {
    expect(calculatePackages(501, 'g', { amount: 500, unit: 'g' })?.packages).toBe(2);
    expect(calculatePackages(1, 'g', { amount: 500, unit: 'g' })?.packages).toBe(1);
    expect(calculatePackages(1499, 'g', { amount: 500, unit: 'g' })?.packages).toBe(3);
  });

  it('rundet bei exakt aufgehendem Bedarf nicht unnoetig auf', () => {
    const result = calculatePackages(1000, 'g', { amount: 500, unit: 'g' });
    expect(result?.packages).toBe(2);
    expect(result?.surplus).toBe(0);
  });

  it('rechnet ueber Einheiten derselben Dimension', () => {
    // Bedarf 1,2 kg, Packung 500 g -> 3 Packungen (1500 g), 0,3 kg uebrig.
    const result = calculatePackages(1.2, 'kg', { amount: 500, unit: 'g' });
    expect(result?.packages).toBe(3);
    expect(result?.purchasedAmount).toBe(1.5);
    expect(result?.surplus).toBe(0.3);
  });

  it('leidet nicht unter Fliesskomma-Rundungsfehlern', () => {
    // 0,1 + 0,2 = 0,30000000000000004 -> darf keine 4. Packung ausloesen.
    const result = calculatePackages(0.1 + 0.2, 'l', { amount: 100, unit: 'ml' });
    expect(result?.packages).toBe(3);
  });

  it('verweigert die Rechnung bei unpassenden Dimensionen', () => {
    // Bedarf in Stueck, Packung in Gramm -> nicht berechenbar.
    expect(calculatePackages(3, 'Stk', { amount: 500, unit: 'g' })).toBeNull();
    expect(calculatePackages(500, 'g', { amount: 1, unit: 'l' })).toBeNull();
  });

  it('liefert null ohne Packungsgroesse', () => {
    expect(calculatePackages(800, 'g', null)).toBeNull();
    expect(calculatePackages(800, 'g', undefined)).toBeNull();
    expect(calculatePackages(800, 'g', { amount: 0, unit: 'g' })).toBeNull();
  });

  it('rechnet auch fuer Stueckeinheiten', () => {
    // Bedarf 7 Stk, Packung 6 Stk -> 2 Packungen, 5 Stk uebrig.
    const result = calculatePackages(7, 'Stk', { amount: 6, unit: 'Stk' });
    expect(result?.packages).toBe(2);
    expect(result?.surplus).toBe(5);
  });
});
