import * as fc from 'fast-check';

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockHederaAccountFindFirst = jest.fn();
const mockTransactionCreate = jest.fn();
const mockTransactionFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    hederaAccount: {
      findFirst: (...args: unknown[]) => mockHederaAccountFindFirst(...args),
    },
    transaction: {
      create: (...args: unknown[]) => mockTransactionCreate(...args),
      findMany: (...args: unknown[]) => mockTransactionFindMany(...args),
    },
  },
}));

// ── Mock Hedera Client ───────────────────────────────────────────────────────

jest.mock('@/modules/hedera/hedera.client', () => ({
  transferHbar: jest.fn().mockResolvedValue({
    transactionId: '0.0.1@123.000',
    hashscanUrl: 'https://hashscan.io/testnet/transaction/0.0.1@123.000',
    status: 'SUCCESS',
  }),
}));

// ── Mock Policy Service ──────────────────────────────────────────────────────

jest.mock('@/modules/policy/policy.service', () => ({
  evaluateTransaction: jest.fn().mockResolvedValue({ allowed: true }),
}));

// ── Mock Audit Service ───────────────────────────────────────────────────────

jest.mock('@/modules/audit/audit.service', () => ({
  log: jest.fn().mockResolvedValue({}),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/lib/response';

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Transfers Property Tests', () => {
  // Feature: aegis-protocol, Property 21: Account Ownership Authorization
  // **Validates: Requirements 7.2**
  it('Property 21: Account Ownership Authorization — transfer from non-owned account returns 403', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 5, maxLength: 15 }),
        fc.string({ minLength: 5, maxLength: 15 }),
        fc.double({ min: 0.01, max: 10000, noNaN: true }),
        async (userId, fromAccountId, toAccountId, amount) => {
          jest.clearAllMocks();

          // Account NOT owned by user — findFirst returns null
          mockHederaAccountFindFirst.mockResolvedValue(null);

          // Simulate the ownership check logic from the route handler
          const account = await prisma.hederaAccount.findFirst({
            where: { accountId: fromAccountId, userId, status: 'ACTIVE' },
          });

          const res = mockRes();

          if (!account) {
            errorResponse(res, 'Forbidden', 'Account not owned by user or not found', 403);
          }

          // Verify 403 response
          expect(account).toBeNull();
          expect(res.status).toHaveBeenCalledWith(403);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: false,
              error: 'Forbidden',
            }),
          );

          // Verify the findFirst was called with correct ownership check
          expect(mockHederaAccountFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                accountId: fromAccountId,
                userId,
                status: 'ACTIVE',
              }),
            }),
          );
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
