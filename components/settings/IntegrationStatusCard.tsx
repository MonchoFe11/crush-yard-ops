// components/settings/IntegrationStatusCard.tsx
// Shows connection status for a single integration source.
// Four states: connected (green), stale (amber), error (red), pending (amber).
// Stale = last sync was successful but >48 hours ago.

import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import type { SyncLogEntry } from '@/lib/types/settings';

interface IntegrationStatusCardProps {
  name: string;
  description: string;
  latestSync: SyncLogEntry | null;
  pendingMessage?: string;
}

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

type Status = 'connected' | 'stale' | 'error' | 'pending';

const STATUS_CONFIG: Record<Status, {
  icon: React.ReactNode;
  color: string;
  bg: string;
  label: string;
}> = {
  connected: {
    icon: <CheckCircle size={16} />,
    color: 'var(--color-success)',
    bg: 'rgba(76, 128, 74, 0.12)',
    label: 'Connected',
  },
  stale: {
    icon: <Clock size={16} />,
    color: 'var(--color-warning)',
    bg: 'rgba(209, 178, 72, 0.12)',
    label: 'Stale',
  },
  error: {
    icon: <XCircle size={16} />,
    color: 'var(--color-error)',
    bg: 'rgba(176, 42, 32, 0.12)',
    label: 'Error',
  },
  pending: {
    icon: <AlertCircle size={16} />,
    color: 'var(--color-warning)',
    bg: 'rgba(209, 178, 72, 0.12)',
    label: 'Pending',
  },
};

function deriveStatus(latestSync: SyncLogEntry | null): Status {
  if (!latestSync) return 'pending';
  if (latestSync.status !== 'success') return 'error';
  const age = Date.now() - new Date(latestSync.created_at).getTime();
  if (age > STALE_THRESHOLD_MS) return 'stale';
  return 'connected';
}

export function IntegrationStatusCard({
  name,
  description,
  latestSync,
  pendingMessage,
}: IntegrationStatusCardProps) {
  const status = deriveStatus(latestSync);
  const config = STATUS_CONFIG[status];

  return (
    <div className="rounded-xl border border-(--border-medium) bg-(--bg-secondary) p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-(--text-primary)">{name}</p>
          <p className="text-xs text-(--text-muted) mt-0.5">{description}</p>
        </div>

        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg shrink-0"
          style={{ backgroundColor: config.bg, color: config.color }}
        >
          {config.icon}
          <span className="text-xs font-semibold">{config.label}</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-(--border-light)">
        {latestSync ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-(--text-muted)">
              <Clock size={11} />
              Last sync: {formatRelativeTime(latestSync.created_at)}
              {latestSync.records_affected != null && (
                <span>· {latestSync.records_affected} records</span>
              )}
            </div>
            {status === 'stale' && (
              <p className="text-xs" style={{ color: 'var(--color-warning)' }}>
                Data may be outdated — run pull-data script to refresh
              </p>
            )}
            {status === 'error' && latestSync.error_message && (
              <p className="text-xs truncate" style={{ color: 'var(--color-error)' }}>
                {latestSync.error_message}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-(--text-muted)">
            {pendingMessage ?? 'No sync recorded yet'}
          </p>
        )}
      </div>
    </div>
  );
}