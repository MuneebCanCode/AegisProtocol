import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { AuthError, ConflictError } from '@/lib/errors';

const SALT_ROUNDS = 10;

export interface JwtPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

function getJwtExpiration(): string {
  return process.env.JWT_EXPIRATION || '24h';
}

function signToken(userId: string, email: string): string {
  const expiration = getJwtExpiration();
  return jwt.sign(
    { userId, email },
    getJwtSecret(),
    { expiresIn: expiration } as jwt.SignOptions
  );
}

export async function register(email: string, password: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError('Email is already registered');
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { email, password: hashedPassword, name },
  });

  const token = signToken(user.id, user.email);

  return {
    user: { id: user.id, email: user.email, name: user.name },
    token,
  };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AuthError('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new AuthError('Invalid credentials');
  }

  const token = signToken(user.id, user.email);

  return {
    user: { id: user.id, email: user.email, name: user.name },
    token,
  };
}

export function verifyToken(token: string): JwtPayload {
  if (!token) {
    throw new AuthError('Token is required');
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthError('Token has expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AuthError('Invalid token');
    }
    throw new AuthError('Token verification failed');
  }
}
