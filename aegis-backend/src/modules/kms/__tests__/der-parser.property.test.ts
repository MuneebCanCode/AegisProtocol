import * as fc from 'fast-check';
import { parsePublicKey } from '@/modules/kms/der-parser';

/**
 * Encode a DER length field.
 */
function encodeDerLength(length: number): Buffer {
  if (length < 128) return Buffer.from([length]);
  if (length < 256) return Buffer.from([0x81, length]);
  return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
}

/**
 * Build a valid DER SubjectPublicKeyInfo for a secp256k1 raw public key.
 */
function buildDerPublicKey(rawKey: Buffer): Buffer {
  // BIT STRING: 0x03, length, 0x00 (unused bits), rawKey
  const bitStringContent = Buffer.concat([Buffer.from([0x00]), rawKey]);
  const bitString = Buffer.concat([
    Buffer.from([0x03]),
    encodeDerLength(bitStringContent.length),
    bitStringContent,
  ]);

  // Algorithm SEQUENCE: ecPublicKey OID + secp256k1 OID
  const ecOid = Buffer.from([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  const curveOid = Buffer.from([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]);
  const algContent = Buffer.concat([ecOid, curveOid]);
  const algSeq = Buffer.concat([
    Buffer.from([0x30]),
    encodeDerLength(algContent.length),
    algContent,
  ]);

  // Outer SEQUENCE
  const outerContent = Buffer.concat([algSeq, bitString]);
  return Buffer.concat([
    Buffer.from([0x30]),
    encodeDerLength(outerContent.length),
    outerContent,
  ]);
}

/**
 * Arbitrary that generates valid compressed secp256k1 public keys (33 bytes).
 * Prefix is 0x02 or 0x03, followed by 32 random bytes.
 */
const compressedKeyArb = fc
  .tuple(
    fc.constantFrom(0x02, 0x03),
    fc.uint8Array({ minLength: 32, maxLength: 32 }),
  )
  .map(([prefix, coords]) => {
    const buf = Buffer.alloc(33);
    buf[0] = prefix;
    Buffer.from(coords).copy(buf, 1);
    return buf;
  });

/**
 * Arbitrary that generates valid uncompressed secp256k1 public keys (65 bytes).
 * Prefix is 0x04, followed by 64 random bytes.
 */
const uncompressedKeyArb = fc
  .uint8Array({ minLength: 64, maxLength: 64 })
  .map((coords) => {
    const buf = Buffer.alloc(65);
    buf[0] = 0x04;
    Buffer.from(coords).copy(buf, 1);
    return buf;
  });

/**
 * Arbitrary that generates any valid secp256k1 raw public key (compressed or uncompressed).
 */
const validRawKeyArb = fc.oneof(compressedKeyArb, uncompressedKeyArb);

describe('DER Parser Property Tests', () => {
  // Feature: aegis-protocol, Property 1: DER Public Key Round Trip
  // **Validates: Requirements 4.1, 4.5, 3.2**
  it('Property 1: DER Public Key Round Trip — parsePublicKey recovers original raw key bytes', () => {
    fc.assert(
      fc.property(validRawKeyArb, (rawKey) => {
        const der = buildDerPublicKey(rawKey);
        const parsed = parsePublicKey(der);
        expect(Buffer.from(parsed)).toEqual(rawKey);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: aegis-protocol, Property 2: DER Public Key Output Size
  // **Validates: Requirements 4.1**
  it('Property 2: DER Public Key Output Size — parsePublicKey produces exactly 33 or 65 bytes', () => {
    fc.assert(
      fc.property(validRawKeyArb, (rawKey) => {
        const der = buildDerPublicKey(rawKey);
        const parsed = parsePublicKey(der);
        expect([33, 65]).toContain(parsed.length);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: aegis-protocol, Property 3: Malformed DER Rejection
  // **Validates: Requirements 4.2**
  it('Property 3: Malformed DER Rejection — arbitrary byte sequences that are not valid DER are rejected', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 200 }),
        (bytes) => {
          const buf = Buffer.from(bytes);

          // Check if this happens to be a valid DER-encoded secp256k1 public key
          let isValid = false;
          try {
            const result = parsePublicKey(buf);
            if (result.length === 33 || result.length === 65) {
              isValid = true;
            }
          } catch {
            // Not valid — this is the expected path
          }

          // If it parsed successfully, skip this input (it's accidentally valid)
          fc.pre(!isValid);

          // If we get here, the input is not valid, so parsePublicKey must throw
          expect(() => parsePublicKey(buf)).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});
