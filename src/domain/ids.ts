/** ID-Erzeugung. IDs sind opak und niemals aus Namen abgeleitet. */

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < bytes; i += 1) buf[i] = Math.floor(Math.random() * 256);
  }
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}${randomHex(8)}`;
}

export const newMealId = () => newId('meal');
export const newIngredientId = () => newId('ing');
export const newAssignmentId = () => newId('asg');
export const newMerchantId = () => newId('mer');
export const newPersonId = () => newId('per');

export function nowISO(): string {
  return new Date().toISOString();
}
