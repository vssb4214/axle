import { NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus, HttpError } from './errors';

type JsonErrorBody = {
  ok: false;
  error: string;
  code?: string;
  hint?: string;
};

/**
 * Convert an unknown error into a consistent JSON response.
 * Keep messages user-safe; do not leak stack traces.
 */
export function jsonError(e: unknown, opts: { fallbackStatus?: number; hint?: string } = {}) {
  const status = getErrorStatus(e, opts.fallbackStatus ?? 500);

  const body: JsonErrorBody = {
    ok: false,
    error: getErrorMessage(e),
    ...(e instanceof HttpError && e.code ? { code: e.code } : {}),
    ...(opts.hint ? { hint: opts.hint } : {})
  };

  return NextResponse.json(body, { status });
}
