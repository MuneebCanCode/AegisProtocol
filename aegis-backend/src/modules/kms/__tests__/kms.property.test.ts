import * as fc from 'fast-check';
import { generateKey, listUserKeys, scheduleKeyDeletion } from '../kms.service';

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

/**
 * Build a valid DER-encoded secp256k1 uncompressed public key.
 */
function buildDerPublicKey(): Buffer {
  const ecOid = Buffer.from([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  const curveOid = Buffer.from([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]);
  const algorithmSeq = Buffer.concat([
    Buffer.from([0x30, ecOid.length + curveOid.length]),
    ecOid,
    curveOid,
  ]);

  // 65-byte uncompressed public key (0x04 prefix + 32 bytes x + 32 bytes y)
  const rawKey = Buffer.alloc(65, 0);
  rawKey[0] = 0x04;
  rawKey[1] = 0xab;
  rawKey[33] = 0xcd;

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

// ── Setup ────────────────────────────────────────────────────────────────────

const userIdArb = fc.uuid();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('KMS Module Property Tests', () => {
  // Feature: aegis-protocol, Property 22: Key Listing Returns Only User's Keys
  // **Validates: Requirements 3.4**
  it('Property 22: Key Listing Returns Only User\'s Keys — listUserKeys returns exactly the records where userId matches', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const userKeys = [
          { id: 'mk-1', userId, kmsKeyArn: 'arn:1', status: 'ACTIVE' },
          { id: 'mk-2', userId, kmsKeyArn: 'arn:2', status: 'ACTIVE' },
        ];

        // Mock findMany to return only the user's keys
        mockManagedKeyFindMany.mockResolvedValueOnce(userKeys);

        const result = await listUserKeys(userId);

        // Verify findMany was called with the correct userId filter
        expect(mockManagedKeyFindMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { userId },
          }),
        );

        // All returned records belong to the requesting user
        expect(result).toEqual(userKeys);
        for (const key of result) {
          expect(key.userId).toBe(userId);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: aegis-protocol, Property 23: Key Deletion Updates Status
  // **Validates: Requirements 3.5**
  it('Property 23: Key Deletion Updates Status — scheduleKeyDeletion updates status to PENDING_DELETION', async () => {
    const keyArnArb = fc.string({ minLength: 10, maxLength: 80 }).map((s) => `arn:aws:kms:us-east-1:123456789:key/${s}`);
    const pendingDaysArb = fc.integer({ min: 7, max: 30 });

    await fc.assert(
      fc.asyncProperty(keyArnArb, pendingDaysArb, async (keyArn, pendingDays) => {
        mockSend.mockResolvedValueOnce({}); // ScheduleKeyDeletionCommand succeeds
        mockManagedKeyUpdate.mockResolvedValueOnce({
          kmsKeyArn: keyArn,
          status: 'PENDING_DELETION',
        });

        await scheduleKeyDeletion(keyArn, pendingDays);

        // Verify prisma.managedKey.update was called with PENDING_DELETION status
        expect(mockManagedKeyUpdate).toHaveBeenCalledWith({
          where: { kmsKeyArn: keyArn },
          data: { status: 'PENDING_DELETION' },
        });
      }),
      { numRuns: 100 },
    );
  });

  // Feature: aegis-protocol, Property 24: Private Key Material Never Exposed
  // **Validates: Requirements 3.6**
  it('Property 24: Private Key Material Never Exposed — generateKey return value never contains private key fields', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const derPubKey = buildDerPublicKey();

        // Mock KMS responses
        mockSend.mockResolvedValueOnce({
          KeyMetadata: {
            Arn: `arn:aws:kms:us-east-1:123456789:key/${userId}`,
            KeyId: `key-${userId}`,
          },
        });
        mockSend.mockResolvedValueOnce({}); // CreateAliasCommand
        mockSend.mockResolvedValueOnce({
          PublicKey: new Uint8Array(derPubKey),
        });

        const managedKeyRecord = {
          id: `mk-${userId}`,
          userId,
          kmsKeyArn: `arn:aws:kms:us-east-1:123456789:key/${userId}`,
          kmsKeyAlias: `alias/aegis-${userId}`,
          publicKey: 'ab'.repeat(33),
          status: 'ACTIVE',
        };
        mockManagedKeyCreate.mockResolvedValueOnce(managedKeyRecord);

        const result = await generateKey(userId);

        // No field name should contain "private" (case-insensitive)
        const keys = Object.keys(result);
        for (const key of keys) {
          expect(key.toLowerCase()).not.toContain('private');
        }

        // publicKey field should be a hex string (not raw binary)
        if (result.publicKey) {
          expect(result.publicKey).toMatch(/^[0-9a-f]+$/i);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: aegis-protocol, Property 42: Managed Key Record Completeness
  // **Validates: Requirements 3.3**
  it('Property 42: Managed Key Record Completeness — generateKey returns record with non-empty kmsKeyArn, kmsKeyAlias, publicKey, and correct userId', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const derPubKey = buildDerPublicKey();
        const keyArn = `arn:aws:kms:us-east-1:123456789:key/test-${userId}`;
        const keyId = `test-${userId}`;

        mockSend.mockResolvedValueOnce({
          KeyMetadata: { Arn: keyArn, KeyId: keyId },
        });
        mockSend.mockResolvedValueOnce({}); // CreateAliasCommand
        mockSend.mockResolvedValueOnce({
          PublicKey: new Uint8Array(derPubKey),
        });

        // Capture what prisma.managedKey.create is called with and return it
        mockManagedKeyCreate.mockImplementationOnce((args: { data: Record<string, unknown> }) => {
          return Promise.resolve({
            id: `mk-${userId}`,
            ...args.data,
            status: 'ACTIVE',
            createdAt: new Date(),
          });
        });

        const result = await generateKey(userId);

        // Non-empty required fields
        expect(result.kmsKeyArn).toBeTruthy();
        expect(typeof result.kmsKeyArn).toBe('string');
        expect(result.kmsKeyArn.length).toBeGreaterThan(0);

        expect(result.kmsKeyAlias).toBeTruthy();
        expect(typeof result.kmsKeyAlias).toBe('string');
        expect(result.kmsKeyAlias.length).toBeGreaterThan(0);

        expect(result.publicKey).toBeTruthy();
        expect(typeof result.publicKey).toBe('string');
        expect(result.publicKey.length).toBeGreaterThan(0);

        // Correct userId
        expect(result.userId).toBe(userId);
      }),
      { numRuns: 100 },
    );
  });
});
