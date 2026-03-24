import { Router, Request, Response } from 'express';
import { authMiddleware } from '@/middleware/auth.middleware';
import * as rotationService from '@/modules/rotation/rotation.service';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

router.post('/:keyId', async (req: Request, res: Response) => {
  try {
    const result = await rotationService.rotateKey(req.params.keyId);
    successResponse(res, result, 'Key rotated successfully', 200, {
      transactionId: result.transactionId,
      hashscanUrl: result.hashscanUrl,
      status: 'SUCCESS',
    });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.get('/history', async (req: Request, res: Response) => {
  try {
    const records = await rotationService.getRotationHistory(req.user!.userId);
    successResponse(res, records, 'Rotation history retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
