import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError, KmsError, HederaError } from '@/lib/errors';
import * as kmsModule from '@/modules/kms/kms.service';
import * as hederaClient from '@/modules/hedera/hedera.client';
import * as auditService from '@/modules/audit/audit.service';
import winston from 'winston';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'key-rotation' },
  transports: [new winston.transports.Console()],
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DELETION_GRACE_DAYS = 30;

// ---------------------------------------------------------------------------
// Rotate Key
// ---------------------------------------------------------------------------

/**
 * Rotate a managed key:
 * 1. Generate a new KMS key
 * 2. Parse the new public key
 * 3. Update the Hedera account key via AccountUpdateTransaction
 * 4. Create a RotationRecord in DB
 * 5. Schedule old key for deletion
 * 6. Log to KEY_LIFECYCLE HCS topic
 *
 * Rollback: If account update fails, schedule new key for deletion.
 *           If old key deletion scheduling fails, log warning but don't roll back.
 */
export async function rotateKey(
  keyId: string,
  gracePeriodDays: number = DEFAULT_DELETION_GRACE_DAYS,
) {
  // 1. Fetch the existing managed key and its Hedera account
  const managedKey = await prisma.managedKey.findUnique({
    where: { id: keyId },
    include: { hederaAccount: true },
  });
  if (!managedKey) throw new NotFoundError(`Managed key not found: ${keyId}`);
  if (managedKey.status !== 'ACTIVE') {
    throw new ValidationError('Can only rotate active keys');
  }
  if (!managedKey.hederaAccount) {
    throw new ValidationError('Key has no associated Hedera account');
  }

  const oldKeyArn = managedKey.kmsKeyArn;
  const accountId = managedKey.hederaAccount.accountId;

  // 2. Generate a new KMS key
  const newKey = await kmsModule.generateKey(managedKey.userId);
  const newPublicKeyBuffer = Buffer.from(newKey.publicKey, 'hex');

  // 3. Update the Hedera account key
  let updateResult: hederaClient.HederaResult;
  try {
    updateResult = await hederaClient.updateAccount(
      accountId,
      newPublicKeyBuffer,
      oldKeyArn,
    );
  } catch (err) {
    // Rollback: schedule the new key for deletion since account update failed
    logger.error('Hedera account update failed during rotation, rolling back new key', {
      keyId,
      newKeyArn: newKey.kmsKeyArn,
      error: err instanceof Error ? err.message : 'Unknown error',
    });

    try {
      await kmsModule.scheduleKeyDeletion(newKey.kmsKeyArn, 7);
    } catch (deleteErr) {
      logger.error('Failed to schedule rollback deletion of new key', {
        newKeyArn: newKey.kmsKeyArn,
        error: deleteErr instanceof Error ? deleteErr.message : 'Unknown error',
      });
    }

    throw err instanceof HederaError
      ? err
      : new HederaError(`Account key update failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  // 4. Update the managed key record to point to the new KMS key
  await prisma.managedKey.update({
    where: { id: keyId },
    data: {
      kmsKeyArn: newKey.kmsKeyArn,
      kmsKeyAlias: newKey.kmsKeyAlias,
      publicKey: newKey.publicKey,
      status: 'ACTIVE',
    },
  });

  // Mark the newly generated key record as ROTATED (it was a temporary record)
  await prisma.managedKey.update({
    where: { id: newKey.id },
    data: { status: 'ROTATED' },
  });

  // 5. Create RotationRecord
  const rotationRecord = await prisma.rotationRecord.create({
    data: {
      managedKeyId: keyId,
      oldKmsKeyArn: oldKeyArn,
      newKmsKeyArn: newKey.kmsKeyArn,
      transactionId: updateResult.transactionId,
      hashscanUrl: updateResult.hashscanUrl,
    },
  });

  // 6. Schedule old key for deletion (with grace period)
  try {
    await kmsModule.scheduleKeyDeletion(oldKeyArn, gracePeriodDays);
  } catch (err) {
    // Log warning but don't roll back — the rotation itself succeeded
    logger.warn('Failed to schedule old key deletion after rotation', {
      oldKeyArn,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }

  // 7. Log to KEY_LIFECYCLE
  await auditService.log({
    eventType: 'KEY_ROTATED',
    category: 'KEY_LIFECYCLE',
    actor: managedKey.userId,
    target: keyId,
    details: {
      rotationRecordId: rotationRecord.id,
      oldKmsKeyArn: oldKeyArn,
      newKmsKeyArn: newKey.kmsKeyArn,
      accountId,
      gracePeriodDays,
      transactionId: updateResult.transactionId,
      hashscanUrl: updateResult.hashscanUrl,
    },
    kmsKeyArn: newKey.kmsKeyArn,
  });

  return {
    rotationRecord,
    newKeyId: newKey.id,
    transactionId: updateResult.transactionId,
    hashscanUrl: updateResult.hashscanUrl,
  };
}

// ---------------------------------------------------------------------------
// Get Rotation History
// ---------------------------------------------------------------------------

/**
 * Get rotation history for a user's managed keys.
 */
export async function getRotationHistory(userId: string) {
  const records = await prisma.rotationRecord.findMany({
    where: {
      managedKey: { userId },
    },
    include: {
      managedKey: {
        select: { id: true, kmsKeyAlias: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return records;
}
