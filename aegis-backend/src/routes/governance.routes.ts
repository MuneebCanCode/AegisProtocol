import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import { prisma } from '@/lib/prisma';
import * as governanceService from '@/modules/governance/governance.service';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();
router.use(authMiddleware);

const proposalSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  options: z.array(z.string()).min(2),
  votingDurationHours: z.number().positive(),
});

const voteSchema = z.object({
  option: z.string().min(1),
});

router.post('/proposals', validate(proposalSchema), async (req: Request, res: Response) => {
  try {
    const result = await governanceService.createProposal(req.user!.userId, req.body);
    successResponse(res, result, 'Proposal created', 201);
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.get('/proposals', async (req: Request, res: Response) => {
  try {
    const proposals = await prisma.proposal.findMany({
      include: { _count: { select: { votes: true } } },
      orderBy: { createdAt: 'desc' },
    });
    successResponse(res, proposals, 'Proposals retrieved');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/proposals/:id/vote', validate(voteSchema), async (req: Request, res: Response) => {
  try {
    const result = await governanceService.castVote(req.user!.userId, {
      proposalId: req.params.id,
      option: req.body.option,
    });
    successResponse(res, result, 'Vote cast', 201);
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

router.post('/proposals/:id/tally', async (req: Request, res: Response) => {
  try {
    const result = await governanceService.tallyVotes(req.params.id);
    successResponse(res, result, 'Votes tallied');
  } catch (err) {
    if (err instanceof AppError) errorResponse(res, err.name, err.message, err.statusCode);
    else errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

export default router;
