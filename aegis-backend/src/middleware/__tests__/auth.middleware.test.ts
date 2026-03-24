import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth.middleware';
import * as authService from '@/modules/auth/auth.service';
import { AuthError } from '@/lib/errors';

jest.mock('@/modules/auth/auth.service');

const mockVerifyToken = authService.verifyToken as jest.MockedFunction<typeof authService.verifyToken>;

function createMockReq(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
  };
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('authMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should call next and attach user when token is valid', () => {
    const payload: authService.JwtPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    mockVerifyToken.mockReturnValue(payload);

    const req = createMockReq('Bearer valid-token');
    const res = createMockRes();

    authMiddleware(req as Request, res as Response, next);

    expect(mockVerifyToken).toHaveBeenCalledWith('valid-token');
    expect(req.user).toEqual(payload);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header is missing', () => {
    const req = createMockReq();
    const res = createMockRes();

    authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header does not start with Bearer', () => {
    const req = createMockReq('Basic abc123');
    const res = createMockRes();

    authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token verification fails', () => {
    mockVerifyToken.mockImplementation(() => {
      throw new AuthError('Invalid token');
    });

    const req = createMockReq('Bearer invalid-token');
    const res = createMockRes();

    authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Unauthorized',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is expired', () => {
    mockVerifyToken.mockImplementation(() => {
      throw new AuthError('Token has expired');
    });

    const req = createMockReq('Bearer expired-token');
    const res = createMockRes();

    authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
