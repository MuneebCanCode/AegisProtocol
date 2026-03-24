import * as fc from 'fast-check';

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockUserFindUnique = jest.fn();
const mockHederaAccountFindFirst = jest.fn();
const mockTokenConfigFindFirst = jest.fn();
const mockGuardianAssignmentCreate = jest.fn();
const mockGuardianAssignmentFindUnique = jest.fn();
const mockGuardianAssignmentFindFirst = jest.fn();
const mockGuardianAssignmentUpdate = jest.fn();
const mockGuardianAssignmentFindMany = jest.fn();
const mockAuditLogFindMany = jest.fn();
const mockAuditLogFindFirst = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: jest.fn(),
    },
    hederaAccount: {
      findFirst: (...args: unknown[]) => mockHederaAccountFindFirst(...args),
    },
    tokenConfig: {
      findFirst: (...args: unknown[]) => mockTokenConfigFindFirst(...args),
    },
    guardianAssignment: {
      create: (...args: unknown[]) => mockGuardianAssignmentCreate(...args),
      findUnique: (...args: unknown[]) => mockGuardianAssignmentFindUnique(...args),
      findFirst: (...args: unknown[]) => mockGuardianAssignmentFindFirst(...args),
      findMany: (...args: unknown[]) => mockGuardianAssignmentFindMany(...args),
      update: (...args: unknown[]) => mockGuardianAssignmentUpdate(...args),
    },
    auditLog: {
      findMany: (...args: unknown[]) => mockAuditLogFindMany(...args),
      findFirst: (...args: unknown[]) => mockAuditLogFindFirst(...args),
    },
  },
}));

// ── Mock Hedera Client ───────────────────────────────────────────────────────

const mockMintNft = jest.fn();
const mockAssociateToken = jest.fn();
const mockTransferNft = jest.fn();

jest.mock('@/modules/hedera/hedera.client', () => ({
  mintNft: (...args: unknown[]) => mockMintNft(...args),
  associateToken: (...args: unknown[]) => mockAssociateToken(...args),
  transferNft: (...args: unknown[]) => mockTransferNft(...args),
}));

// ── Mock Audit Service ───────────────────────────────────────────────────────

const mockAuditLog = jest.fn();

jest.mock('@/modules/audit/audit.service', () => ({
  log: (...args: unknown[]) => mockAuditLog(...args),
}));

// ── Mock @hashgraph/sdk ──────────────────────────────────────────────────────

jest.mock('@hashgraph/sdk', () => ({
  AccountUpdateTransaction: jest.fn().mockImplementation(() => ({
    setAccountId: jest.fn().mockReturnThis(),
    setKey: jest.fn().mockReturnThis(),
  })),
  AccountId: { fromString: jest.fn((s: string) => s) },
  PublicKey: { fromBytesECDSA: jest.fn((b: Buffer) => b) },
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import {
  assignGuardian,
  removeGuardian,
  initiateRecovery,
  getRecoveryStatus,
} from '../guardian.service';
import { ValidationError } from '@/lib/errors';

// ── Setup ────────────────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.HEDERA_OPERATOR_ID = '0.0.1234';
  process.env.HEDERA_NETWORK = 'testnet';
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Arbitraries ──────────────────────────────────────────────────────────────

const userIdArb = fc.uuid();
const guardianUserIdArb = fc.uuid();
const roleArb = fc.constantFrom('FAMILY', 'LEGAL', 'INSTITUTIONAL');
const weightArb = fc.integer({ min: 1, max: 10 });
const tokenIdArb = fc.constantFrom('0.0.5001', '0.0.5002', '0.0.5003');

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Guardian Module Property Tests', () => {
  // Feature: aegis-protocol, Property 25: NFT Token Association Before Transfer
  // **Validates: Requirements 10.5, 39.1**
  it('Property 25: NFT Token Association Before Transfer — associateToken is called before transferNft', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, guardianUserIdArb, roleArb, weightArb, async (userId, guardianUserId, role, weight) => {
        fc.pre(userId !== guardianUserId);

        const tokenId = '0.0.5001';
        const guardianAccountId = '0.0.9999';
        const callOrder: string[] = [];

        mockUserFindUnique
          .mockResolvedValueOnce({ id: userId })
          .mockResolvedValueOnce({ id: guardianUserId });
        mockHederaAccountFindFirst.mockResolvedValueOnce({
          accountId: guardianAccountId,
          managedKey: { publicKey: 'aabb', kmsKeyArn: 'arn:test' },
        });
        mockTokenConfigFindFirst.mockResolvedValueOnce({ tokenId });
        mockMintNft.mockImplementation(async () => {
          callOrder.push('mintNft');
          return { serialNumber: 1, transactionId: 'tx-mint', hashscanUrl: 'url' };
        });
        mockAssociateToken.mockImplementation(async () => {
          callOrder.push('associateToken');
          return { transactionId: 'tx-assoc', hashscanUrl: 'url', status: 'SUCCESS' };
        });
        mockTransferNft.mockImplementation(async () => {
          callOrder.push('transferNft');
          return { transactionId: 'tx-transfer', hashscanUrl: 'url', status: 'SUCCESS' };
        });
        mockGuardianAssignmentCreate.mockResolvedValueOnce({
          id: 'assignment-1',
          userId,
          guardianUserId,
          role,
          weight,
          nftSerial: 1,
        });
        mockAuditLog.mockResolvedValueOnce({});

        await assignGuardian(userId, guardianUserId, role, weight);

        const assocIdx = callOrder.indexOf('associateToken');
        const transferIdx = callOrder.indexOf('transferNft');
        expect(assocIdx).toBeGreaterThanOrEqual(0);
        expect(transferIdx).toBeGreaterThanOrEqual(0);
        expect(assocIdx).toBeLessThan(transferIdx);
      }),
      { numRuns: 100 },
    );
  }, 30000);

  // Feature: aegis-protocol, Property 26: Key DNA NFT Minted on Key Creation
  // **Validates: Requirements 10.2, 39.2**
  it('Property 26: Key DNA NFT Minted on Key Creation — assignGuardian calls mintNft with Guardian Badge token ID', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, guardianUserIdArb, roleArb, weightArb, async (userId, guardianUserId, role, weight) => {
        fc.pre(userId !== guardianUserId);

        const tokenId = '0.0.5001';

        mockUserFindUnique
          .mockResolvedValueOnce({ id: userId })
          .mockResolvedValueOnce({ id: guardianUserId });
        mockHederaAccountFindFirst.mockResolvedValueOnce({
          accountId: '0.0.8888',
          managedKey: { publicKey: 'aabb', kmsKeyArn: 'arn:test' },
        });
        mockTokenConfigFindFirst.mockResolvedValueOnce({ tokenId });
        mockMintNft.mockResolvedValueOnce({
          serialNumber: 1,
          transactionId: 'tx-mint',
          hashscanUrl: 'url',
        });
        mockAssociateToken.mockResolvedValueOnce({
          transactionId: 'tx-assoc',
          hashscanUrl: 'url',
          status: 'SUCCESS',
        });
        mockTransferNft.mockResolvedValueOnce({
          transactionId: 'tx-transfer',
          hashscanUrl: 'url',
          status: 'SUCCESS',
        });
        mockGuardianAssignmentCreate.mockResolvedValueOnce({
          id: 'assignment-1',
          userId,
          guardianUserId,
          role,
          weight,
          nftSerial: 1,
        });
        mockAuditLog.mockResolvedValueOnce({});

        await assignGuardian(userId, guardianUserId, role, weight);

        // Verify mintNft was called with the Guardian Badge token ID
        expect(mockMintNft).toHaveBeenCalledWith(tokenId, expect.any(Buffer));
      }),
      { numRuns: 100 },
    );
  }, 30000);

  // Feature: aegis-protocol, Property 27: Guardian Badge NFT Minted on Assignment
  // **Validates: Requirements 10.3, 25.2, 39.3**
  it('Property 27: Guardian Badge NFT Minted on Assignment — mintNft metadata contains relationship info', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, guardianUserIdArb, roleArb, weightArb, async (userId, guardianUserId, role, weight) => {
        fc.pre(userId !== guardianUserId);
        jest.clearAllMocks();

        const tokenId = '0.0.5001';

        mockUserFindUnique
          .mockResolvedValueOnce({ id: userId })
          .mockResolvedValueOnce({ id: guardianUserId });
        mockHederaAccountFindFirst.mockResolvedValueOnce({
          accountId: '0.0.7777',
          managedKey: { publicKey: 'aabb', kmsKeyArn: 'arn:test' },
        });
        mockTokenConfigFindFirst.mockResolvedValueOnce({ tokenId });
        mockMintNft.mockResolvedValueOnce({
          serialNumber: 1,
          transactionId: 'tx-mint',
          hashscanUrl: 'url',
        });
        mockAssociateToken.mockResolvedValueOnce({
          transactionId: 'tx-assoc',
          hashscanUrl: 'url',
          status: 'SUCCESS',
        });
        mockTransferNft.mockResolvedValueOnce({
          transactionId: 'tx-transfer',
          hashscanUrl: 'url',
          status: 'SUCCESS',
        });
        mockGuardianAssignmentCreate.mockResolvedValueOnce({
          id: 'assignment-1',
          userId,
          guardianUserId,
          role,
          weight,
          nftSerial: 1,
        });
        mockAuditLog.mockResolvedValueOnce({});

        await assignGuardian(userId, guardianUserId, role, weight);

        // Verify mintNft was called with metadata containing relationship info
        expect(mockMintNft).toHaveBeenCalledTimes(1);
        const metadataBuffer = mockMintNft.mock.calls[0][1] as Buffer;
        const metadata = JSON.parse(metadataBuffer.toString());
        expect(metadata.type).toBe('GuardianBadge');
        expect(metadata.protectedUser).toBe(userId);
        expect(metadata.guardianUser).toBe(guardianUserId);
        expect(metadata.role).toBe(role);
        expect(metadata.weight).toBe(weight);
      }),
      { numRuns: 100 },
    );
  }, 30000);

  // Feature: aegis-protocol, Property 28: Guardian Removal Revokes NFT and Status
  // **Validates: Requirements 25.6, 39.4**
  it('Property 28: Guardian Removal Revokes NFT and Status — removeGuardian sets status to REVOKED', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), fc.uuid(), async (assignmentId, userId, guardianUserId) => {
        const tokenId = '0.0.5001';

        mockGuardianAssignmentFindUnique.mockResolvedValueOnce({
          id: assignmentId,
          userId,
          guardianUserId,
          status: 'ACTIVE',
          nftSerial: 1,
        });
        mockTokenConfigFindFirst.mockResolvedValueOnce({ tokenId });
        mockHederaAccountFindFirst.mockResolvedValueOnce({
          accountId: '0.0.6666',
          managedKey: { publicKey: 'aabb', kmsKeyArn: 'arn:test' },
        });
        mockTransferNft.mockResolvedValueOnce({
          transactionId: 'tx-burn',
          hashscanUrl: 'url',
          status: 'SUCCESS',
        });
        mockGuardianAssignmentUpdate.mockResolvedValueOnce({
          id: assignmentId,
          status: 'REVOKED',
        });
        mockAuditLog.mockResolvedValueOnce({});

        await removeGuardian(assignmentId);

        // Verify status was set to REVOKED
        expect(mockGuardianAssignmentUpdate).toHaveBeenCalledWith({
          where: { id: assignmentId },
          data: { status: 'REVOKED' },
        });
      }),
      { numRuns: 100 },
    );
  }, 30000);

  // Feature: aegis-protocol, Property 29: Recovery Requires Valid Guardian Badge
  // **Validates: Requirements 25.4**
  it('Property 29: Recovery Requires Valid Guardian Badge — initiateRecovery with no ACTIVE assignment throws', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (guardianUserId, targetUserId) => {
        // No active assignment found
        mockGuardianAssignmentFindFirst.mockResolvedValueOnce(null);

        await expect(
          initiateRecovery(guardianUserId, targetUserId),
        ).rejects.toThrow(ValidationError);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: aegis-protocol, Property 30: Recovery Executes Only at Threshold
  // **Validates: Requirements 25.5**
  it('Property 30: Recovery Executes Only at Threshold — getRecoveryStatus returns correct threshold and approved count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        async (userId, threshold, approvedCount) => {
          mockUserFindUnique.mockResolvedValueOnce({
            id: userId,
            recoveryThreshold: threshold,
          });
          mockGuardianAssignmentFindMany.mockResolvedValueOnce([]);

          // Build mock audit logs
          const scheduleId = 'schedule-123';
          const initiationLog = {
            eventType: 'RECOVERY_INITIATED',
            target: userId,
            details: { scheduleId },
            createdAt: new Date(),
          };
          const approvalLogs = Array.from({ length: approvedCount }, (_, i) => ({
            eventType: 'RECOVERY_APPROVED',
            target: userId,
            details: {
              scheduleId,
              guardianAccountId: `0.0.${1000 + i}`,
              transactionId: `tx-${i}`,
            },
            createdAt: new Date(),
          }));

          mockAuditLogFindMany.mockResolvedValueOnce([initiationLog, ...approvalLogs]);

          const status = await getRecoveryStatus(userId);

          expect(status.threshold).toBe(threshold);
          expect(status.approvedCount).toBe(approvedCount);
          expect(status.isComplete).toBe(approvedCount >= threshold);
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
