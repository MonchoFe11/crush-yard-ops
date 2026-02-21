// components/settings/SyncLogTable.tsx
// Shows the 20 most recent sync operations as an audit trail.
// Columns: time, source, operation, status, records, duration.
// Errors display inline below their row.

import React from 'react';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import type { SyncLogEntry } from '@/lib/types/settings';

interface SyncLogTableProps {
  entries: SyncLogEntry[];
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const SOURCE_LABELS: Record<string, string> = {
  courtreserve: 'CourtReserve',
  tripleseat:   'Tripleseat',
};

export function SyncLogTable({ entries }: SyncLogTableProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-(--border-medium) bg-(--bg-secondary) p-8 text-center">
        <p className="text-sm text-(--text-muted)">No sync history yet</p>
        <p className="text-xs text-(--text-muted) mt-1">
          Run the pull-data script to populate this log
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-(--border-medium) overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-(--border-light) bg-(--bg-secondary)">
            <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">
              Time
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">
              Source
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">
              Operation
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">
              Status
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">
              Records
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">
              Duration
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--border-light) bg-(--bg-primary)">
          {entries.map(entry => (
            <React.Fragment key={entry.id}>
              <tr className="hover:bg-(--bg-secondary) transition-colors">
                <td className="px-4 py-3 text-xs text-(--text-muted) whitespace-nowrap">
                  {formatDateTime(entry.created_at)}
                </td>
                <td className="px-4 py-3 font-medium text-(--text-primary)">
                  {SOURCE_LABELS[entry.source] ?? entry.source}
                </td>
                <td className="px-4 py-3 text-xs text-(--text-secondary) capitalize">
                  {entry.operation ?? '—'}
                </td>
                <td className="px-4 py-3">
                  {entry.status === 'success' ? (
                    <span
                      className="flex items-center gap-1 text-xs"
                      style={{ color: 'var(--color-success)' }}
                    >
                      <CheckCircle size={13} />
                      Success
                    </span>
                  ) : entry.status === 'running' ? (
                    <span className="flex items-center gap-1 text-xs text-(--text-muted)">
                      <Loader size={13} className="animate-spin" />
                      Running
                    </span>
                  ) : (
                    <span
                      className="flex items-center gap-1 text-xs"
                      style={{ color: 'var(--color-error)' }}
                    >
                      <XCircle size={13} />
                      {entry.status}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-(--text-secondary)">
                  {entry.records_affected != null
                    ? `${entry.records_affected} records`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-(--text-muted) font-mono">
                  {entry.duration_ms != null
                    ? `${(entry.duration_ms / 1000).toFixed(1)}s`
                    : '—'}
                </td>
              </tr>

              {/* Inline error row — appears directly below failed entry */}
              {entry.error_message && (
                <tr className="bg-(--bg-secondary)">
                  <td />
                  <td
                    colSpan={5}
                    className="px-4 py-2 text-xs"
                    style={{ color: 'var(--color-error)' }}
                  >
                    {entry.error_message}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}