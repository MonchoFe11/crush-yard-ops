// lib/utils/event-style.ts
// Semantic operational classifier for calendar events.
// Color = operational meaning, not vendor source.
// Classification priority (first match wins):
//   conflict → confirmed-event → prospect-event → maintenance → lesson → league → reservation → movable
// All visual rules live in globals.css — components stay clean.

import type { CalendarEvent } from '@/lib/types/calendar';

// ── Keyword lists ────────────────────────────────────────────────
// Tight by design — must not catch open play or drop-in categories.

const LESSON_KEYWORDS = ['lesson', 'clinic', 'drill', 'guided play', 'shot specific', 'introductory class'];

// 'dupr' and 'competition' removed — both appear in open play event names
const LEAGUE_KEYWORDS = ['league', 'round robin', 'tournament', 'interclub'];

const MAINTENANCE_KEYWORDS = ['maintenance', 'closed', 'repair', 'out of order', 'resurfacing', 'hold'];

// ── Detection helpers ────────────────────────────────────────────

function getHaystack(event: CalendarEvent): string {
  return [event.category, event.title]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isConfirmedEvent(event: CalendarEvent): boolean {
  if (event.source !== 'tripleseat_event') return false;
  return event.status === 'confirmed';
}

function isProspectEvent(event: CalendarEvent): boolean {
  if (event.source === 'tripleseat_lead') return true;
  if (event.source === 'tripleseat_event') {
    return event.status === 'prospect' || event.status === 'tentative';
  }
  return false;
}

function isMaintenanceEvent(event: CalendarEvent): boolean {
  return MAINTENANCE_KEYWORDS.some(kw => getHaystack(event).includes(kw));
}

function isLessonEvent(event: CalendarEvent): boolean {
  if (event.source !== 'courtreserve_event') return false;
  return LESSON_KEYWORDS.some(kw => getHaystack(event).includes(kw));
}

function isLeagueEvent(event: CalendarEvent): boolean {
  if (event.source !== 'courtreserve_event') return false;
  return LEAGUE_KEYWORDS.some(kw => getHaystack(event).includes(kw));
}

function isReservation(event: CalendarEvent): boolean {
  return event.source === 'courtreserve';
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Returns CSS class names for a CalendarEvent.
 * Used by ResourceCalendar, AgendaView, and EventsPipelinePanel.
 */
export function getEventClasses(event: CalendarEvent): string {
  const classes: string[] = ['event-block'];

  if (isConfirmedEvent(event)) {
    classes.push('confirmed-event');
  } else if (isProspectEvent(event)) {
    classes.push('prospect-event');
  } else if (isMaintenanceEvent(event)) {
    classes.push('maintenance');
  } else if (isLessonEvent(event)) {
    classes.push('lesson');
  } else if (isLeagueEvent(event)) {
    classes.push('league');
  } else if (isReservation(event)) {
    classes.push('reservation');
  } else {
    classes.push('movable');
  }

  if (event.hasConflict) classes.push('has-conflict');

  return classes.join(' ');
}

/**
 * Same as getEventClasses but adds 'absolute' for resource grid positioning.
 * ResourceCalendar only.
 */
export function getGridEventClasses(event: CalendarEvent): string {
  return `${getEventClasses(event)} absolute`;
}

/**
 * Returns true if the event should show a PRO badge.
 * Used by ResourceCalendar event block JSX.
 */
export function isProStaffedEvent(event: CalendarEvent): boolean {
  return isLessonEvent(event);
}