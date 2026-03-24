import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import * as guardianService from '@/modules/guardian/guardian.service';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

const assignSchema = z.object({
  guardianUserId: z.string().uuid(),
  role: z.string().min(1),
  weight: z.number().int().positive().default(1),
});

const thresholdSchema = z.object({
  threshold: z.number().int().positive(),
});

const initiateRecoverySchema = z.object({
  targetUserId: z.string().uuid(),
});

const signRecoverySchema = z.object({
  scheduleId: z.string(),
});

router.post('/', validate(assignSchema), async (req: Request, res: Response) => {
  try {
    const result = await guardianService.assignGuardian(
      req.user!.userId, req.body.guardianUserId, req.body.role, req.body.weight,
    );
    successResponse(res, result, 'Guardian assigned', 201);
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await guardianService.removeGuardian(req.params.id);
    successResponse(res, { id: req.params.id }, 'Guardian removed');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.put('/threshold', validate(thresholdSchema), async (req: Request, res: Response) => {
  try {
    await guardianService.setRecoveryThreshold(req.user!.userId, req.body.threshold);
    successResponse(res, { threshold: req.body.threshold }, 'Recovery threshold updated');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/recovery/initiate', validate(initiateRecoverySchema), async (req: Request, res: Response) => {
  try {
    const result = await guardianService.initiateRecovery(req.user!.userId, req.body.targetUserId);
    successResponse(res, result, 'Recovery initiated', 201);
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/recovery/sign', validate(signRecoverySchema), async (req: Request, res: Response) => {
  try {
    const result = await guardianService.signRecovery(req.user!.userId, req.body.scheduleId);
    successResponse(res, result, 'Recovery signed');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.get('/recovery/status', async (req: Request, res: Response) => {
  try {
    const status = await guardianService.getRecoveryStatus(req.user!.userId);
    successResponse(res, status, 'Recovery status retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
