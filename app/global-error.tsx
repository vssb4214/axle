'use client';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui', padding: '2rem' }}>
        <div style={{ maxWidth: '28rem', margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>
            {error.message || 'Internal Server Error'}
          </p>
          {error.message?.includes('NEXT_PUBLIC_SUPABASE') && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
              Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart.
            </p>
          )}
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '9999px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '9999px',
                border: '1px solid #475569',
                color: '#e2e8f0',
                textDecoration: 'none',
                fontWeight: 600
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
