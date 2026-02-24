'use client';

// components/calendar/ResourceCalendar.tsx

import { getEventClasses, getGridEventClasses } from '@/lib/utils/event-style';
import { useMemo, useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import type { CalendarEvent, CourtMapping } from '@/lib/types/calendar';

const GRID_START = 6 * 60;
const GRID_END = 23 * 60;
const HOUR_HEIGHT = 64;
const TOTAL_HEIGHT = ((GRID_END - GRID_START) / 60) * HOUR_HEIGHT;
const TIME_COL_WIDTH = 56;

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

interface ResourceCalendarProps {
  dates: string[];
  courtMappings: CourtMapping[];
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

// ── Events Pipeline Panel ─────────────────────────────────────────

interface EventsPipelinePanelProps {
  events: CalendarEvent[];
  courtMappings: CourtMapping[];
  open: boolean;
  onToggle: () => void;
  onEventClick?: (event: CalendarEvent) => void;
}

function EventsPipelinePanel({
  events,
  courtMappings,
  open,
  onToggle,
  onEventClick,
}: EventsPipelinePanelProps) {
  const venueEvents = useMemo(() => {
    const filtered = events.filter(
      e => e.source === 'tripleseat_event' || e.source === 'tripleseat_lead'
    );
    return [...filtered].sort((a, b) => {
      if (a.hasConflict !== b.hasConflict) return a.hasConflict ? -1 : 1;
      return a.startMinutes - b.startMinutes;
    });
  }, [events]);

  if (venueEvents.length === 0) return null;

  const conflictCount = venueEvents.filter(e => e.hasConflict).length;

  function getCourtLabel(event: CalendarEvent): string {
    if (event.courtMappingIds.length === 0) return 'Off-Court';
    const numbers = event.courtMappingIds
      .map(id => courtMappings.find(m => m.id === id)?.court_number)
      .filter((n): n is number => n !== undefined)
      .sort((a, b) => a - b);
    return numbers.length > 0 ? `Courts ${numbers.join(', ')}` : 'Off-Court';
  }

  function getStatusLabel(event: CalendarEvent): string {
    switch (event.status) {
      case 'confirmed': return 'Confirmed';
      case 'tentative': return 'Tentative';
      case 'prospect':  return 'Prospect';
      case 'cancelled': return 'Cancelled';
    }
  }

  function getStatusClass(event: CalendarEvent): string {
    switch (event.status) {
      case 'confirmed': return 'text-(--color-secondary)';
      case 'tentative': return 'text-(--color-primary)';
      case 'prospect':  return 'text-(--text-muted)';
      case 'cancelled': return 'text-(--color-error)';
    }
  }

  return (
    <div className="shrink-0 border-b border-(--border-light) bg-(--bg-tertiary)">

      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-(--bg-primary)/40 transition-colors"
      >
        <span className="text-xs font-bold tracking-widest text-(--text-secondary) uppercase">
          Events Pipeline
        </span>

        <span className="text-xs text-(--text-muted) font-mono">
          · {venueEvents.length} event{venueEvents.length !== 1 ? 's' : ''}
        </span>

        {conflictCount > 0 && (
          <Link
            href="/conflicts"
            title="View all conflicts"
            onClick={e => e.stopPropagation()}
            className="text-xs font-semibold font-mono hover:underline cursor-pointer"
            style={{ color: 'var(--color-error)' }}
          >
            · {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
          </Link>
        )}

        <div
          className="ml-0.5 text-(--text-muted)"
          title="All bookings from your events platform for this day. Court assignments shown per card. Leads appear as prospects in the pipeline."
        >
          <Info size={11} />
        </div>

        <div className="ml-auto text-(--text-muted)">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>

      {/* Card strip */}
      {open && (
        <div className="flex flex-nowrap overflow-x-auto gap-2 px-3 pb-2">
          {venueEvents.map(event => {
            const courtLabel = getCourtLabel(event);
            const isOffCourt = courtLabel === 'Off-Court';

            return (
              <button
                key={event.id}
                onClick={() => onEventClick?.(event)}
                className={`${getEventClasses(event)} shrink-0 flex flex-col justify-between gap-1 px-2.5 py-2 rounded text-left min-w-[180px] max-w-[240px] relative`}
              >
                {event.hasConflict && (
                  <span
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--color-error)' }}
                  />
                )}

                <p className="event-title truncate pr-3 text-xs font-semibold leading-tight">
                  {event.title}
                </p>

                <p className="event-meta text-xs leading-tight">
                  {event.startTime}–{event.endTime}
                </p>

                {event.guestCount !== null && event.guestCount > 0 && (
                  <p className="event-meta text-xs leading-tight">
                    {event.guestCount} guests
                  </p>
                )}

                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`text-xs font-mono leading-tight ${getStatusClass(event)}`}>
                    {getStatusLabel(event)}
                  </span>
                  <span className="text-(--text-muted) text-xs">·</span>
                  <span
                    className={`text-xs leading-tight font-mono ${
                      isOffCourt
                        ? 'text-(--text-muted) italic'
                        : 'text-(--color-secondary)'
                    }`}
                  >
                    {courtLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
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
      {hourLines.map(h => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-(--border-light)/40 pointer-events-none"
          style={{ top: minutesToPx(h * 60) }}
        />
      ))}
      {hourLines.map(h => (
        <div
          key={`${h}-half`}
          className="absolute left-0 right-0 border-t border-(--border-light)/20 pointer-events-none"
          style={{ top: minutesToPx(h * 60 + 30) }}
        />
      ))}
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
            className={getGridEventClasses(event)}
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
  const [pipelineOpen, setPipelineOpen] = useState(true);

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

      {/* ── Events Pipeline Panel ── */}
      <EventsPipelinePanel
        events={events}
        courtMappings={courtMappings}
        open={pipelineOpen}
        onToggle={() => setPipelineOpen(prev => !prev)}
        onEventClick={onEventClick}
      />

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
          <TimeGutter />
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