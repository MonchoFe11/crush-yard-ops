'use client';

// components/calendar/CalendarShell.tsx
// Client Component — owns calendar state and navigation.
// Initial data arrives as props from the Server Component (zero HTTP on first load).
// Subsequent navigation fetches from /api/calendar.

import { EventSlideOver } from '@/components/calendar/EventSlideOver';
import { AgendaView } from '@/components/calendar/AgendaView';
import { ResourceCalendar } from '@/components/calendar/ResourceCalendar';
import { useState, useCallback, useTransition, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, LayoutList, CalendarDays, RefreshCw, Layers, Activity, Ticket } from 'lucide-react';
import type {
  CalendarEvent,
  CalendarViewMode,
  CourtMapping,
} from '@/lib/types/calendar';

// ── Types ─────────────────────────────────────────────────────────

type SourceFilter = 'all' | 'courts' | 'venue';

interface CalendarShellProps {
  initialDate: string;
  initialCourtMappings: CourtMapping[];
  initialEvents: CalendarEvent[];
  initialDates: string[];
}

// ── Source filter config ──────────────────────────────────────────

interface SourceFilterConfig {
  value: SourceFilter;
  label: string;
  icon: React.ElementType;
  title: string;
  sources: CalendarEvent['source'][];
}

const SOURCE_FILTERS: SourceFilterConfig[] = [
  {
    value: 'all',
    label: 'Command Center',
    icon: Layers,
    title: 'Show all sources',
    sources: ['courtreserve', 'courtreserve_event', 'tripleseat_event', 'tripleseat_lead'],
  },
  {
    value: 'courts',
    label: 'Courts & Ops',
    icon: Activity,
    title: 'CourtReserve data only',
    sources: ['courtreserve', 'courtreserve_event'],
  },
  {
    value: 'venue',
    label: 'Venue Events',
    icon: Ticket,
    title: 'Tripleseat data only',
    sources: ['tripleseat_event', 'tripleseat_lead'],
  },
];

// ── Helpers ───────────────────────────────────────────────────────

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
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  // Close slide-over when source filter changes to prevent ghost panel
  useEffect(() => {
    setSelectedEvent(null);
  }, [sourceFilter]);

  const filteredEvents = useMemo(() => {
    if (sourceFilter === 'all') return events;
    const config = SOURCE_FILTERS.find(f => f.value === sourceFilter);
    if (!config) return events;
    return events.filter(e => config.sources.includes(e.source));
  }, [events, sourceFilter]);

  const fetchCalendarData = useCallback(async (date: string, mode: CalendarViewMode) => {
    try {
      const res = await fetch(`/api/calendar?date=${date}&mode=${mode}&location=ORL`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

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

      {/* ── Toolbar: 3-zone layout ── */}
      <div className="flex items-center px-6 py-3 border-b border-(--border-light) shrink-0">

        {/* Zone 1 — Left: navigation + date */}
        <div className="flex items-center gap-2 flex-1">
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

          <button
            onClick={() => fetchCalendarData(currentDate, viewMode)}
            disabled={isPending}
            title="Refresh calendar data"
            className="p-1.5 rounded hover:bg-(--bg-secondary) text-(--text-secondary) hover:text-(--text-primary) transition-colors disabled:opacity-40"
            aria-label="Refresh"
          >
            <RefreshCw size={15} className={isPending ? 'animate-spin' : ''} />
          </button>

          <h2 className="ml-1 text-base font-semibold text-(--text-primary) whitespace-nowrap">
            {formatDateLabel(dates, viewMode)}
          </h2>

          {isPending && (
            <div className="w-4 h-4 border-2 border-(--text-secondary) border-t-transparent rounded-full animate-spin ml-1" />
          )}
        </div>

        {/* Zone 2 — Center: source filter */}
        <div className="flex items-center gap-1 bg-(--bg-secondary) rounded-lg p-1">
          {SOURCE_FILTERS.map(({ value, label, icon: Icon, title }) => (
            <button
              key={value}
              onClick={() => setSourceFilter(value)}
              title={title}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                sourceFilter === value
                  ? 'bg-(--bg-primary) text-(--text-primary) shadow-sm border border-(--color-secondary)'
                  : 'text-(--text-secondary) hover:text-(--text-primary)'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Zone 3 — Right: view mode toggles */}
        <div className="flex items-center gap-1 bg-(--bg-secondary) rounded-lg p-1 flex-1 justify-end">
          <button
            onClick={() => handleViewMode('day')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              viewMode === 'day'
                ? 'bg-(--bg-primary) text-(--text-primary) shadow-sm border border-(--color-secondary)'
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
                ? 'bg-(--bg-primary) text-(--text-primary) shadow-sm border border-(--color-secondary)'
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
                ? 'bg-(--bg-primary) text-(--text-primary) shadow-sm border border-(--color-secondary)'
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
        {viewMode === 'day' ? (
          <ResourceCalendar
            dates={dates}
            courtMappings={courtMappings}
            events={filteredEvents}
            onEventClick={(event) => setSelectedEvent(event)}
          />
        ) : (
          <AgendaView
            dates={dates}
            courtMappings={courtMappings}
            events={filteredEvents}
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