import { parsePublicKey, parseSignature } from '../der-parser';

/**
 * Helper: build a DER-encoded SubjectPublicKeyInfo for secp256k1.
 *
 * Structure:
 *   SEQUENCE {
 *     SEQUENCE { OID(ecPublicKey), OID(secp256k1) }
 *     BIT STRING { 0x00 || rawKeyBytes }
 *   }
 */
function buildDerPublicKey(rawKey: Buffer): Buffer {
  const ecOid = Buffer.from([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  const curveOid = Buffer.from([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]);

  // Inner SEQUENCE (algorithm identifier)
  const algContent = Buffer.concat([ecOid, curveOid]);
  const algSeq = Buffer.concat([Buffer.from([0x30, algContent.length]), algContent]);

  // BIT STRING: 0x00 (unused bits) + raw key
  const bitStringContent = Buffer.concat([Buffer.from([0x00]), rawKey]);
  const bitString = Buffer.concat([Buffer.from([0x03, bitStringContent.length]), bitStringContent]);

  // Outer SEQUENCE
  const outerContent = Buffer.concat([algSeq, bitString]);
  const outer = Buffer.concat([Buffer.from([0x30, outerContent.length]), outerContent]);

  return outer;
}

/**
 * Helper: build a DER-encoded ECDSA signature from r and s values.
 *
 * Structure: SEQUENCE { INTEGER(r), INTEGER(s) }
 */
function buildDerSignature(r: Buffer, s: Buffer): Buffer {
  const rDer = encodeDerInteger(r);
  const sDer = encodeDerInteger(s);
  const content = Buffer.concat([rDer, sDer]);
  return Buffer.concat([Buffer.from([0x30, content.length]), content]);
}

function encodeDerInteger(value: Buffer): Buffer {
  // Add leading 0x00 if high bit is set (to keep it positive)
  let v = value;
  if (v[0] & 0x80) {
    v = Buffer.concat([Buffer.from([0x00]), v]);
  }
  return Buffer.concat([Buffer.from([0x02, v.length]), v]);
}

describe('DER Parser', () => {
  describe('parsePublicKey', () => {
    it('parses a valid uncompressed secp256k1 public key (65 bytes, 0x04 prefix)', () => {
      const rawKey = Buffer.alloc(65);
      rawKey[0] = 0x04;
      for (let i = 1; i < 65; i++) rawKey[i] = i;

      const der = buildDerPublicKey(rawKey);
      const result = parsePublicKey(der);

      expect(result).toEqual(rawKey);
      expect(result.length).toBe(65);
    });

    it('parses a valid compressed secp256k1 public key (33 bytes, 0x02 prefix)', () => {
      const rawKey = Buffer.alloc(33);
      rawKey[0] = 0x02;
      for (let i = 1; i < 33; i++) rawKey[i] = i + 10;

      const der = buildDerPublicKey(rawKey);
      const result = parsePublicKey(der);

      expect(result).toEqual(rawKey);
      expect(result.length).toBe(33);
    });

    it('parses a valid compressed secp256k1 public key with 0x03 prefix', () => {
      const rawKey = Buffer.alloc(33);
      rawKey[0] = 0x03;
      for (let i = 1; i < 33; i++) rawKey[i] = 0xff - i;

      const der = buildDerPublicKey(rawKey);
      const result = parsePublicKey(der);

      expect(result).toEqual(rawKey);
      expect(result.length).toBe(33);
    });

    it('throws on empty buffer', () => {
      expect(() => parsePublicKey(Buffer.alloc(0))).toThrow('non-empty Buffer');
    });

    it('throws on non-SEQUENCE outer tag', () => {
      const bad = Buffer.from([0x02, 0x01, 0x00]);
      expect(() => parsePublicKey(bad)).toThrow('expected SEQUENCE');
    });

    it('throws on wrong EC OID', () => {
      // Build a valid structure but with wrong EC OID
      const wrongEcOid = Buffer.from([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x02]); // last byte changed
      const curveOid = Buffer.from([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]);
      const algContent = Buffer.concat([wrongEcOid, curveOid]);
      const algSeq = Buffer.concat([Buffer.from([0x30, algContent.length]), algContent]);
      const rawKey = Buffer.alloc(33);
      rawKey[0] = 0x02;
      const bitStringContent = Buffer.concat([Buffer.from([0x00]), rawKey]);
      const bitString = Buffer.concat([Buffer.from([0x03, bitStringContent.length]), bitStringContent]);
      const outerContent = Buffer.concat([algSeq, bitString]);
      const der = Buffer.concat([Buffer.from([0x30, outerContent.length]), outerContent]);

      expect(() => parsePublicKey(der)).toThrow('not an EC public key');
    });

    it('throws on wrong curve OID (not secp256k1)', () => {
      const ecOid = Buffer.from([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
      const wrongCurveOid = Buffer.from([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0b]); // secp256r1 instead
      const algContent = Buffer.concat([ecOid, wrongCurveOid]);
      const algSeq = Buffer.concat([Buffer.from([0x30, algContent.length]), algContent]);
      const rawKey = Buffer.alloc(33);
      rawKey[0] = 0x02;
      const bitStringContent = Buffer.concat([Buffer.from([0x00]), rawKey]);
      const bitString = Buffer.concat([Buffer.from([0x03, bitStringContent.length]), bitStringContent]);
      const outerContent = Buffer.concat([algSeq, bitString]);
      const der = Buffer.concat([Buffer.from([0x30, outerContent.length]), outerContent]);

      expect(() => parsePublicKey(der)).toThrow('not a secp256k1 curve');
    });

    it('throws on invalid key length', () => {
      const rawKey = Buffer.alloc(40); // neither 33 nor 65
      rawKey[0] = 0x04;
      const der = buildDerPublicKey(rawKey);

      expect(() => parsePublicKey(der)).toThrow('unexpected public key length');
    });

    it('throws on truncated input', () => {
      const rawKey = Buffer.alloc(33);
      rawKey[0] = 0x02;
      const der = buildDerPublicKey(rawKey);
      const truncated = der.subarray(0, 10);

      expect(() => parsePublicKey(truncated)).toThrow('DER parse error');
    });

    it('throws on compressed key with invalid prefix (0x05)', () => {
      const rawKey = Buffer.alloc(33);
      rawKey[0] = 0x05; // invalid prefix
      for (let i = 1; i < 33; i++) rawKey[i] = i;
      const der = buildDerPublicKey(rawKey);

      expect(() => parsePublicKey(der)).toThrow('compressed key must start with 0x02 or 0x03');
    });
  });

  describe('parseSignature', () => {
    it('parses a valid DER-encoded signature with 32-byte r and s', () => {
      const r = Buffer.alloc(32, 0x11);
      const s = Buffer.alloc(32, 0x22);
      const der = buildDerSignature(r, s);

      const result = parseSignature(der);

      expect(result.r).toEqual(r);
      expect(result.s).toEqual(s);
      expect(result.r.length).toBe(32);
      expect(result.s.length).toBe(32);
    });

    it('strips leading zeros from r and s and pads to 32 bytes', () => {
      // r with leading zero (DER positive sign) and shorter value
      const rShort = Buffer.from([0x01, 0x02, 0x03]);
      const sShort = Buffer.from([0xff, 0xee]); // high bit set, DER will add 0x00

      const der = buildDerSignature(rShort, sShort);
      const result = parseSignature(der);

      expect(result.r.length).toBe(32);
      expect(result.s.length).toBe(32);
      // r should be left-padded with zeros
      expect(result.r[31]).toBe(0x03);
      expect(result.r[30]).toBe(0x02);
      expect(result.r[29]).toBe(0x01);
      expect(result.r[0]).toBe(0x00);
      // s should be left-padded with zeros
      expect(result.s[31]).toBe(0xee);
      expect(result.s[30]).toBe(0xff);
    });

    it('handles r and s with high bit set (DER adds leading 0x00)', () => {
      const r = Buffer.alloc(32, 0x80); // all bytes have high bit set
      const s = Buffer.alloc(32, 0xff);
      const der = buildDerSignature(r, s);

      const result = parseSignature(der);

      expect(result.r).toEqual(r);
      expect(result.s).toEqual(s);
    });

    it('throws on empty buffer', () => {
      expect(() => parseSignature(Buffer.alloc(0))).toThrow('non-empty Buffer');
    });

    it('throws on non-SEQUENCE outer tag', () => {
      const bad = Buffer.from([0x02, 0x01, 0x00]);
      expect(() => parseSignature(bad)).toThrow('expected SEQUENCE');
    });

    it('throws when r is not an INTEGER', () => {
      // Build a SEQUENCE with a non-INTEGER first element
      const content = Buffer.from([0x03, 0x01, 0x00, 0x02, 0x01, 0x01]); // BIT STRING instead of INTEGER
      const bad = Buffer.concat([Buffer.from([0x30, content.length]), content]);

      expect(() => parseSignature(bad)).toThrow('expected INTEGER');
    });

    it('throws when s is not an INTEGER', () => {
      // Build a SEQUENCE with valid r but non-INTEGER s
      const rDer = Buffer.from([0x02, 0x01, 0x01]);
      const sBad = Buffer.from([0x03, 0x01, 0x01]); // BIT STRING instead of INTEGER
      const content = Buffer.concat([rDer, sBad]);
      const bad = Buffer.concat([Buffer.from([0x30, content.length]), content]);

      expect(() => parseSignature(bad)).toThrow('expected INTEGER');
    });
  });
});
