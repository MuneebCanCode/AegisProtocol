import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';
import * as auditService from '@/modules/audit/audit.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthCategory = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';

export interface HealthScoreResult {
  totalScore: number;
  category: HealthCategory;
  components: {
    keyAge: number;
    guardianCount: number;
    guardianDiversity: number;
    policyStrictness: number;
    auditCompleteness: number;
    insuranceCoverage: number;
    heartbeatRegularity: number;
    recoveryDrills: number;
    securityIncidents: number;
  };
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

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
} as const;

const SCORE_CHANGE_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Categorization
// ---------------------------------------------------------------------------

export function categorizeScore(score: number): HealthCategory {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  if (score >= 50) return 'FAIR';
  return 'POOR';
}

// ---------------------------------------------------------------------------
// Component Calculators
// ---------------------------------------------------------------------------

/**
 * Key Age (25%): 100 if < 30 days old, decreasing linearly to 0 at 365 days.
 */
function calcKeyAge(createdAt: Date): number {
  const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 30) return 100;
  if (ageDays >= 365) return 0;
  // Linear decrease from 100 at 30 days to 0 at 365 days
  return Math.round(100 * (1 - (ageDays - 30) / (365 - 30)));
}

/**
 * Guardian Count (15%): 100 if >= 3 guardians, 66 if 2, 33 if 1, 0 if none.
 */
function calcGuardianCount(count: number): number {
  if (count >= 3) return 100;
  if (count === 2) return 66;
  if (count === 1) return 33;
  return 0;
}

/**
 * Guardian Diversity (10%): 100 if >= 3 unique roles, proportional otherwise.
 */
function calcGuardianDiversity(uniqueRoles: number): number {
  if (uniqueRoles >= 3) return 100;
  return Math.round((uniqueRoles / 3) * 100);
}

/**
 * Policy Strictness (15%): 100 if policy exists with all rules configured,
 * proportional based on configured rules.
 */
function calcPolicyStrictness(policies: Array<{
  maxTransactionAmount: number;
  dailyLimit: number;
  whitelistedAccounts: string[];
  businessHoursOnly: boolean;
  isActive: boolean;
}>): number {
  const activePolicies = policies.filter((p) => p.isActive);
  if (activePolicies.length === 0) return 0;

  // Check how many rule types are configured across all active policies
  // 4 possible rule types: maxTransactionAmount, dailyLimit, whitelist, businessHours
  const totalRuleTypes = 4;
  let configuredRules = 0;

  const hasMaxTx = activePolicies.some((p) => p.maxTransactionAmount > 0);
  const hasDailyLimit = activePolicies.some((p) => p.dailyLimit > 0);
  const hasWhitelist = activePolicies.some((p) => p.whitelistedAccounts.length > 0);
  const hasBusinessHours = activePolicies.some((p) => p.businessHoursOnly);

  if (hasMaxTx) configuredRules++;
  if (hasDailyLimit) configuredRules++;
  if (hasWhitelist) configuredRules++;
  if (hasBusinessHours) configuredRules++;

  return Math.round((configuredRules / totalRuleTypes) * 100);
}

/**
 * Audit Completeness (10%): Percentage of user's transactions that have
 * corresponding audit logs.
 */
function calcAuditCompleteness(transactionCount: number, auditLogCount: number): number {
  if (transactionCount === 0) return 100; // No transactions = fully audited
  const ratio = Math.min(auditLogCount / transactionCount, 1);
  return Math.round(ratio * 100);
}

/**
 * Insurance Coverage (5%): 100 if active insurance policy exists, 0 otherwise.
 */
function calcInsuranceCoverage(hasActiveInsurance: boolean): number {
  return hasActiveInsurance ? 100 : 0;
}

/**
 * Heartbeat Regularity (5%): 100 if heartbeat within last 7 days,
 * decreasing to 0 at 30 days.
 */
function calcHeartbeatRegularity(lastHeartbeat: Date | null): number {
  if (!lastHeartbeat) return 0;
  const daysSince = (Date.now() - lastHeartbeat.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 7) return 100;
  if (daysSince >= 30) return 0;
  // Linear decrease from 100 at 7 days to 0 at 30 days
  return Math.round(100 * (1 - (daysSince - 7) / (30 - 7)));
}

/**
 * Recovery Drills (10%): 100 if recovery was tested in last 90 days, 0 otherwise.
 */
function calcRecoveryDrills(hasRecentRecoveryDrill: boolean): number {
  return hasRecentRecoveryDrill ? 100 : 0;
}

/**
 * Security Incidents (5%): 100 if no incidents, decreasing by 20 per incident.
 */
function calcSecurityIncidents(incidentCount: number): number {
  const score = 100 - incidentCount * 20;
  return Math.max(score, 0);
}

// ---------------------------------------------------------------------------
// Main Calculator
// ---------------------------------------------------------------------------

/**
 * Calculate the health score for a managed key.
 *
 * Fetches all relevant data from the database, computes each of the 9
 * weighted components, produces a total score (0-100), categorizes it,
 * and conditionally persists the score + logs to COMPLIANCE_EVENTS when
 * the score changes by more than 5 points from the stored value.
 */
export async function calculateScore(keyId: string): Promise<HealthScoreResult> {
  // 1. Fetch the managed key with its owner
  const managedKey = await prisma.managedKey.findUnique({
    where: { id: keyId },
    include: { user: true },
  });

  if (!managedKey) {
    throw new NotFoundError(`Managed key not found: ${keyId}`);
  }

  const userId = managedKey.userId;

  // 2. Gather data for all components in parallel
  const [
    guardians,
    policies,
    transactionCount,
    auditLogCount,
    activeInsurance,
    deadmanSwitch,
    recentRecoveryDrill,
    securityIncidentCount,
  ] = await Promise.all([
    // Guardians assigned to this user
    prisma.guardianAssignment.findMany({
      where: { userId, status: 'ACTIVE' },
    }),

    // User's policies
    prisma.policy.findMany({
      where: { userId },
    }),

    // Count of user's transactions
    prisma.transaction.count({
      where: { userId },
    }),

    // Count of audit logs where the actor is this user
    prisma.auditLog.count({
      where: { actor: userId },
    }),

    // Active insurance policy for the user
    prisma.insurancePolicy.findFirst({
      where: { userId, status: 'ACTIVE' },
    }),

    // Most recent active dead man's switch for the user
    prisma.deadmanSwitch.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { lastHeartbeat: 'desc' },
    }),

    // Check for recovery drill events in the last 90 days
    prisma.auditLog.findFirst({
      where: {
        actor: userId,
        eventType: { in: ['RECOVERY_COMPLETED', 'RECOVERY_INITIATED'] },
        createdAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        },
      },
    }),

    // Count security incidents (policy violations + unauthorized access)
    prisma.auditLog.count({
      where: {
        actor: userId,
        eventType: {
          in: ['POLICY_VIOLATED', 'UNAUTHORIZED_ATTEMPT'],
        },
      },
    }),
  ]);

  // 3. Calculate each component score (0-100)
  const uniqueRoles = new Set(guardians.map((g) => g.role)).size;

  const components = {
    keyAge: calcKeyAge(managedKey.createdAt),
    guardianCount: calcGuardianCount(guardians.length),
    guardianDiversity: calcGuardianDiversity(uniqueRoles),
    policyStrictness: calcPolicyStrictness(policies),
    auditCompleteness: calcAuditCompleteness(transactionCount, auditLogCount),
    insuranceCoverage: calcInsuranceCoverage(activeInsurance !== null),
    heartbeatRegularity: calcHeartbeatRegularity(deadmanSwitch?.lastHeartbeat ?? null),
    recoveryDrills: calcRecoveryDrills(recentRecoveryDrill !== null),
    securityIncidents: calcSecurityIncidents(securityIncidentCount),
  };

  // 4. Compute weighted total
  const totalScore = Math.round(
    components.keyAge * WEIGHTS.keyAge +
    components.guardianCount * WEIGHTS.guardianCount +
    components.guardianDiversity * WEIGHTS.guardianDiversity +
    components.policyStrictness * WEIGHTS.policyStrictness +
    components.auditCompleteness * WEIGHTS.auditCompleteness +
    components.insuranceCoverage * WEIGHTS.insuranceCoverage +
    components.heartbeatRegularity * WEIGHTS.heartbeatRegularity +
    components.recoveryDrills * WEIGHTS.recoveryDrills +
    components.securityIncidents * WEIGHTS.securityIncidents,
  );

  // 5. Categorize
  const category = categorizeScore(totalScore);

  // 6. Persist and log if score changed by more than 5 points
  const previousScore = managedKey.healthScore;
  if (Math.abs(totalScore - previousScore) > SCORE_CHANGE_THRESHOLD) {
    await prisma.managedKey.update({
      where: { id: keyId },
      data: { healthScore: totalScore },
    });

    await auditService.log({
      eventType: 'HEALTH_SCORE_CHANGED',
      category: 'COMPLIANCE_EVENTS',
      actor: userId,
      target: keyId,
      details: {
        previousScore,
        newScore: totalScore,
        category,
        components,
      },
    });
  }

  return {
    totalScore,
    category,
    components,
  };
}
