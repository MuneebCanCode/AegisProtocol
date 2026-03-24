import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import { prisma } from '@/lib/prisma';
import * as kmsModule from '@/modules/kms/kms.service';
import * as hederaClient from '@/modules/hedera/hedera.client';
import * as auditService from '@/modules/audit/audit.service';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

const createAccountSchema = z.object({
  keyId: z.string().uuid(),
  alias: z.string().optional(),
});

const deleteAccountSchema = z.object({
  transferAccountId: z.string(),
});

router.post('/', validate(createAccountSchema), async (req: Request, res: Response) => {
  try {
    const { keyId, alias } = req.body;
    const userId = req.user!.userId;

    const managedKey = await prisma.managedKey.findFirst({
      where: { id: keyId, userId, status: 'ACTIVE' },
    });
    if (!managedKey) {
      errorResponse(res, 'NotFound', 'Managed key not found', 404);
      return;
    }

    const publicKeyBuffer = Buffer.from(managedKey.publicKey, 'hex');
    const result = await hederaClient.createAccount(publicKeyBuffer);

    const account = await prisma.hederaAccount.create({
      data: {
        userId,
        accountId: result.accountId,
        alias: alias ?? null,
        managedKeyId: keyId,
        hashscanUrl: result.hashscanUrl,
      },
    });

    await auditService.log({
      eventType: 'ACCOUNT_CREATED',
      category: 'KEY_LIFECYCLE',
      actor: userId,
      target: result.accountId,
      details: { accountId: result.accountId, keyId, transactionId: result.transactionId },
      kmsKeyArn: managedKey.kmsKeyArn,
    });

    successResponse(res, account, 'Account created', 201, {
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

router.get('/', async (req: Request, res: Response) => {
  try {
    const accounts = await prisma.hederaAccount.findMany({
      where: { userId: req.user!.userId },
      include: { managedKey: { select: { id: true, kmsKeyAlias: true, healthScore: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    successResponse(res, accounts, 'Accounts retrieved');
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.name, err.message, err.statusCode);
    } else {
      errorResponse(res, 'InternalError', 'An unexpected error occurred');
    }
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const account = await prisma.hederaAccount.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
      include: { managedKey: true },
    });
    if (!account) {
      errorResponse(res, 'NotFound', 'Account not found', 404);
      return;
    }

    const { alias } = req.body;
    const updated = await prisma.hederaAccount.update({
      where: { id: req.params.id },
      data: { alias },
    });
    successResponse(res, updated, 'Account updated');
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.name, err.message, err.statusCode);
    } else {
      errorResponse(res, 'InternalError', 'An unexpected error occurred');
    }
  }
});

router.delete('/:id', validate(deleteAccountSchema), async (req: Request, res: Response) => {
  try {
    const account = await prisma.hederaAccount.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
      include: { managedKey: true },
    });
    if (!account) {
      errorResponse(res, 'NotFound', 'Account not found', 404);
      return;
    }

    const result = await hederaClient.deleteAccount(
      account.accountId,
      req.body.transferAccountId,
      account.managedKey.kmsKeyArn,
    );

    await prisma.hederaAccount.update({
      where: { id: req.params.id },
      data: { status: 'DELETED' },
    });

    await auditService.log({
      eventType: 'ACCOUNT_DELETED',
      category: 'KEY_LIFECYCLE',
      actor: req.user!.userId,
      target: account.accountId,
      details: { transferAccountId: req.body.transferAccountId, transactionId: result.transactionId },
      kmsKeyArn: account.managedKey.kmsKeyArn,
    });

    successResponse(res, { id: req.params.id }, 'Account deleted', 200, {
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

export default router;
