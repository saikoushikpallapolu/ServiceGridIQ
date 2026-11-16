import { z } from 'zod';
import type { Session } from '@servicegrid/contracts';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function api(path: string, options: RequestInit = {}, session?: Session | null): Promise<unknown> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (session) {
    headers.set('X-CSRF-Token', session.csrfToken);
    if (session.activeOrganization) headers.set('X-Organization-Id', session.activeOrganization.id);
  }
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  const data: unknown = await response.json();
  if (!response.ok) {
    const failure = z.object({ error: z.object({ message: z.string() }) }).safeParse(data);
    throw new ApiError(response.status, failure.success ? failure.data.error.message : 'The request could not be completed');
  }
  return data;
}
