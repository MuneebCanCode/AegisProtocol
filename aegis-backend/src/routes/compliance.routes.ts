import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import * as complianceService from '@/modules/compliance/compliance.service';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

router.get('/score', async (req: Request, res: Response) => {
  try {
    const result = await complianceService.calculateComplianceScore(req.user!.userId);
    successResponse(res, result, 'Compliance score calculated');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.get('/report', async (req: Request, res: Response) => {
  try {
    const report = await complianceService.generateReport(req.user!.userId);
    successResponse(res, report, 'Compliance report generated');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

const exportSchema = z.object({
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
});

router.post('/export', validate(exportSchema), async (req: Request, res: Response) => {
  try {
    const csv = await complianceService.exportCsv(req.user!.userId, req.body.startDate, req.body.endDate);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
    res.send(csv);
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
