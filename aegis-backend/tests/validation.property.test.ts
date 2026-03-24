import * as fc from 'fast-check';
import { Request, Response, NextFunction } from 'express';
import { validate } from '@/middleware/validate.middleware';
import { registerSchema } from '@/modules/auth/auth.schemas';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockReq(body: unknown): Partial<Request> {
  return { body };
}

function createMockRes(): Partial<Response> & { _statusCode: number; _json: unknown } {
  const res: Partial<Response> & { _statusCode: number; _json: unknown } = {
    _statusCode: 0,
    _json: null,
  };
  res.status = jest.fn((code: number) => {
    res._statusCode = code;
    return res as Response;
  });
  res.json = jest.fn((data: unknown) => {
    res._json = data;
    return res as Response;
  });
  return res;
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generate request bodies that do NOT conform to registerSchema.
 * registerSchema requires: email (valid email string), password (string min 8 chars).
 */
const invalidBodyArb = fc.oneof(
  // Empty object — missing both fields
  fc.constant({}),
  // Invalid email format, no password
  fc.constant({ email: 'not-email' }),
  // Valid-ish email but password too short
  fc.record({
    email: fc.string(),
    password: fc.string({ maxLength: 7 }),
  }),
  // Completely random values
  fc.anything(),
);

describe('Zod Validation Property Tests', () => {
  // Feature: aegis-protocol, Property 10: Zod Request Validation
  // **Validates: Requirements 2.5, 15.3, 16.2, 30.4**
  it('Property 10: Zod Request Validation — invalid bodies return 400 with standard error format and do not call next()', () => {
    const middleware = validate(registerSchema);

    fc.assert(
      fc.property(invalidBodyArb, (body) => {
        // Pre-condition: body must actually fail registerSchema validation
        const parseResult = registerSchema.safeParse(body);
        fc.pre(!parseResult.success);

        const req = createMockReq(body);
        const res = createMockRes();
        const next: NextFunction = jest.fn();

        middleware(req as Request, res as Response, next);

        // Must return 400
        expect(res.status).toHaveBeenCalledWith(400);

        // Must return standard error format
        expect(res._json).toEqual(
          expect.objectContaining({
            success: false,
            error: 'Validation Error',
            message: expect.any(String),
          }),
        );

        // Must NOT call next
        expect(next).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
