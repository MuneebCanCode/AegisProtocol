import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import { prisma } from '@/lib/prisma';
import * as policyService from '@/modules/policy/policy.service';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

const policySchema = z.object({
  maxTransactionAmount: z.number().positive(),
  dailyLimit: z.number().positive(),
  whitelistedAccounts: z.array(z.string()).default([]),
  businessHoursOnly: z.boolean().default(false),
  startHour: z.number().int().min(0).max(23).optional(),
  endHour: z.number().int().min(0).max(23).optional(),
});

router.post('/', validate(policySchema), async (req: Request, res: Response) => {
  try {
    const result = await policyService.createPolicy(req.user!.userId, req.body);
    successResponse(res, result, 'Policy created', 201);
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.put('/:id', validate(policySchema), async (req: Request, res: Response) => {
  try {
    const result = await policyService.updatePolicy(req.params.id, req.body);
    successResponse(res, result, 'Policy updated');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const policies = await prisma.policy.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
    });
    successResponse(res, policies, 'Policies retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
