// ---------------------------------------------------------------------------
// Pre-compiled Solidity Smart Contract — Policy Enforcement
// ---------------------------------------------------------------------------
// The contract implements:
//   State variables: maxTransactionAmount, dailyLimit, dailySpent, lastResetDay,
//                    whitelisted mapping, businessHoursOnly, startHour, endHour
//   Functions:
//     setPolicy(uint256 maxAmount, uint256 dailyLimit, bool businessHoursOnly, uint8 startHour, uint8 endHour)
//     addToWhitelist(address account)
//     removeFromWhitelist(address account)
//     evaluateTransaction(uint256 amount, address recipient, uint256 timestamp) → (bool allowed, string reason)
//
// ABI and bytecode are hardcoded — no Solidity compiler in the build pipeline.
// ---------------------------------------------------------------------------

/**
 * ABI for the PolicyEnforcement smart contract.
 */
export const POLICY_CONTRACT_ABI = [
  {
    inputs: [
      { name: 'maxAmount', type: 'uint256' },
      { name: '_dailyLimit', type: 'uint256' },
      { name: '_businessHoursOnly', type: 'bool' },
      { name: '_startHour', type: 'uint8' },
      { name: '_endHour', type: 'uint8' },
    ],
    name: 'setPolicy',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'addToWhitelist',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'removeFromWhitelist',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      { name: 'timestamp', type: 'uint256' },
    ],
    name: 'evaluateTransaction',
    outputs: [
      { name: 'allowed', type: 'bool' },
      { name: 'reason', type: 'string' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Pre-compiled bytecode for the PolicyEnforcement smart contract (hex-encoded).
 *
 * This is a placeholder — replace with the actual compiled bytecode from the
 * Solidity contract before deploying to Hedera testnet.
 */
export const POLICY_CONTRACT_BYTECODE =
  '608060405234801561001057600080fd5b50610800806100206000396000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c806301ffc9a71461005157806365b2a24b1461008157806386d1a69f146100a0578063d547741f146100b5575b600080fd5b';

/**
 * Default gas limit for contract deployment.
 */
export const DEPLOY_GAS = 200_000;

/**
 * Default gas limit for state-changing contract executions (setPolicy, whitelist ops).
 */
export const EXECUTE_GAS = 100_000;

/**
 * Default gas limit for read-only contract queries (evaluateTransaction).
 */
export const QUERY_GAS = 100_000;
