import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';
import * as auditService from '@/modules/audit/audit.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComplianceCategory =
  | 'keyRotation'
  | 'guardianCoverage'
  | 'auditLogCompleteness'
  | 'policyCoverage'
  | 'insuranceCoverage';

export interface ComplianceCategoryScore {
  category: ComplianceCategory;
  score: number;
  weight: number;
  description: string;
}

export interface ComplianceScoreResult {
  overallScore: number;
  categories: ComplianceCategoryScore[];
}

export interface ComplianceReport {
  generatedAt: string;
  userId: string;
  complianceScore: ComplianceScoreResult;
  auditLogCount: number;
  rotationCount: number;
  guardianCount: number;
  policyCount: number;
  insuranceCount: number;
  healthScores: { keyId: string; score: number; category: string }[];
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const CATEGORY_WEIGHTS: Record<ComplianceCategory, number> = {
  keyRotation: 0.25,
  guardianCoverage: 0.20,
  auditLogCompleteness: 0.20,
  policyCoverage: 0.20,
  insuranceCoverage: 0.15,
};

// ---------------------------------------------------------------------------
// Category Score Calculators
// ---------------------------------------------------------------------------

/**
 * Key Rotation Compliance (25%):
 * 100 if all keys rotated within 90 days, proportional otherwise.
 */
async function calcKeyRotationScore(userId: string): Promise<number> {
  const keys = await prisma.managedKey.findMany({
    where: { userId, status: 'ACTIVE' },
  });
  if (keys.length === 0) return 100;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  let rotatedCount = 0;

  for (const key of keys) {
    const recentRotation = await prisma.rotationRecord.findFirst({
      where: { managedKeyId: key.id, createdAt: { gte: ninetyDaysAgo } },
    });
    if (recentRotation || key.createdAt >= ninetyDaysAgo) {
      rotatedCount++;
    }
  }

  return Math.round((rotatedCount / keys.length) * 100);
}

/**
 * Guardian Coverage (20%):
 * 100 if user has >= 3 active guardians, proportional otherwise.
 */
async function calcGuardianCoverageScore(userId: string): Promise<number> {
  const count = await prisma.guardianAssignment.count({
    where: { userId, status: 'ACTIVE' },
  });
  if (count >= 3) return 100;
  return Math.round((count / 3) * 100);
}

/**
 * Audit Log Completeness (20%):
 * Ratio of audit logs to transactions (capped at 100).
 */
async function calcAuditLogCompletenessScore(userId: string): Promise<number> {
  const [txCount, auditCount] = await Promise.all([
    prisma.transaction.count({ where: { userId } }),
    prisma.auditLog.count({ where: { actor: userId } }),
  ]);
  if (txCount === 0) return 100;
  return Math.min(Math.round((auditCount / txCount) * 100), 100);
}

/**
 * Policy Coverage (20%):
 * 100 if user has at least one active policy, 0 otherwise.
 */
async function calcPolicyCoverageScore(userId: string): Promise<number> {
  const activePolicy = await prisma.policy.findFirst({
    where: { userId, isActive: true },
  });
  return activePolicy ? 100 : 0;
}

/**
 * Insurance Coverage (15%):
 * 100 if user has at least one active insurance policy, 0 otherwise.
 */
async function calcInsuranceCoverageScore(userId: string): Promise<number> {
  const activeInsurance = await prisma.insurancePolicy.findFirst({
    where: { userId, status: 'ACTIVE' },
  });
  return activeInsurance ? 100 : 0;
}

// ---------------------------------------------------------------------------
// Calculate Compliance Score
// ---------------------------------------------------------------------------

/**
 * Calculate the overall compliance score as a weighted average of 5 categories.
 */
export async function calculateComplianceScore(
  userId: string,
): Promise<ComplianceScoreResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  const [keyRotation, guardianCoverage, auditLogCompleteness, policyCoverage, insuranceCoverage] =
    await Promise.all([
      calcKeyRotationScore(userId),
      calcGuardianCoverageScore(userId),
      calcAuditLogCompletenessScore(userId),
      calcPolicyCoverageScore(userId),
      calcInsuranceCoverageScore(userId),
    ]);

  const categories: ComplianceCategoryScore[] = [
    { category: 'keyRotation', score: keyRotation, weight: CATEGORY_WEIGHTS.keyRotation, description: 'Key Rotation Compliance' },
    { category: 'guardianCoverage', score: guardianCoverage, weight: CATEGORY_WEIGHTS.guardianCoverage, description: 'Guardian Coverage' },
    { category: 'auditLogCompleteness', score: auditLogCompleteness, weight: CATEGORY_WEIGHTS.auditLogCompleteness, description: 'Audit Log Completeness' },
    { category: 'policyCoverage', score: policyCoverage, weight: CATEGORY_WEIGHTS.policyCoverage, description: 'Policy Coverage' },
    { category: 'insuranceCoverage', score: insuranceCoverage, weight: CATEGORY_WEIGHTS.insuranceCoverage, description: 'Insurance Coverage' },
  ];

  const overallScore = Math.round(
    categories.reduce((sum, c) => sum + c.score * c.weight, 0),
  );

  return { overallScore, categories };
}


// ---------------------------------------------------------------------------
// Generate Report
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive compliance report:
 * Aggregates audit logs, health scores, rotation records, guardian assignments,
 * policy evaluations, and insurance records.
 * Logs COMPLIANCE_REPORT_GENERATED event on COMPLIANCE_EVENTS HCS topic.
 */
export async function generateReport(userId: string): Promise<ComplianceReport> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  const [complianceScore, auditLogCount, rotationCount, guardianCount, policyCount, insuranceCount, keys] =
    await Promise.all([
      calculateComplianceScore(userId),
      prisma.auditLog.count({ where: { actor: userId } }),
      prisma.rotationRecord.count({
        where: { managedKey: { userId } },
      }),
      prisma.guardianAssignment.count({ where: { userId, status: 'ACTIVE' } }),
      prisma.policy.count({ where: { userId, isActive: true } }),
      prisma.insurancePolicy.count({ where: { userId, status: 'ACTIVE' } }),
      prisma.managedKey.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { id: true, healthScore: true },
      }),
    ]);

  const healthScores = keys.map((k) => ({
    keyId: k.id,
    score: k.healthScore,
    category: k.healthScore >= 90 ? 'EXCELLENT' : k.healthScore >= 70 ? 'GOOD' : k.healthScore >= 50 ? 'FAIR' : 'POOR',
  }));

  const report: ComplianceReport = {
    generatedAt: new Date().toISOString(),
    userId,
    complianceScore,
    auditLogCount,
    rotationCount,
    guardianCount,
    policyCount,
    insuranceCount,
    healthScores,
  };

  // Log COMPLIANCE_REPORT_GENERATED event
  await auditService.log({
    eventType: 'COMPLIANCE_REPORT_GENERATED',
    category: 'COMPLIANCE_EVENTS',
    actor: userId,
    target: userId,
    details: {
      overallScore: complianceScore.overallScore,
      auditLogCount,
      rotationCount,
      guardianCount,
      policyCount,
      insuranceCount,
      keyCount: keys.length,
    },
  });

  return report;
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

/**
 * Generate a CSV string of audit log entries for a date range.
 */
export async function exportCsv(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  const logs = await prisma.auditLog.findMany({
    where: {
      actor: userId,
      createdAt: { gte: startDate, lte: endDate },
    },
    orderBy: { createdAt: 'asc' },
  });

  // CSV header
  const header = 'id,eventType,category,actor,target,transactionId,hashscanUrl,createdAt';
  const rows = logs.map((log) =>
    [
      log.id,
      log.eventType,
      log.category,
      log.actor,
      log.target,
      log.transactionId ?? '',
      log.hashscanUrl ?? '',
      log.createdAt.toISOString(),
    ]
      .map((field) => `"${String(field).replace(/"/g, '""')}"`)
      .join(','),
  );

  return [header, ...rows].join('\n');
}
