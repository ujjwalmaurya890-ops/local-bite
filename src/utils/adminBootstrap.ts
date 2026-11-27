import { timingSafeEqual } from 'node:crypto';

export function matchesBootstrapToken(configuredToken: string, suppliedToken: unknown): boolean {
  if (!configuredToken || typeof suppliedToken !== 'string') return false;
  const expected = Buffer.from(configuredToken);
  const actual = Buffer.from(suppliedToken);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
