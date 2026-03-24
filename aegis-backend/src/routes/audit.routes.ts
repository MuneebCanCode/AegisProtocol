import { Router, Request, Response } from 'express';
import { authMiddleware } from '@/middleware/auth.middleware';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';
import { AuditCategory } from '@prisma/client';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, eventType, startDate, endDate, limit } = req.query;
    const where: any = { actor: req.user!.userId };

    if (category) where.category = category as AuditCategory;
    if (eventType) where.eventType = eventType as string;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200),
    });
    successResponse(res, logs, 'Audit logs retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

// SSE stream endpoint for real-time audit events
router.get('/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const userId = req.user!.userId;
  let lastId: string | null = null;

  const interval = setInterval(async () => {
    try {
      const where: any = { actor: userId };
      if (lastId) where.id = { gt: lastId };

      const newLogs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: 10,
      });

      for (const log of newLogs) {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
        lastId = log.id;
      }
    } catch {
      // Silently handle polling errors
    }
  }, 5000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

export default router;
