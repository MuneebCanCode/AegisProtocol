import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/errors';
import * as hederaClient from '@/modules/hedera/hedera.client';
import * as auditService from '@/modules/audit/audit.service';
import { TransferTransaction, Hbar, AccountId } from '@hashgraph/sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeadManConfig {
  inactivityTimeoutDays: number;
  recoveryAccountId: string;
  transferAmount: number;
  sourceAccountId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a TransferTransaction that moves HBAR from source to recovery account.
 * This is the inner transaction wrapped by the ScheduleCreateTransaction.
 */
function buildTransferTransaction(
  sourceAccountId: string,
  recoveryAccountId: string,
  transferAmount: number,
): TransferTransaction {
  return new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(sourceAccountId), new Hbar(-transferAmount))
    .addHbarTransfer(AccountId.fromString(recoveryAccountId), new Hbar(transferAmount));
}

// ---------------------------------------------------------------------------
// Configure Dead Man's Switch
// ---------------------------------------------------------------------------

/**
 * Configure a dead man's switch for a user:
 * 1. Validate configuration parameters
 * 2. Create a TransferTransaction (source → recovery) as the inner scheduled tx
 * 3. Create a ScheduleCreateTransaction wrapping the transfer with inactivity timeout
 * 4. Store DeadmanSwitch record in the database
 * 5. Log to KEY_LIFECYCLE HCS topic
 */
export async function configure(
  userId: string,
  config: DeadManConfig,
): Promise<ReturnType<typeof prisma.deadmanSwitch.create>> {
  const { inactivityTimeoutDays, recoveryAccountId, transferAmount, sourceAccountId } = config;

  if (inactivityTimeoutDays <= 0) {
    throw new ValidationError('Inactivity timeout must be greater than 0 days');
  }
  if (transferAmount <= 0) {
    throw new ValidationError('Transfer amount must be greater than 0');
  }

  // Build the inner transfer transaction
  const transferTx = buildTransferTransaction(sourceAccountId, recoveryAccountId, transferAmount);

  // Create a scheduled transaction on Hedera with the inactivity timeout as memo context
  const scheduleResult = await hederaClient.createSchedule(
    transferTx,
    `AEGIS Dead Man Switch: ${sourceAccountId} → ${recoveryAccountId} after ${inactivityTimeoutDays}d inactivity`,
  );

  // Store DeadmanSwitch record
  const deadmanSwitch = await prisma.deadmanSwitch.create({
    data: {
      userId,
      inactivityTimeoutDays,
      recoveryAccountId,
      transferAmount,
      sourceAccountId,
      scheduleId: scheduleResult.scheduleId,
      lastHeartbeat: new Date(),
      status: 'ACTIVE',
    },
  });

  // Log to KEY_LIFECYCLE
  await auditService.log({
    eventType: 'DEADMAN_CONFIGURED',
    category: 'KEY_LIFECYCLE',
    actor: userId,
    target: sourceAccountId,
    details: {
      deadmanSwitchId: deadmanSwitch.id,
      inactivityTimeoutDays,
      recoveryAccountId,
      transferAmount,
      scheduleId: scheduleResult.scheduleId,
      transactionId: scheduleResult.transactionId,
      hashscanUrl: scheduleResult.hashscanUrl,
    },
  });

  return deadmanSwitch;
}

// ---------------------------------------------------------------------------
// Send Heartbeat
// ---------------------------------------------------------------------------

/**
 * Send a heartbeat signal for a user's dead man's switch:
 * 1. Find the active DeadmanSwitch record for the user
 * 2. Update the lastHeartbeat timestamp
 * 3. Delete the existing scheduled transaction on Hedera
 * 4. Create a new scheduled transaction with fresh expiration
 * 5. Update the scheduleId in the database
 * 6. Log to KEY_LIFECYCLE HCS topic
 */
export async function sendHeartbeat(userId: string): Promise<void> {
  // Find active dead man's switch for the user
  const deadmanSwitch = await prisma.deadmanSwitch.findFirst({
    where: { userId, status: 'ACTIVE' },
  });

  if (!deadmanSwitch) {
    throw new NotFoundError('No active dead man switch found for this user');
  }

  // Delete the existing scheduled transaction
  if (deadmanSwitch.scheduleId) {
    await hederaClient.deleteSchedule(deadmanSwitch.scheduleId);
  }

  // Build a fresh transfer transaction
  const transferTx = buildTransferTransaction(
    deadmanSwitch.sourceAccountId,
    deadmanSwitch.recoveryAccountId,
    deadmanSwitch.transferAmount,
  );

  // Create a new scheduled transaction with fresh expiration
  const scheduleResult = await hederaClient.createSchedule(
    transferTx,
    `AEGIS Dead Man Switch: ${deadmanSwitch.sourceAccountId} → ${deadmanSwitch.recoveryAccountId} after ${deadmanSwitch.inactivityTimeoutDays}d inactivity`,
  );

  // Update the DeadmanSwitch record with new heartbeat and schedule
  await prisma.deadmanSwitch.update({
    where: { id: deadmanSwitch.id },
    data: {
      lastHeartbeat: new Date(),
      scheduleId: scheduleResult.scheduleId,
    },
  });

  // Log to KEY_LIFECYCLE
  await auditService.log({
    eventType: 'HEARTBEAT_SENT',
    category: 'KEY_LIFECYCLE',
    actor: userId,
    target: deadmanSwitch.sourceAccountId,
    details: {
      deadmanSwitchId: deadmanSwitch.id,
      oldScheduleId: deadmanSwitch.scheduleId,
      newScheduleId: scheduleResult.scheduleId,
      transactionId: scheduleResult.transactionId,
      hashscanUrl: scheduleResult.hashscanUrl,
    },
  });
}

// ---------------------------------------------------------------------------
// Get Status
// ---------------------------------------------------------------------------

/**
 * Get the current dead man's switch status for a user.
 */
export async function getStatus(
  userId: string,
): Promise<ReturnType<typeof prisma.deadmanSwitch.findFirst>> {
  const deadmanSwitch = await prisma.deadmanSwitch.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  if (!deadmanSwitch) {
    throw new NotFoundError('No dead man switch found for this user');
  }

  return deadmanSwitch;
}
