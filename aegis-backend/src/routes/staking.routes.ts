import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import { prisma } from '@/lib/prisma';
import * as hederaClient from '@/modules/hedera/hedera.client';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

const stakeToNodeSchema = z.object({
  accountId: z.string(),
  nodeId: z.number().int(),
});

const stakeToAccountSchema = z.object({
  accountId: z.string(),
  stakedAccountId: z.string(),
});

router.post('/node', validate(stakeToNodeSchema), async (req: Request, res: Response) => {
  try {
    const { accountId, nodeId } = req.body;
    const result = await hederaClient.stakeToNode(accountId, nodeId);
    const staking = await prisma.stakingInfo.create({
      data: {
        userId: req.user!.userId, accountId, stakedNodeId: nodeId,
        isActive: true, transactionId: result.transactionId, hashscanUrl: result.hashscanUrl,
      },
    });
    successResponse(res, staking, 'Staked to node', 201, {
      transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status,
    });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/account', validate(stakeToAccountSchema), async (req: Request, res: Response) => {
  try {
    const { accountId, stakedAccountId } = req.body;
    const result = await hederaClient.stakeToAccount(accountId, stakedAccountId);
    const staking = await prisma.stakingInfo.create({
      data: {
        userId: req.user!.userId, accountId, stakedAccountId,
        isActive: true, transactionId: result.transactionId, hashscanUrl: result.hashscanUrl,
      },
    });
    successResponse(res, staking, 'Staked to account', 201, {
      transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status,
    });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/unstake', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;
    const result = await hederaClient.unstake(accountId);
    await prisma.stakingInfo.updateMany({
      where: { userId: req.user!.userId, accountId, isActive: true },
      data: { isActive: false },
    });
    successResponse(res, {}, 'Unstaked', 200, {
      transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status,
    });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const staking = await prisma.stakingInfo.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
    });
    successResponse(res, staking, 'Staking info retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
