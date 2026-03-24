import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError, HederaError } from '@/lib/errors';
import * as hederaClient from '@/modules/hedera/hedera.client';
import * as auditService from '@/modules/audit/audit.service';
import { ContractFunctionParameters } from '@hashgraph/sdk';
import {
  POLICY_CONTRACT_BYTECODE,
  DEPLOY_GAS,
  EXECUTE_GAS,
  QUERY_GAS,
} from './contract.constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyRules {
  maxTransactionAmount: number;
  dailyLimit: number;
  whitelistedAccounts: string[];
  businessHoursOnly: boolean;
  startHour?: number;
  endHour?: number;
}

export interface PolicyEvaluation {
  allowed: boolean;
  reason: string;
  policyId: string;
}

// ---------------------------------------------------------------------------
// Contract Deployment
// ---------------------------------------------------------------------------

/**
 * Deploy the pre-compiled policy enforcement smart contract to Hedera.
 * Returns the new contract ID.
 */
export async function deployContract(): Promise<string> {
  const result = await hederaClient.deployContract(POLICY_CONTRACT_BYTECODE, DEPLOY_GAS);
  return result.contractId;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build ContractFunctionParameters for the setPolicy call.
 */
function buildSetPolicyParams(rules: PolicyRules): ContractFunctionParameters {
  return new ContractFunctionParameters()
    .addUint256(Math.round(rules.maxTransactionAmount))
    .addUint256(Math.round(rules.dailyLimit))
    .addBool(rules.businessHoursOnly)
    .addUint8(rules.startHour ?? 0)
    .addUint8(rules.endHour ?? 23);
}

/**
 * Sync policy rules to the on-chain smart contract via ContractExecuteTransaction.
 * Also manages the whitelist by adding each whitelisted account.
 */
async function syncPolicyToContract(
  contractId: string,
  rules: PolicyRules,
): Promise<hederaClient.HederaResult> {
  // 1. Set core policy parameters
  const setPolicyResult = await hederaClient.executeContract(
    contractId,
    'setPolicy',
    buildSetPolicyParams(rules),
    EXECUTE_GAS,
  );

  // 2. Add whitelisted accounts
  for (const account of rules.whitelistedAccounts) {
    const params = new ContractFunctionParameters().addAddress(account);
    await hederaClient.executeContract(contractId, 'addToWhitelist', params, EXECUTE_GAS);
  }

  return setPolicyResult;
}

// ---------------------------------------------------------------------------
// Create Policy
// ---------------------------------------------------------------------------

/**
 * Create a new policy for a user:
 * 1. Deploy a new smart contract (or reuse existing)
 * 2. Sync policy rules to the contract
 * 3. Store Policy record in DB
 * 4. Log to POLICY_EVENTS
 */
export async function createPolicy(userId: string, rules: PolicyRules) {
  // Validate user exists
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  // Deploy a new smart contract for this policy
  const contractId = await deployContract();

  // Sync rules to the contract
  const executeResult = await syncPolicyToContract(contractId, rules);

  // Store Policy record
  const policy = await prisma.policy.create({
    data: {
      userId,
      maxTransactionAmount: rules.maxTransactionAmount,
      dailyLimit: rules.dailyLimit,
      whitelistedAccounts: rules.whitelistedAccounts,
      businessHoursOnly: rules.businessHoursOnly,
      startHour: rules.startHour ?? null,
      endHour: rules.endHour ?? null,
      contractId,
      hashscanUrl: executeResult.hashscanUrl,
      isActive: true,
    },
  });

  // Log to POLICY_EVENTS
  await auditService.log({
    eventType: 'POLICY_CREATED',
    category: 'POLICY_EVENTS',
    actor: userId,
    target: policy.id,
    details: {
      policyId: policy.id,
      contractId,
      maxTransactionAmount: rules.maxTransactionAmount,
      dailyLimit: rules.dailyLimit,
      businessHoursOnly: rules.businessHoursOnly,
      startHour: rules.startHour ?? null,
      endHour: rules.endHour ?? null,
      whitelistedAccounts: rules.whitelistedAccounts,
      transactionId: executeResult.transactionId,
    },
  });

  return policy;
}

// ---------------------------------------------------------------------------
// Update Policy
// ---------------------------------------------------------------------------

/**
 * Update an existing policy:
 * 1. Update the smart contract state via ContractExecuteTransaction
 * 2. Update the Policy record in DB
 * 3. Log to POLICY_EVENTS
 */
export async function updatePolicy(policyId: string, rules: PolicyRules) {
  const existing = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!existing) throw new NotFoundError(`Policy ${policyId} not found`);
  if (!existing.contractId) {
    throw new ValidationError('Policy has no associated smart contract');
  }

  // Sync updated rules to the contract
  const executeResult = await syncPolicyToContract(existing.contractId, rules);

  // Update Policy record
  const policy = await prisma.policy.update({
    where: { id: policyId },
    data: {
      maxTransactionAmount: rules.maxTransactionAmount,
      dailyLimit: rules.dailyLimit,
      whitelistedAccounts: rules.whitelistedAccounts,
      businessHoursOnly: rules.businessHoursOnly,
      startHour: rules.startHour ?? null,
      endHour: rules.endHour ?? null,
      hashscanUrl: executeResult.hashscanUrl,
    },
  });

  // Log to POLICY_EVENTS
  await auditService.log({
    eventType: 'POLICY_UPDATED',
    category: 'POLICY_EVENTS',
    actor: existing.userId,
    target: policyId,
    details: {
      policyId,
      contractId: existing.contractId,
      maxTransactionAmount: rules.maxTransactionAmount,
      dailyLimit: rules.dailyLimit,
      businessHoursOnly: rules.businessHoursOnly,
      startHour: rules.startHour ?? null,
      endHour: rules.endHour ?? null,
      whitelistedAccounts: rules.whitelistedAccounts,
      transactionId: executeResult.transactionId,
    },
  });

  return policy;
}

// ---------------------------------------------------------------------------
// Evaluate Transaction
// ---------------------------------------------------------------------------

/**
 * Evaluate a transaction against the user's active policy:
 * 1. Look up the user's active policy
 * 2. Query the smart contract via ContractCallTransaction
 * 3. Return { allowed, reason, policyId }
 * 4. Log the evaluation result to POLICY_EVENTS
 */
export async function evaluateTransaction(
  userId: string,
  transaction: { amount: number; recipientAddress: string; timestamp?: number },
): Promise<PolicyEvaluation> {
  // Find the user's active policy
  const policy = await prisma.policy.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  // If no active policy, allow the transaction
  if (!policy || !policy.contractId) {
    return { allowed: true, reason: 'No active policy', policyId: '' };
  }

  const txTimestamp = transaction.timestamp ?? Math.floor(Date.now() / 1000);

  // Query the smart contract
  const params = new ContractFunctionParameters()
    .addUint256(Math.round(transaction.amount))
    .addAddress(transaction.recipientAddress)
    .addUint256(txTimestamp);

  const result = await hederaClient.queryContract(
    policy.contractId,
    'evaluateTransaction',
    params,
    QUERY_GAS,
  );

  const allowed = result.getBool(0);
  const reason = result.getString(1);

  const evaluation: PolicyEvaluation = {
    allowed,
    reason,
    policyId: policy.id,
  };

  // Log evaluation result to POLICY_EVENTS
  const eventType = allowed ? 'POLICY_EVALUATION_PASSED' : 'POLICY_VIOLATED';
  await auditService.log({
    eventType,
    category: 'POLICY_EVENTS',
    actor: userId,
    target: policy.id,
    details: {
      policyId: policy.id,
      contractId: policy.contractId,
      amount: transaction.amount,
      recipientAddress: transaction.recipientAddress,
      allowed,
      reason,
    },
  });

  return evaluation;
}
