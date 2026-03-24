import * as fc from 'fast-check';

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockUserFindUnique = jest.fn();
const mockManagedKeyFindMany = jest.fn();
const mockRotationRecordFindFirst = jest.fn();
const mockGuardianAssignmentCount = jest.fn();
const mockTransactionCount = jest.fn();
const mockAuditLogCount = jest.fn();
const mockPolicyFindFirst = jest.fn();
const mockInsurancePolicyFindFirst = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    managedKey: {
      findMany: (...args: unknown[]) => mockManagedKeyFindMany(...args),
    },
    rotationRecord: {
      findFirst: (...args: unknown[]) => mockRotationRecordFindFirst(...args),
    },
    guardianAssignment: {
      count: (...args: unknown[]) => mockGuardianAssignmentCount(...args),
    },
    transaction: {
      count: (...args: unknown[]) => mockTransactionCount(...args),
    },
    auditLog: {
      count: (...args: unknown[]) => mockAuditLogCount(...args),
    },
    policy: {
      findFirst: (...args: unknown[]) => mockPolicyFindFirst(...args),
    },
    insurancePolicy: {
      findFirst: (...args: unknown[]) => mockInsurancePolicyFindFirst(...args),
    },
  },
}));

// ── Mock Audit Service ───────────────────────────────────────────────────────

jest.mock('@/modules/audit/audit.service', () => ({
  log: jest.fn().mockResolvedValue({}),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { calculateComplianceScore } from '../compliance.service';

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Weights ──────────────────────────────────────────────────────────────────

const WEIGHTS = {
  keyRotation: 0.25,
  guardianCoverage: 0.20,
  auditLogCompleteness: 0.20,
  policyCoverage: 0.20,
  insuranceCoverage: 0.15,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Compliance Score Property Tests', () => {
  // Feature: aegis-protocol, Property 38: Compliance Score Weighted Calculation
  // **Validates: Requirements 36.2**
  it('Property 38: Compliance Score Weighted Calculation — overall score equals weighted average of 5 categories', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // keyRotation: 0 or 100 (no keys = 100, all rotated = 100, none rotated = 0)
          hasKeys: fc.boolean(),
          allKeysRotated: fc.boolean(),
          // guardianCoverage: 0..3 guardians → score = min(count/3, 1) * 100
          guardianCount: fc.integer({ min: 0, max: 5 }),
          // auditLogCompleteness: ratio of audit logs to transactions
          txCount: fc.integer({ min: 0, max: 100 }),
          auditCount: fc.integer({ min: 0, max: 200 }),
          // policyCoverage: has active policy or not
          hasPolicy: fc.boolean(),
          // insuranceCoverage: has active insurance or not
          hasInsurance: fc.boolean(),
        }),
        async (params) => {
          jest.clearAllMocks();

          const userId = 'test-user-id';
          mockUserFindUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });

          // Key rotation score
          if (!params.hasKeys) {
            mockManagedKeyFindMany.mockResolvedValue([]);
          } else {
            const key = {
              id: 'key-1',
              createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), // 120 days ago
            };
            mockManagedKeyFindMany.mockResolvedValue([key]);
            if (params.allKeysRotated) {
              mockRotationRecordFindFirst.mockResolvedValue({ id: 'rot-1' });
            } else {
              mockRotationRecordFindFirst.mockResolvedValue(null);
            }
          }

          // Guardian coverage
          mockGuardianAssignmentCount.mockResolvedValue(params.guardianCount);

          // Audit log completeness
          mockTransactionCount.mockResolvedValue(params.txCount);
          mockAuditLogCount.mockResolvedValue(params.auditCount);

          // Policy coverage
          mockPolicyFindFirst.mockResolvedValue(params.hasPolicy ? { id: 'pol-1' } : null);

          // Insurance coverage
          mockInsurancePolicyFindFirst.mockResolvedValue(params.hasInsurance ? { id: 'ins-1' } : null);

          const result = await calculateComplianceScore(userId);

          // Calculate expected category scores
          let expectedKeyRotation: number;
          if (!params.hasKeys) {
            expectedKeyRotation = 100;
          } else {
            expectedKeyRotation = params.allKeysRotated ? Math.round((1 / 1) * 100) : 0;
          }

          const expectedGuardian = params.guardianCount >= 3
            ? 100
            : Math.round((params.guardianCount / 3) * 100);

          const expectedAudit = params.txCount === 0
            ? 100
            : Math.min(Math.round((params.auditCount / params.txCount) * 100), 100);

          const expectedPolicy = params.hasPolicy ? 100 : 0;
          const expectedInsurance = params.hasInsurance ? 100 : 0;

          const expectedOverall = Math.round(
            expectedKeyRotation * WEIGHTS.keyRotation +
            expectedGuardian * WEIGHTS.guardianCoverage +
            expectedAudit * WEIGHTS.auditLogCompleteness +
            expectedPolicy * WEIGHTS.policyCoverage +
            expectedInsurance * WEIGHTS.insuranceCoverage,
          );

          // Verify overall score matches weighted average
          expect(result.overallScore).toBe(expectedOverall);

          // Verify all 5 categories are present with correct weights
          expect(result.categories).toHaveLength(5);
          const categoryMap = new Map(result.categories.map((c) => [c.category, c]));
          expect(categoryMap.get('keyRotation')?.weight).toBe(0.25);
          expect(categoryMap.get('guardianCoverage')?.weight).toBe(0.20);
          expect(categoryMap.get('auditLogCompleteness')?.weight).toBe(0.20);
          expect(categoryMap.get('policyCoverage')?.weight).toBe(0.20);
          expect(categoryMap.get('insuranceCoverage')?.weight).toBe(0.15);
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
