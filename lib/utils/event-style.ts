// lib/utils/event-style.ts
// Centralized event CSS class resolver.
// Source → color stripe, Status → border style, Conflict → red accent.
// All visual rules defined in globals.css — components stay clean.

import type { CalendarEvent } from '@/lib/types/calendar';

/**
 * Returns CSS class names for a CalendarEvent.
 * Used by AgendaView for event row styling.
 */
export function getEventClasses(event: CalendarEvent): string {
  const classes: string[] = ['event-block'];

  if (event.source === 'tripleseat_lead') {
    classes.push('lead');
  } else if (event.source === 'tripleseat_event') {
    classes.push('tripleseat');
    if (event.status === 'tentative') classes.push('tentative');
    if (event.status === 'prospect')  classes.push('prospect');
  } else {
    // courtreserve
    classes.push('courtreserve');
    if (event.status === 'tentative') classes.push('tentative');
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