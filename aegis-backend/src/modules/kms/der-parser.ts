/**
 * DER Parser for AWS KMS secp256k1 public keys and ECDSA signatures.
 *
 * AWS KMS returns public keys in SubjectPublicKeyInfo DER format (ASN.1):
 *   SEQUENCE { SEQUENCE { OID(ecPublicKey), OID(secp256k1) }, BIT STRING { raw key bytes } }
 *
 * ECDSA signatures are DER-encoded as:
 *   SEQUENCE { INTEGER(r), INTEGER(s) }
 */

// ASN.1 tag constants
const TAG_SEQUENCE = 0x30;
const TAG_BIT_STRING = 0x03;
const TAG_INTEGER = 0x02;
const TAG_OID = 0x06;

// OID for EC public key: 1.2.840.10045.2.1
const EC_PUBLIC_KEY_OID = Buffer.from([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);

// OID for secp256k1: 1.3.132.0.10
const SECP256K1_OID = Buffer.from([0x2b, 0x81, 0x04, 0x00, 0x0a]);

/**
 * Read a DER length field starting at the given offset.
 * Returns the length value and the number of bytes consumed for the length encoding.
 */
function readDerLength(buf: Buffer, offset: number): { length: number; bytesRead: number } {
  if (offset >= buf.length) {
    throw new Error('DER parse error: unexpected end of input while reading length');
  }

  const firstByte = buf[offset];

  // Short form: length is directly encoded in one byte (bit 7 is 0)
  if ((firstByte & 0x80) === 0) {
    return { length: firstByte, bytesRead: 1 };
  }

  // Long form: first byte indicates number of subsequent length bytes
  const numLengthBytes = firstByte & 0x7f;
  if (numLengthBytes === 0) {
    throw new Error('DER parse error: indefinite length encoding is not supported');
  }
  if (numLengthBytes > 4) {
    throw new Error('DER parse error: length encoding too large');
  }
  if (offset + 1 + numLengthBytes > buf.length) {
    throw new Error('DER parse error: unexpected end of input while reading multi-byte length');
  }

  let length = 0;
  for (let i = 0; i < numLengthBytes; i++) {
    length = (length << 8) | buf[offset + 1 + i];
  }

  return { length, bytesRead: 1 + numLengthBytes };
}

/**
 * Read a DER TLV (Tag-Length-Value) element at the given offset.
 * Returns the tag, value buffer, and total bytes consumed.
 */
function readDerElement(buf: Buffer, offset: number): { tag: number; value: Buffer; totalBytes: number } {
  if (offset >= buf.length) {
    throw new Error('DER parse error: unexpected end of input while reading tag');
  }

  const tag = buf[offset];
  const { length, bytesRead } = readDerLength(buf, offset + 1);
  const valueStart = offset + 1 + bytesRead;

  if (valueStart + length > buf.length) {
    throw new Error(
      `DER parse error: element at offset ${offset} claims length ${length} but only ${buf.length - valueStart} bytes remain`
    );
  }

  const value = buf.subarray(valueStart, valueStart + length);
  return { tag, value, totalBytes: 1 + bytesRead + length };
}

/**
 * Parse a DER-encoded SubjectPublicKeyInfo structure from AWS KMS
 * and extract the raw secp256k1 public key bytes.
 *
 * @param derEncoded - The DER-encoded public key buffer from AWS KMS
 * @returns Raw public key bytes (33 bytes compressed or 65 bytes uncompressed)
 * @throws Error if the input is malformed or not a secp256k1 key
 */
export function parsePublicKey(derEncoded: Buffer): Buffer {
  if (!Buffer.isBuffer(derEncoded) || derEncoded.length === 0) {
    throw new Error('DER parse error: input must be a non-empty Buffer');
  }

  // Outer SEQUENCE
  const outer = readDerElement(derEncoded, 0);
  if (outer.tag !== TAG_SEQUENCE) {
    throw new Error(`DER parse error: expected SEQUENCE (0x30) at offset 0, got 0x${outer.tag.toString(16)}`);
  }

  const outerValue = outer.value;
  let pos = 0;

  // Inner SEQUENCE containing algorithm OIDs
  const algorithmSeq = readDerElement(outerValue, pos);
  if (algorithmSeq.tag !== TAG_SEQUENCE) {
    throw new Error(
      `DER parse error: expected algorithm SEQUENCE (0x30), got 0x${algorithmSeq.tag.toString(16)}`
    );
  }
  pos += algorithmSeq.totalBytes;

  // Parse the algorithm SEQUENCE to verify OIDs
  let algPos = 0;
  const algValue = algorithmSeq.value;

  // First OID: EC public key (1.2.840.10045.2.1)
  const ecOid = readDerElement(algValue, algPos);
  if (ecOid.tag !== TAG_OID) {
    throw new Error(`DER parse error: expected OID tag (0x06), got 0x${ecOid.tag.toString(16)}`);
  }
  if (!ecOid.value.equals(EC_PUBLIC_KEY_OID)) {
    throw new Error('DER parse error: not an EC public key (OID mismatch)');
  }
  algPos += ecOid.totalBytes;

  // Second OID: secp256k1 (1.3.132.0.10)
  const curveOid = readDerElement(algValue, algPos);
  if (curveOid.tag !== TAG_OID) {
    throw new Error(`DER parse error: expected curve OID tag (0x06), got 0x${curveOid.tag.toString(16)}`);
  }
  if (!curveOid.value.equals(SECP256K1_OID)) {
    throw new Error('DER parse error: not a secp256k1 curve (OID mismatch)');
  }

  // BIT STRING containing the public key
  const bitString = readDerElement(outerValue, pos);
  if (bitString.tag !== TAG_BIT_STRING) {
    throw new Error(
      `DER parse error: expected BIT STRING (0x03), got 0x${bitString.tag.toString(16)}`
    );
  }

  // BIT STRING has a leading byte indicating unused bits (should be 0)
  if (bitString.value.length < 2) {
    throw new Error('DER parse error: BIT STRING too short to contain a public key');
  }
  const unusedBits = bitString.value[0];
  if (unusedBits !== 0) {
    throw new Error(`DER parse error: expected 0 unused bits in BIT STRING, got ${unusedBits}`);
  }

  const rawKey = bitString.value.subarray(1);

  // Validate key length: 33 bytes (compressed 02/03 prefix) or 65 bytes (uncompressed 04 prefix)
  if (rawKey.length === 33) {
    const prefix = rawKey[0];
    if (prefix !== 0x02 && prefix !== 0x03) {
      throw new Error(
        `DER parse error: compressed key must start with 0x02 or 0x03, got 0x${prefix.toString(16)}`
      );
    }
  } else if (rawKey.length === 65) {
    if (rawKey[0] !== 0x04) {
      throw new Error(
        `DER parse error: uncompressed key must start with 0x04, got 0x${rawKey[0].toString(16)}`
      );
    }
  } else {
    throw new Error(
      `DER parse error: unexpected public key length ${rawKey.length} (expected 33 or 65)`
    );
  }

  return Buffer.from(rawKey);
}

/**
 * Parse a DER-encoded ECDSA signature and extract the (r, s) components.
 *
 * DER format: SEQUENCE { INTEGER(r), INTEGER(s) }
 * Integers may have a leading 0x00 byte for positive sign which is stripped.
 * Each component is left-padded to 32 bytes.
 *
 * @param derEncoded - The DER-encoded signature buffer
 * @returns Object with r and s as 32-byte Buffers
 * @throws Error if the input is malformed
 */
export function parseSignature(derEncoded: Buffer): { r: Buffer; s: Buffer } {
  if (!Buffer.isBuffer(derEncoded) || derEncoded.length === 0) {
    throw new Error('DER signature parse error: input must be a non-empty Buffer');
  }

  // Outer SEQUENCE
  const outer = readDerElement(derEncoded, 0);
  if (outer.tag !== TAG_SEQUENCE) {
    throw new Error(
      `DER signature parse error: expected SEQUENCE (0x30), got 0x${outer.tag.toString(16)}`
    );
  }

  const seqValue = outer.value;
  let pos = 0;

  // First INTEGER: r
  const rElement = readDerElement(seqValue, pos);
  if (rElement.tag !== TAG_INTEGER) {
    throw new Error(
      `DER signature parse error: expected INTEGER (0x02) for r, got 0x${rElement.tag.toString(16)}`
    );
  }
  pos += rElement.totalBytes;

  // Second INTEGER: s
  const sElement = readDerElement(seqValue, pos);
  if (sElement.tag !== TAG_INTEGER) {
    throw new Error(
      `DER signature parse error: expected INTEGER (0x02) for s, got 0x${sElement.tag.toString(16)}`
    );
  }

  const r = padTo32Bytes(stripLeadingZeros(rElement.value));
  const s = padTo32Bytes(stripLeadingZeros(sElement.value));

  return { r, s };
}

/**
 * Strip leading zero bytes from a DER integer value.
 * DER integers use a leading 0x00 to indicate a positive number when the
 * high bit of the next byte is set.
 */
function stripLeadingZeros(buf: Buffer): Buffer {
  let start = 0;
  while (start < buf.length - 1 && buf[start] === 0x00) {
    start++;
  }
  return buf.subarray(start);
}

/**
 * Left-pad a buffer to exactly 32 bytes.
 */
function padTo32Bytes(buf: Buffer): Buffer {
  if (buf.length === 32) {
    return Buffer.from(buf);
  }
  if (buf.length > 32) {
    throw new Error(`DER signature parse error: integer component too large (${buf.length} bytes after stripping zeros)`);
  }
  const padded = Buffer.alloc(32);
  buf.copy(padded, 32 - buf.length);
  return padded;
}
