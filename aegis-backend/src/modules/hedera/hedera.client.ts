import {
  Client,
  AccountCreateTransaction,
  AccountUpdateTransaction,
  AccountDeleteTransaction,
  TransferTransaction,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenAssociateTransaction,
  TokenGrantKycTransaction,
  TokenRevokeKycTransaction,
  TokenFreezeTransaction,
  TokenUnfreezeTransaction,
  TokenWipeTransaction,
  TokenPauseTransaction,
  TokenUnpauseTransaction,
  TokenFeeScheduleUpdateTransaction,
  TokenType,
  ContractCreateTransaction,
  ContractExecuteTransaction,
  ContractCallQuery,
  ContractFunctionParameters,
  FileCreateTransaction,
  FileUpdateTransaction,
  FileAppendTransaction,
  FileContentsQuery,
  ScheduleCreateTransaction,
  ScheduleSignTransaction,
  ScheduleDeleteTransaction,
  AccountAllowanceApproveTransaction,
  Hbar,
  PublicKey,
  AccountId,
  TokenId,
  TopicId,
  ContractId,
  FileId,
  ScheduleId,
  Transaction,
  CustomRoyaltyFee,
  CustomFixedFee,
  NftId,
} from '@hashgraph/sdk';
import { HederaError } from '@/lib/errors';
import * as kmsModule from '@/modules/kms/kms.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HederaResult {
  transactionId: string;
  hashscanUrl: string;
  status: string;
}

export interface FungibleTokenParams {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: number;
  treasuryAccountId: string;
}

export interface NftCollectionParams {
  name: string;
  symbol: string;
  treasuryAccountId: string;
  maxSupply?: number;
  royaltyPercent?: number;
  fallbackFeeHbar?: number;
}

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let hederaClient: Client | null = null;

function getNetwork(): string {
  return process.env.HEDERA_NETWORK || 'testnet';
}

function getClient(): Client {
  if (!hederaClient) {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;
    if (!operatorId || !operatorKey) {
      throw new HederaError(
        'HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY environment variables are required'
      );
    }

    const network = getNetwork();
    hederaClient =
      network === 'mainnet'
        ? Client.forMainnet()
        : network === 'previewnet'
          ? Client.forPreviewnet()
          : Client.forTestnet();

    hederaClient.setOperator(operatorId, operatorKey);
  }
  return hederaClient;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHashscanUrl(transactionId: string): string {
  const network = getNetwork();
  return `https://hashscan.io/${network}/transaction/${transactionId}`;
}

function toResult(transactionId: string, status: string): HederaResult {
  return {
    transactionId,
    hashscanUrl: buildHashscanUrl(transactionId),
    status,
  };
}

/**
 * Sign a frozen transaction with a KMS-managed key.
 * 1. Freeze the transaction
 * 2. Get the transaction bytes
 * 3. Sign via KMS signData (returns 64-byte r+s)
 * 4. Split into r (32 bytes) and s (32 bytes)
 * 5. Attach signature using the public key
 */
async function signWithKms(
  transaction: Transaction,
  signerKeyArn: string,
  publicKey: Buffer
): Promise<Transaction> {
  const frozen = transaction.isFrozen() ? transaction : transaction.freeze();
  const txBytes = frozen.toBytes();
  const signatureBytes = await kmsModule.signData(signerKeyArn, Buffer.from(txBytes));
  const edPubKey = PublicKey.fromBytesECDSA(publicKey);
  frozen.addSignature(edPubKey, signatureBytes);
  return frozen;
}

// ---------------------------------------------------------------------------
// Account Operations
// ---------------------------------------------------------------------------

export async function createAccount(
  publicKey: Buffer
): Promise<HederaResult & { accountId: string }> {
  try {
    const client = getClient();
    const key = PublicKey.fromBytesECDSA(publicKey);

    const tx = new AccountCreateTransaction().setKey(key).setInitialBalance(new Hbar(0));

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const accountId = receipt.accountId!.toString();
    const txId = response.transactionId.toString();

    return { ...toResult(txId, receipt.status.toString()), accountId };
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to create account: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function updateAccount(
  accountId: string,
  newPublicKey: Buffer,
  signerKeyArn?: string
): Promise<HederaResult> {
  try {
    const client = getClient();
    const key = PublicKey.fromBytesECDSA(newPublicKey);

    let tx: Transaction = new AccountUpdateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setKey(key);

    if (signerKeyArn) {
      const pubKey = await kmsModule.getPublicKey(signerKeyArn);
      tx = await signWithKms(tx, signerKeyArn, pubKey);
    }

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to update account: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function deleteAccount(
  accountId: string,
  transferAccountId: string,
  signerKeyArn?: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    let tx: Transaction = new AccountDeleteTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setTransferAccountId(AccountId.fromString(transferAccountId));

    if (signerKeyArn) {
      const pubKey = await kmsModule.getPublicKey(signerKeyArn);
      tx = await signWithKms(tx, signerKeyArn, pubKey);
    }

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to delete account: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

// ---------------------------------------------------------------------------
// Crypto Transfer
// ---------------------------------------------------------------------------

export async function transferHbar(
  from: string,
  to: string,
  amount: number,
  signerKeyArn?: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    let tx: Transaction = new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(from), new Hbar(-amount))
      .addHbarTransfer(AccountId.fromString(to), new Hbar(amount));

    if (signerKeyArn) {
      const pubKey = await kmsModule.getPublicKey(signerKeyArn);
      tx = await signWithKms(tx, signerKeyArn, pubKey);
    }

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to transfer HBAR: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

// ---------------------------------------------------------------------------
// HCS Operations
// ---------------------------------------------------------------------------

export async function createTopic(
  memo: string
): Promise<HederaResult & { topicId: string }> {
  try {
    const client = getClient();

    const tx = new TopicCreateTransaction().setTopicMemo(memo);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const topicId = receipt.topicId!.toString();

    return { ...toResult(response.transactionId.toString(), receipt.status.toString()), topicId };
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to create topic: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function submitMessage(
  topicId: string,
  message: string
): Promise<HederaResult & { sequenceNumber: number }> {
  try {
    const client = getClient();

    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(message);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const sequenceNumber = receipt.topicSequenceNumber!.toNumber();

    return {
      ...toResult(response.transactionId.toString(), receipt.status.toString()),
      sequenceNumber,
    };
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to submit message: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

// ---------------------------------------------------------------------------
// Token Operations
// ---------------------------------------------------------------------------

export async function createFungibleToken(
  params: FungibleTokenParams
): Promise<HederaResult & { tokenId: string }> {
  try {
    const client = getClient();

    const tx = new TokenCreateTransaction()
      .setTokenName(params.name)
      .setTokenSymbol(params.symbol)
      .setDecimals(params.decimals)
      .setInitialSupply(params.initialSupply)
      .setTreasuryAccountId(AccountId.fromString(params.treasuryAccountId))
      .setTokenType(TokenType.FungibleCommon);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const tokenId = receipt.tokenId!.toString();

    return { ...toResult(response.transactionId.toString(), receipt.status.toString()), tokenId };
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to create fungible token: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function createNftCollection(
  params: NftCollectionParams
): Promise<HederaResult & { tokenId: string }> {
  try {
    const client = getClient();
    const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID!);

    const tx = new TokenCreateTransaction()
      .setTokenName(params.name)
      .setTokenSymbol(params.symbol)
      .setTokenType(TokenType.NonFungibleUnique)
      .setTreasuryAccountId(AccountId.fromString(params.treasuryAccountId))
      .setSupplyKey(client.operatorPublicKey!)
      .setAdminKey(client.operatorPublicKey!);

    if (params.maxSupply !== undefined) {
      tx.setMaxSupply(params.maxSupply);
    }

    if (params.royaltyPercent !== undefined) {
      const royaltyFee = new CustomRoyaltyFee()
        .setNumerator(params.royaltyPercent)
        .setDenominator(100)
        .setFeeCollectorAccountId(operatorId);

      if (params.fallbackFeeHbar !== undefined) {
        royaltyFee.setFallbackFee(
          new CustomFixedFee()
            .setHbarAmount(new Hbar(params.fallbackFeeHbar))
            .setFeeCollectorAccountId(operatorId)
        );
      }

      tx.setCustomFees([royaltyFee]);
    }

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const tokenId = receipt.tokenId!.toString();

    return { ...toResult(response.transactionId.toString(), receipt.status.toString()), tokenId };
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to create NFT collection: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function mintNft(
  tokenId: string,
  metadata: Buffer
): Promise<HederaResult & { serialNumber: number }> {
  try {
    const client = getClient();

    const tx = new TokenMintTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .addMetadata(metadata);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const serialNumber = receipt.serials[0].toNumber();

    return {
      ...toResult(response.transactionId.toString(), receipt.status.toString()),
      serialNumber,
    };
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to mint NFT: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function transferNft(
  tokenId: string,
  serial: number,
  from: string,
  to: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    const nftId = new NftId(TokenId.fromString(tokenId), serial);
    const tx = new TransferTransaction()
      .addNftTransfer(nftId, AccountId.fromString(from), AccountId.fromString(to));

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to transfer NFT: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function associateToken(
  accountId: string,
  tokenId: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setTokenIds([TokenId.fromString(tokenId)]);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to associate token: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function transferFungibleToken(
  tokenId: string,
  from: string,
  to: string,
  amount: number
): Promise<HederaResult> {
  try {
    const client = getClient();
    const tid = TokenId.fromString(tokenId);

    const tx = new TransferTransaction()
      .addTokenTransfer(tid, AccountId.fromString(from), -amount)
      .addTokenTransfer(tid, AccountId.fromString(to), amount);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to transfer fungible token: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function grantKyc(
  tokenId: string,
  accountId: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new TokenGrantKycTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setAccountId(AccountId.fromString(accountId));

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to grant KYC: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function revokeKyc(
  tokenId: string,
  accountId: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new TokenRevokeKycTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setAccountId(AccountId.fromString(accountId));

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to revoke KYC: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function freezeToken(
  tokenId: string,
  accountId: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new TokenFreezeTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setAccountId(AccountId.fromString(accountId));

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to freeze token: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function unfreezeToken(
  tokenId: string,
  accountId: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new TokenUnfreezeTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setAccountId(AccountId.fromString(accountId));

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to unfreeze token: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function wipeToken(
  tokenId: string,
  accountId: string,
  amount: number
): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new TokenWipeTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setAccountId(AccountId.fromString(accountId))
      .setAmount(amount);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to wipe token: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function pauseToken(tokenId: string): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new TokenPauseTransaction().setTokenId(TokenId.fromString(tokenId));

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to pause token: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function unpauseToken(tokenId: string): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new TokenUnpauseTransaction().setTokenId(TokenId.fromString(tokenId));

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to unpause token: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function updateFeeSchedule(
  tokenId: string,
  fees: any[]
): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new TokenFeeScheduleUpdateTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setCustomFees(fees);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to update fee schedule: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function airdropToken(
  tokenId: string,
  recipients: { accountId: string; amount: number }[]
): Promise<HederaResult> {
  try {
    const client = getClient();
    const tid = TokenId.fromString(tokenId);
    const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID!);

    const tx = new TransferTransaction();
    let totalAmount = 0;
    for (const r of recipients) {
      tx.addTokenTransfer(tid, AccountId.fromString(r.accountId), r.amount);
      totalAmount += r.amount;
    }
    tx.addTokenTransfer(tid, operatorId, -totalAmount);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to airdrop token: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

// ---------------------------------------------------------------------------
// Smart Contract Operations
// ---------------------------------------------------------------------------

export async function deployContract(
  bytecode: string,
  gas: number
): Promise<HederaResult & { contractId: string }> {
  try {
    const client = getClient();

    const tx = new ContractCreateTransaction()
      .setBytecode(Buffer.from(bytecode, 'hex'))
      .setGas(gas);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const contractId = receipt.contractId!.toString();

    return {
      ...toResult(response.transactionId.toString(), receipt.status.toString()),
      contractId,
    };
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to deploy contract: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function executeContract(
  contractId: string,
  functionName: string,
  params: any,
  gas: number
): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromString(contractId))
      .setGas(gas)
      .setFunction(functionName, params instanceof ContractFunctionParameters ? params : undefined);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to execute contract: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function queryContract(
  contractId: string,
  functionName: string,
  params: any,
  gas: number
): Promise<any> {
  try {
    const client = getClient();

    const query = new ContractCallQuery()
      .setContractId(ContractId.fromString(contractId))
      .setGas(gas)
      .setFunction(functionName, params instanceof ContractFunctionParameters ? params : undefined);

    const result = await query.execute(client);
    return result;
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to query contract: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

// ---------------------------------------------------------------------------
// File Service Operations
// ---------------------------------------------------------------------------

export async function createFile(
  contents: Buffer
): Promise<HederaResult & { fileId: string }> {
  try {
    const client = getClient();

    const tx = new FileCreateTransaction().setContents(contents);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const fileId = receipt.fileId!.toString();

    return { ...toResult(response.transactionId.toString(), receipt.status.toString()), fileId };
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to create file: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function updateFile(
  fileId: string,
  contents: Buffer
): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new FileUpdateTransaction()
      .setFileId(FileId.fromString(fileId))
      .setContents(contents);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to update file: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function appendFile(
  fileId: string,
  contents: Buffer
): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new FileAppendTransaction()
      .setFileId(FileId.fromString(fileId))
      .setContents(contents);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to append file: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function getFileContents(fileId: string): Promise<Buffer> {
  try {
    const client = getClient();

    const query = new FileContentsQuery().setFileId(FileId.fromString(fileId));

    const contents = await query.execute(client);
    return Buffer.from(contents);
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to get file contents: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

// ---------------------------------------------------------------------------
// Schedule Service Operations
// ---------------------------------------------------------------------------

export async function createSchedule(
  transaction: any,
  memo: string
): Promise<HederaResult & { scheduleId: string }> {
  try {
    const client = getClient();

    const tx = new ScheduleCreateTransaction()
      .setScheduledTransaction(transaction)
      .setScheduleMemo(memo);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const scheduleId = receipt.scheduleId!.toString();

    return {
      ...toResult(response.transactionId.toString(), receipt.status.toString()),
      scheduleId,
    };
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to create schedule: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function signSchedule(
  scheduleId: string,
  signerKeyArn?: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    let tx: Transaction = new ScheduleSignTransaction()
      .setScheduleId(ScheduleId.fromString(scheduleId));

    if (signerKeyArn) {
      const pubKey = await kmsModule.getPublicKey(signerKeyArn);
      tx = await signWithKms(tx, signerKeyArn, pubKey);
    }

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to sign schedule: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function deleteSchedule(scheduleId: string): Promise<HederaResult> {
  try {
    const client = getClient();

    const tx = new ScheduleDeleteTransaction()
      .setScheduleId(ScheduleId.fromString(scheduleId));

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to delete schedule: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

// ---------------------------------------------------------------------------
// Allowance Operations
// ---------------------------------------------------------------------------

export async function approveHbarAllowance(
  owner: string,
  spender: string,
  amount: number,
  signerKeyArn?: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    let tx: Transaction = new AccountAllowanceApproveTransaction()
      .approveHbarAllowance(
        AccountId.fromString(owner),
        AccountId.fromString(spender),
        new Hbar(amount)
      );

    if (signerKeyArn) {
      const pubKey = await kmsModule.getPublicKey(signerKeyArn);
      tx = await signWithKms(tx, signerKeyArn, pubKey);
    }

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to approve HBAR allowance: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function approveTokenAllowance(
  owner: string,
  spender: string,
  tokenId: string,
  amount: number,
  signerKeyArn?: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    let tx: Transaction = new AccountAllowanceApproveTransaction()
      .approveTokenAllowance(
        TokenId.fromString(tokenId),
        AccountId.fromString(owner),
        AccountId.fromString(spender),
        amount
      );

    if (signerKeyArn) {
      const pubKey = await kmsModule.getPublicKey(signerKeyArn);
      tx = await signWithKms(tx, signerKeyArn, pubKey);
    }

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to approve token allowance: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function deleteAllowance(
  owner: string,
  spender: string,
  signerKeyArn?: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    // Revoke HBAR allowance by approving 0
    let tx: Transaction = new AccountAllowanceApproveTransaction()
      .approveHbarAllowance(
        AccountId.fromString(owner),
        AccountId.fromString(spender),
        new Hbar(0)
      );

    if (signerKeyArn) {
      const pubKey = await kmsModule.getPublicKey(signerKeyArn);
      tx = await signWithKms(tx, signerKeyArn, pubKey);
    }

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to delete allowance: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

// ---------------------------------------------------------------------------
// Staking Operations
// ---------------------------------------------------------------------------

export async function stakeToNode(
  accountId: string,
  nodeId: number,
  signerKeyArn?: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    let tx: Transaction = new AccountUpdateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setStakedNodeId(nodeId)
      .setDeclineStakingReward(false);

    if (signerKeyArn) {
      const pubKey = await kmsModule.getPublicKey(signerKeyArn);
      tx = await signWithKms(tx, signerKeyArn, pubKey);
    }

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to stake to node: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function stakeToAccount(
  accountId: string,
  stakedAccountId: string,
  signerKeyArn?: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    let tx: Transaction = new AccountUpdateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setStakedAccountId(AccountId.fromString(stakedAccountId))
      .setDeclineStakingReward(false);

    if (signerKeyArn) {
      const pubKey = await kmsModule.getPublicKey(signerKeyArn);
      tx = await signWithKms(tx, signerKeyArn, pubKey);
    }

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to stake to account: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function unstake(
  accountId: string,
  signerKeyArn?: string
): Promise<HederaResult> {
  try {
    const client = getClient();

    let tx: Transaction = new AccountUpdateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .clearStakedNodeId()
      .clearStakedAccountId()
      .setDeclineStakingReward(false);

    if (signerKeyArn) {
      const pubKey = await kmsModule.getPublicKey(signerKeyArn);
      tx = await signWithKms(tx, signerKeyArn, pubKey);
    }

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return toResult(response.transactionId.toString(), receipt.status.toString());
  } catch (err) {
    if (err instanceof HederaError) throw err;
    throw new HederaError(
      `Failed to unstake: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}
