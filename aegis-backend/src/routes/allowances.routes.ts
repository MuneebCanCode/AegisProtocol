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

const approveSchema = z.object({
  ownerAccountId: z.string(),
  spenderAccountId: z.string(),
  amount: z.number().positive(),
  tokenId: z.string().optional(),
});

router.post('/', validate(approveSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { ownerAccountId, spenderAccountId, amount, tokenId } = req.body;

    let result;
    if (tokenId) {
      result = await hederaClient.approveTokenAllowance(ownerAccountId, spenderAccountId, tokenId, amount);
    } else {
      result = await hederaClient.approveHbarAllowance(ownerAccountId, spenderAccountId, amount);
    }

    const allowance = await prisma.allowance.create({
      data: {
        userId, ownerAccountId, spenderAccountId, amount,
        tokenId: tokenId ?? null,
        transactionId: result.transactionId,
        hashscanUrl: result.hashscanUrl,
      },
    });
    successResponse(res, allowance, 'Allowance approved', 201, {
      transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status,
    });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const allowances = await prisma.allowance.findMany({
      where: { userId: req.user!.userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    successResponse(res, allowances, 'Allowances retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const allowance = await prisma.allowance.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!allowance) { errorResponse(res, 'NotFound', 'Allowance not found', 404); return; }

    await hederaClient.deleteAllowance(allowance.ownerAccountId, allowance.spenderAccountId);
    await prisma.allowance.update({ where: { id: req.params.id }, data: { isActive: false } });
    successResponse(res, { id: req.params.id }, 'Allowance revoked');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
