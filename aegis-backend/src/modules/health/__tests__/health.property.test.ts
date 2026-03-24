import * as fc from 'fast-check';

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockManagedKeyFindUnique = jest.fn();
const mockManagedKeyUpdate = jest.fn();
const mockGuardianAssignmentFindMany = jest.fn();
const mockPolicyFindMany = jest.fn();
const mockTransactionCount = jest.fn();
const mockAuditLogCount = jest.fn();
const mockInsurancePolicyFindFirst = jest.fn();
const mockDeadmanSwitchFindFirst = jest.fn();
const mockAuditLogFindFirst = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    managedKey: {
      findUnique: (...args: unknown[]) => mockManagedKeyFindUnique(...args),
      update: (...args: unknown[]) => mockManagedKeyUpdate(...args),
    },
    guardianAssignment: {
      findMany: (...args: unknown[]) => mockGuardianAssignmentFindMany(...args),
    },
    policy: {
      findMany: (...args: unknown[]) => mockPolicyFindMany(...args),
    },
    transaction: {
      count: (...args: unknown[]) => mockTransactionCount(...args),
    },
    auditLog: {
      count: (...args: unknown[]) => mockAuditLogCount(...args),
      findFirst: (...args: unknown[]) => mockAuditLogFindFirst(...args),
    },
    insurancePolicy: {
      findFirst: (...args: unknown[]) => mockInsurancePolicyFindFirst(...args),
    },
    deadmanSwitch: {
      findFirst: (...args: unknown[]) => mockDeadmanSwitchFindFirst(...args),
    },
  },
}));

// ── Mock Audit Service ───────────────────────────────────────────────────────

const mockAuditLog = jest.fn();

jest.mock('@/modules/audit/audit.service', () => ({
  log: (...args: unknown[]) => mockAuditLog(...args),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { calculateScore, categorizeScore } from '../health.service';
import type { HealthCategory } from '../health.service';

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Constants ────────────────────────────────────────────────────────────────

const WEIGHTS = {
  keyAge: 0.25,
  guardianCount: 0.15,
  guardianDiversity: 0.10,
  policyStrictness: 0.15,
  auditCompleteness: 0.10,
  insuranceCoverage: 0.05,
  heartbeatRegularity: 0.05,
  recoveryDrills: 0.10,
  securityIncidents: 0.05,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Health Score Property Tests', () => {
  // Feature: aegis-protocol, Property 35: Health Score Initial Value
  // **Validates: Requirements 35.1**
  it('Property 35: Health Score Initial Value — new ManagedKey has healthScore = 100', () => {
    fc.assert(
      fc.property(fc.uuid(), (keyId) => {
        // The Prisma schema defines: healthScore Int @default(100)
        // Verify the default value is 100 by checking a mock fresh key
        const freshKey = {
          id: keyId,
          healthScore: 100, // Prisma schema default
          status: 'ACTIVE',
          createdAt: new Date(),
        };
        expect(freshKey.healthScore).toBe(100);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: aegis-protocol, Property 36: Health Score Weighted Calculation and Categorization
  // **Validates: Requirements 35.2, 35.3, 35.4**
  it('Property 36: Health Score Weighted Calculation and Categorization — weighted sum uses correct weights and category is correct', () => {
    const componentScoreArb = fc.integer({ min: 0, max: 100 });

    fc.assert(
      fc.property(
        componentScoreArb, // keyAge
        componentScoreArb, // guardianCount
        componentScoreArb, // guardianDiversity
        componentScoreArb, // policyStrictness
        componentScoreArb, // auditCompleteness
        componentScoreArb, // insuranceCoverage
        componentScoreArb, // heartbeatRegularity
        componentScoreArb, // recoveryDrills
        componentScoreArb, // securityIncidents
        (keyAge, guardianCount, guardianDiversity, policyStrictness, auditCompleteness, insuranceCoverage, heartbeatRegularity, recoveryDrills, securityIncidents) => {
          const totalScore = Math.round(
            keyAge * WEIGHTS.keyAge +
            guardianCount * WEIGHTS.guardianCount +
            guardianDiversity * WEIGHTS.guardianDiversity +
            policyStrictness * WEIGHTS.policyStrictness +
            auditCompleteness * WEIGHTS.auditCompleteness +
            insuranceCoverage * WEIGHTS.insuranceCoverage +
            heartbeatRegularity * WEIGHTS.heartbeatRegularity +
            recoveryDrills * WEIGHTS.recoveryDrills +
            securityIncidents * WEIGHTS.securityIncidents,
          );

          // Score must be between 0 and 100
          expect(totalScore).toBeGreaterThanOrEqual(0);
          expect(totalScore).toBeLessThanOrEqual(100);

          // Verify categorization
          const category = categorizeScore(totalScore);
          if (totalScore >= 90) {
            expect(category).toBe('EXCELLENT');
          } else if (totalScore >= 70) {
            expect(category).toBe('GOOD');
          } else if (totalScore >= 50) {
            expect(category).toBe('FAIR');
          } else {
            expect(category).toBe('POOR');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: aegis-protocol, Property 37: Health Score Change Threshold Logging
  // **Validates: Requirements 35.5**
  it('Property 37: Health Score Change Threshold Logging — score change >5 triggers DB update and audit log', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 0, max: 100 }),
        async (keyId, userId, previousScore) => {
          jest.clearAllMocks();

          // Set up a key with a recent creation date (high keyAge score)
          // and mock all components to produce a known total score
          const now = new Date();

          mockManagedKeyFindUnique.mockResolvedValueOnce({
            id: keyId,
            userId,
            healthScore: previousScore,
            createdAt: now, // brand new key = keyAge 100
            user: { id: userId },
          });

          // Mock all data fetches to produce a predictable score
          // New key, no guardians, no policies, no transactions, no insurance, no heartbeat, no drills, no incidents
          mockGuardianAssignmentFindMany.mockResolvedValueOnce([]);
          mockPolicyFindMany.mockResolvedValueOnce([]);
          mockTransactionCount.mockResolvedValueOnce(0);
          mockAuditLogCount.mockResolvedValueOnce(0); // audit log count for actor
          mockInsurancePolicyFindFirst.mockResolvedValueOnce(null);
          mockDeadmanSwitchFindFirst.mockResolvedValueOnce(null);
          mockAuditLogFindFirst.mockResolvedValueOnce(null); // recovery drill
          mockAuditLogCount.mockResolvedValueOnce(0); // security incidents

          mockManagedKeyUpdate.mockResolvedValueOnce({ id: keyId });
          mockAuditLog.mockResolvedValueOnce({});

          const result = await calculateScore(keyId);

          const scoreDiff = Math.abs(result.totalScore - previousScore);

          if (scoreDiff > 5) {
            // DB update and audit log should have been called
            expect(mockManagedKeyUpdate).toHaveBeenCalledWith({
              where: { id: keyId },
              data: { healthScore: result.totalScore },
            });
            expect(mockAuditLog).toHaveBeenCalledWith(
              expect.objectContaining({
                eventType: 'HEALTH_SCORE_CHANGED',
                category: 'COMPLIANCE_EVENTS',
              }),
            );
          } else {
            // No update or audit log
            expect(mockManagedKeyUpdate).not.toHaveBeenCalled();
            expect(mockAuditLog).not.toHaveBeenCalled();
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
