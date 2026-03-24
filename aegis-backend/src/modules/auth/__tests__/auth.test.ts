import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { register, login, verifyToken, JwtPayload } from '../auth.service';
import { registerSchema, loginSchema } from '../auth.schemas';
import { AuthError, ConflictError } from '@/lib/errors';

// Mock Prisma
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

const TEST_SECRET = 'test-jwt-secret-key';
const TEST_EXPIRATION = '1h';

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.JWT_EXPIRATION = TEST_EXPIRATION;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Auth Schemas', () => {
  describe('registerSchema', () => {
    it('accepts valid registration input', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
        name: 'Test User',
      });
      expect(result.success).toBe(true);
    });

    it('accepts registration without name', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = registerSchema.safeParse({
        email: 'not-an-email',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects password shorter than 8 characters', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'short',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('accepts valid login input', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'bad-email',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Auth Service', () => {
  describe('register', () => {
    it('creates a user and returns a JWT token', async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        id: 'user-1',
        email: 'new@example.com',
        name: 'New User',
        password: 'hashed',
      });

      const result = await register('new@example.com', 'password123', 'New User');

      expect(result.user.email).toBe('new@example.com');
      expect(result.user.name).toBe('New User');
      expect(result.token).toBeDefined();

      // Verify the token is valid
      const decoded = jwt.verify(result.token, TEST_SECRET) as JwtPayload;
      expect(decoded.userId).toBe('user-1');
      expect(decoded.email).toBe('new@example.com');
      expect(decoded.exp).toBeDefined();
    });

    it('hashes the password with bcrypt (salt rounds >= 10)', async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        id: 'user-2',
        email: 'test@example.com',
        name: null,
        password: 'hashed',
      });

      await register('test@example.com', 'mypassword');

      const createCall = mockCreate.mock.calls[0][0];
      const storedHash = createCall.data.password;

      // bcrypt hash should start with $2a$ or $2b$ and have salt rounds >= 10
      expect(storedHash).toMatch(/^\$2[ab]\$/);
      const rounds = parseInt(storedHash.split('$')[2], 10);
      expect(rounds).toBeGreaterThanOrEqual(10);
    });

    it('throws ConflictError for duplicate email', async () => {
      mockFindUnique.mockResolvedValue({ id: 'existing', email: 'dup@example.com' });

      await expect(register('dup@example.com', 'password123'))
        .rejects.toThrow(ConflictError);
    });
  });

  describe('login', () => {
    it('returns a JWT token for valid credentials', async () => {
      const hashed = await bcrypt.hash('correctpassword', 10);
      mockFindUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        password: hashed,
      });

      const result = await login('user@example.com', 'correctpassword');

      expect(result.user.email).toBe('user@example.com');
      expect(result.token).toBeDefined();

      const decoded = jwt.verify(result.token, TEST_SECRET) as JwtPayload;
      expect(decoded.userId).toBe('user-1');
    });

    it('throws AuthError with generic message for wrong email', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(login('wrong@example.com', 'password123'))
        .rejects.toThrow(AuthError);

      try {
        await login('wrong@example.com', 'password123');
      } catch (err) {
        expect((err as AuthError).message).toBe('Invalid credentials');
      }
    });

    it('throws AuthError with generic message for wrong password', async () => {
      const hashed = await bcrypt.hash('correctpassword', 10);
      mockFindUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        password: hashed,
      });

      await expect(login('user@example.com', 'wrongpassword'))
        .rejects.toThrow(AuthError);

      try {
        await login('user@example.com', 'wrongpassword');
      } catch (err) {
        expect((err as AuthError).message).toBe('Invalid credentials');
      }
    });

    it('returns identical error messages for wrong email and wrong password', async () => {
      // Wrong email
      mockFindUnique.mockResolvedValue(null);
      let wrongEmailMsg = '';
      try {
        await login('wrong@example.com', 'password123');
      } catch (err) {
        wrongEmailMsg = (err as AuthError).message;
      }

      // Wrong password
      const hashed = await bcrypt.hash('correctpassword', 10);
      mockFindUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        password: hashed,
      });
      let wrongPassMsg = '';
      try {
        await login('user@example.com', 'wrongpassword');
      } catch (err) {
        wrongPassMsg = (err as AuthError).message;
      }

      expect(wrongEmailMsg).toBe(wrongPassMsg);
    });
  });

  describe('verifyToken', () => {
    it('returns decoded payload for a valid token', () => {
      const token = jwt.sign(
        { userId: 'user-1', email: 'user@example.com' },
        TEST_SECRET,
        { expiresIn: '1h' }
      );

      const payload = verifyToken(token);

      expect(payload.userId).toBe('user-1');
      expect(payload.email).toBe('user@example.com');
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it('throws AuthError for expired token', () => {
      const token = jwt.sign(
        { userId: 'user-1', email: 'user@example.com' },
        TEST_SECRET,
        { expiresIn: '0s' }
      );

      // Small delay to ensure expiration
      expect(() => verifyToken(token)).toThrow(AuthError);
    });

    it('throws AuthError for malformed token', () => {
      expect(() => verifyToken('not.a.valid.token')).toThrow(AuthError);
    });

    it('throws AuthError for token signed with wrong secret', () => {
      const token = jwt.sign(
        { userId: 'user-1', email: 'user@example.com' },
        'wrong-secret',
        { expiresIn: '1h' }
      );

      expect(() => verifyToken(token)).toThrow(AuthError);
    });

    it('throws AuthError for empty token', () => {
      expect(() => verifyToken('')).toThrow(AuthError);
    });
  });
});
