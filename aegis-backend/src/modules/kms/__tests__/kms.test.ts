import { createHash } from 'crypto';
import {
  generateKey,
  getPublicKey,
  signData,
  scheduleKeyDeletion,
  listUserKeys,
} from '../kms.service';
import { KmsError } from '@/lib/errors';

// ── Mock AWS KMS Client ──────────────────────────────────────────────────────

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-kms', () => {
  const actual = jest.requireActual('@aws-sdk/client-kms');
  return {
    ...actual,
    KMSClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockManagedKeyCreate = jest.fn();
const mockManagedKeyUpdate = jest.fn();
const mockManagedKeyFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    managedKey: {
      create: (...args: unknown[]) => mockManagedKeyCreate(...args),
      update: (...args: unknown[]) => mockManagedKeyUpdate(...args),
      findMany: (...args: unknown[]) => mockManagedKeyFindMany(...args),
    },
  },
}));

// ── Test Fixtures ────────────────────────────────────────────────────────────

// A valid DER-encoded secp256k1 public key (uncompressed, 65 bytes raw)
// SubjectPublicKeyInfo: SEQUENCE { SEQUENCE { OID(ecPublicKey), OID(secp256k1) }, BIT STRING { 0x04 ... } }
function buildDerPublicKey(): Buffer {
  // OID for EC public key: 1.2.840.10045.2.1
  const ecOid = Buffer.from([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  // OID for secp256k1: 1.3.132.0.10
  const curveOid = Buffer.from([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]);

  const algorithmSeq = Buffer.concat([
    Buffer.from([0x30, ecOid.length + curveOid.length]),
    ecOid,
    curveOid,
  ]);

  // 65-byte uncompressed public key (0x04 prefix + 32 bytes x + 32 bytes y)
  const rawKey = Buffer.alloc(65, 0);
  rawKey[0] = 0x04;
  rawKey[1] = 0x01; // non-zero x
  rawKey[33] = 0x02; // non-zero y

  // BIT STRING: 1 byte unused-bits (0x00) + raw key
  const bitStringContent = Buffer.concat([Buffer.from([0x00]), rawKey]);
  const bitString = Buffer.concat([
    Buffer.from([0x03, bitStringContent.length]),
    bitStringContent,
  ]);

  const outerContent = Buffer.concat([algorithmSeq, bitString]);
  return Buffer.concat([
    Buffer.from([0x30, outerContent.length]),
    outerContent,
  ]);
}

// A valid DER-encoded ECDSA signature: SEQUENCE { INTEGER(r), INTEGER(s) }
function buildDerSignature(rBytes: Buffer, sBytes: Buffer): Buffer {
  const encodeInteger = (val: Buffer): Buffer => {
    // Add leading 0x00 if high bit is set
    const needsPad = val[0] >= 0x80;
    const content = needsPad ? Buffer.concat([Buffer.from([0x00]), val]) : val;
    return Buffer.concat([Buffer.from([0x02, content.length]), content]);
  };

  const rEnc = encodeInteger(rBytes);
  const sEnc = encodeInteger(sBytes);
  const seqContent = Buffer.concat([rEnc, sEnc]);
  return Buffer.concat([Buffer.from([0x30, seqContent.length]), seqContent]);
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('KMS Service', () => {
  describe('generateKey', () => {
    it('creates a KMS key, alias, fetches public key, and stores ManagedKey', async () => {
      const derPubKey = buildDerPublicKey();
      const userId = 'user-123';

      // CreateKeyCommand
      mockSend.mockResolvedValueOnce({
        KeyMetadata: {
          Arn: 'arn:aws:kms:us-east-1:123456789:key/test-key-id',
          KeyId: 'test-key-id',
        },
      });
      // CreateAliasCommand
      mockSend.mockResolvedValueOnce({});
      // GetPublicKeyCommand
      mockSend.mockResolvedValueOnce({
        PublicKey: new Uint8Array(derPubKey),
      });

      const expectedRecord = {
        id: 'mk-1',
        userId,
        kmsKeyArn: 'arn:aws:kms:us-east-1:123456789:key/test-key-id',
        kmsKeyAlias: expect.stringMatching(/^alias\/aegis-/),
        publicKey: expect.any(String),
        status: 'ACTIVE',
      };
      mockManagedKeyCreate.mockResolvedValue(expectedRecord);

      const result = await generateKey(userId);

      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(mockManagedKeyCreate).toHaveBeenCalledTimes(1);

      const createArg = mockManagedKeyCreate.mock.calls[0][0];
      expect(createArg.data.userId).toBe(userId);
      expect(createArg.data.kmsKeyArn).toBe('arn:aws:kms:us-east-1:123456789:key/test-key-id');
      expect(createArg.data.kmsKeyAlias).toMatch(/^alias\/aegis-/);
      expect(createArg.data.publicKey).toBeDefined();
      // Public key should be hex-encoded
      expect(createArg.data.publicKey).toMatch(/^[0-9a-f]+$/);

      expect(result).toEqual(expectedRecord);
    });

    it('throws KmsError when CreateKeyCommand fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('AWS error'));

      await expect(generateKey('user-1')).rejects.toThrow(KmsError);
    });

    it('throws KmsError with descriptive message when CreateKeyCommand fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('AWS error'));

      await expect(generateKey('user-1')).rejects.toThrow(/Failed to create KMS key/);
    });

    it('throws KmsError when CreateAliasCommand fails', async () => {
      mockSend.mockResolvedValueOnce({
        KeyMetadata: { Arn: 'arn:test', KeyId: 'key-id' },
      });
      mockSend.mockRejectedValueOnce(new Error('Alias error'));

      await expect(generateKey('user-1')).rejects.toThrow(KmsError);
    });

    it('throws KmsError when GetPublicKeyCommand fails', async () => {
      mockSend.mockResolvedValueOnce({
        KeyMetadata: { Arn: 'arn:test', KeyId: 'key-id' },
      });
      mockSend.mockResolvedValueOnce({});
      mockSend.mockRejectedValueOnce(new Error('PubKey error'));

      await expect(generateKey('user-1')).rejects.toThrow(KmsError);
    });

    it('throws KmsError when key ARN is missing from response', async () => {
      mockSend.mockResolvedValueOnce({
        KeyMetadata: {},
      });

      await expect(generateKey('user-1')).rejects.toThrow(/missing key ARN/);
    });

    it('never includes private key material in the stored record', async () => {
      const derPubKey = buildDerPublicKey();

      mockSend.mockResolvedValueOnce({
        KeyMetadata: { Arn: 'arn:test', KeyId: 'key-id' },
      });
      mockSend.mockResolvedValueOnce({});
      mockSend.mockResolvedValueOnce({
        PublicKey: new Uint8Array(derPubKey),
      });
      mockManagedKeyCreate.mockResolvedValue({ id: 'mk-1' });

      await generateKey('user-1');

      const createArg = mockManagedKeyCreate.mock.calls[0][0];
      // Only publicKey, kmsKeyArn, kmsKeyAlias, userId should be stored
      const dataKeys = Object.keys(createArg.data);
      expect(dataKeys).not.toContain('privateKey');
      expect(dataKeys).not.toContain('secretKey');
      expect(dataKeys).not.toContain('keyMaterial');
    });
  });

  describe('getPublicKey', () => {
    it('returns raw public key bytes from KMS', async () => {
      const derPubKey = buildDerPublicKey();
      mockSend.mockResolvedValueOnce({
        PublicKey: new Uint8Array(derPubKey),
      });

      const result = await getPublicKey('arn:test-key');

      expect(Buffer.isBuffer(result)).toBe(true);
      // Should be 65 bytes (uncompressed) based on our fixture
      expect(result.length).toBe(65);
      expect(result[0]).toBe(0x04);
    });

    it('throws KmsError when GetPublicKeyCommand fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('KMS unavailable'));

      await expect(getPublicKey('arn:test')).rejects.toThrow(KmsError);
    });

    it('throws KmsError when PublicKey is missing from response', async () => {
      mockSend.mockResolvedValueOnce({});

      await expect(getPublicKey('arn:test')).rejects.toThrow(KmsError);
    });
  });

  describe('signData', () => {
    it('hashes data, signs via KMS, parses DER, normalizes, and returns 64-byte r+s', async () => {
      const r = Buffer.alloc(32, 0);
      r[31] = 0x01; // r = 1
      const s = Buffer.alloc(32, 0);
      s[31] = 0x05; // s = 5 (already low-S)

      const derSig = buildDerSignature(r, s);
      mockSend.mockResolvedValueOnce({
        Signature: new Uint8Array(derSig),
      });

      const data = Buffer.from('test data to sign');
      const result = await signData('arn:test-key', data);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(64);

      // Verify KMS was called with a SHA-256 digest
      const sendCall = mockSend.mock.calls[0][0];
      expect(sendCall.input.MessageType).toBe('DIGEST');
      expect(sendCall.input.SigningAlgorithm).toBe('ECDSA_SHA_256');

      // Verify the message sent to KMS is the SHA-256 hash of the data
      const expectedDigest = createHash('sha256').update(data).digest();
      expect(Buffer.from(sendCall.input.Message)).toEqual(expectedDigest);
    });

    it('throws KmsError when SignCommand fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Sign failed'));

      await expect(signData('arn:test', Buffer.from('data'))).rejects.toThrow(KmsError);
    });

    it('throws KmsError when Signature is missing from response', async () => {
      mockSend.mockResolvedValueOnce({});

      await expect(signData('arn:test', Buffer.from('data'))).rejects.toThrow(KmsError);
    });

    it('normalizes high-S signatures to low-S form', async () => {
      const r = Buffer.alloc(32, 0);
      r[31] = 0x01;

      // Use a high-S value (greater than half curve order)
      // Half curve order ≈ 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0
      // Use S = curveOrder - 1 (definitely high-S)
      const highS = Buffer.from(
        'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140',
        'hex'
      );

      const derSig = buildDerSignature(r, highS);
      mockSend.mockResolvedValueOnce({
        Signature: new Uint8Array(derSig),
      });

      const result = await signData('arn:test-key', Buffer.from('data'));

      // The s component (last 32 bytes) should be normalized (low-S)
      const sResult = result.subarray(32);
      const sValue = BigInt('0x' + sResult.toString('hex'));
      const halfCurveOrder = BigInt(
        '0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0'
      );
      expect(sValue <= halfCurveOrder).toBe(true);
    });
  });

  describe('scheduleKeyDeletion', () => {
    it('calls KMS ScheduleKeyDeletionCommand and updates DB status', async () => {
      mockSend.mockResolvedValueOnce({});
      mockManagedKeyUpdate.mockResolvedValue({
        id: 'mk-1',
        status: 'PENDING_DELETION',
      });

      await scheduleKeyDeletion('arn:test-key', 7);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const sendCall = mockSend.mock.calls[0][0];
      expect(sendCall.input.KeyId).toBe('arn:test-key');
      expect(sendCall.input.PendingWindowInDays).toBe(7);

      expect(mockManagedKeyUpdate).toHaveBeenCalledWith({
        where: { kmsKeyArn: 'arn:test-key' },
        data: { status: 'PENDING_DELETION' },
      });
    });

    it('throws KmsError when ScheduleKeyDeletionCommand fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Deletion failed'));

      await expect(scheduleKeyDeletion('arn:test', 7)).rejects.toThrow(KmsError);
    });
  });

  describe('listUserKeys', () => {
    it('returns all ManagedKey records for the user', async () => {
      const keys = [
        { id: 'mk-1', userId: 'user-1', status: 'ACTIVE' },
        { id: 'mk-2', userId: 'user-1', status: 'PENDING_DELETION' },
      ];
      mockManagedKeyFindMany.mockResolvedValue(keys);

      const result = await listUserKeys('user-1');

      expect(result).toEqual(keys);
      expect(mockManagedKeyFindMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns empty array when user has no keys', async () => {
      mockManagedKeyFindMany.mockResolvedValue([]);

      const result = await listUserKeys('user-no-keys');

      expect(result).toEqual([]);
    });
  });
});
