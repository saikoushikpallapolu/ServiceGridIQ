export class AuthError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function reject(status: number, code: string, message: string): never { throw new AuthError(status, code, message); }
