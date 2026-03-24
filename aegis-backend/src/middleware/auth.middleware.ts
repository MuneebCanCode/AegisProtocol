import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@/modules/auth/auth.service';
import { errorResponse } from '@/lib/response';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    errorResponse(res, 'Unauthorized', 'Missing or malformed Authorization header', 401);
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    errorResponse(res, 'Unauthorized', 'Invalid or expired token', 401);
  }
}
