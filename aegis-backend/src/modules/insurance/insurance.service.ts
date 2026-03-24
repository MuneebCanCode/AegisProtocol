import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/errors';
import * as hederaClient from '@/modules/hedera/hedera.client';
import * as auditService from '@/modules/audit/audit.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DepositInput {
  premiumAmount: number;
  coverageAmount: number;
  coverageLevel?: string;
  sourceAccountId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INSURANCE_POOL_ACCOUNT_ENV = 'AEGIS_INSURANCE_POOL_ACCOUNT';

function getPoolAccountId(): string {
  const poolAccount = process.env[INSURANCE_POOL_ACCOUNT_ENV];
  if (!poolAccount) {
    throw new ValidationError(
      `${INSURANCE_POOL_ACCOUNT_ENV} environment variable is not set`,
    );
  }
  return poolAccount;
}

// ---------------------------------------------------------------------------
// Deposit
// ---------------------------------------------------------------------------

/**
 * Deposit into the insurance pool:
 * 1. Submit CryptoTransferTransaction from user's account to pool account
 * 2. Create InsurancePolicy record in DB
 * 3. Log to COMPLIANCE_EVENTS HCS topic
 */
export async function deposit(userId: string, input: DepositInput) {
  const { premiumAmount, coverageAmount, coverageLevel, sourceAccountId } = input;

  if (premiumAmount <= 0) {
    throw new ValidationError('Premium amount must be greater than 0');
  }
  if (coverageAmount <= 0) {
    throw new ValidationError('Coverage amount must be greater than 0');
  }

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  const poolAccountId = getPoolAccountId();

  // Get the user's managed key for signing
  const account = await prisma.hederaAccount.findFirst({
    where: { userId, accountId: sourceAccountId, status: 'ACTIVE' },
    include: { managedKey: true },
  });
  if (!account) {
    throw new NotFoundError(`No active Hedera account found: ${sourceAccountId}`);
  }

  // Submit CryptoTransferTransaction to pool account
  const transferResult = await hederaClient.transferHbar(
    sourceAccountId,
    poolAccountId,
    premiumAmount,
    account.managedKey.kmsKeyArn,
  );

  // Create InsurancePolicy record
  const policy = await prisma.insurancePolicy.create({
    data: {
      userId,
      premiumAmount,
      coverageAmount,
      coverageLevel: coverageLevel ?? null,
      status: 'ACTIVE',
      transactionId: transferResult.transactionId,
      hashscanUrl: transferResult.hashscanUrl,
    },
  });

  // Log to COMPLIANCE_EVENTS
  await auditService.log({
    eventType: 'INSURANCE_DEPOSIT',
    category: 'COMPLIANCE_EVENTS',
    actor: userId,
    target: policy.id,
    details: {
      policyId: policy.id,
      premiumAmount,
      coverageAmount,
      coverageLevel: coverageLevel ?? null,
      sourceAccountId,
      poolAccountId,
      transactionId: transferResult.transactionId,
    },
  });

  return policy;
}

// ---------------------------------------------------------------------------
// Withdraw
// ---------------------------------------------------------------------------

/**
 * Withdraw from the insurance pool:
 * 1. Verify the InsurancePolicy exists and is active
 * 2. Submit CryptoTransferTransaction from pool to user's account
 * 3. Update InsurancePolicy status to CLAIMED
 * 4. Log to COMPLIANCE_EVENTS HCS topic
 */
export async function withdraw(userId: string, policyId: string) {
  const policy = await prisma.insurancePolicy.findUnique({
    where: { id: policyId },
  });
  if (!policy) throw new NotFoundError(`Insurance policy ${policyId} not found`);
  if (policy.userId !== userId) {
    throw new ValidationError('Insurance policy does not belong to this user');
  }
  if (policy.status !== 'ACTIVE') {
    throw new ValidationError('Insurance policy is not active');
  }

  // Get user's primary Hedera account
  const account = await prisma.hederaAccount.findFirst({
    where: { userId, status: 'ACTIVE' },
  });
  if (!account) {
    throw new NotFoundError('No active Hedera account found for user');
  }

  const poolAccountId = getPoolAccountId();

  // Submit CryptoTransferTransaction from pool to user
  const transferResult = await hederaClient.transferHbar(
    poolAccountId,
    account.accountId,
    policy.coverageAmount,
  );

  // Update InsurancePolicy status
  const updatedPolicy = await prisma.insurancePolicy.update({
    where: { id: policyId },
    data: {
      status: 'CLAIMED',
      transactionId: transferResult.transactionId,
      hashscanUrl: transferResult.hashscanUrl,
    },
  });

  // Log to COMPLIANCE_EVENTS
  await auditService.log({
    eventType: 'INSURANCE_WITHDRAWAL',
    category: 'COMPLIANCE_EVENTS',
    actor: userId,
    target: policyId,
    details: {
      policyId,
      coverageAmount: policy.coverageAmount,
      destinationAccountId: account.accountId,
      poolAccountId,
      transactionId: transferResult.transactionId,
    },
  });

  return updatedPolicy;
}

// ---------------------------------------------------------------------------
// Get Info
// ---------------------------------------------------------------------------

/**
 * Get insurance details for a user.
 */
export async function getInfo(userId: string) {
  const policies = await prisma.insurancePolicy.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  const activePolicies = policies.filter((p) => p.status === 'ACTIVE');
  const totalPremium = activePolicies.reduce((sum, p) => sum + p.premiumAmount, 0);
  const totalCoverage = activePolicies.reduce((sum, p) => sum + p.coverageAmount, 0);

  return {
    policies,
    activePolicies: activePolicies.length,
    totalPremium,
    totalCoverage,
  };
}
