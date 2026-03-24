import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import * as insuranceService from '@/modules/insurance/insurance.service';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

const depositSchema = z.object({
  premiumAmount: z.number().positive(),
  coverageAmount: z.number().positive(),
  coverageLevel: z.string().optional(),
  sourceAccountId: z.string(),
});

router.post('/deposit', validate(depositSchema), async (req: Request, res: Response) => {
  try {
    const result = await insuranceService.deposit(req.user!.userId, req.body);
    successResponse(res, result, 'Insurance deposit successful', 201);
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/withdraw/:policyId', async (req: Request, res: Response) => {
  try {
    const result = await insuranceService.withdraw(req.user!.userId, req.params.policyId);
    successResponse(res, result, 'Insurance withdrawal successful');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.get('/info', async (req: Request, res: Response) => {
  try {
    const info = await insuranceService.getInfo(req.user!.userId);
    successResponse(res, info, 'Insurance info retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
