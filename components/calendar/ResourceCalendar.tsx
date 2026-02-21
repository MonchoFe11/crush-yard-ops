'use client';

// components/calendar/ResourceCalendar.tsx
// The 2D resource grid — courts as columns, time as rows.
// Events positioned with CSS absolute positioning using precomputed
// startMinutes/endMinutes from the transform layer.
//
// Grid constants:
//   GRID_START  = 6am  (360 min)
//   GRID_END    = 11pm (1380 min)
//   HOUR_HEIGHT = 64px

import { useMemo, useRef, useEffect, useState } from 'react';
import type { CalendarEvent, CourtMapping } from '@/lib/types/calendar';

// ── Grid constants ────────────────────────────────────────────────

const GRID_START = 6 * 60;
const GRID_END = 23 * 60;
const HOUR_HEIGHT = 64;
const TOTAL_HEIGHT = ((GRID_END - GRID_START) / 60) * HOUR_HEIGHT; // 1088px
const TIME_COL_WIDTH = 56;

// ── Helpers ───────────────────────────────────────────────────────

function minutesToPx(minutes: number): number {
  return ((minutes - GRID_START) / 60) * HOUR_HEIGHT;
}

function durationToPx(durationMinutes: number): number {
  return (durationMinutes / 60) * HOUR_HEIGHT;
}

function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

// Eastern-aware current time — all event data is Eastern,
// indicator must match regardless of user's device timezone
function getEasternTimeMinutes(): number {
  const easternStr = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [h, m] = easternStr.split(':').map(Number);
  return h * 60 + m;
}

// ── Event CSS classes (uses globals.css design system) ────────────

function getEventClasses(event: CalendarEvent): string {
  const classes = ['event-block', 'absolute'];

  if (event.source === 'tripleseat_lead') {
    classes.push('lead');
  } else if (event.source === 'tripleseat_event') {
    classes.push('tripleseat');
    if (event.status === 'tentative') classes.push('tentative');
  } else {
    // CourtReserve — differentiate lessons visually
    classes.push('courtreserve');
    if (
      event.category === 'Private Lesson' ||
      event.category === 'Beginner Session'
    ) {
      classes.push('lesson');
    }
  }

  if (event.hasConflict) classes.push('has-conflict');

  return classes.join(' ');
}

// ── Types ─────────────────────────────────────────────────────────

interface ResourceCalendarProps {
  dates: string[];
  courtMappings: CourtMapping[];
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

// ── Time gutter ───────────────────────────────────────────────────

function TimeGutter() {
  const hours: number[] = [];
  for (let h = GRID_START / 60; h <= GRID_END / 60; h++) {
    hours.push(h);
  }

  return (
    <div
      className="relative shrink-0 border-r border-(--border-light) bg-(--bg-primary) z-10"
      style={{ width: TIME_COL_WIDTH, height: TOTAL_HEIGHT }}
    >
      {hours.map(h => (
        <div
          key={h}
          className="absolute right-2 text-xs font-medium text-(--text-muted) -translate-y-1/2 select-none"
          style={{ top: minutesToPx(h * 60) }}
        >
          {formatHour(h)}
        </div>
      ))}
    </div>
  );
}

// ── Court column ──────────────────────────────────────────────────

interface CourtColumnProps {
  courtMapping: CourtMapping;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

function CourtColumn({ courtMapping, events, onEventClick }: CourtColumnProps) {
  // Filter + overlap positioning inside useMemo —
  // prevents dependency busting on every render
  const positioned = useMemo(() => {
    const courtEvents = events.filter(e =>
      e.courtMappingIds.includes(courtMapping.id)
    );
    const sorted = [...courtEvents].sort((a, b) => a.startMinutes - b.startMinutes);
    const columns: CalendarEvent[][] = [];

    for (const event of sorted) {
      let placed = false;
      for (const col of columns) {
        const last = col[col.length - 1];
        if (last.endMinutes <= event.startMinutes) {
          col.push(event);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([event]);
    }

    const totalCols = columns.length || 1;
    return sorted.map(event => {
      const colIndex = columns.findIndex(col => col.includes(event));
      return { event, colIndex, totalCols };
    });
  }, [events, courtMapping.id]);

  const hourLines: number[] = [];
  for (let h = GRID_START / 60; h < GRID_END / 60; h++) {
    hourLines.push(h);
  }

  return (
    <div
      className="relative border-r border-(--border-light) min-w-[140px] flex-1"
      style={{ height: TOTAL_HEIGHT }}
    >
      {/* Hour grid lines */}
      {hourLines.map(h => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-(--border-light)/40 pointer-events-none"
          style={{ top: minutesToPx(h * 60) }}
        />
      ))}

      {/* Half-hour lines */}
      {hourLines.map(h => (
        <div
          key={`${h}-half`}
          className="absolute left-0 right-0 border-t border-(--border-light)/20 pointer-events-none"
          style={{ top: minutesToPx(h * 60 + 30) }}
        />
      ))}

      {/* Event blocks */}
      {positioned.map(({ event, colIndex, totalCols }) => {
        const top = minutesToPx(event.startMinutes);
        const height = Math.max(durationToPx(event.durationMinutes), 20);
        const widthPct = 100 / totalCols;
        const leftPct = colIndex * widthPct;
        const shortEvent = event.durationMinutes <= 30;

        return (
          <button
            key={event.id}
            onClick={() => onEventClick?.(event)}
            className={getEventClasses(event)}
            style={{
              top: top + 1,
              height: height - 2,
              left: `calc(${leftPct}% + 2px)`,
              width: `calc(${widthPct}% - 4px)`,
              zIndex: event.hasConflict ? 20 : 10,
            }}
            title={`${event.title} · ${event.startTime}–${event.endTime}`}
          >
            {shortEvent ? (
              <p className="event-title truncate">
                {event.startTime} {event.title}
              </p>
            ) : (
              <>
                <p className="event-title truncate">{event.title}</p>
                <p className="event-meta truncate">
                  {event.startTime}–{event.endTime}
                </p>
                {event.memberName && (
                  <p className="event-meta truncate mt-0.5">
                    {event.memberName}
                  </p>
                )}
                {event.instructorName && (
                  <p className="event-meta truncate">
                    ↳ {event.instructorName}
                  </p>
                )}
                {event.guestCount ? (
                  <p className="event-meta truncate">
                    {event.guestCount} guests
                  </p>
                ) : null}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Current time indicator ────────────────────────────────────────
// Uses Eastern time to match event data regardless of device timezone.
// Updates every 60 seconds via setInterval.
// Hydration-safe: null on server, real value after mount.

function CurrentTimeIndicator() {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setMinutes(getEasternTimeMinutes());
    const init = setTimeout(tick, 0);
    const interval = setInterval(tick, 60_000);
    return () => {
      clearTimeout(init);
      clearInterval(interval);
    };
  }, []);

  if (minutes === null || minutes < GRID_START || minutes > GRID_END) return null;

  return (
    <div
      className="absolute left-0 right-0 z-30 pointer-events-none"
      style={{ top: minutesToPx(minutes) }}
    >
      <div className="flex items-center">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0 -ml-[5px]"
          style={{ backgroundColor: 'var(--color-error)' }}
        />
        <div
          className="flex-1 h-[2px]"
          style={{
            backgroundColor: 'var(--color-error)',
            boxShadow: '0 0 8px var(--color-error)',
          }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export function ResourceCalendar({
  dates,
  courtMappings,
  events,
  onEventClick,
}: ResourceCalendarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to 2 hours before current time on mount + date change
  useEffect(() => {
    if (!scrollRef.current) return;
    const minutes = getEasternTimeMinutes();
    const target =
      minutes >= GRID_START && minutes <= GRID_END
        ? minutesToPx(minutes) - 120
        : minutesToPx(8 * 60);
    scrollRef.current.scrollTop = Math.max(0, target);
  }, [dates]);

  if (courtMappings.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-(--text-muted) text-sm">
        No courts found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-(--bg-primary)">

      {/* ── Court header row ── */}
      <div
        className="flex shrink-0 border-b border-(--border-light) bg-(--bg-secondary) z-20"
        style={{ paddingLeft: TIME_COL_WIDTH }}
      >
        {courtMappings.map(court => (
          <div
            key={court.id}
            className="flex-1 min-w-[140px] px-2 py-2.5 text-center border-r border-(--border-light)"
          >
            <p className="text-xs font-bold text-(--text-primary) tracking-wide truncate uppercase">
              {court.court_name}
            </p>
            <p className="text-xs text-(--text-muted) mt-0.5 font-mono">
              {events.filter(e => e.courtMappingIds.includes(court.id)).length} events
            </p>
          </div>
        ))}
      </div>

      {/* ── Scrollable grid body ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-auto min-h-0"
      >
        <div
          className="flex"
          style={{ height: TOTAL_HEIGHT, minWidth: 'max-content' }}
        >
          {/* Time gutter */}
          <TimeGutter />

          {/* Court columns with current time overlay */}
          <div className="relative flex flex-1 min-w-0">
            <CurrentTimeIndicator />
            {courtMappings.map(court => (
              <CourtColumn
                key={court.id}
                courtMapping={court}
                events={events}
                onEventClick={onEventClick}
              />
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}