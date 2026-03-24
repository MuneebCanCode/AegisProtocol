import * as fc from 'fast-check';

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockManagedKeyFindUnique = jest.fn();
const mockManagedKeyUpdate = jest.fn();
const mockRotationRecordCreate = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    managedKey: {
      findUnique: (...args: unknown[]) => mockManagedKeyFindUnique(...args),
      update: (...args: unknown[]) => mockManagedKeyUpdate(...args),
    },
    rotationRecord: {
      create: (...args: unknown[]) => mockRotationRecordCreate(...args),
    },
  },
}));

// ── Mock KMS Module ──────────────────────────────────────────────────────────

const mockGenerateKey = jest.fn();
const mockScheduleKeyDeletion = jest.fn();

jest.mock('@/modules/kms/kms.service', () => ({
  generateKey: (...args: unknown[]) => mockGenerateKey(...args),
  scheduleKeyDeletion: (...args: unknown[]) => mockScheduleKeyDeletion(...args),
}));

// ── Mock Hedera Client ───────────────────────────────────────────────────────

const mockUpdateAccount = jest.fn();

jest.mock('@/modules/hedera/hedera.client', () => ({
  updateAccount: (...args: unknown[]) => mockUpdateAccount(...args),
}));

// ── Mock Audit Service ───────────────────────────────────────────────────────

jest.mock('@/modules/audit/audit.service', () => ({
  log: jest.fn().mockResolvedValue({}),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { rotateKey } from '../rotation.service';

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupRotationMocks(keyId: string, oldArn: string, newArn: string, txId: string) {
  mockManagedKeyFindUnique.mockResolvedValue({
    id: keyId,
    userId: 'user-1',
    kmsKeyArn: oldArn,
    status: 'ACTIVE',
    hederaAccount: { accountId: '0.0.7000' },
  });

  mockGenerateKey.mockResolvedValue({
    id: 'new-key-id',
    kmsKeyArn: newArn,
    kmsKeyAlias: 'alias/aegis-new',
    publicKey: 'aabbccdd',
  });

  mockUpdateAccount.mockResolvedValue({
    transactionId: txId,
    hashscanUrl: `https://hashscan.io/testnet/transaction/${txId}`,
    status: 'SUCCESS',
  });

  mockManagedKeyUpdate.mockResolvedValue({});

  mockRotationRecordCreate.mockImplementation((args: any) =>
    Promise.resolve({ id: 'rot-record-1', ...args.data }),
  );

  mockScheduleKeyDeletion.mockResolvedValue({});
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Key Rotation Property Tests', () => {
  // Feature: aegis-protocol, Property 39: Rotation Record Persistence
  // **Validates: Requirements 24.2**
  it('Property 39: Rotation Record Persistence — rotationRecord.create is called with correct fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 10, maxLength: 80 }),
        fc.string({ minLength: 10, maxLength: 80 }),
        fc.string({ minLength: 5, maxLength: 40 }),
        async (keyId, oldArn, newArn, txId) => {
          jest.clearAllMocks();
          setupRotationMocks(keyId, oldArn, newArn, txId);

          await rotateKey(keyId);

          expect(mockRotationRecordCreate).toHaveBeenCalledTimes(1);
          const createArgs = mockRotationRecordCreate.mock.calls[0][0];
          expect(createArgs.data.oldKmsKeyArn).toBe(oldArn);
          expect(createArgs.data.newKmsKeyArn).toBe(newArn);
          expect(createArgs.data.transactionId).toBe(txId);
          expect(createArgs.data.hashscanUrl).toBe(
            `https://hashscan.io/testnet/transaction/${txId}`,
          );
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  // Feature: aegis-protocol, Property 40: Old Key Scheduled for Deletion After Rotation
  // **Validates: Requirements 24.3**
  it('Property 40: Old Key Scheduled for Deletion After Rotation — scheduleKeyDeletion called with old ARN and grace period', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 10, maxLength: 80 }),
        fc.string({ minLength: 10, maxLength: 80 }),
        fc.integer({ min: 7, max: 365 }),
        async (keyId, oldArn, newArn, gracePeriodDays) => {
          jest.clearAllMocks();
          setupRotationMocks(keyId, oldArn, newArn, '0.0.1@123.000');

          await rotateKey(keyId, gracePeriodDays);

          expect(mockScheduleKeyDeletion).toHaveBeenCalledTimes(1);
          expect(mockScheduleKeyDeletion).toHaveBeenCalledWith(oldArn, gracePeriodDays);
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
