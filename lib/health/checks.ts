import { supabaseClient } from '@/lib/db/client';

export type CheckResult = {
  ok: boolean;
  label: string;
  detail?: string;
  meta?: Record<string, unknown>;
};

function ms(n: number) {
  return `${Math.round(n)}ms`;
}

export async function checkSupabase(): Promise<CheckResult> {
  const started = Date.now();
  try {
    // Minimal read to verify credentials + connectivity.
    // NOTE: RLS may block access to tables; that is still a *useful* signal.
    // Use a table that exists in db/schema.sql.
    // We prefer a lightweight SELECT against a commonly-present table.
    const { error } = await supabaseClient.from('listings').select('id').limit(1);

    const dur = Date.now() - started;
    if (error) {
      return {
        ok: false,
        label: 'Supabase',
        detail: `Query failed (${ms(dur)}): ${error.message}`,
        meta: { code: error.code, hint: error.hint }
      };
    }

    return {
      ok: true,
      label: 'Supabase',
      detail: `OK (${ms(dur)})`
    };
  } catch (e: any) {
    const dur = Date.now() - started;
    return {
      ok: false,
      label: 'Supabase',
      detail: `Error (${ms(dur)}): ${e?.message ?? String(e)}`
    };
  }
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // ignore
    }
    return { res, text, json };
  } finally {
    clearTimeout(t);
  }
}

export async function checkOllama(): Promise<CheckResult> {
  const started = Date.now();
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  try {
    const { res, json, text } = await fetchJsonWithTimeout(`${baseUrl}/api/tags`, 2500);
    const dur = Date.now() - started;

    if (!res.ok) {
      return {
        ok: false,
        label: 'Ollama',
        detail: `HTTP ${res.status} (${ms(dur)}): ${text.slice(0, 200)}`,
        meta: { baseUrl }
      };
    }

    const models = Array.isArray(json?.models) ? json.models : [];
    const modelNames = models.map((m: any) => m?.name).filter(Boolean);

    return {
      ok: true,
      label: 'Ollama',
      detail: `OK (${ms(dur)}) · models: ${modelNames.length}`,
      meta: { baseUrl, models: modelNames.slice(0, 20) }
    };
  } catch (e: any) {
    const dur = Date.now() - started;
    return {
      ok: false,
      label: 'Ollama',
      detail: `Error (${ms(dur)}): ${e?.name === 'AbortError' ? 'timeout' : (e?.message ?? String(e))}`,
      meta: { baseUrl }
    };
  }
}

export async function runHealthChecks(): Promise<CheckResult[]> {
  return Promise.all([checkSupabase(), checkOllama()]);
}
