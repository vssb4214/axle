'use client';

import { useState } from 'react';

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Fallback: do nothing.
    }
  }

  return (
    <button type="button" className="btn-secondary" onClick={onCopy}>
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
