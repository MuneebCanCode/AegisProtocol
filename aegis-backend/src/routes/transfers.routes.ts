import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import { prisma } from '@/lib/prisma';
import * as hederaClient from '@/modules/hedera/hedera.client';
import * as policyService from '@/modules/policy/policy.service';
import * as auditService from '@/modules/audit/audit.service';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

const transferSchema = z.object({
  fromAccountId: z.string(),
  toAccountId: z.string(),
  amount: z.number().positive(),
});

router.post('/', validate(transferSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { fromAccountId, toAccountId, amount } = req.body;

    // Validate ownership
    const account = await prisma.hederaAccount.findFirst({
      where: { accountId: fromAccountId, userId, status: 'ACTIVE' },
      include: { managedKey: true },
    });
    if (!account) {
      errorResponse(res, 'Forbidden', 'Account not owned by user or not found', 403);
      return;
    }

    // Evaluate policy
    const evaluation = await policyService.evaluateTransaction(userId, {
      amount,
      recipientAddress: toAccountId,
    });
    if (!evaluation.allowed) {
      errorResponse(res, 'PolicyViolation', evaluation.reason, 403);
      return;
    }

    // Execute transfer
    const result = await hederaClient.transferHbar(
      fromAccountId,
      toAccountId,
      amount,
      account.managedKey.kmsKeyArn,
    );

    // Record transaction
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'HBAR_TRANSFER',
        amount,
        fromAccountId,
        toAccountId,
        transactionId: result.transactionId,
        hashscanUrl: result.hashscanUrl,
        status: result.status,
      },
    });

    // Audit log
    await auditService.log({
      eventType: 'HBAR_TRANSFER',
      category: 'SIGNING_EVENTS',
      actor: userId,
      target: fromAccountId,
      details: {
        transactionType: 'HBAR_TRANSFER',
        transactionId: result.transactionId,
        amount,
        from: fromAccountId,
        to: toAccountId,
      },
      kmsKeyArn: account.managedKey.kmsKeyArn,
    });

    successResponse(res, transaction, 'Transfer successful', 200, {
      transactionId: result.transactionId,
      hashscanUrl: result.hashscanUrl,
      status: result.status,
    });
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.name, err.message, err.statusCode);
    } else {
      errorResponse(res, 'InternalError', 'An unexpected error occurred');
    }
  }
});

router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
    });
    successResponse(res, transactions, 'Transactions retrieved');
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.name, err.message, err.statusCode);
    } else {
      errorResponse(res, 'InternalError', 'An unexpected error occurred');
    }
  }
});

export default router;
