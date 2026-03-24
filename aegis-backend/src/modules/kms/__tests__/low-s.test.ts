import { normalize, CURVE_ORDER, HALF_CURVE_ORDER } from '../low-s-normalizer';

/**
 * Helper: convert a BigInt to a 32-byte Buffer.
 */
function bigIntToBuf(value: bigint): Buffer {
  const hex = value.toString(16).padStart(64, '0');
  return Buffer.from(hex, 'hex');
}

describe('Low-S Normalizer', () => {
  describe('normalize', () => {
    it('should return the same s when s is below half curve order', () => {
      const r = Buffer.alloc(32, 0xab);
      const s = bigIntToBuf(1000n);

      const result = normalize(r, s);

      expect(result.s).toEqual(s);
      expect(result.r).toEqual(r);
    });

    it('should return the same s when s equals half curve order', () => {
      const r = Buffer.alloc(32, 0x01);
      const s = bigIntToBuf(HALF_CURVE_ORDER);

      const result = normalize(r, s);

      expect(result.s).toEqual(s);
    });

    it('should normalize s when s exceeds half curve order', () => {
      const r = Buffer.alloc(32, 0x01);
      const highS = HALF_CURVE_ORDER + 1n;
      const s = bigIntToBuf(highS);

      const result = normalize(r, s);

      const expectedS = CURVE_ORDER - highS;
      expect(result.s).toEqual(bigIntToBuf(expectedS));
    });

    it('should normalize s = curveOrder - 1 (maximum valid high-S)', () => {
      const r = Buffer.alloc(32, 0xff);
      const highS = CURVE_ORDER - 1n;
      const s = bigIntToBuf(highS);

      const result = normalize(r, s);

      // curveOrder - (curveOrder - 1) = 1
      expect(result.s).toEqual(bigIntToBuf(1n));
    });

    it('should not mutate the original r buffer', () => {
      const r = Buffer.alloc(32, 0xab);
      const s = bigIntToBuf(HALF_CURVE_ORDER + 1n);
      const originalR = Buffer.from(r);

      normalize(r, s);

      expect(r).toEqual(originalR);
    });

    it('should not mutate the original s buffer', () => {
      const s = bigIntToBuf(HALF_CURVE_ORDER + 1n);
      const r = Buffer.alloc(32, 0x01);
      const originalS = Buffer.from(s);

      normalize(r, s);

      expect(s).toEqual(originalS);
    });

    it('should be idempotent — normalizing twice gives the same result', () => {
      const r = Buffer.alloc(32, 0xab);
      const highS = CURVE_ORDER - 42n;
      const s = bigIntToBuf(highS);

      const first = normalize(r, s);
      const second = normalize(first.r, first.s);

      expect(second.r).toEqual(first.r);
      expect(second.s).toEqual(first.s);
    });

    it('should produce a 32-byte s buffer after normalization', () => {
      const r = Buffer.alloc(32, 0x01);
      const s = bigIntToBuf(CURVE_ORDER - 1n);

      const result = normalize(r, s);

      expect(result.r.length).toBe(32);
      expect(result.s.length).toBe(32);
    });

    it('should handle s = 1 (already low-S, no change needed)', () => {
      const r = Buffer.alloc(32, 0x01);
      const s = bigIntToBuf(1n);

      const result = normalize(r, s);

      expect(result.s).toEqual(s);
    });
  });
});
