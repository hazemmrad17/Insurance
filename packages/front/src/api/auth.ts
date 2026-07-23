/**
 * Auth API Client — Login, Register, Logout, Session Restore
 *
 * All calls use apiFetch which sends httpOnly cookies automatically.
 * On success, the backend sets a JWT cookie — subsequent requests
 * are authenticated via that cookie.
 */

import { apiFetch } from './client.js';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'assureur' | 'assure';
}

interface AuthResponse {
  user: AuthUser;
}

interface MeResponse {
  user: AuthUser;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthUser> {
  const data = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function register(params: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'assureur' | 'assure';
}): Promise<AuthUser> {
  const data = await apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return data.user;
}

export async function logout(): Promise<void> {
  await apiFetch<{ success: boolean }>('/api/auth/logout', {
    method: 'POST',
  });
}

export async function getMe(): Promise<AuthUser | null> {
  try {
    const data = await apiFetch<MeResponse>('/api/auth/me');
    return data.user;
  } catch {
    return null;
  }
}
