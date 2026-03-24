import * as fc from 'fast-check';

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockPolicyFindFirst = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    policy: {
      findFirst: (...args: unknown[]) => mockPolicyFindFirst(...args),
    },
  },
}));

// ── Mock Hedera Client ───────────────────────────────────────────────────────

const mockQueryContract = jest.fn();

jest.mock('@/modules/hedera/hedera.client', () => ({
  queryContract: (...args: unknown[]) => mockQueryContract(...args),
}));

// ── Mock Audit Service ───────────────────────────────────────────────────────

const mockAuditLog = jest.fn();

jest.mock('@/modules/audit/audit.service', () => ({
  log: (...args: unknown[]) => mockAuditLog(...args),
}));

// ── Mock @hashgraph/sdk ──────────────────────────────────────────────────────

jest.mock('@hashgraph/sdk', () => ({
  ContractFunctionParameters: jest.fn().mockImplementation(() => ({
    addUint256: jest.fn().mockReturnThis(),
    addAddress: jest.fn().mockReturnThis(),
    addBool: jest.fn().mockReturnThis(),
    addUint8: jest.fn().mockReturnThis(),
  })),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { evaluateTransaction } from '../policy.service';

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Policy Engine Property Tests', () => {
  // Feature: aegis-protocol, Property 31: Policy Evaluation on Outgoing Transactions
  // **Validates: Requirements 26.3, 26.4**
  it('Property 31: Policy Evaluation on Outgoing Transactions — evaluateTransaction calls queryContract and returns denial result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
        fc.hexaString({ minLength: 40, maxLength: 40 }).map((s) => `0x${s}`),
        async (userId, amount, recipientAddress) => {
          const policyId = 'policy-123';
          const contractId = '0.0.54321';

          // Mock active policy exists
          mockPolicyFindFirst.mockResolvedValueOnce({
            id: policyId,
            userId,
            contractId,
            isActive: true,
          });

          // Mock contract query returns denial
          mockQueryContract.mockResolvedValueOnce({
            getBool: (idx: number) => false,
            getString: (idx: number) => 'Amount exceeds limit',
          });

          mockAuditLog.mockResolvedValueOnce({});

          const result = await evaluateTransaction(userId, {
            amount,
            recipientAddress,
          });

          // Verify queryContract was called
          expect(mockQueryContract).toHaveBeenCalledWith(
            contractId,
            'evaluateTransaction',
            expect.anything(),
            expect.any(Number),
          );

          // Verify denial result
          expect(result.allowed).toBe(false);
          expect(result.reason).toBe('Amount exceeds limit');
          expect(result.policyId).toBe(policyId);
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
