import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, recoveryThreshold: true, createdAt: true },
    });
    const accounts = await prisma.hederaAccount.findMany({
      where: { userId: req.user!.userId, status: 'ACTIVE' },
      include: { managedKey: { select: { healthScore: true, status: true } } },
    });
    successResponse(res, { user, accounts }, 'Settings retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.put('/profile', validate(updateProfileSchema), async (req: Request, res: Response) => {
  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: req.body,
      select: { id: true, email: true, name: true },
    });
    successResponse(res, updated, 'Profile updated');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
