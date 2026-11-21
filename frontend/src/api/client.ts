export const API_BASE = '/api/v1';

export class ApiError extends Error {
  public code: string;
  public statusCode: number;
  public details?: any[];

  constructor(message: string, code: string, statusCode: number, details?: any[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('certiflow_token');
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorEnvelope = data?.error || {};
    throw new ApiError(
      errorEnvelope.message || `Request failed with status ${response.status}`,
      errorEnvelope.code || 'REQUEST_FAILED',
      response.status,
      errorEnvelope.details
    );
  }

  return data as T;
}
