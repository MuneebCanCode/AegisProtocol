import { EventEmitter } from 'events';
import { HederaError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountBalance {
  account: string;
  balance: number; // tinybars
  tokens: Array<{
    token_id: string;
    balance: number;
  }>;
}

export interface MirrorTransaction {
  transaction_id: string;
  name: string;
  result: string;
  consensus_timestamp: string;
  transfers: Array<{
    account: string;
    amount: number;
  }>;
  hashscanUrl: string;
}

export interface PaginatedTransactions {
  transactions: MirrorTransaction[];
  links: {
    next: string | null;
  };
}

export interface TokenInfo {
  token_id: string;
  name: string;
  symbol: string;
  decimals: string;
  total_supply: string;
  type: string;
  treasury_account_id: string;
  freeze_default: boolean;
  kyc_key: string | null;
  pause_status: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MIRROR_URL = 'https://testnet.mirrornode.hedera.com';
const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 32_000;
const POLL_INTERVAL_MS = 3000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMirrorUrl(): string {
  return process.env.HEDERA_MIRROR_URL ?? DEFAULT_MIRROR_URL;
}

function hashscanUrlForTx(transactionId: string): string {
  return `https://hashscan.io/testnet/transaction/${transactionId}`;
}

function computeDelay(attempt: number): number {
  const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_DELAY_MS);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch wrapper with exponential backoff retry logic.
 */
async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }

      // Non-retryable client errors (4xx except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const body = await response.text().catch(() => '');
        throw new HederaError(
          `Mirror Node request failed: ${response.status} ${response.statusText} — ${body}`
        );
      }

      // Retryable: 429 or 5xx
      lastError = new HederaError(
        `Mirror Node request failed: ${response.status} ${response.statusText}`
      );
    } catch (err) {
      // Re-throw non-retryable client errors (4xx except 429) immediately
      if (err instanceof HederaError) {
        // Check if this is a 4xx non-retryable error (contains status code but not 429/5xx)
        const statusMatch = err.message.match(/Mirror Node request failed: (\d+)/);
        if (statusMatch) {
          const status = parseInt(statusMatch[1], 10);
          if (status >= 400 && status < 500 && status !== 429) {
            throw err;
          }
        }
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < MAX_RETRIES) {
      await sleep(computeDelay(attempt));
    }
  }

  throw new HederaError(
    `Mirror Node request failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message ?? 'unknown error'}`
  );
}

// ---------------------------------------------------------------------------
// Active subscriptions
// ---------------------------------------------------------------------------

interface TopicSubscription {
  emitter: EventEmitter;
  abortController: AbortController;
  lastTimestamp: string;
}

const activeSubscriptions = new Map<string, TopicSubscription>();

// ---------------------------------------------------------------------------
// REST API methods
// ---------------------------------------------------------------------------

/**
 * Query account balance (HBAR + tokens) from the Mirror Node.
 * Requirement 22.1
 */
export async function getAccountBalance(accountId: string): Promise<AccountBalance> {
  const url = `${getMirrorUrl()}/api/v1/balances?account.id=${accountId}&limit=1`;
  const response = await fetchWithRetry(url);
  const data: any = await response.json();

  if (!data.balances || data.balances.length === 0) {
    throw new HederaError(`No balance data found for account ${accountId}`);
  }

  const entry = data.balances[0];
  return {
    account: entry.account,
    balance: entry.balance,
    tokens: entry.tokens ?? [],
  };
}

/**
 * Query paginated transaction history for an account.
 * Requirement 22.2
 */
export async function getTransactionHistory(
  accountId: string,
  page?: string
): Promise<PaginatedTransactions> {
  const url =
    page ??
    `${getMirrorUrl()}/api/v1/transactions?account.id=${accountId}&limit=25&order=desc`;

  const response = await fetchWithRetry(url);
  const data: any = await response.json();

  const transactions: MirrorTransaction[] = (data.transactions ?? []).map(
    (tx: Record<string, unknown>) => ({
      transaction_id: tx.transaction_id as string,
      name: tx.name as string,
      result: tx.result as string,
      consensus_timestamp: tx.consensus_timestamp as string,
      transfers: tx.transfers ?? [],
      hashscanUrl: hashscanUrlForTx(tx.transaction_id as string),
    })
  );

  return {
    transactions,
    links: {
      next: data.links?.next
        ? `${getMirrorUrl()}${data.links.next}`
        : null,
    },
  };
}

/**
 * Query token information from the Mirror Node.
 * Requirement 22.3
 */
export async function getTokenInfo(tokenId: string): Promise<TokenInfo> {
  const url = `${getMirrorUrl()}/api/v1/tokens/${tokenId}`;
  const response = await fetchWithRetry(url);
  const data: any = await response.json();

  return {
    token_id: data.token_id,
    name: data.name,
    symbol: data.symbol,
    decimals: data.decimals,
    total_supply: data.total_supply,
    type: data.type,
    treasury_account_id: data.treasury_account_id,
    freeze_default: data.freeze_default,
    kyc_key: data.kyc_key ?? null,
    pause_status: data.pause_status,
  };
}

// ---------------------------------------------------------------------------
// Real-time topic subscription via polling
// ---------------------------------------------------------------------------

/**
 * Subscribe to an HCS topic. Returns an EventEmitter that emits:
 *   - 'message' — each new topic message
 *   - 'error'   — on unrecoverable failure
 *
 * Uses Mirror Node REST API polling with exponential backoff on failures.
 * Requirements 23.1, 23.3
 */
export function subscribeToTopic(topicId: string): EventEmitter {
  // If already subscribed, return existing emitter
  const existing = activeSubscriptions.get(topicId);
  if (existing) {
    return existing.emitter;
  }

  const emitter = new EventEmitter();
  const abortController = new AbortController();

  const subscription: TopicSubscription = {
    emitter,
    abortController,
    lastTimestamp: '0.0',
  };

  activeSubscriptions.set(topicId, subscription);

  // Start polling loop in background
  pollTopicMessages(topicId, subscription).catch((err) => {
    emitter.emit('error', err);
  });

  return emitter;
}

async function pollTopicMessages(
  topicId: string,
  subscription: TopicSubscription
): Promise<void> {
  let consecutiveFailures = 0;

  while (!subscription.abortController.signal.aborted) {
    try {
      const url =
        `${getMirrorUrl()}/api/v1/topics/${topicId}/messages` +
        `?limit=25&order=asc&timestamp=gt:${subscription.lastTimestamp}`;

      const response = await fetch(url, {
        signal: subscription.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Mirror Node topic poll failed: ${response.status}`);
      }

      const data: any = await response.json();
      const messages: Array<Record<string, unknown>> = data.messages ?? [];

      for (const msg of messages) {
        subscription.emitter.emit('message', msg);
        if (typeof msg.consensus_timestamp === 'string') {
          subscription.lastTimestamp = msg.consensus_timestamp;
        }
      }

      // Reset failure counter on success
      consecutiveFailures = 0;
    } catch (err: unknown) {
      // If aborted, exit cleanly
      if (subscription.abortController.signal.aborted) {
        return;
      }

      consecutiveFailures++;

      if (consecutiveFailures > MAX_RETRIES) {
        subscription.emitter.emit(
          'error',
          new HederaError(
            `Topic subscription failed after ${MAX_RETRIES} retries: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        );
        return;
      }

      // Exponential backoff before retry
      const delay = computeDelay(consecutiveFailures - 1);
      await sleep(delay);
      continue;
    }

    // Wait before next poll
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Unsubscribe from an HCS topic, closing the connection and releasing resources.
 * Requirement 23.4
 */
export function unsubscribe(topicId: string): void {
  const subscription = activeSubscriptions.get(topicId);
  if (!subscription) {
    return;
  }

  subscription.abortController.abort();
  subscription.emitter.removeAllListeners();
  activeSubscriptions.delete(topicId);
}

/**
 * Unsubscribe from all active topic subscriptions.
 */
export function unsubscribeAll(): void {
  for (const topicId of activeSubscriptions.keys()) {
    unsubscribe(topicId);
  }
}
