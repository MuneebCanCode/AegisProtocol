/**
 * Low-S Normalizer for ECDSA signatures on the secp256k1 curve.
 *
 * Hedera requires all ECDSA signatures to use "low-S" form, meaning the
 * S component must be at or below half the curve order. If S exceeds
 * curveOrder / 2, it is replaced with curveOrder - S.
 *
 * This ensures signature malleability is eliminated — each (r, s) pair
 * has exactly one canonical representation.
 */

// secp256k1 curve order (n)
const CURVE_ORDER = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141'
);

// Half the curve order — the threshold for low-S
const HALF_CURVE_ORDER = CURVE_ORDER / 2n;

/**
 * Convert a Buffer to a BigInt (unsigned, big-endian).
 */
function bufferToBigInt(buf: Buffer): bigint {
  if (buf.length === 0) {
    return 0n;
  }
  return BigInt('0x' + buf.toString('hex'));
}

/**
 * Convert a BigInt to a 32-byte big-endian Buffer.
 */
function bigIntToBuffer32(value: bigint): Buffer {
  const hex = value.toString(16).padStart(64, '0');
  return Buffer.from(hex, 'hex');
}

/**
 * Normalize an ECDSA signature to low-S form.
 *
 * If S exceeds half the curve order, replace S with (curveOrder - S).
 * If S is already at or below half the curve order, return unchanged values.
 *
 * Both r and s must be 32-byte Buffers.
 *
 * @param r - The r component of the signature (32-byte Buffer)
 * @param s - The s component of the signature (32-byte Buffer)
 * @returns Object with r and s as 32-byte Buffers, with s in low-S form
 */
export function normalize(r: Buffer, s: Buffer): { r: Buffer; s: Buffer } {
  const sValue = bufferToBigInt(s);

  if (sValue > HALF_CURVE_ORDER) {
    const normalizedS = CURVE_ORDER - sValue;
    return { r: Buffer.from(r), s: bigIntToBuffer32(normalizedS) };
  }

  return { r: Buffer.from(r), s: Buffer.from(s) };
}

// Exported for testing
export { CURVE_ORDER, HALF_CURVE_ORDER };
