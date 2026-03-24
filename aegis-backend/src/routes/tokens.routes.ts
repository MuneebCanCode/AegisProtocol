import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import * as hederaClient from '@/modules/hedera/hedera.client';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

const tokenAccountSchema = z.object({ tokenId: z.string(), accountId: z.string() });
const wipeSchema = z.object({ tokenId: z.string(), accountId: z.string(), amount: z.number().positive() });
const tokenIdSchema = z.object({ tokenId: z.string() });
const airdropSchema = z.object({
  tokenId: z.string(),
  recipients: z.array(z.object({ accountId: z.string(), amount: z.number().positive() })),
});

router.post('/kyc/grant', validate(tokenAccountSchema), async (req: Request, res: Response) => {
  try {
    const result = await hederaClient.grantKyc(req.body.tokenId, req.body.accountId);
    successResponse(res, result, 'KYC granted', 200, { transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/kyc/revoke', validate(tokenAccountSchema), async (req: Request, res: Response) => {
  try {
    const result = await hederaClient.revokeKyc(req.body.tokenId, req.body.accountId);
    successResponse(res, result, 'KYC revoked', 200, { transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/freeze', validate(tokenAccountSchema), async (req: Request, res: Response) => {
  try {
    const result = await hederaClient.freezeToken(req.body.tokenId, req.body.accountId);
    successResponse(res, result, 'Token frozen', 200, { transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/unfreeze', validate(tokenAccountSchema), async (req: Request, res: Response) => {
  try {
    const result = await hederaClient.unfreezeToken(req.body.tokenId, req.body.accountId);
    successResponse(res, result, 'Token unfrozen', 200, { transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/wipe', validate(wipeSchema), async (req: Request, res: Response) => {
  try {
    const result = await hederaClient.wipeToken(req.body.tokenId, req.body.accountId, req.body.amount);
    successResponse(res, result, 'Token wiped', 200, { transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/pause', validate(tokenIdSchema), async (req: Request, res: Response) => {
  try {
    const result = await hederaClient.pauseToken(req.body.tokenId);
    successResponse(res, result, 'Token paused', 200, { transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/unpause', validate(tokenIdSchema), async (req: Request, res: Response) => {
  try {
    const result = await hederaClient.unpauseToken(req.body.tokenId);
    successResponse(res, result, 'Token unpaused', 200, { transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/airdrop', validate(airdropSchema), async (req: Request, res: Response) => {
  try {
    const result = await hederaClient.airdropToken(req.body.tokenId, req.body.recipients);
    successResponse(res, result, 'Airdrop completed', 200, { transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
