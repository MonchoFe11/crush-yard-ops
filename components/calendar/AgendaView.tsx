'use client';

// components/calendar/AgendaView.tsx
// Agenda view — events grouped by category, chronologically sorted within each group.
// Answers "what type of operational day is this?" — complement to the spatial grid.

import type { CalendarEvent, CourtMapping } from '@/lib/types/calendar';
import { Clock, MapPin, User, Users, AlertTriangle } from 'lucide-react';
import { formatDuration } from '@/lib/utils/format';

// ── Types ─────────────────────────────────────────────────────────

interface AgendaViewProps {
  dates: string[];
  courtMappings: CourtMapping[];
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

// ── Category mapping ──────────────────────────────────────────────
// Explicit lookup table — no fragile string matching.
// Add new CourtReserve categories here as they appear.

const CATEGORY_MAP: Record<string, string> = {
  'Private Lesson':                    'Private Lesson',
  'Beginner Session':                  'Beginner Session',
  'Fitness Session':                   'Fitness Session',
  'Indoor Pickleball':                 'Indoor Pickleball',
  '$$ Last Minute Court Reservation':  'Last Minute Reservation',
};

const CATEGORY_ORDER = [
  'Tripleseat Event',
  'Private Lesson',
  'Beginner Session',
  'Fitness Session',
  'Indoor Pickleball',
  'Last Minute Reservation',
  'Tripleseat Lead',
  'Other',
];

// Category color via CSS vars — no hardcoded Tailwind colors
const CATEGORY_STYLE: Record<string, { dotColor: string; labelColor: string }> = {
  'Tripleseat Event':      { dotColor: 'var(--color-primary)',   labelColor: 'var(--color-primary)' },
  'Tripleseat Lead':       { dotColor: 'var(--text-muted)',      labelColor: 'var(--text-muted)' },
  'Private Lesson':        { dotColor: 'var(--color-secondary)', labelColor: 'var(--color-secondary)' },
  'Beginner Session':      { dotColor: 'var(--color-secondary)', labelColor: 'var(--color-secondary)' },
  'Fitness Session':       { dotColor: 'var(--color-success)',   labelColor: 'var(--color-success)' },
  'Indoor Pickleball':     { dotColor: 'var(--color-primary)',   labelColor: 'var(--text-secondary)' },
  'Last Minute Reservation': { dotColor: 'var(--color-warning)', labelColor: 'var(--color-warning)' },
  'Other':                 { dotColor: 'var(--text-muted)',      labelColor: 'var(--text-muted)' },
};

function getCategoryGroup(event: CalendarEvent): string {
  if (event.source === 'tripleseat_event') return 'Tripleseat Event';
  if (event.source === 'tripleseat_lead')  return 'Tripleseat Lead';
  if (!event.category) return 'Other';
  return CATEGORY_MAP[event.category] ?? 'Other';
}

function groupEventsByCategory(
  events: CalendarEvent[]
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();

  const sorted = [...events].sort((a, b) => a.startMinutes - b.startMinutes);

  for (const event of sorted) {
    const group = getCategoryGroup(event);
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(event);
  }

  // Enforce CATEGORY_ORDER, then append any unknown groups at end
  const ordered = new Map<string, CalendarEvent[]>();
  for (const cat of CATEGORY_ORDER) {
    if (map.has(cat)) ordered.set(cat, map.get(cat)!);
  }
  for (const [cat, evts] of map) {
    if (!ordered.has(cat)) ordered.set(cat, evts);
  }

  return ordered;
}

// ── Event row ─────────────────────────────────────────────────────

function AgendaEventRow({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick?: () => void;
}) {
  const courtNum = event.courtNumber ? `Court ${event.courtNumber}` : null;
  const isLead = event.source === 'tripleseat_lead';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors
        hover:bg-(--bg-tertiary)
        ${isLead
          ? 'border-dashed border-(--border-light) opacity-70'
          : 'border-(--border-light)'
        }
        ${event.hasConflict ? 'border-l-2' : ''}`}
      style={event.hasConflict
        ? { borderLeftColor: 'var(--color-error)' }
        : undefined
      }
    >
      <div className="flex items-start gap-4">

        {/* Time column */}
        <div className="shrink-0 w-24 text-right">
          <p className="text-sm font-mono text-(--text-secondary)">
            {event.startTime}
          </p>
          <p className="text-xs font-mono text-(--text-muted)">
            {event.endTime}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-(--text-primary) truncate">
              {event.title}
            </p>
            {event.hasConflict && (
              <span
                className="flex items-center gap-1 text-xs"
                style={{ color: 'var(--color-error)' }}
              >
                <AlertTriangle size={11} />
                Conflict
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {courtNum && (
              <span className="flex items-center gap-1 text-xs text-(--text-muted)">
                <MapPin size={11} />
                {courtNum}
              </span>
            )}
            {event.memberName && (
              <span className="flex items-center gap-1 text-xs text-(--text-muted)">
                <User size={11} />
                {event.memberName}
              </span>
            )}
            {event.instructorName && (
              <span className="flex items-center gap-1 text-xs text-(--text-muted)">
                <User size={11} />
                ↳ {event.instructorName}
              </span>
            )}
            {event.guestCount ? (
              <span className="flex items-center gap-1 text-xs text-(--text-muted)">
                <Users size={11} />
                {event.guestCount} guests
              </span>
            ) : null}
            {event.contactName && (
              <span className="flex items-center gap-1 text-xs text-(--text-muted)">
                <User size={11} />
                {event.contactName}
              </span>
            )}
          </div>
        </div>

        {/* Duration */}
        <div className="shrink-0">
          <span className="flex items-center gap-1 text-xs text-(--text-muted)">
            <Clock size={11} />
            {formatDuration(event.durationMinutes)}
          </span>
        </div>

      </div>
    </button>
  );
}

// ── Empty state ───────────────────────────────────────────────────

function EmptyDay() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-(--text-muted)">
      <p className="text-sm font-medium">No events scheduled</p>
      <p className="text-xs mt-1">Navigate to a different day to see activity</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export function AgendaView({
  dates,
  courtMappings,
  events,
  onEventClick,
}: AgendaViewProps) {
  const grouped = groupEventsByCategory(events);

  const dateLabel = dates[0]
    ? new Date(dates[0] + 'T00:00:00Z').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';

  if (events.length === 0) return <EmptyDay />;

  return (
    <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">

      {/* ── Day summary bar ── */}
      <div className="flex items-center justify-between mb-6 pb-3 border-b border-(--border-light)">
        <p className="text-sm font-medium text-(--text-secondary)">
          {dateLabel}
        </p>
        <div className="flex items-center gap-4">
          <span className="text-xs text-(--text-muted)">
            {events.length} events
          </span>
          <span className="text-xs text-(--text-muted)">
            {courtMappings.filter(c =>
              events.some(e => e.courtMappingIds.includes(c.id))
            ).length} courts active
          </span>
          {events.some(e => e.hasConflict) && (
            <span
              className="flex items-center gap-1 text-xs font-medium"
              style={{ color: 'var(--color-error)' }}
            >
              <AlertTriangle size={12} />
              {events.filter(e => e.hasConflict).length} conflicts
            </span>
          )}
        </div>
      </div>

      {/* ── Category groups ── */}
      <div className="space-y-6 max-w-4xl">
        {Array.from(grouped.entries()).map(([category, categoryEvents]) => {
          const style = CATEGORY_STYLE[category] ?? {
            dotColor: 'var(--text-muted)',
            labelColor: 'var(--text-muted)',
          };
          return (
            <div key={category}>
              {/* Category header */}
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: style.dotColor }}
                />
                <p
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: style.labelColor }}
                >
                  {category}
                </p>
                <span className="text-xs text-(--text-muted)">
                  ({categoryEvents.length})
                </span>
              </div>

              {/* Events in category */}
              <div className="space-y-1.5 ml-4">
                {categoryEvents.map(event => (
                  <AgendaEventRow
                    key={event.id}
                    event={event}
                    onClick={() => onEventClick?.(event)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}