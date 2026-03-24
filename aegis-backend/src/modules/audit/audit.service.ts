import { createHash, randomUUID } from 'crypto';
import winston from 'winston';
import { prisma } from '@/lib/prisma';
import { AuditCategory } from '@prisma/client';
import * as kmsModule from '@/modules/kms/kms.service';
import * as hederaClient from '@/modules/hedera/hedera.client';
import type { AuditEvent, AuditMessage } from './audit.types';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'audit-logger' },
  transports: [new winston.transports.Console()],
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const SYSTEM_SIGNING_KEY_ENV = 'AEGIS_SYSTEM_KMS_KEY_ARN';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Partially mask a KMS key ARN: show first 20 chars + "..." + last 8 chars.
 * If the ARN is shorter than 30 chars, return it as-is.
 */
export function maskKmsKeyArn(arn: string): string {
  if (arn.length <= 28) return arn;
  return `${arn.slice(0, 20)}...${arn.slice(-8)}`;
}

/**
 * Build the JSON message payload (without signature).
 */
export function buildMessagePayload(
  eventId: string,
  timestamp: string,
  event: AuditEvent,
  maskedKmsKeyId: string,
): AuditMessage {
  return {
    eventId,
    timestamp,
    eventType: event.eventType,
    category: event.category,
    actor: event.actor,
    target: event.target,
    details: event.details,
    kmsKeyId: maskedKmsKeyId,
  };
}

/**
 * Compute SHA-256 hash of the JSON payload string.
 */
export function computePayloadHash(payload: AuditMessage): Buffer {
  const jsonString = JSON.stringify(payload);
  return createHash('sha256').update(jsonString).digest();
}

/**
 * Resolve the KMS key ARN to use for signing.
 * Uses the event's kmsKeyArn if provided, otherwise falls back to the system key.
 */
function resolveSigningKeyArn(event: AuditEvent): string {
  if (event.kmsKeyArn) return event.kmsKeyArn;
  const systemKey = process.env[SYSTEM_SIGNING_KEY_ENV];
  if (!systemKey) {
    throw new Error(
      `No KMS key ARN provided and ${SYSTEM_SIGNING_KEY_ENV} environment variable is not set`,
    );
  }
  return systemKey;
}

/**
 * Look up the HCS topic ID for a given audit category.
 */
async function getTopicId(category: AuditCategory): Promise<string> {
  const config = await prisma.hcsTopicConfig.findUnique({ where: { category } });
  if (!config) {
    throw new Error(`No HCS topic configured for category: ${category}`);
  }
  return config.topicId;
}

/**
 * Submit a message to an HCS topic with retry logic.
 * Returns the result on success, or null if all retries fail.
 */
async function submitWithRetry(
  topicId: string,
  message: string,
): Promise<{ transactionId: string; hashscanUrl: string; sequenceNumber: number } | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await hederaClient.submitMessage(topicId, message);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      if (attempt < MAX_RETRIES) {
        logger.warn(`HCS submission attempt ${attempt}/${MAX_RETRIES} failed: ${errMsg}`, {
          topicId,
          attempt,
        });
      } else {
        logger.error(
          `HCS submission failed after ${MAX_RETRIES} attempts: ${errMsg}`,
          { topicId },
        );
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main log function
// ---------------------------------------------------------------------------

/**
 * Log an audit event:
 * 1. Generate eventId (UUID v4) and timestamp (ISO-8601)
 * 2. Look up the HCS topic ID for the event's category
 * 3. Partially mask the kmsKeyId
 * 4. Construct the JSON message payload (without signature)
 * 5. Compute SHA-256 hash of the JSON string
 * 6. Sign the hash via KMS Module's signData
 * 7. Add hex-encoded signature to the message
 * 8. Submit the signed message to the HCS topic via Hedera Client
 * 9. Store AuditLog record in DB with all fields
 * 10. Return the AuditLog record
 */
export async function log(event: AuditEvent) {
  // 1. Generate eventId and timestamp
  const eventId = randomUUID();
  const timestamp = new Date().toISOString();

  // 2. Look up HCS topic ID
  const topicId = await getTopicId(event.category);

  // 3. Resolve and mask the KMS key ARN
  const signingKeyArn = resolveSigningKeyArn(event);
  const maskedKmsKeyId = maskKmsKeyArn(signingKeyArn);

  // 4. Build message payload (without signature)
  const payload = buildMessagePayload(eventId, timestamp, event, maskedKmsKeyId);

  // 5. Compute SHA-256 hash of the JSON payload
  const hash = computePayloadHash(payload);

  // 6. Sign the hash via KMS Module
  const signatureBytes = await kmsModule.signData(signingKeyArn, hash);

  // 7. Add hex-encoded signature to the message
  const signedMessage: AuditMessage = {
    ...payload,
    signature: signatureBytes.toString('hex'),
  };

  const messageString = JSON.stringify(signedMessage);

  // 8. Submit to HCS topic with retry
  const hcsResult = await submitWithRetry(topicId, messageString);

  // 9. Store AuditLog record in DB
  const auditLog = await prisma.auditLog.create({
    data: {
      id: eventId,
      eventType: event.eventType,
      category: event.category,
      actor: event.actor,
      target: event.target,
      details: event.details as any,
      kmsKeyId: maskedKmsKeyId,
      signature: signedMessage.signature,
      topicId,
      transactionId: hcsResult?.transactionId ?? null,
      hashscanUrl: hcsResult?.hashscanUrl ?? null,
      sequenceNumber: hcsResult?.sequenceNumber ?? null,
    },
  });

  // 10. Return the AuditLog record
  return auditLog;
}
