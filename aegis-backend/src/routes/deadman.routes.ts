import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import * as deadmanService from '@/modules/deadman/deadman.service';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

const configureSchema = z.object({
  inactivityTimeoutDays: z.number().int().positive(),
  recoveryAccountId: z.string(),
  transferAmount: z.number().positive(),
  sourceAccountId: z.string(),
});

router.post('/', validate(configureSchema), async (req: Request, res: Response) => {
  try {
    const result = await deadmanService.configure(req.user!.userId, req.body);
    successResponse(res, result, 'Dead man switch configured', 201);
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/heartbeat', async (req: Request, res: Response) => {
  try {
    await deadmanService.sendHeartbeat(req.user!.userId);
    successResponse(res, {}, 'Heartbeat sent');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await deadmanService.getStatus(req.user!.userId);
    successResponse(res, status, 'Dead man switch status retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
