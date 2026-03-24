import * as fc from 'fast-check';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { register, login, verifyToken, JwtPayload } from '../auth.service';
import { AuthError, ConflictError } from '@/lib/errors';

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockFindUnique = jest.fn();
const mockCreate = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

// ── Setup ────────────────────────────────────────────────────────────────────

const TEST_SECRET = 'property-test-jwt-secret';

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.JWT_EXPIRATION = '1h';
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Arbitraries ──────────────────────────────────────────────────────────────

const emailArb = fc.emailAddress();
const passwordArb = fc.string({ minLength: 8, maxLength: 50 });

describe('Auth Module Property Tests', () => {
  // Feature: aegis-protocol, Property 6: Authentication Round Trip
  // **Validates: Requirements 2.1, 2.2, 2.6**
  it('Property 6: Authentication Round Trip — register then login returns valid JWT with userId and exp', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, passwordArb, async (email, password) => {
        const userId = `user-${email}`;

        // Mock create to capture the hashed password and return it for login
        let capturedHash = '';
        mockFindUnique.mockResolvedValueOnce(null); // register check
        mockCreate.mockImplementationOnce((args: { data: { password: string; email: string; name?: string } }) => {
          capturedHash = args.data.password;
          return Promise.resolve({
            id: userId,
            email,
            name: null,
            password: capturedHash,
          });
        });

        const registerResult = await register(email, password);
        expect(registerResult.user.email).toBe(email);
        expect(registerResult.token).toBeDefined();

        // Login: findUnique returns the user with the captured hashed password
        mockFindUnique.mockResolvedValueOnce({
          id: userId,
          email,
          name: null,
          password: capturedHash,
        });

        const loginResult = await login(email, password);
        expect(loginResult.user.email).toBe(email);
        expect(loginResult.token).toBeDefined();

        // Verify the login token is a valid JWT with userId and exp
        const decoded = jwt.verify(loginResult.token, TEST_SECRET) as JwtPayload;
        expect(decoded.userId).toBe(userId);
        expect(decoded.email).toBe(email);
        expect(typeof decoded.exp).toBe('number');
      }),
      { numRuns: 100 },
    );
  }, 120000);

  // Feature: aegis-protocol, Property 7: Duplicate Email Rejection
  // **Validates: Requirements 2.3**
  it('Property 7: Duplicate Email Rejection — register with existing email throws ConflictError', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, passwordArb, async (email, password) => {
        // findUnique returns an existing user
        mockFindUnique.mockResolvedValueOnce({
          id: 'existing-user',
          email,
          name: null,
          password: 'hashed',
        });

        await expect(register(email, password)).rejects.toThrow(ConflictError);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: aegis-protocol, Property 8: Generic Authentication Error
  // **Validates: Requirements 2.4**
  it('Property 8: Generic Authentication Error — wrong email and wrong password produce identical error messages', async () => {
    // Pre-compute a bcrypt hash for a known password to avoid hashing in every iteration
    const knownPassword = 'known-correct-password-12345';
    const precomputedHash = await bcrypt.hash(knownPassword, 10);

    await fc.assert(
      fc.asyncProperty(emailArb, passwordArb, async (email, password) => {
        // Ensure the generated password differs from the known password
        fc.pre(password !== knownPassword);

        // Case 1: Wrong email — findUnique returns null
        mockFindUnique.mockResolvedValueOnce(null);

        let wrongEmailError: AuthError | null = null;
        try {
          await login(email, password);
        } catch (err) {
          wrongEmailError = err as AuthError;
        }
        expect(wrongEmailError).toBeInstanceOf(AuthError);

        // Case 2: Wrong password — findUnique returns user with precomputed hash
        mockFindUnique.mockResolvedValueOnce({
          id: 'user-1',
          email,
          name: null,
          password: precomputedHash,
        });

        let wrongPasswordError: AuthError | null = null;
        try {
          await login(email, password);
        } catch (err) {
          wrongPasswordError = err as AuthError;
        }
        expect(wrongPasswordError).toBeInstanceOf(AuthError);

        // Both errors must have identical message "Invalid credentials"
        expect(wrongEmailError!.message).toBe('Invalid credentials');
        expect(wrongPasswordError!.message).toBe('Invalid credentials');
        expect(wrongEmailError!.message).toBe(wrongPasswordError!.message);
      }),
      { numRuns: 100 },
    );
  }, 120000);

  // Feature: aegis-protocol, Property 9: Invalid JWT Rejection
  // **Validates: Requirements 2.7, 33.6**
  it('Property 9: Invalid JWT Rejection — expired, malformed, and empty tokens all throw AuthError', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Expired tokens
          fc.constant('expired').map(() =>
            jwt.sign({ userId: 'u1', email: 'a@b.com' }, TEST_SECRET, { expiresIn: '-1s' })
          ),
          // Malformed tokens (random strings)
          fc.string({ minLength: 1, maxLength: 200 }),
          // Empty strings
          fc.constant('')
        ),
        (token) => {
          expect(() => verifyToken(token)).toThrow(AuthError);
        },
      ),
      { numRuns: 100 },
    );
  });
});
