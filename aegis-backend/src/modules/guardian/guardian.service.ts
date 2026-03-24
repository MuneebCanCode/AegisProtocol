import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError, HederaError } from '@/lib/errors';
import * as hederaClient from '@/modules/hedera/hedera.client';
import * as auditService from '@/modules/audit/audit.service';
import { AccountUpdateTransaction, AccountId, PublicKey } from '@hashgraph/sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecoveryStatus {
  scheduleId: string | null;
  threshold: number;
  approvedCount: number;
  approvedGuardians: { accountId: string; hashscanUrl: string }[];
  isComplete: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up the Guardian Badge token ID from the TokenConfig table.
 */
async function getGuardianBadgeTokenId(): Promise<string> {
  const tokenConfig = await prisma.tokenConfig.findFirst({
    where: { name: { contains: 'Guardian Badge' } },
  });
  if (!tokenConfig) {
    throw new NotFoundError('Guardian Badge token not found in TokenConfig');
  }
  return tokenConfig.tokenId;
}

/**
 * Get the first Hedera account for a user.
 */
async function getUserHederaAccount(userId: string) {
  const account = await prisma.hederaAccount.findFirst({
    where: { userId },
    include: { managedKey: true },
  });
  if (!account) {
    throw new NotFoundError(`No Hedera account found for user ${userId}`);
  }
  return account;
}

// ---------------------------------------------------------------------------
// Guardian Assignment
// ---------------------------------------------------------------------------

/**
 * Assign a guardian to a user:
 * 1. Create GuardianAssignment record
 * 2. Mint Guardian Badge NFT with relationship metadata
 * 3. Associate token with guardian's Hedera account
 * 4. Transfer NFT to guardian's account
 * 5. Log to GUARDIAN_EVENTS
 */
export async function assignGuardian(
  userId: string,
  guardianUserId: string,
  role: string,
  weight: number,
) {
  // Validate users exist
  const [user, guardian] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.user.findUnique({ where: { id: guardianUserId } }),
  ]);
  if (!user) throw new NotFoundError(`User ${userId} not found`);
  if (!guardian) throw new NotFoundError(`Guardian user ${guardianUserId} not found`);

  // Get guardian's Hedera account
  const guardianAccount = await getUserHederaAccount(guardianUserId);
  const tokenId = await getGuardianBadgeTokenId();
  const operatorId = process.env.HEDERA_OPERATOR_ID!;

  // 1. Mint Guardian Badge NFT with relationship metadata
  const metadata = Buffer.from(
    JSON.stringify({
      type: 'GuardianBadge',
      protectedUser: userId,
      guardianUser: guardianUserId,
      role,
      weight,
      assignedAt: new Date().toISOString(),
    }),
  );
  const mintResult = await hederaClient.mintNft(tokenId, metadata);

  // 2. Associate token with guardian's account (may already be associated)
  try {
    await hederaClient.associateToken(guardianAccount.accountId, tokenId);
  } catch {
    // Token may already be associated — ignore association errors
  }

  // 3. Transfer NFT from treasury to guardian
  const transferResult = await hederaClient.transferNft(
    tokenId,
    mintResult.serialNumber,
    operatorId,
    guardianAccount.accountId,
  );

  // 4. Create GuardianAssignment record
  const assignment = await prisma.guardianAssignment.create({
    data: {
      userId,
      guardianUserId,
      role,
      weight,
      nftSerial: mintResult.serialNumber,
      hashscanUrl: transferResult.hashscanUrl,
    },
  });

  // 5. Log to GUARDIAN_EVENTS
  await auditService.log({
    eventType: 'GUARDIAN_ASSIGNED',
    category: 'GUARDIAN_EVENTS',
    actor: userId,
    target: guardianUserId,
    details: {
      assignmentId: assignment.id,
      role,
      weight,
      nftSerial: mintResult.serialNumber,
      tokenId,
      guardianAccountId: guardianAccount.accountId,
      mintTransactionId: mintResult.transactionId,
      transferTransactionId: transferResult.transactionId,
    },
  });

  return assignment;
}


// ---------------------------------------------------------------------------
// Guardian Removal
// ---------------------------------------------------------------------------

/**
 * Remove a guardian:
 * 1. Transfer Guardian Badge NFT back to treasury (burn equivalent)
 * 2. Set GuardianAssignment status to REVOKED
 * 3. Log to GUARDIAN_EVENTS
 */
export async function removeGuardian(assignmentId: string) {
  const assignment = await prisma.guardianAssignment.findUnique({
    where: { id: assignmentId },
  });
  if (!assignment) {
    throw new NotFoundError(`Guardian assignment ${assignmentId} not found`);
  }
  if (assignment.status === 'REVOKED') {
    throw new ValidationError('Guardian assignment is already revoked');
  }

  const tokenId = await getGuardianBadgeTokenId();
  const operatorId = process.env.HEDERA_OPERATOR_ID!;
  const guardianAccount = await getUserHederaAccount(assignment.guardianUserId);

  // 1. Transfer NFT back to treasury (acts as burn)
  let transferResult: hederaClient.HederaResult | undefined;
  if (assignment.nftSerial) {
    transferResult = await hederaClient.transferNft(
      tokenId,
      assignment.nftSerial,
      guardianAccount.accountId,
      operatorId,
    );
  }

  // 2. Set status to REVOKED
  await prisma.guardianAssignment.update({
    where: { id: assignmentId },
    data: { status: 'REVOKED' },
  });

  // 3. Log to GUARDIAN_EVENTS
  await auditService.log({
    eventType: 'GUARDIAN_REMOVED',
    category: 'GUARDIAN_EVENTS',
    actor: assignment.userId,
    target: assignment.guardianUserId,
    details: {
      assignmentId,
      nftSerial: assignment.nftSerial,
      tokenId,
      guardianAccountId: guardianAccount.accountId,
      transferTransactionId: transferResult?.transactionId ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Recovery Threshold
// ---------------------------------------------------------------------------

/**
 * Set the recovery threshold for a user.
 */
export async function setRecoveryThreshold(userId: string, threshold: number) {
  if (threshold < 1) {
    throw new ValidationError('Recovery threshold must be at least 1');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  await prisma.user.update({
    where: { id: userId },
    data: { recoveryThreshold: threshold },
  });
}

// ---------------------------------------------------------------------------
// Recovery Initiation
// ---------------------------------------------------------------------------

/**
 * Initiate social recovery:
 * 1. Verify guardian holds a valid Guardian Badge NFT
 * 2. Create a ScheduleCreateTransaction wrapping an AccountUpdateTransaction (key rotation)
 * 3. Log to GUARDIAN_EVENTS
 */
export async function initiateRecovery(
  guardianUserId: string,
  targetUserId: string,
): Promise<{ scheduleId: string; hashscanUrl: string }> {
  // Verify guardian assignment exists and is active
  const assignment = await prisma.guardianAssignment.findFirst({
    where: {
      userId: targetUserId,
      guardianUserId,
      status: 'ACTIVE',
    },
  });
  if (!assignment) {
    throw new ValidationError(
      'No active guardian assignment found. Guardian Badge NFT ownership required.',
    );
  }

  // Verify guardian has an NFT serial (proof of badge ownership)
  if (!assignment.nftSerial) {
    throw new ValidationError('Guardian does not hold a valid Guardian Badge NFT');
  }

  // Get target user's Hedera account and managed key for key rotation
  const targetAccount = await getUserHederaAccount(targetUserId);
  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) throw new NotFoundError(`Target user ${targetUserId} not found`);

  // Build an AccountUpdateTransaction for key rotation as the scheduled inner transaction
  const newPublicKey = PublicKey.fromBytesECDSA(
    Buffer.from(targetAccount.managedKey.publicKey, 'hex'),
  );
  const accountUpdateTx = new AccountUpdateTransaction()
    .setAccountId(AccountId.fromString(targetAccount.accountId))
    .setKey(newPublicKey);

  // Create a scheduled transaction requiring threshold guardian signatures
  const scheduleResult = await hederaClient.createSchedule(
    accountUpdateTx,
    `AEGIS Recovery for ${targetAccount.accountId} initiated by guardian ${guardianUserId}`,
  );

  // Log to GUARDIAN_EVENTS
  await auditService.log({
    eventType: 'RECOVERY_INITIATED',
    category: 'GUARDIAN_EVENTS',
    actor: guardianUserId,
    target: targetUserId,
    details: {
      scheduleId: scheduleResult.scheduleId,
      targetAccountId: targetAccount.accountId,
      threshold: targetUser.recoveryThreshold,
      transactionId: scheduleResult.transactionId,
    },
  });

  return {
    scheduleId: scheduleResult.scheduleId,
    hashscanUrl: scheduleResult.hashscanUrl,
  };
}


// ---------------------------------------------------------------------------
// Recovery Signing
// ---------------------------------------------------------------------------

/**
 * Sign a recovery scheduled transaction as a guardian.
 * Uses the guardian's KMS key to submit a ScheduleSignTransaction.
 */
export async function signRecovery(
  guardianUserId: string,
  scheduleId: string,
): Promise<hederaClient.HederaResult> {
  // Get guardian's Hedera account and KMS key
  const guardianAccount = await getUserHederaAccount(guardianUserId);

  // Sign the schedule using the guardian's KMS key
  const result = await hederaClient.signSchedule(
    scheduleId,
    guardianAccount.managedKey.kmsKeyArn,
  );

  // Log to GUARDIAN_EVENTS
  await auditService.log({
    eventType: 'RECOVERY_APPROVED',
    category: 'GUARDIAN_EVENTS',
    actor: guardianUserId,
    target: scheduleId,
    details: {
      guardianAccountId: guardianAccount.accountId,
      scheduleId,
      transactionId: result.transactionId,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Recovery Status
// ---------------------------------------------------------------------------

/**
 * Get the recovery status for a user:
 * - threshold from user's recoveryThreshold
 * - active guardians and their approval status
 * - hashscan URLs for approved guardians
 */
export async function getRecoveryStatus(userId: string): Promise<RecoveryStatus> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  // Get all active guardian assignments for this user
  const assignments = await prisma.guardianAssignment.findMany({
    where: { userId, status: 'ACTIVE' },
    include: {
      guardian: {
        include: {
          hederaAccounts: { take: 1 },
        },
      },
    },
  });

  // Find the most recent recovery-related audit logs for this user
  const recoveryLogs = await prisma.auditLog.findMany({
    where: {
      category: 'GUARDIAN_EVENTS',
      target: userId,
      eventType: { in: ['RECOVERY_INITIATED', 'RECOVERY_APPROVED'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Find the latest RECOVERY_INITIATED log to get the scheduleId
  const initiationLog = recoveryLogs.find((l) => l.eventType === 'RECOVERY_INITIATED');
  const scheduleId =
    initiationLog && typeof initiationLog.details === 'object' && initiationLog.details !== null
      ? (initiationLog.details as Record<string, unknown>).scheduleId as string | null
      : null;

  // Find approval logs for the current schedule
  const approvalLogs = scheduleId
    ? recoveryLogs.filter(
        (l) =>
          l.eventType === 'RECOVERY_APPROVED' &&
          typeof l.details === 'object' &&
          l.details !== null &&
          (l.details as Record<string, unknown>).scheduleId === scheduleId,
      )
    : [];

  const network = process.env.HEDERA_NETWORK || 'testnet';

  // Build approved guardians list with hashscan URLs
  const approvedGuardians = approvalLogs.map((log) => {
    const details = log.details as Record<string, unknown>;
    const guardianAccountId = (details.guardianAccountId as string) || '';
    const transactionId = (details.transactionId as string) || '';
    return {
      accountId: guardianAccountId,
      hashscanUrl: transactionId
        ? `https://hashscan.io/${network}/transaction/${transactionId}`
        : '',
    };
  });

  const threshold = user.recoveryThreshold;
  const approvedCount = approvedGuardians.length;

  return {
    scheduleId,
    threshold,
    approvedCount,
    approvedGuardians,
    isComplete: approvedCount >= threshold,
  };
}
