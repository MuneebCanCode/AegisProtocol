import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import * as hederaClient from '@/modules/hedera/hedera.client';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

const createFileSchema = z.object({ contents: z.string() });
const updateFileSchema = z.object({ fileId: z.string(), contents: z.string() });

router.post('/', validate(createFileSchema), async (req: Request, res: Response) => {
  try {
    const result = await hederaClient.createFile(Buffer.from(req.body.contents));
    successResponse(res, { fileId: result.fileId }, 'File created', 201, {
      transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status,
    });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.put('/', validate(updateFileSchema), async (req: Request, res: Response) => {
  try {
    const result = await hederaClient.updateFile(req.body.fileId, Buffer.from(req.body.contents));
    successResponse(res, {}, 'File updated', 200, {
      transactionId: result.transactionId, hashscanUrl: result.hashscanUrl, status: result.status,
    });
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.get('/:fileId', async (req: Request, res: Response) => {
  try {
    const contents = await hederaClient.getFileContents(req.params.fileId);
    successResponse(res, { contents: contents.toString() }, 'File contents retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
