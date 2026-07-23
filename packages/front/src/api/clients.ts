import { apiFetch } from './client.js';
import type { ClientRecord, CreateClientRequest, UpdateClientRequest } from '@previa/shared/types';

export async function fetchClients(): Promise<ClientRecord[]> {
  return apiFetch<ClientRecord[]>('/api/clients');
}

export async function fetchClientById(id: string): Promise<ClientRecord & { properties?: any[] }> {
  return apiFetch<ClientRecord & { properties?: any[] }>(`/api/clients/${id}`);
}

export async function createClient(data: CreateClientRequest): Promise<ClientRecord> {
  return apiFetch<ClientRecord>('/api/clients', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateClient(id: string, data: UpdateClientRequest): Promise<ClientRecord> {
  return apiFetch<ClientRecord>(`/api/clients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteClient(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/clients/${id}`, {
    method: 'DELETE',
  });
}
