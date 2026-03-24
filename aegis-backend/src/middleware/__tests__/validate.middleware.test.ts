import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../validate.middleware';

function createMockReq(body: unknown): Partial<Request> {
  return { body };
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const testSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0),
});

describe('validate middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  it('should call next and replace body with parsed data on valid input', () => {
    const req = createMockReq({ email: 'test@example.com', age: 25, extra: 'field' });
    const res = createMockRes();
    const middleware = validate(testSchema);

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    // extra field should be stripped by zod
    expect(req.body).toEqual({ email: 'test@example.com', age: 25 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 400 with validation details on invalid input', () => {
    const req = createMockReq({ email: 'not-an-email', age: -5 });
    const res = createMockRes();
    const middleware = validate(testSchema);

    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Validation Error',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 when required fields are missing', () => {
    const req = createMockReq({});
    const res = createMockRes();
    const middleware = validate(testSchema);

    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 when body has wrong types', () => {
    const req = createMockReq({ email: 'test@example.com', age: 'not-a-number' });
    const res = createMockRes();
    const middleware = validate(testSchema);

    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should include field paths in error message', () => {
    const req = createMockReq({ email: 'bad', age: -1 });
    const res = createMockRes();
    const middleware = validate(testSchema);

    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonCall.message).toContain('email');
  });
});
