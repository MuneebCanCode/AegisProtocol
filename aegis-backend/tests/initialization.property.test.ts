import * as fc from 'fast-check';

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockHcsTopicConfigFindUnique = jest.fn();
const mockHcsTopicConfigCreate = jest.fn();
const mockTokenConfigFindFirst = jest.fn();
const mockTokenConfigCreate = jest.fn();

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    hcsTopicConfig: {
      findUnique: (...args: unknown[]) => mockHcsTopicConfigFindUnique(...args),
      create: (...args: unknown[]) => mockHcsTopicConfigCreate(...args),
    },
    tokenConfig: {
      findFirst: (...args: unknown[]) => mockTokenConfigFindFirst(...args),
      create: (...args: unknown[]) => mockTokenConfigCreate(...args),
    },
  },
}));

// ── Mock Hedera Client ───────────────────────────────────────────────────────

const mockCreateTopic = jest.fn();
const mockCreateFungibleToken = jest.fn();
const mockCreateNftCollection = jest.fn();

jest.mock('../src/modules/hedera/hedera.client', () => ({
  createTopic: (...args: unknown[]) => mockCreateTopic(...args),
  createFungibleToken: (...args: unknown[]) => mockCreateFungibleToken(...args),
  createNftCollection: (...args: unknown[]) => mockCreateNftCollection(...args),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { initialize } from '../src/modules/init/init.service';

// ── Setup ────────────────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.HEDERA_OPERATOR_ID = '0.0.1234';
  process.env.HEDERA_NETWORK = 'testnet';
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Initialization Property Tests', () => {
  // Feature: aegis-protocol, Property 13: Initialization Idempotence
  // **Validates: Requirements 1.4**
  it('Property 13: Initialization Idempotence — when all resources exist, no new Hedera resources are created', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        async (_seed) => {
          jest.clearAllMocks();

          // All 6 HCS topics already exist
          mockHcsTopicConfigFindUnique.mockResolvedValue({
            topicId: '0.0.5000',
            category: 'KEY_LIFECYCLE',
            memo: 'existing',
            hashscanUrl: 'https://hashscan.io/testnet/topic/0.0.5000',
          });

          // All 3 tokens already exist
          mockTokenConfigFindFirst.mockResolvedValue({
            tokenId: '0.0.6000',
            name: 'existing',
            hashscanUrl: 'https://hashscan.io/testnet/token/0.0.6000',
          });

          await initialize();

          // No Hedera resources should have been created
          expect(mockCreateTopic).not.toHaveBeenCalled();
          expect(mockCreateFungibleToken).not.toHaveBeenCalled();
          expect(mockCreateNftCollection).not.toHaveBeenCalled();

          // No DB creates should have been called
          expect(mockHcsTopicConfigCreate).not.toHaveBeenCalled();
          expect(mockTokenConfigCreate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  // Feature: aegis-protocol, Property 14: Initialization Resource Hashscan URLs
  // **Validates: Requirements 1.3**
  it('Property 14: Initialization Resource Hashscan URLs — every created resource has a non-empty hashscanUrl', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1000, max: 99999 }),
        async (topicIdNum) => {
          jest.clearAllMocks();

          // No existing resources — all need to be created
          mockHcsTopicConfigFindUnique.mockResolvedValue(null);
          mockTokenConfigFindFirst.mockResolvedValue(null);

          // Hedera creates return IDs
          mockCreateTopic.mockResolvedValue({
            topicId: `0.0.${topicIdNum}`,
            transactionId: '0.0.1@123.000',
            hashscanUrl: `https://hashscan.io/testnet/topic/0.0.${topicIdNum}`,
            status: 'SUCCESS',
          });

          mockCreateFungibleToken.mockResolvedValue({
            tokenId: `0.0.${topicIdNum + 100}`,
            transactionId: '0.0.1@124.000',
            hashscanUrl: `https://hashscan.io/testnet/token/0.0.${topicIdNum + 100}`,
            status: 'SUCCESS',
          });

          mockCreateNftCollection.mockResolvedValue({
            tokenId: `0.0.${topicIdNum + 200}`,
            transactionId: '0.0.1@125.000',
            hashscanUrl: `https://hashscan.io/testnet/token/0.0.${topicIdNum + 200}`,
            status: 'SUCCESS',
          });

          mockHcsTopicConfigCreate.mockImplementation((args: any) =>
            Promise.resolve({ id: 'created', ...args.data }),
          );
          mockTokenConfigCreate.mockImplementation((args: any) =>
            Promise.resolve({ id: 'created', ...args.data }),
          );

          await initialize();

          // Verify all HCS topic creates have non-empty hashscanUrl
          for (const call of mockHcsTopicConfigCreate.mock.calls) {
            const data = call[0].data;
            expect(data.hashscanUrl).toBeTruthy();
            expect(typeof data.hashscanUrl).toBe('string');
            expect(data.hashscanUrl.length).toBeGreaterThan(0);
            expect(data.hashscanUrl).toContain('hashscan.io');
          }

          // Verify all token creates have non-empty hashscanUrl
          for (const call of mockTokenConfigCreate.mock.calls) {
            const data = call[0].data;
            expect(data.hashscanUrl).toBeTruthy();
            expect(typeof data.hashscanUrl).toBe('string');
            expect(data.hashscanUrl.length).toBeGreaterThan(0);
            expect(data.hashscanUrl).toContain('hashscan.io');
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
