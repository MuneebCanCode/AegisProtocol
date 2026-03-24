import { Router, Request, Response } from 'express';
import { authMiddleware } from '@/middleware/auth.middleware';
import * as kmsModule from '@/modules/kms/kms.service';
import * as healthService from '@/modules/health/health.service';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  try {
    const key = await kmsModule.generateKey(req.user!.userId);
    successResponse(res, key, 'Key generated successfully', 201);
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
    const keys = await kmsModule.listUserKeys(req.user!.userId);
    successResponse(res, keys, 'Keys retrieved successfully');
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.name, err.message, err.statusCode);
    } else {
      errorResponse(res, 'InternalError', 'An unexpected error occurred');
    }
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const keys = await kmsModule.listUserKeys(req.user!.userId);
    const key = keys.find((k) => k.id === id);
    if (!key) {
      errorResponse(res, 'NotFound', 'Key not found', 404);
      return;
    }
    await kmsModule.scheduleKeyDeletion(key.kmsKeyArn, 30);
    successResponse(res, { id }, 'Key scheduled for deletion');
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.name, err.message, err.statusCode);
    } else {
      errorResponse(res, 'InternalError', 'An unexpected error occurred');
    }
  }
});

router.get('/:id/health', async (req: Request, res: Response) => {
  try {
    const result = await healthService.calculateScore(req.params.id);
    successResponse(res, result, 'Health score calculated');
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.name, err.message, err.statusCode);
    } else {
      errorResponse(res, 'InternalError', 'An unexpected error occurred');
    }
  }
});

export default router;
