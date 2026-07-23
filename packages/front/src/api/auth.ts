import { apiFetch } from './client.js';
import type { RegisterRequest, LoginRequest, AuthResponse, AuthUser } from '@previa/shared/types';

export async function login(credentials: LoginRequest): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function logout(): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/api/auth/logout', {
    method: 'POST',
  });
}

export async function getMe(): Promise<{ user: AuthUser }> {
  return apiFetch<{ user: AuthUser }>('/api/auth/me');
}
