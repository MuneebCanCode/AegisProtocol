import {
  KMSClient,
  CreateKeyCommand,
  CreateAliasCommand,
  GetPublicKeyCommand,
  SignCommand,
  ScheduleKeyDeletionCommand,
  KeyUsageType,
  KeySpec,
  MessageType,
  SigningAlgorithmSpec,
} from '@aws-sdk/client-kms';
import { createHash, randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { KmsError, NotFoundError } from '@/lib/errors';
import { parsePublicKey, parseSignature } from './der-parser';
import { normalize } from './low-s-normalizer';

function getKmsClient(): KMSClient {
  return new KMSClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });
}

// Singleton KMS client
let kmsClient: KMSClient | null = null;

function getClient(): KMSClient {
  if (!kmsClient) {
    kmsClient = getKmsClient();
  }
  return kmsClient;
}

/**
 * Generate a new ECC_SECG_P256K1 key in AWS KMS, extract the public key,
 * and store a ManagedKey record in the database.
 */
export async function generateKey(userId: string) {
  const client = getClient();
  const aliasName = `alias/aegis-${randomUUID()}`;

  // 1. Create the asymmetric signing key
  let createKeyResult;
  try {
    createKeyResult = await client.send(
      new CreateKeyCommand({
        KeySpec: KeySpec.ECC_SECG_P256K1,
        KeyUsage: KeyUsageType.SIGN_VERIFY,
        Description: `AEGIS managed key for user ${userId}`,
      })
    );
  } catch (err) {
    throw new KmsError(
      `Failed to create KMS key: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }

  const keyArn = createKeyResult.KeyMetadata?.Arn;
  const keyId = createKeyResult.KeyMetadata?.KeyId;
  if (!keyArn || !keyId) {
    throw new KmsError('KMS CreateKey response missing key ARN or ID');
  }

  // 2. Create an alias for the key
  try {
    await client.send(
      new CreateAliasCommand({
        AliasName: aliasName,
        TargetKeyId: keyId,
      })
    );
  } catch (err) {
    throw new KmsError(
      `Failed to create KMS alias: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }

  // 3. Get the DER-encoded public key
  let publicKeyDer: Uint8Array;
  try {
    const pubKeyResult = await client.send(
      new GetPublicKeyCommand({ KeyId: keyArn })
    );
    if (!pubKeyResult.PublicKey) {
      throw new Error('GetPublicKey response missing PublicKey');
    }
    publicKeyDer = pubKeyResult.PublicKey;
  } catch (err) {
    if (err instanceof KmsError) throw err;
    throw new KmsError(
      `Failed to get public key: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }

  // 4. Parse DER to get raw public key bytes
  const rawPublicKey = parsePublicKey(Buffer.from(publicKeyDer));
  const publicKeyHex = rawPublicKey.toString('hex');

  // 5. Store ManagedKey record in DB
  const managedKey = await prisma.managedKey.create({
    data: {
      userId,
      kmsKeyArn: keyArn,
      kmsKeyAlias: aliasName,
      publicKey: publicKeyHex,
    },
  });

  return managedKey;
}

/**
 * Get the raw public key bytes for a given KMS key ARN.
 */
export async function getPublicKey(keyArn: string): Promise<Buffer> {
  const client = getClient();

  let publicKeyDer: Uint8Array;
  try {
    const result = await client.send(
      new GetPublicKeyCommand({ KeyId: keyArn })
    );
    if (!result.PublicKey) {
      throw new Error('GetPublicKey response missing PublicKey');
    }
    publicKeyDer = result.PublicKey;
  } catch (err) {
    if (err instanceof KmsError) throw err;
    throw new KmsError(
      `Failed to get public key: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }

  return parsePublicKey(Buffer.from(publicKeyDer));
}

/**
 * Sign data using a KMS key. Hashes the data with SHA-256, sends the digest
 * to KMS for signing, parses the DER signature, and normalizes to low-S form.
 * Returns concatenated r+s (64 bytes).
 */
export async function signData(keyArn: string, data: Buffer): Promise<Buffer> {
  const client = getClient();

  // 1. Hash the data with SHA-256
  const digest = createHash('sha256').update(data).digest();

  // 2. Sign the digest via KMS
  let derSignature: Uint8Array;
  try {
    const result = await client.send(
      new SignCommand({
        KeyId: keyArn,
        Message: digest,
        MessageType: MessageType.DIGEST,
        SigningAlgorithm: SigningAlgorithmSpec.ECDSA_SHA_256,
      })
    );
    if (!result.Signature) {
      throw new Error('Sign response missing Signature');
    }
    derSignature = result.Signature;
  } catch (err) {
    if (err instanceof KmsError) throw err;
    throw new KmsError(
      `Failed to sign data: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }

  // 3. Parse DER signature to get (r, s)
  const { r, s } = parseSignature(Buffer.from(derSignature));

  // 4. Normalize to low-S form
  const normalized = normalize(r, s);

  // 5. Return concatenated r+s (64 bytes)
  return Buffer.concat([normalized.r, normalized.s]);
}

/**
 * Schedule a KMS key for deletion and update the ManagedKey status in the database.
 */
export async function scheduleKeyDeletion(
  keyArn: string,
  pendingWindowDays: number
): Promise<void> {
  const client = getClient();

  try {
    await client.send(
      new ScheduleKeyDeletionCommand({
        KeyId: keyArn,
        PendingWindowInDays: pendingWindowDays,
      })
    );
  } catch (err) {
    throw new KmsError(
      `Failed to schedule key deletion: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }

  // Update ManagedKey status in DB
  await prisma.managedKey.update({
    where: { kmsKeyArn: keyArn },
    data: { status: 'PENDING_DELETION' },
  });
}

/**
 * List all ManagedKey records for a given user.
 */
export async function listUserKeys(userId: string) {
  return prisma.managedKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}
