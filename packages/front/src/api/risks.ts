import { apiFetch } from './client.js';
import type { AssessRequest, AssessResponse } from '@previa/shared/types';

export async function runAssessment(params: AssessRequest): Promise<AssessResponse> {
  return apiFetch<AssessResponse>('/api/risk/assess', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
