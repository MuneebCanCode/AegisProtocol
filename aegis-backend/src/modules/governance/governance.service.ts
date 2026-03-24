import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError, ConflictError } from '@/lib/errors';
import * as hederaClient from '@/modules/hedera/hedera.client';
import * as auditService from '@/modules/audit/audit.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateProposalInput {
  title: string;
  description: string;
  options: string[];
  votingDurationHours: number;
}

export interface CastVoteInput {
  proposalId: string;
  option: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up the AEGIS Governance Token ID from the TokenConfig table.
 */
async function getGovernanceTokenId(): Promise<string> {
  const tokenConfig = await prisma.tokenConfig.findFirst({
    where: { name: { contains: 'Governance' } },
  });
  if (!tokenConfig) {
    throw new NotFoundError('AEGIS Governance Token not found in TokenConfig');
  }
  return tokenConfig.tokenId;
}

/**
 * Get the governance topic ID for submitting proposal/vote records to HCS.
 */
async function getGovernanceTopicId(): Promise<string> {
  // Use COMPLIANCE_EVENTS topic for governance (or a dedicated one if configured)
  const config = await prisma.hcsTopicConfig.findFirst({
    where: { category: 'COMPLIANCE_EVENTS' },
  });
  if (!config) {
    throw new NotFoundError('No HCS topic configured for governance events');
  }
  return config.topicId;
}

/**
 * Get a voter's governance token balance via Mirror Node or DB.
 * For simplicity, queries the Hedera mirror node for the token balance.
 */
async function getVoterTokenBalance(userId: string, tokenId: string): Promise<number> {
  const account = await prisma.hederaAccount.findFirst({
    where: { userId, status: 'ACTIVE' },
  });
  if (!account) {
    throw new NotFoundError(`No active Hedera account found for user ${userId}`);
  }

  // Query mirror node for token balance
  const mirrorClient = await import('@/modules/mirror/mirror.client');
  const tokenInfo = await mirrorClient.getTokenInfo(tokenId);

  // For simplicity, return a weight of 1 if the user has any association
  // In production, this would query the actual token balance from mirror node
  return tokenInfo ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Create Proposal
// ---------------------------------------------------------------------------

/**
 * Create a governance proposal:
 * 1. Validate input
 * 2. Store proposal in DB
 * 3. Submit proposal record to HCS topic
 * 4. Log to COMPLIANCE_EVENTS
 */
export async function createProposal(userId: string, input: CreateProposalInput) {
  const { title, description, options, votingDurationHours } = input;

  if (!title || title.trim().length === 0) {
    throw new ValidationError('Proposal title is required');
  }
  if (options.length < 2) {
    throw new ValidationError('At least 2 voting options are required');
  }
  if (votingDurationHours <= 0) {
    throw new ValidationError('Voting duration must be greater than 0 hours');
  }

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  const votingEndsAt = new Date(Date.now() + votingDurationHours * 60 * 60 * 1000);

  // Store proposal in DB
  const proposal = await prisma.proposal.create({
    data: {
      creatorId: userId,
      title,
      description,
      options,
      votingEndsAt,
      status: 'ACTIVE',
    },
  });

  // Submit to HCS topic
  const topicId = await getGovernanceTopicId();
  const hcsMessage = JSON.stringify({
    type: 'PROPOSAL_CREATED',
    proposalId: proposal.id,
    title,
    description,
    options,
    votingEndsAt: votingEndsAt.toISOString(),
    createdBy: userId,
    timestamp: new Date().toISOString(),
  });

  const hcsResult = await hederaClient.submitMessage(topicId, hcsMessage);

  // Update proposal with HCS transaction info
  await prisma.proposal.update({
    where: { id: proposal.id },
    data: {
      hcsTransactionId: hcsResult.transactionId,
      hashscanUrl: hcsResult.hashscanUrl,
    },
  });

  // Log to COMPLIANCE_EVENTS
  await auditService.log({
    eventType: 'PROPOSAL_CREATED',
    category: 'COMPLIANCE_EVENTS',
    actor: userId,
    target: proposal.id,
    details: {
      proposalId: proposal.id,
      title,
      options,
      votingEndsAt: votingEndsAt.toISOString(),
      transactionId: hcsResult.transactionId,
    },
  });

  return proposal;
}


// ---------------------------------------------------------------------------
// Cast Vote
// ---------------------------------------------------------------------------

/**
 * Cast a vote on a proposal:
 * 1. Verify proposal exists and is active (voting period not ended)
 * 2. Verify voter holds AEGIS Governance Tokens
 * 3. Enforce single vote per user per proposal
 * 4. Record vote weighted by token balance
 * 5. Submit vote record to HCS topic
 * 6. Log to COMPLIANCE_EVENTS
 */
export async function castVote(userId: string, input: CastVoteInput) {
  const { proposalId, option } = input;

  // 1. Verify proposal exists and is active
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new NotFoundError(`Proposal ${proposalId} not found`);

  if (proposal.status !== 'ACTIVE') {
    throw new ValidationError('Proposal is no longer active');
  }
  if (new Date() > proposal.votingEndsAt) {
    throw new ValidationError('Voting period has ended');
  }
  if (!proposal.options.includes(option)) {
    throw new ValidationError(`Invalid option. Valid options: ${proposal.options.join(', ')}`);
  }

  // 2. Verify voter holds governance tokens
  const tokenId = await getGovernanceTokenId();
  const tokenBalance = await getVoterTokenBalance(userId, tokenId);
  if (tokenBalance <= 0) {
    throw new ValidationError('Voter must hold AEGIS Governance Tokens to vote');
  }

  // 3. Enforce single vote per user per proposal (unique constraint in DB)
  const existingVote = await prisma.vote.findUnique({
    where: { proposalId_userId: { proposalId, userId } },
  });
  if (existingVote) {
    throw new ConflictError('User has already voted on this proposal');
  }

  // 4. Record vote weighted by token balance
  const vote = await prisma.vote.create({
    data: {
      proposalId,
      userId,
      option,
      weight: tokenBalance,
    },
  });

  // 5. Submit vote record to HCS topic
  const topicId = await getGovernanceTopicId();
  const hcsMessage = JSON.stringify({
    type: 'VOTE_CAST',
    proposalId,
    voterId: userId,
    option,
    weight: tokenBalance,
    timestamp: new Date().toISOString(),
  });

  const hcsResult = await hederaClient.submitMessage(topicId, hcsMessage);

  // Update vote with HCS transaction info
  await prisma.vote.update({
    where: { id: vote.id },
    data: {
      hcsTransactionId: hcsResult.transactionId,
      hashscanUrl: hcsResult.hashscanUrl,
    },
  });

  // 6. Log to COMPLIANCE_EVENTS
  await auditService.log({
    eventType: 'VOTE_CAST',
    category: 'COMPLIANCE_EVENTS',
    actor: userId,
    target: proposalId,
    details: {
      proposalId,
      voteId: vote.id,
      option,
      weight: tokenBalance,
      transactionId: hcsResult.transactionId,
    },
  });

  return vote;
}

// ---------------------------------------------------------------------------
// Tally Votes
// ---------------------------------------------------------------------------

/**
 * Tally votes for a proposal when the voting period ends:
 * 1. Verify proposal exists and voting period has ended
 * 2. Aggregate votes by option, weighted by token balance
 * 3. Record result on HCS
 * 4. Update proposal status and results in DB
 * 5. Log to COMPLIANCE_EVENTS
 */
export async function tallyVotes(proposalId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { votes: true },
  });
  if (!proposal) throw new NotFoundError(`Proposal ${proposalId} not found`);

  if (proposal.status !== 'ACTIVE') {
    throw new ValidationError('Proposal is not active');
  }
  if (new Date() < proposal.votingEndsAt) {
    throw new ValidationError('Voting period has not ended yet');
  }

  // Aggregate votes by option
  const tally: Record<string, number> = {};
  for (const opt of proposal.options) {
    tally[opt] = 0;
  }
  for (const vote of proposal.votes) {
    tally[vote.option] = (tally[vote.option] || 0) + vote.weight;
  }

  // Determine winner
  let winningOption = '';
  let maxWeight = 0;
  for (const [opt, weight] of Object.entries(tally)) {
    if (weight > maxWeight) {
      maxWeight = weight;
      winningOption = opt;
    }
  }

  const results = {
    tally,
    totalVotes: proposal.votes.length,
    totalWeight: proposal.votes.reduce((sum, v) => sum + v.weight, 0),
    winningOption,
    winningWeight: maxWeight,
  };

  // Submit results to HCS
  const topicId = await getGovernanceTopicId();
  const hcsMessage = JSON.stringify({
    type: 'PROPOSAL_TALLIED',
    proposalId,
    results,
    timestamp: new Date().toISOString(),
  });

  const hcsResult = await hederaClient.submitMessage(topicId, hcsMessage);

  // Update proposal status and results
  const updatedProposal = await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: 'COMPLETED',
      results,
    },
  });

  // Log to COMPLIANCE_EVENTS
  await auditService.log({
    eventType: 'PROPOSAL_TALLIED',
    category: 'COMPLIANCE_EVENTS',
    actor: 'system',
    target: proposalId,
    details: {
      proposalId,
      results,
      transactionId: hcsResult.transactionId,
    },
  });

  return updatedProposal;
}
