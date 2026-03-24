import { prisma } from '@/lib/prisma';
import { HederaError } from '@/lib/errors';
import * as hederaClient from '@/modules/hedera/hedera.client';
import { AuditCategory } from '@prisma/client';
import winston from 'winston';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'init' },
  transports: [new winston.transports.Console()],
});

// ---------------------------------------------------------------------------
// Topic Definitions
// ---------------------------------------------------------------------------

const TOPICS: { category: AuditCategory; memo: string }[] = [
  { category: 'KEY_LIFECYCLE', memo: 'AEGIS Protocol - Key Lifecycle Events' },
  { category: 'SIGNING_EVENTS', memo: 'AEGIS Protocol - Signing Events' },
  { category: 'ACCESS_EVENTS', memo: 'AEGIS Protocol - Access Events' },
  { category: 'GUARDIAN_EVENTS', memo: 'AEGIS Protocol - Guardian Events' },
  { category: 'POLICY_EVENTS', memo: 'AEGIS Protocol - Policy Events' },
  { category: 'COMPLIANCE_EVENTS', memo: 'AEGIS Protocol - Compliance Events' },
];

// ---------------------------------------------------------------------------
// Token Definitions
// ---------------------------------------------------------------------------

interface TokenDef {
  name: string;
  symbol: string;
  type: 'FUNGIBLE' | 'NFT';
  decimals?: number;
  initialSupply?: number;
  royaltyPercent?: number;
  fallbackFeeHbar?: number;
}

const TOKENS: TokenDef[] = [
  {
    name: 'AEGIS Governance',
    symbol: 'AEGIS',
    type: 'FUNGIBLE',
    decimals: 8,
    initialSupply: 1_000_000_00000000, // 1M tokens with 8 decimals
  },
  {
    name: 'Key DNA NFT',
    symbol: 'KEYDNA',
    type: 'NFT',
    royaltyPercent: 5,
    fallbackFeeHbar: 1,
  },
  {
    name: 'Guardian Badge NFT',
    symbol: 'GBADGE',
    type: 'NFT',
    royaltyPercent: 5,
    fallbackFeeHbar: 1,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHashscanUrl(type: 'topic' | 'token', id: string): string {
  const network = process.env.HEDERA_NETWORK || 'testnet';
  return `https://hashscan.io/${network}/${type}/${id}`;
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

/**
 * Idempotent initialization:
 * 1. Check DB for existing HcsTopicConfig and TokenConfig records
 * 2. Create missing HCS topics (6 total)
 * 3. Create missing tokens (3 total)
 * 4. Store all topic IDs and token IDs with hashscan URLs in DB
 *
 * Throws on failure — caller should block request acceptance until complete.
 */
export async function initialize(): Promise<void> {
  logger.info('Starting AEGIS Protocol initialization...');

  // ── HCS Topics ──────────────────────────────────────────────────────────
  for (const topicDef of TOPICS) {
    const existing = await prisma.hcsTopicConfig.findUnique({
      where: { category: topicDef.category },
    });

    if (existing) {
      logger.info(`HCS topic already exists for ${topicDef.category}: ${existing.topicId}`);
      continue;
    }

    logger.info(`Creating HCS topic for ${topicDef.category}...`);
    try {
      const result = await hederaClient.createTopic(topicDef.memo);

      await prisma.hcsTopicConfig.create({
        data: {
          category: topicDef.category,
          topicId: result.topicId,
          memo: topicDef.memo,
          hashscanUrl: buildHashscanUrl('topic', result.topicId),
        },
      });

      logger.info(`Created HCS topic ${topicDef.category}: ${result.topicId}`);
    } catch (err) {
      const msg = `Failed to create HCS topic for ${topicDef.category}: ${err instanceof Error ? err.message : 'Unknown error'}`;
      logger.error(msg);
      throw new HederaError(msg);
    }
  }

  // ── Tokens ──────────────────────────────────────────────────────────────
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  if (!operatorId) {
    throw new HederaError('HEDERA_OPERATOR_ID environment variable is required');
  }

  for (const tokenDef of TOKENS) {
    const existing = await prisma.tokenConfig.findFirst({
      where: { name: tokenDef.name },
    });

    if (existing) {
      logger.info(`Token already exists: ${tokenDef.name} (${existing.tokenId})`);
      continue;
    }

    logger.info(`Creating token: ${tokenDef.name}...`);
    try {
      let tokenId: string;

      if (tokenDef.type === 'FUNGIBLE') {
        const result = await hederaClient.createFungibleToken({
          name: tokenDef.name,
          symbol: tokenDef.symbol,
          decimals: tokenDef.decimals ?? 0,
          initialSupply: tokenDef.initialSupply ?? 0,
          treasuryAccountId: operatorId,
        });
        tokenId = result.tokenId;
      } else {
        const result = await hederaClient.createNftCollection({
          name: tokenDef.name,
          symbol: tokenDef.symbol,
          treasuryAccountId: operatorId,
          royaltyPercent: tokenDef.royaltyPercent,
          fallbackFeeHbar: tokenDef.fallbackFeeHbar,
        });
        tokenId = result.tokenId;
      }

      await prisma.tokenConfig.create({
        data: {
          name: tokenDef.name,
          tokenId,
          type: tokenDef.type,
          hashscanUrl: buildHashscanUrl('token', tokenId),
        },
      });

      logger.info(`Created token ${tokenDef.name}: ${tokenId}`);
    } catch (err) {
      const msg = `Failed to create token ${tokenDef.name}: ${err instanceof Error ? err.message : 'Unknown error'}`;
      logger.error(msg);
      throw new HederaError(msg);
    }
  }

  logger.info('AEGIS Protocol initialization complete.');
}
