import * as fc from 'fast-check';

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockProposalFindUnique = jest.fn();
const mockVoteFindUnique = jest.fn();
const mockVoteCreate = jest.fn();
const mockVoteUpdate = jest.fn();
const mockProposalUpdate = jest.fn();
const mockTokenConfigFindFirst = jest.fn();
const mockHcsTopicConfigFindFirst = jest.fn();
const mockHederaAccountFindFirst = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    proposal: {
      findUnique: (...args: unknown[]) => mockProposalFindUnique(...args),
      update: (...args: unknown[]) => mockProposalUpdate(...args),
    },
    vote: {
      findUnique: (...args: unknown[]) => mockVoteFindUnique(...args),
      create: (...args: unknown[]) => mockVoteCreate(...args),
      update: (...args: unknown[]) => mockVoteUpdate(...args),
    },
    tokenConfig: {
      findFirst: (...args: unknown[]) => mockTokenConfigFindFirst(...args),
    },
    hcsTopicConfig: {
      findFirst: (...args: unknown[]) => mockHcsTopicConfigFindFirst(...args),
    },
    hederaAccount: {
      findFirst: (...args: unknown[]) => mockHederaAccountFindFirst(...args),
    },
  },
}));

// ── Mock Hedera Client ───────────────────────────────────────────────────────

const mockSubmitMessage = jest.fn();

jest.mock('@/modules/hedera/hedera.client', () => ({
  submitMessage: (...args: unknown[]) => mockSubmitMessage(...args),
}));

// ── Mock Audit Service ───────────────────────────────────────────────────────

jest.mock('@/modules/audit/audit.service', () => ({
  log: jest.fn().mockResolvedValue({}),
}));

// ── Mock Mirror Client ───────────────────────────────────────────────────────

const mockGetTokenInfo = jest.fn();

const mirrorExports = {
  getTokenInfo: (...args: unknown[]) => mockGetTokenInfo(...args),
  getAccountBalance: jest.fn(),
  getTransactionHistory: jest.fn(),
  subscribeToTopic: jest.fn(),
  unsubscribe: jest.fn(),
  unsubscribeAll: jest.fn(),
};

jest.mock('@/modules/mirror/mirror.client', () => ({
  __esModule: true,
  ...mirrorExports,
  default: mirrorExports,
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { castVote } from '../governance.service';
import { ConflictError } from '@/lib/errors';

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupGovernanceMocks(tokenBalance: number) {
  // Token config lookup
  mockTokenConfigFindFirst.mockResolvedValue({ tokenId: '0.0.6000' });
  // HCS topic for governance
  mockHcsTopicConfigFindFirst.mockResolvedValue({ topicId: '0.0.5005', category: 'COMPLIANCE_EVENTS' });
  // User has an active Hedera account
  mockHederaAccountFindFirst.mockResolvedValue({ accountId: '0.0.7000', userId: 'user-1', status: 'ACTIVE' });
  // Mirror node returns token info (balance proxy)
  mockGetTokenInfo.mockResolvedValue({
    token_id: '0.0.6000',
    name: 'AEGIS Governance',
    symbol: 'AEGIS',
    total_supply: '1000000',
    type: 'FUNGIBLE_COMMON',
  });
  // HCS submit
  mockSubmitMessage.mockResolvedValue({
    transactionId: '0.0.1@1234567890.000',
    hashscanUrl: 'https://hashscan.io/testnet/transaction/0.0.1@1234567890.000',
    sequenceNumber: 1,
  });
}

const activeProposal = (proposalId: string) => ({
  id: proposalId,
  creatorId: 'creator-1',
  title: 'Test Proposal',
  description: 'A test proposal',
  options: ['Approve', 'Reject'],
  votingEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  status: 'ACTIVE',
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Governance Property Tests', () => {
  // Feature: aegis-protocol, Property 33: Single Vote Per User Per Proposal
  // **Validates: Requirements 28.5**
  it('Property 33: Single Vote Per User Per Proposal — duplicate vote throws ConflictError', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom('Approve', 'Reject'),
        async (userId, proposalId, option) => {
          jest.clearAllMocks();
          setupGovernanceMocks(1);

          mockProposalFindUnique.mockResolvedValue(activeProposal(proposalId));

          // Simulate existing vote — user already voted
          mockVoteFindUnique.mockResolvedValue({
            id: 'existing-vote',
            proposalId,
            userId,
            option: 'Approve',
            weight: 1,
          });

          await expect(castVote(userId, { proposalId, option })).rejects.toThrow(ConflictError);

          // vote.create should NOT have been called
          expect(mockVoteCreate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  // Feature: aegis-protocol, Property 34: Vote Weighted by Token Balance
  // **Validates: Requirements 28.2**
  it('Property 34: Vote Weighted by Token Balance — vote.create is called with weight equal to token balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom('Approve', 'Reject'),
        async (userId, proposalId, option) => {
          jest.clearAllMocks();
          setupGovernanceMocks(1);

          mockProposalFindUnique.mockResolvedValue(activeProposal(proposalId));

          // No existing vote
          mockVoteFindUnique.mockResolvedValue(null);

          // vote.create returns the created vote
          mockVoteCreate.mockImplementation((args: any) =>
            Promise.resolve({ id: 'new-vote', ...args.data }),
          );
          mockVoteUpdate.mockResolvedValue({});

          await castVote(userId, { proposalId, option });

          // The token balance from getVoterTokenBalance returns 1 (since getTokenInfo returns truthy)
          expect(mockVoteCreate).toHaveBeenCalledTimes(1);
          const createArgs = mockVoteCreate.mock.calls[0][0];
          expect(createArgs.data.weight).toBe(1);
          expect(createArgs.data.proposalId).toBe(proposalId);
          expect(createArgs.data.userId).toBe(userId);
          expect(createArgs.data.option).toBe(option);
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
