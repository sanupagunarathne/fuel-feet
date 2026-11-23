import { createContext, useContext, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiErrorResponseSchema } from '@fuel-feet/shared';

const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
export const FleetToken = createContext('');

export async function fleetRequest(token: string, path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (typeof options.body === 'string') headers.set('Content-Type', 'application/json');
  const response = await fetch(apiBase + path, { ...options, headers, cache: 'no-store' });
  if (!response.ok) {
    const error = apiErrorResponseSchema.safeParse(await response.json().catch(() => null));
    throw new Error(error.success ? error.data.error.message : `Request failed (${response.status}).`);
  }
  return response;
}

export function useFleetQuery<T>(path: string, enabled = true) {
  const token = useContext(FleetToken);
  return useQuery({
    queryKey: ['fleet', path], enabled,
    queryFn: async ({ signal }) => (await fleetRequest(token, path, { signal })).json() as Promise<T>,
    retry: false,
  });
}

export function useFleetMutation() {
  const token = useContext(FleetToken);
  const last = useRef<{ signature: string; key: string } | null>(null);
  return async (path: string, method: string, body: unknown, idempotent = true) => {
    const content = JSON.stringify(body);
    const signature = JSON.stringify([path, method, content]);
    if (!last.current || last.current.signature !== signature) last.current = { signature, key: crypto.randomUUID() };
    const headers = idempotent ? { 'Idempotency-Key': last.current.key } : undefined;
    const result = await fleetRequest(token, path, { method, body: content, headers });
    last.current = null;
    return result.json();
  };
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : 'Could not complete the request.';
}

export function scope(path: string, values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(name, String(value));
  }
  return `${path}?${query}`;
}
