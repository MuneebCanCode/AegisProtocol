import { Router, Request, Response } from 'express';
import { validate } from '@/middleware/validate.middleware';
import { registerSchema, loginSchema } from '@/modules/auth/auth.schemas';
import * as authService from '@/modules/auth/auth.service';
import { successResponse, errorResponse } from '@/lib/response';
import { AppError } from '@/lib/errors';

const router = Router();

router.post('/register', validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    const result = await authService.register(email, password, name);
    successResponse(res, result, 'Registration successful', 201);
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.name, err.message, err.statusCode);
    } else {
      errorResponse(res, 'InternalError', 'An unexpected error occurred');
    }
  }
});

router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    successResponse(res, result, 'Login successful');
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.name, err.message, err.statusCode);
    } else {
      errorResponse(res, 'InternalError', 'An unexpected error occurred');
    }
  }
});

export default router;
