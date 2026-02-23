'use client';

// components/calendar/EventSlideOver.tsx
// Slide-over panel triggered when staff clicks an event block.
// Uses slide-over-enter animation and panel-open scroll lock from globals.css.

import { useEffect } from 'react';
import { X, Clock, User, Users, MapPin, Tag, AlertTriangle, CalendarDays } from 'lucide-react';
import type { CalendarEvent } from '@/lib/types/calendar';
import { formatDuration } from '@/lib/utils/format';

// ── Types ─────────────────────────────────────────────────────────

interface EventSlideOverProps {
  event: CalendarEvent | null;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function sourceLabel(event: CalendarEvent): string {
  switch (event.source) {
    case 'courtreserve':       return 'CourtReserve';
    case 'courtreserve_event': return 'CourtReserve Event';
    case 'tripleseat_event':   return 'Event';
    case 'tripleseat_lead':    return 'Lead';
  }
}

function statusLabel(event: CalendarEvent): string {
  switch (event.status) {
    case 'confirmed': return 'Confirmed';
    case 'tentative': return 'Tentative';
    case 'prospect':  return 'Prospect';
    case 'cancelled': return 'Cancelled';
  }
}

// Uses badge classes defined in globals.css
function statusBadgeClass(event: CalendarEvent): string {
  switch (event.status) {
    case 'confirmed': return 'badge-definite';
    case 'tentative': return 'badge-tentative';
    case 'prospect':  return 'badge-prospect';
    case 'cancelled': return 'badge-prospect opacity-50';
  }
}

// ── Detail row ────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-(--border-light)">
      <div className="mt-0.5 text-(--text-muted) shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-(--text-muted) uppercase tracking-wider mb-0.5">
          {label}
        </p>
        <p className="text-sm text-(--text-primary) wrap-break-word">{value}</p>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────

export function EventSlideOver({ event, onClose }: EventSlideOverProps) {
  // Close on Escape key
  useEffect(() => {
    if (!event) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [event, onClose]);

  // Lock body scroll when panel is open
  useEffect(() => {
    if (event) {
      document.body.classList.add('panel-open');
    } else {
      document.body.classList.remove('panel-open');
    }
    return () => document.body.classList.remove('panel-open');
  }, [event]);

  if (!event) return null;

  const courtLabel = event.courtNumber
    ? `Court ${event.courtNumber}`
    : event.courtMappingIds.length > 1
    ? `${event.courtMappingIds.length} courts`
    : 'Unassigned';

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Panel ── */}
      <div
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-(--bg-secondary)
          border-l border-(--border-medium) z-50 flex flex-col shadow-2xl slide-over-enter"
        role="dialog"
        aria-modal="true"
        aria-label="Event details"
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-(--border-light) shrink-0 bg-(--bg-primary)">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={statusBadgeClass(event)}>
                {statusLabel(event)}
              </span>
              <span className="text-xs text-(--text-muted) font-medium">
                {sourceLabel(event)}
              </span>
              {event.hasConflict && (
                <span className="flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded border"
                  style={{
                    color: 'var(--color-error)',
                    borderColor: 'var(--color-error)',
                    backgroundColor: 'rgba(176, 42, 32, 0.15)',
                  }}
                >
                  <AlertTriangle size={12} />
                  CONFLICT
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-(--text-primary) leading-tight">
              {event.title}
            </h2>
            {event.category && event.category !== event.title && (
              <p className="text-sm text-(--text-secondary) mt-1 font-medium">
                {event.category}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            autoFocus
            className="p-1.5 rounded-md hover:bg-(--bg-tertiary) text-(--text-muted)
              hover:text-(--text-primary) transition-colors shrink-0
              focus:outline-none focus:ring-2 focus:ring-(--border-medium)"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-2">

          <DetailRow
            icon={<Clock size={15} />}
            label="Time"
            value={`${event.startTime} – ${event.endTime} (${formatDuration(event.durationMinutes)})`}
          />

          <DetailRow
            icon={<CalendarDays size={15} />}
            label="Date"
            value={formatDate(event.date)}
          />

          <DetailRow
            icon={<MapPin size={15} />}
            label="Court"
            value={courtLabel}
          />

          <DetailRow
            icon={<User size={15} />}
            label="Member"
            value={event.memberName ?? undefined}
          />

          <DetailRow
            icon={<Tag size={15} />}
            label="Member Email"
            value={event.memberEmail ?? undefined}
          />

          <DetailRow
            icon={<User size={15} />}
            label="Instructor"
            value={event.instructorName ?? undefined}
          />

          <DetailRow
            icon={<User size={15} />}
            label="Contact"
            value={event.contactName ?? undefined}
          />

          <DetailRow
            icon={<Tag size={15} />}
            label="Contact Email"
            value={event.contactEmail ?? undefined}
          />

          <DetailRow
            icon={<Users size={15} />}
            label="Guest Count"
            value={event.guestCount ? `${event.guestCount} guests` : undefined}
          />

          <DetailRow
            icon={<Tag size={15} />}
            label="Event Type"
            value={event.eventType ?? undefined}
          />

        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-(--border-light) shrink-0 bg-(--bg-primary)">
          <p className="text-[10px] text-(--text-muted) font-mono truncate uppercase tracking-widest">
            {event.id}
          </p>
        </div>
      </div>
    </>
  );
}