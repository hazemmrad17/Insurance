/**
 * Auth Service — JWT via HTTP-only cookies + bcrypt password hashing
 */
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface JwtPayload {
  sub: string;    // user id
  email: string;
  role: 'assureur' | 'assure';
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRATION)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      sub: payload.sub as string,
      email: payload['email'] as string,
      role: payload['role'] as 'assureur' | 'assure',
    };
  } catch {
    return null;
  }
}

export function buildCookieHeader(token: string): string {
  const maxAge = 24 * 60 * 60; // 24h in seconds
  const secure = env.COOKIE_SECURE ? '; Secure' : '';
  return `token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export function clearCookieHeader(): string {
  return `token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
