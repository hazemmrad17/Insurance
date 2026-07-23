/**
 * Frontend HTTP Client Wrapper
 * All requests automatically include credentials (HTTP-only cookies).
 */

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'same-origin', // sends httpOnly cookies automatically
  });

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: response.statusText };
    }
    throw new Error(errorData.message || 'API request failed');
  }

  return response.json();
}
