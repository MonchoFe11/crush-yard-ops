'use client';

// components/calendar/AIBriefTab.tsx
// Renders an AI-generated operational brief for Tripleseat events.
// Fetches from /api/briefs on demand. Caches via Supabase (server-side).

import { useState } from 'react';
import { Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Copy, Check } from 'lucide-react';
import type { CalendarEvent } from '@/lib/types/calendar';

// ── Types ─────────────────────────────────────────────────────────

interface AIBriefTabProps {
  event: CalendarEvent;
}

type BriefState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; brief: string; cached: boolean }
  | { status: 'error'; message: string };

// ── Markdown renderer ─────────────────────────────────────────────
// Groups consecutive bullet lines into a proper <ul> block.

function renderBrief(markdown: string): React.ReactNode {
  const lines = markdown.split('\n');
  const nodes: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let keyCounter = 0;

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    nodes.push(
      <ul key={`ul-${keyCounter++}`} className="list-disc list-inside ml-3 mb-1 space-y-0.5">
        {bulletBuffer.map((text, i) => (
          <li key={i} className="text-sm text-(--text-secondary)">
            {text}
          </li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  for (const line of lines) {
    // Bold headers: **Text**
    if (line.startsWith('**') && line.endsWith('**')) {
      flushBullets();
      nodes.push(
        <p key={keyCounter++} className="text-sm font-bold text-(--text-primary) mt-4 mb-1 first:mt-0">
          {line.slice(2, -2)}
        </p>
      );
      continue;
    }
    // Bullet points — buffer them
    if (line.startsWith('- ')) {
      bulletBuffer.push(line.slice(2));
      continue;
    }
    // Numbered flags: "1. " "2. " etc
    if (/^\d+\.\s/.test(line)) {
      flushBullets();
      nodes.push(
        <p key={keyCounter++} className="text-sm text-(--text-secondary) mb-1 ml-1">
          {line}
        </p>
      );
      continue;
    }
    // Empty line
    if (line.trim() === '') {
      flushBullets();
      nodes.push(<div key={keyCounter++} className="h-1" />);
      continue;
    }
    // Normal text
    flushBullets();
    nodes.push(
      <p key={keyCounter++} className="text-sm text-(--text-secondary) mb-1">
        {line}
      </p>
    );
  }

  flushBullets();
  return nodes;
}

// ── Component ─────────────────────────────────────────────────────

export function AIBriefTab({ event }: AIBriefTabProps) {
  const [state, setState] = useState<BriefState>({ status: 'idle' });
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalRecordId: event.originalRecordId,
          source: event.source,
        }),
      });

      if (!res.ok) {
        const data: unknown = await res.json();
        const message =
          typeof data === 'object' &&
          data !== null &&
          'error' in data &&
          typeof (data as Record<string, unknown>).error === 'string'
            ? (data as Record<string, string>).error
            : 'Failed to generate brief';
        setState({ status: 'error', message });
        return;
      }

      const data: unknown = await res.json();
      if (
        typeof data === 'object' &&
        data !== null &&
        'brief' in data &&
        typeof (data as Record<string, unknown>).brief === 'string'
      ) {
        setState({
          status: 'done',
          brief: (data as Record<string, unknown>).brief as string,
          cached: Boolean((data as Record<string, unknown>).cached),
        });
      } else {
        setState({ status: 'error', message: 'Unexpected response format' });
      }
    } catch {
      setState({ status: 'error', message: 'Network error. Try again.' });
    }
  };

  const handleCopy = () => {
    if (state.status !== 'done') return;
    navigator.clipboard.writeText(state.brief);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Idle ──
  if (state.status === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgba(114, 161, 154, 0.15)' }}
        >
          <Sparkles size={20} style={{ color: 'var(--color-secondary)' }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-(--text-primary) mb-1">
            Generate AI Brief
          </p>
          <p className="text-xs text-(--text-muted) max-w-[220px]">
            Claude will analyze this event and create an operational checklist for your team.
          </p>
        </div>
        <button
          onClick={generate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: 'var(--color-secondary)',
            color: 'var(--bg-primary)',
          }}
        >
          <Sparkles size={14} />
          Generate Brief
        </button>
      </div>
    );
  }

  // ── Loading ──
  if (state.status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <RefreshCw
          size={20}
          className="animate-spin"
          style={{ color: 'var(--color-secondary)' }}
        />
        <p className="text-sm text-(--text-muted)">Generating brief...</p>
      </div>
    );
  }

  // ── Error ──
  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-3">
        <AlertTriangle size={20} style={{ color: 'var(--color-error)' }} />
        <p className="text-sm text-(--text-secondary)">{state.message}</p>
        <button
          onClick={generate}
          className="text-xs text-(--text-muted) hover:text-(--text-primary) underline transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Done ──
  return (
    <div className="px-1 py-2 flex flex-col">
      {state.cached && (
        <div className="flex items-center gap-1.5 mb-3 px-1">
          <CheckCircle2 size={12} style={{ color: 'var(--color-secondary)' }} />
          <p className="text-[10px] text-(--text-muted) uppercase tracking-widest">
            Cached brief
          </p>
        </div>
      )}

      <div className="space-y-0.5">
        {renderBrief(state.brief)}
      </div>

      <div className="mt-5 pt-4 border-t border-(--border-light) flex items-center justify-between">
        <button
          onClick={generate}
          className="flex items-center gap-1.5 text-xs text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          <RefreshCw size={11} />
          Regenerate
        </button>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
          style={{
            backgroundColor: copied
              ? 'rgba(114, 161, 154, 0.15)'
              : 'var(--bg-tertiary)',
            color: copied
              ? 'var(--color-secondary)'
              : 'var(--text-primary)',
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied ✓' : 'Copy Brief'}
        </button>
      </div>
    </div>
  );
}