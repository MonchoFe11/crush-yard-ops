'use client';

// components/conflicts/ConflictsView.tsx

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  MapPin,
  User,
  RefreshCw,
} from 'lucide-react';
import type { CalendarEvent, CourtMapping } from '@/lib/types/calendar';
import { formatDuration } from '@/lib/utils/format';
import { EventSlideOver } from '@/components/calendar/EventSlideOver';

// ── Types ──────────────────────────────────────────────────────────

interface ConflictGroup {
  events: CalendarEvent[];
  overlapStart: string;
  overlapEnd: string;
  overlapMinutes: number;
}

interface ConflictsViewProps {
  courtMappings: CourtMapping[];
}

type Severity = 'critical' | 'warning' | 'low';

// ── Helpers ────────────────────────────────────────────────────────

function getSeverity(events: CalendarEvent[]): Severity {
  const confirmedCount = events.filter(e => e.status === 'confirmed').length;
  if (confirmedCount >= 2) return 'critical';
  if (confirmedCount >= 1) return 'warning';
  return 'low';
}

const SEVERITY_STYLES: Record<Severity, {
  borderColor: string;
  labelColor: string;
  bgColor: string;
  label: string;
}> = {
  critical: {
    borderColor: 'var(--color-error)',
    labelColor: 'var(--color-error)',
    bgColor: 'rgba(176, 42, 32, 0.15)',
    label: 'Critical',
  },
  warning: {
    borderColor: 'var(--color-warning)',
    labelColor: 'var(--color-warning)',
    bgColor: 'rgba(209, 178, 72, 0.15)',
    label: 'Warning',
  },
  low: {
    borderColor: 'var(--color-primary)',
    labelColor: 'var(--color-primary)',
    bgColor: 'rgba(77, 119, 144, 0.15)',
    label: 'Low',
  },
};

function formatConflictDate(dateStr: string): string {
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  });
  const tomorrow = new Date(today + 'T00:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  if (dateStr === today) return 'Today';
  if (dateStr === tomorrowStr) return 'Tomorrow';

  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function sourceLabel(source: CalendarEvent['source']): string {
  switch (source) {
    case 'courtreserve':     return 'CourtReserve';
    case 'tripleseat_event': return 'Tripleseat';
    case 'tripleseat_lead':  return 'Lead';
  }
}

function sourceColors(source: CalendarEvent['source']): { bg: string; text: string } {
  switch (source) {
    case 'courtreserve':
      return { bg: 'rgba(114, 161, 154, 0.15)', text: 'var(--color-secondary)' };
    case 'tripleseat_event':
      return { bg: 'rgba(77, 119, 144, 0.15)', text: 'var(--color-primary)' };
    case 'tripleseat_lead':
      return { bg: 'rgba(209, 178, 72, 0.15)', text: 'var(--color-warning)' };
  }
}

// ── Conflict event card ────────────────────────────────────────────

function ConflictEventCard({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: () => void;
}) {
  const colors = sourceColors(event.source);

  return (
    <button
      onClick={onClick}
      className="flex-1 min-w-[200px] text-left p-3 rounded-lg border border-(--border-medium)
        bg-(--bg-tertiary) hover:bg-(--bg-secondary) transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-xs font-medium px-1.5 py-0.5 rounded"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {sourceLabel(event.source)}
        </span>
        <span className="text-xs text-(--text-muted) capitalize">{event.status}</span>
      </div>

      <p className="text-sm font-semibold text-(--text-primary) truncate mb-1.5">
        {event.title}
      </p>

      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-(--text-muted)">
          <Clock size={11} />
          {event.startTime} – {event.endTime}
          <span>({formatDuration(event.durationMinutes)})</span>
        </div>

        {(event.memberName || event.contactName) && (
          <div className="flex items-center gap-1.5 text-xs text-(--text-muted)">
            <User size={11} />
            {event.memberName ?? event.contactName}
          </div>
        )}

        {event.instructorName && (
          <div className="flex items-center gap-1.5 text-xs text-(--text-muted)">
            <User size={11} />
            ↳ {event.instructorName}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Conflict group card ────────────────────────────────────────────

function ConflictGroupCard({
  group,
  courtMappings,
  onEventClick,
}: {
  group: ConflictGroup;
  courtMappings: CourtMapping[];
  onEventClick: (event: CalendarEvent) => void;
}) {
  const severity = getSeverity(group.events);
  const styles = SEVERITY_STYLES[severity];

  const court = courtMappings.find(c =>
    group.events[0]?.courtMappingIds.includes(c.id)
  );

  return (
    <div
      className="rounded-xl border border-(--border-medium) overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: styles.borderColor }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-(--bg-secondary) border-b border-(--border-light)">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: styles.bgColor, color: styles.labelColor }}
        >
          {styles.label}
        </span>

        {court && (
          <span className="flex items-center gap-1 text-xs font-semibold text-(--text-primary)">
            <MapPin size={11} />
            {court.court_name}
          </span>
        )}

        <span className="text-xs text-(--text-muted)">
          {group.events.length} overlapping events
        </span>

        <div className="ml-auto flex items-center gap-1 text-xs text-(--text-muted)">
          <AlertTriangle size={11} style={{ color: styles.labelColor }} />
          Conflict: {group.overlapStart} – {group.overlapEnd}
          {group.overlapMinutes > 0 && (
            <span>({formatDuration(group.overlapMinutes)})</span>
          )}
        </div>
      </div>

      {/* Cards — flex-wrap handles 3+ events gracefully */}
      <div className="flex flex-wrap gap-3 p-4 bg-(--bg-primary)">
        {group.events.map(event => (
          <ConflictEventCard
            key={event.id}
            event={event}
            onClick={() => onEventClick(event)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────

function NoConflicts() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: 'rgba(209, 178, 72, 0.15)' }}
      >
        <CheckCircle size={22} style={{ color: 'var(--color-warning)' }} />
      </div>
      <p className="text-sm font-medium text-(--text-primary)">No conflicts detected</p>
      <p className="text-xs mt-1 text-(--text-muted)">All courts are clear for the next 14 days</p>
    </div>
  );
}

// ── Loading state ──────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex items-center gap-3 text-(--text-muted)">
        <div
          className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
        />
        <span className="text-sm">Scanning for conflicts…</span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export function ConflictsView({ courtMappings }: ConflictsViewProps) {
  const [conflictGroups, setConflictGroups] = useState<ConflictGroup[]>([]);
  const [meta, setMeta] = useState<{
    fromDate: string;
    toDate: string;
    totalConflicts: number;
    generatedAt: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const fetchConflicts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/conflicts?days=14&location=ORL');
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setConflictGroups(data.conflictGroups ?? []);
      setMeta({
        fromDate: data.fromDate,
        toDate: data.toDate,
        totalConflicts: data.totalConflicts,
        generatedAt: data.meta?.generatedAt ?? '',
      });
    } catch {
      setError('Failed to load conflicts. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConflicts();
  }, []);

  // Group conflict clusters by date for section headers
  const byDate = new Map<string, ConflictGroup[]>();
  for (const group of conflictGroups) {
    const date = group.events[0]?.date ?? 'unknown';
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(group);
  }
  const sortedDates = Array.from(byDate.keys()).sort();

  const generatedAtLabel = meta?.generatedAt
    ? new Date(meta.generatedAt).toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  return (
    <>
      <div className="flex flex-col h-full min-h-0">

        {/* ── Header bar ── */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-(--border-light) shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-(--text-primary)">
              Conflicts
            </h2>

            {meta && meta.totalConflicts > 0 && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: 'rgba(176, 42, 32, 0.2)',
                  color: 'var(--color-error)',
                }}
              >
                {meta.totalConflicts}
              </span>
            )}

            <span className="text-xs text-(--text-muted)">Next 14 days</span>

            {generatedAtLabel && (
              <span className="text-xs text-(--text-muted)">
                · as of {generatedAtLabel}
              </span>
            )}
          </div>

          <button
            onClick={fetchConflicts}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg
              border border-(--border-medium) text-(--text-secondary)
              hover:bg-(--bg-secondary) transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">

          {isLoading && <LoadingState />}

          {error && (
            <div
              className="flex items-center gap-3 p-4 rounded-lg border border-(--border-medium) bg-(--bg-secondary) text-sm"
              style={{ color: 'var(--color-error)' }}
            >
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {!isLoading && !error && conflictGroups.length === 0 && <NoConflicts />}

          {!isLoading && !error && sortedDates.length > 0 && (
            <div className="space-y-8 max-w-4xl">
              {sortedDates.map(date => (
                <div key={date}>
                  <div className="flex items-center gap-3 mb-3">
                    <p className="text-sm font-semibold text-(--text-primary)">
                      {formatConflictDate(date)}
                    </p>
                    <div className="flex-1 h-px bg-(--border-light)" />
                    <span className="text-xs text-(--text-muted)">
                      {byDate.get(date)!.length}{' '}
                      {byDate.get(date)!.length === 1 ? 'conflict' : 'conflicts'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {byDate.get(date)!.map((group, i) => (
                      <ConflictGroupCard
                        key={i}
                        group={group}
                        courtMappings={courtMappings}
                        onEventClick={setSelectedEvent}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      <EventSlideOver
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </>
  );
}