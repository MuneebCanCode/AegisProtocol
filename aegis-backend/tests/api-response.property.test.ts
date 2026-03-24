import * as fc from 'fast-check';
import { successResponse, errorResponse } from '../src/lib/response';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// ── Sensitive field names that must never appear in error responses ───────────

const SENSITIVE_FIELDS = ['stack', 'query', 'sql', 'password', 'secret', 'token'];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('API Response Format Property Tests', () => {
  // Feature: aegis-protocol, Property 11: Successful API Response Structure
  // **Validates: Requirements 30.1, 30.2**
  it('Property 11: Successful API Response Structure — successResponse produces { success: true, data, message }', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string({ maxLength: 50 })),
        fc.string({ minLength: 1, maxLength: 100 }),
        (data, message) => {
          const res = mockRes();
          successResponse(res, data, message);

          expect(res.status).toHaveBeenCalledWith(200);
          const body = res.json.mock.calls[0][0];
          expect(body.success).toBe(true);
          expect(body.data).toEqual(data);
          expect(body.message).toBe(message);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: aegis-protocol, Property 11 (continued): Hedera fields included when provided
  it('Property 11 (hedera): successResponse includes transactionId, hashscanUrl, status when hedera params provided', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string({ maxLength: 50 })),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 5, maxLength: 40 }),
        fc.string({ minLength: 10, maxLength: 80 }),
        fc.constantFrom('SUCCESS', 'PENDING', 'FAILED'),
        (data, message, txId, hashscanUrl, status) => {
          const res = mockRes();
          successResponse(res, data, message, 200, {
            transactionId: txId,
            hashscanUrl,
            status,
          });

          const body = res.json.mock.calls[0][0];
          expect(body.success).toBe(true);
          expect(body.transactionId).toBe(txId);
          expect(body.hashscanUrl).toBe(hashscanUrl);
          expect(body.status).toBe(status);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: aegis-protocol, Property 12: Error API Response Structure
  // **Validates: Requirements 30.3, 34.4**
  it('Property 12: Error API Response Structure — errorResponse produces { success: false, error, message } with no internal details', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.integer({ min: 400, max: 599 }),
        (error, message, statusCode) => {
          const res = mockRes();
          errorResponse(res, error, message, statusCode);

          expect(res.status).toHaveBeenCalledWith(statusCode);
          const body = res.json.mock.calls[0][0];

          // Required fields
          expect(body.success).toBe(false);
          expect(body.error).toBe(error);
          expect(body.message).toBe(message);

          // No sensitive internal DB details exposed
          const bodyKeys = Object.keys(body);
          for (const sensitive of SENSITIVE_FIELDS) {
            expect(bodyKeys).not.toContain(sensitive);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
