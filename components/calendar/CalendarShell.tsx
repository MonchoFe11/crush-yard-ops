'use client';

// components/calendar/CalendarShell.tsx
// Client Component — owns calendar state and navigation.
// Initial data arrives as props from the Server Component (zero HTTP on first load).
// Subsequent navigation fetches from /api/calendar.

import { EventSlideOver } from '@/components/calendar/EventSlideOver';
import { AgendaView } from '@/components/calendar/AgendaView';
import { ResourceCalendar } from '@/components/calendar/ResourceCalendar';
import { useState, useCallback, useTransition } from 'react';
import { ChevronLeft, ChevronRight, Calendar, LayoutList, CalendarDays } from 'lucide-react';
import type {
  CalendarEvent,
  CalendarViewMode,
  CourtMapping,
} from '@/lib/types/calendar';

// ── Types ─────────────────────────────────────────────────────────

interface CalendarShellProps {
  initialDate: string;
  initialCourtMappings: CourtMapping[];
  initialEvents: CalendarEvent[];
  initialDates: string[];
}

// ── Helpers ───────────────────────────────────────────────────────

// Derives label from the dates array returned by the API.
// This ensures the header always matches the grid exactly,
// since the API normalizes weeks to Monday.
function formatDateLabel(dates: string[], mode: CalendarViewMode): string {
  if (dates.length === 0) return '';

  if (mode === 'week' && dates.length > 1) {
    const start = new Date(dates[0] + 'T00:00:00Z');
    const end = new Date(dates[dates.length - 1] + 'T00:00:00Z');
    return `${start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })} - ${end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })}`;
  }

  const d = new Date(dates[0] + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function navigateDate(date: string, mode: CalendarViewMode, direction: 1 | -1): string {
  const d = new Date(date + 'T00:00:00Z');
  const delta = mode === 'week' ? 7 : 1;
  d.setUTCDate(d.getUTCDate() + delta * direction);
  return d.toISOString().split('T')[0];
}

// ── Component ─────────────────────────────────────────────────────

export function CalendarShell({
  initialDate,
  initialCourtMappings,
  initialEvents,
  initialDates,
}: CalendarShellProps) {
  const [currentDate, setCurrentDate] = useState(initialDate);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('day');
  const [courtMappings, setCourtMappings] = useState<CourtMapping[]>(initialCourtMappings);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [dates, setDates] = useState<string[]>(initialDates);
  const [isPending, startTransition] = useTransition();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const fetchCalendarData = useCallback(async (date: string, mode: CalendarViewMode) => {
    try {
      const res = await fetch(
        `/api/calendar?date=${date}&mode=${mode}&location=ORL`
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      // startTransition wraps only state updates — fetch runs normally above
      startTransition(() => {
        setCourtMappings(data.courtMappings);
        setEvents(data.events);
        setDates(data.dates);
      });
    } catch (err) {
      console.error('[CalendarShell] fetch error:', err);
    }
  }, []);

  const handleNavigate = useCallback((direction: 1 | -1) => {
    const newDate = navigateDate(currentDate, viewMode, direction);
    setCurrentDate(newDate);
    fetchCalendarData(newDate, viewMode);
  }, [currentDate, viewMode, fetchCalendarData]);

  const handleToday = useCallback(() => {
    const todayEastern = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/New_York',
    });
    setCurrentDate(todayEastern);
    fetchCalendarData(todayEastern, viewMode);
  }, [viewMode, fetchCalendarData]);

  const handleViewMode = useCallback((mode: CalendarViewMode) => {
    setViewMode(mode);
    fetchCalendarData(currentDate, mode);
  }, [currentDate, fetchCalendarData]);

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-(--border-light) shrink-0">

        {/* Left: navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleNavigate(-1)}
            disabled={isPending}
            className="p-1.5 rounded hover:bg-(--bg-secondary) text-(--text-secondary) hover:text-(--text-primary) transition-colors disabled:opacity-40"
            aria-label="Previous"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            onClick={() => handleNavigate(1)}
            disabled={isPending}
            className="p-1.5 rounded hover:bg-(--bg-secondary) text-(--text-secondary) hover:text-(--text-primary) transition-colors disabled:opacity-40"
            aria-label="Next"
          >
            <ChevronRight size={18} />
          </button>

          <button
            onClick={handleToday}
            disabled={isPending}
            className="px-3 py-1.5 text-sm rounded hover:bg-(--bg-secondary) text-(--text-secondary) hover:text-(--text-primary) transition-colors disabled:opacity-40"
          >
            Today
          </button>

          <h2 className="ml-2 text-base font-semibold text-(--text-primary)">
            {formatDateLabel(dates, viewMode)}
          </h2>

          {isPending && (
            <div className="w-4 h-4 border-2 border-(--text-secondary) border-t-transparent rounded-full animate-spin ml-2" />
          )}
        </div>

        {/* Right: view mode toggles */}
        <div className="flex items-center gap-1 bg-(--bg-secondary) rounded-lg p-1">
          <button
            onClick={() => handleViewMode('day')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              viewMode === 'day'
                ? 'bg-(--bg-primary) text-(--text-primary) shadow-sm border border-(--border-light)'
                : 'text-(--text-secondary) hover:text-(--text-primary)'
            }`}
          >
            <Calendar size={14} />
            Day
          </button>
          <button
            onClick={() => handleViewMode('week')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              viewMode === 'week'
                ? 'bg-(--bg-primary) text-(--text-primary) shadow-sm border border-(--border-light)'
                : 'text-(--text-secondary) hover:text-(--text-primary)'
            }`}
          >
            <CalendarDays size={14} />
            Week
          </button>
          <button
            onClick={() => handleViewMode('agenda')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              viewMode === 'agenda'
                ? 'bg-(--bg-primary) text-(--text-primary) shadow-sm border border-(--border-light)'
                : 'text-(--text-secondary) hover:text-(--text-primary)'
            }`}
          >
            <LayoutList size={14} />
            Agenda
          </button>
        </div>
      </div>

      {/* ── Calendar body ── */}
      <div className={`flex-1 min-h-0 overflow-hidden transition-opacity duration-150 ${isPending ? 'opacity-50' : 'opacity-100'}`}>
        {viewMode === 'agenda' ? (
          <AgendaView
            dates={dates}
            courtMappings={courtMappings}
            events={events}
            onEventClick={(event) => setSelectedEvent(event)}
          />
        ) : (
          <ResourceCalendar
            dates={dates}
            courtMappings={courtMappings}
            events={events}
            onEventClick={(event) => setSelectedEvent(event)}
          />
        )}
      </div>
      <EventSlideOver
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />

    </div>
  );
}