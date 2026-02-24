'use client';

// components/calendar/AgendaView.tsx
// Two modes:
//   Day/Agenda (dates.length === 1): grouped by category, original behavior.
//   Week       (dates.length  >  1): grouped by date first, then category per day.
//              Each day section has a collapse toggle for density control.

import { useState } from 'react';
import Link from 'next/link';
import type { CalendarEvent, CourtMapping } from '@/lib/types/calendar';
import { Clock, MapPin, User, Users, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDuration } from '@/lib/utils/format';
import { getEventClasses } from '@/lib/utils/event-style';

// ── Types ─────────────────────────────────────────────────────────

interface AgendaViewProps {
  dates: string[];
  courtMappings: CourtMapping[];
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

// ── Category mapping ──────────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  'Private Lesson':                   'Private Lesson',
  'Beginner Session':                 'Beginner Session',
  'Fitness Session':                  'Fitness Session',
  'Indoor Pickleball':                'Indoor Pickleball',
  '$$ Last Minute Court Reservation': 'Last Minute Reservation',
};

const CATEGORY_ORDER = [
  'Events',
  'Private Lesson',
  'Beginner Session',
  'Fitness Session',
  'Indoor Pickleball',
  'Last Minute Reservation',
  'Leads',
];

const CATEGORY_STYLE: Record<string, { dotColor: string; labelColor: string }> = {
  'Events':                  { dotColor: 'var(--color-primary)',   labelColor: 'var(--color-primary)' },
  'Leads':                   { dotColor: 'var(--text-muted)',      labelColor: 'var(--text-muted)' },
  'Private Lesson':          { dotColor: 'var(--color-secondary)', labelColor: 'var(--color-secondary)' },
  'Beginner Session':        { dotColor: 'var(--color-secondary)', labelColor: 'var(--color-secondary)' },
  'Fitness Session':         { dotColor: 'var(--color-success)',   labelColor: 'var(--color-success)' },
  'Indoor Pickleball':       { dotColor: 'var(--color-primary)',   labelColor: 'var(--text-secondary)' },
  'Last Minute Reservation': { dotColor: 'var(--color-warning)',   labelColor: 'var(--color-warning)' },
};

// ── Helpers ───────────────────────────────────────────────────────

function getCategoryGroup(event: CalendarEvent): string {
  if (event.source === 'tripleseat_event') return 'Events';
  if (event.source === 'tripleseat_lead')  return 'Leads';
  if (!event.category) return 'Other';
  return CATEGORY_MAP[event.category] ?? event.category;
}

function groupEventsByCategory(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  const sorted = [...events].sort((a, b) => a.startMinutes - b.startMinutes);

  for (const event of sorted) {
    const group = getCategoryGroup(event);
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(event);
  }

  const ordered = new Map<string, CalendarEvent[]>();
  for (const cat of CATEGORY_ORDER) {
    if (map.has(cat)) ordered.set(cat, map.get(cat)!);
  }
  const unknown = [...map.keys()]
    .filter(k => !CATEGORY_ORDER.includes(k))
    .sort();
  for (const cat of unknown) {
    ordered.set(cat, map.get(cat)!);
  }

  return ordered;
}

function groupEventsByDate(
  events: CalendarEvent[],
  dates: string[]
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const d of dates) map.set(d, []);

  for (const event of events) {
    if (map.has(event.date)) {
      map.get(event.date)!.push(event);
    } else {
      map.set(event.date, [event]);
    }
  }

  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function formatDayHeader(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatWeekRange(dates: string[]): string {
  if (dates.length === 0) return '';
  const start = new Date(dates[0] + 'T00:00:00Z');
  const end   = new Date(dates[dates.length - 1] + 'T00:00:00Z');
  const startStr = start.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
  const endStr = end.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
  return `${startStr} – ${endStr}`;
}

// ── Event row ─────────────────────────────────────────────────────

function AgendaEventRow({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick?: () => void;
}) {
  const isProspect = event.status === 'prospect' || event.source === 'tripleseat_lead';
  const isUnassigned = event.courtMappingIds.length === 0;
  const courtLabel = event.courtMappingIds.length > 1
    ? `${event.courtMappingIds.length} courts`
    : event.courtNumber
    ? `Court ${event.courtNumber}`
    : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-lg transition-colors hover:bg-(--bg-tertiary) ${getEventClasses(event)} ${isProspect ? 'opacity-70' : ''}`}
      style={event.hasConflict ? { borderLeftColor: 'var(--color-error)' } : undefined}
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
              <Link
                href="/conflicts"
                onClick={e => e.stopPropagation()}
                title="View all conflicts"
                className="flex items-center gap-1 text-xs font-medium hover:underline cursor-pointer"
                style={{ color: 'var(--color-error)' }}
              >
                <AlertTriangle size={11} />
                Conflict
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {courtLabel ? (
              <span className="flex items-center gap-1 text-xs text-(--text-secondary)">
                <MapPin size={11} />
                {courtLabel}
              </span>
            ) : isUnassigned ? (
              <span className="flex items-center gap-1 text-xs italic text-(--text-muted)">
                <MapPin size={11} />
                Unassigned
              </span>
            ) : null}
            {event.memberName && (
              <span className="flex items-center gap-1 text-xs text-(--text-secondary)">
                <User size={11} />
                {event.memberName}
              </span>
            )}
            {event.instructorName && (
              <span className="flex items-center gap-1 text-xs text-(--text-secondary)">
                <User size={11} />
                {event.instructorName}
              </span>
            )}
            {event.guestCount ? (
              <span className="flex items-center gap-1 text-xs text-(--text-secondary)">
                <Users size={11} />
                {event.guestCount} guests
              </span>
            ) : null}
            {event.contactName && (
              <span className="flex items-center gap-1 text-xs text-(--text-secondary)">
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

// ── Category group ────────────────────────────────────────────────

function CategoryGroup({
  category,
  events,
  onEventClick,
}: {
  category: string;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}) {
  const style = CATEGORY_STYLE[category] ?? {
    dotColor: 'var(--text-muted)',
    labelColor: 'var(--text-muted)',
  };

  return (
    <div>
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
          ({events.length})
        </span>
      </div>
      <div className="space-y-1.5 ml-4">
        {events.map(event => (
          <AgendaEventRow
            key={event.id}
            event={event}
            onClick={() => onEventClick?.(event)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Day section (week mode only) ──────────────────────────────────

function DaySection({
  dateStr,
  events,
  onEventClick,
  isToday,
}: {
  dateStr: string;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  isToday?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(!isToday);
  const conflictCount = events.filter(e => e.hasConflict).length;
  const grouped = groupEventsByCategory(events);

  return (
    <div className="border border-(--border-light) rounded-lg overflow-hidden">

      {/* Day header — click to collapse */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 bg-(--bg-secondary) hover:bg-(--bg-tertiary) transition-colors"
      >
        <div className="flex items-center gap-3">
          {collapsed
            ? <ChevronRight size={14} className="text-(--text-muted)" />
            : <ChevronDown  size={14} className="text-(--text-muted)" />
          }
          <p className="text-sm font-semibold text-(--text-primary)">
            {formatDayHeader(dateStr)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-(--text-muted)">
            {events.length} events
          </span>
          {conflictCount > 0 && (
            <Link
              href="/conflicts"
              onClick={e => e.stopPropagation()}
              title="View all conflicts"
              className="flex items-center gap-1 text-xs font-medium hover:underline cursor-pointer"
              style={{ color: 'var(--color-error)' }}
            >
              <AlertTriangle size={11} />
              {conflictCount} {conflictCount === 1 ? 'conflict' : 'conflicts'}
            </Link>
          )}
        </div>
      </button>

      {/* Day content */}
      {!collapsed && (
        <div className="px-4 py-4 space-y-6">
          {events.length === 0 ? (
            <p className="text-sm text-(--text-muted) py-2 text-center">
              No events scheduled
            </p>
          ) : (
            Array.from(grouped.entries()).map(([category, categoryEvents]) => (
              <CategoryGroup
                key={category}
                category={category}
                events={categoryEvents}
                onEventClick={onEventClick}
              />
            ))
          )}
        </div>
      )}

    </div>
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
  events,
  onEventClick,
}: Omit<AgendaViewProps, 'courtMappings'> & { courtMappings: CourtMapping[] }) {
  const isWeekMode = dates.length > 1;

  // ── Week mode ─────────────────────────────────────────────────
  if (isWeekMode) {
    const byDate = groupEventsByDate(events, dates);
    const totalConflicts = events.filter(e => e.hasConflict).length;
    const todayEastern = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/New_York',
    });
    const activeCourtIds = new Set(events.flatMap(e => e.courtMappingIds));
    const unassignedCount = events.filter(e => e.courtMappingIds.length === 0).length;

    return (
      <div className="h-full overflow-y-auto px-6 py-4">

        {/* Week summary bar */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-(--border-light)">
          <p className="text-sm font-medium text-(--text-secondary)">
            {formatWeekRange(dates)}
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-(--text-muted)">
              {events.length} events
            </span>
            <span className="text-xs text-(--text-muted)">
              {activeCourtIds.size} courts active
            </span>
            {unassignedCount > 0 && (
              <span className="text-xs text-(--text-muted)">
                {unassignedCount} unassigned
              </span>
            )}
            {totalConflicts > 0 && (
              <Link
                href="/conflicts"
                title="View all conflicts"
                className="flex items-center gap-1 text-xs font-medium hover:underline cursor-pointer"
                style={{ color: 'var(--color-error)' }}
              >
                <AlertTriangle size={12} />
                {totalConflicts} conflicts
              </Link>
            )}
          </div>
        </div>

        {/* Day sections */}
        <div className="space-y-3 max-w-4xl">
          {Array.from(byDate.entries()).map(([dateStr, dayEvents]) => (
            <DaySection
              key={dateStr}
              dateStr={dateStr}
              events={dayEvents}
              onEventClick={onEventClick}
              isToday={dateStr === todayEastern}
            />
          ))}
        </div>

      </div>
    );
  }

  // ── Day / Agenda mode (original behavior) ─────────────────────
  if (events.length === 0) return <EmptyDay />;

  const grouped = groupEventsByCategory(events);
  const activeCourtIds = new Set(events.flatMap(e => e.courtMappingIds));
  const dateLabel = dates[0]
    ? new Date(dates[0] + 'T00:00:00Z').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';

  return (
    <div className="h-full overflow-y-auto px-6 py-4">

      {/* Day summary bar */}
      <div className="flex items-center justify-between mb-6 pb-3 border-b border-(--border-light)">
        <p className="text-sm font-medium text-(--text-secondary)">
          {dateLabel}
        </p>
        <div className="flex items-center gap-4">
          <span className="text-xs text-(--text-muted)">
            {events.length} events
          </span>
          <span className="text-xs text-(--text-muted)">
            {activeCourtIds.size} courts active
          </span>
          {events.some(e => e.hasConflict) && (
            <Link
              href="/conflicts"
              title="View all conflicts"
              className="flex items-center gap-1 text-xs font-medium hover:underline cursor-pointer"
              style={{ color: 'var(--color-error)' }}
            >
              <AlertTriangle size={12} />
              {events.filter(e => e.hasConflict).length} conflicts
            </Link>
          )}
        </div>
      </div>

      {/* Category groups */}
      <div className="space-y-6 max-w-4xl">
        {Array.from(grouped.entries()).map(([category, categoryEvents]) => (
          <CategoryGroup
            key={category}
            category={category}
            events={categoryEvents}
            onEventClick={onEventClick}
          />
        ))}
      </div>

    </div>
  );
}