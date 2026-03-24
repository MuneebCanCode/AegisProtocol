import { Router, Request, Response } from 'express';
import { authMiddleware } from '@/middleware/auth.middleware';
import * as mirrorClient from '@/modules/mirror/mirror.client';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

router.get('/balance/:accountId', async (req: Request, res: Response) => {
  try {
    const balance = await mirrorClient.getAccountBalance(req.params.accountId);
    successResponse(res, balance, 'Balance retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.get('/transactions/:accountId', async (req: Request, res: Response) => {
  try {
    const page = req.query.page as string | undefined;
    const history = await mirrorClient.getTransactionHistory(req.params.accountId, page);
    successResponse(res, history, 'Transaction history retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.get('/tokens/:tokenId', async (req: Request, res: Response) => {
  try {
    const info = await mirrorClient.getTokenInfo(req.params.tokenId);
    successResponse(res, info, 'Token info retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
