/**
 * API Request/Response Types
 * Shared between packages/front and packages/api via @previa/shared/types
 */

import type { PerilScores, RiskAssessmentInput } from './schema.js';

/* ─── Auth ─── */

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'assureur' | 'assure';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'assureur' | 'assure';
}

export interface AuthResponse {
  user: AuthUser;
}

/* ─── Clients ─── */

export interface ClientRecord {
  id: string;
  userId: string;
  civility: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  insuredAddress: string | null;
  insuredPostalCode: string | null;
  insuredCity: string | null;
  status: 'active' | 'pending' | 'suspended';
  createdAt: string;
}

export interface CreateClientRequest {
  civility?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  insuredAddress?: string;
  insuredPostalCode?: string;
  insuredCity?: string;
}

export type UpdateClientRequest = Partial<CreateClientRequest> & {
  status?: 'active' | 'pending' | 'suspended';
};

/* ─── Properties ─── */

export interface PropertyRecord {
  id: string;
  clientId: string;
  address: string;
  postalCode: string | null;
  city: string | null;
  dpeClass: string | null;
  builtYear: number | null;
  banId: string | null;
  longitude: number | null;
  latitude: number | null;
  createdAt: string;
}

export interface CreatePropertyRequest {
  clientId: string;
  address: string;
  postalCode?: string;
  city?: string;
  dpeClass?: string;
  builtYear?: number;
  banId?: string;
  longitude?: number;
  latitude?: number;
}

/* ─── Risk Assessment ─── */

export interface AssessRequest {
  latitude: number;
  longitude: number;
  address: string;
  banId?: string;
  communeCode?: string;
  communeName?: string;
  departmentCode?: string;
  propertyId?: string;
}

export interface AssessResponse extends RiskAssessmentInput {
  assessmentId: string;
  scores: PerilScores;
}

export interface AssessmentSummary {
  id: string;
  propertyId: string | null;
  addressLabel: string;
  latitude: number;
  longitude: number;
  globalScore: number;
  scores: PerilScores;
  createdAt: string;
}

/* ─── API Error ─── */

export interface ApiError {
  error: string;
  message: string;
  status: number;
}
