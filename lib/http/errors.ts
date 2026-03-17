export type HttpErrorDetails = {
  status?: number;
  code?: string;
  cause?: unknown;
};

/**
 * Lightweight, dependency-free HTTP error.
 *
 * Useful for API routes where you want to:
 * - throw with a status code
 * - preserve a causal chain
 * - return a sanitized message to clients
 */
export class HttpError extends Error {
  status: number;
  code?: string;
  override cause?: unknown;

  constructor(message: string, details: HttpErrorDetails = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = details.status ?? 500;
    this.code = details.code;
    this.cause = details.cause;
  }
}

export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export function getErrorStatus(e: unknown, fallback = 500): number {
  if (e instanceof HttpError) return e.status;
  return fallback;
}
