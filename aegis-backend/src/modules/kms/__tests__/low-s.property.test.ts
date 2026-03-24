import * as fc from 'fast-check';
import { normalize, CURVE_ORDER, HALF_CURVE_ORDER } from '@/modules/kms/low-s-normalizer';

/**
 * Convert a BigInt to a 32-byte big-endian Buffer.
 */
function bigIntToBuffer(value: bigint): Buffer {
  const hex = value.toString(16).padStart(64, '0');
  return Buffer.from(hex, 'hex');
}

/**
 * Convert a Buffer to a BigInt (unsigned, big-endian).
 */
function bufferToBigInt(buf: Buffer): bigint {
  if (buf.length === 0) return 0n;
  return BigInt('0x' + buf.toString('hex'));
}

/**
 * Arbitrary for a high-S value: HALF_CURVE_ORDER < s < CURVE_ORDER.
 */
const highSArb = fc
  .bigUintN(256)
  .filter((s) => s > HALF_CURVE_ORDER && s < CURVE_ORDER);

/**
 * Arbitrary for a valid S value: 0 < s < CURVE_ORDER.
 */
const validSArb = fc
  .bigUintN(256)
  .filter((s) => s > 0n && s < CURVE_ORDER);

/**
 * Arbitrary for a random 32-byte r buffer.
 */
const rArb = fc.uint8Array({ minLength: 32, maxLength: 32 }).map((a) => Buffer.from(a));

describe('Low-S Normalizer Property Tests', () => {
  // Feature: aegis-protocol, Property 4: Low-S Normalization Produces Low-S
  // **Validates: Requirements 4.3**
  it('Property 4: Low-S Normalization Produces Low-S — normalizing high-S produces s <= HALF_CURVE_ORDER', () => {
    fc.assert(
      fc.property(rArb, highSArb, (r, sVal) => {
        const s = bigIntToBuffer(sVal);
        const result = normalize(r, s);
        const resultS = bufferToBigInt(result.s);
        expect(resultS <= HALF_CURVE_ORDER).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: aegis-protocol, Property 5: Low-S Normalization Idempotence
  // **Validates: Requirements 4.4, 4.6**
  it('Property 5: Low-S Normalization Idempotence — normalize(normalize(r, s)) equals normalize(r, s)', () => {
    fc.assert(
      fc.property(rArb, validSArb, (r, sVal) => {
        const s = bigIntToBuffer(sVal);
        const first = normalize(r, s);
        const second = normalize(first.r, first.s);
        expect(second.r).toEqual(first.r);
        expect(second.s).toEqual(first.s);
      }),
      { numRuns: 100 },
    );
  });
});
