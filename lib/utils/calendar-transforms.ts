// lib/utils/calendar-transforms.ts
// Converts raw DB rows into normalized CalendarEvent objects.
// All functions are pure — no side effects, no external calls.
//
// TIMEZONE: CourtReserve times are already Eastern local.
// Tripleseat times are UTC and must be converted via toEasternHHMM().
// All CalendarEvent times are Eastern local "HH:MM" 24h.
//
// MIDNIGHT: Events spanning midnight are not supported in Week 1.
// durationMinutes assumes endMinutes > startMinutes.

import type {
  CalendarEvent,
  CalendarEventSource,
  CalendarEventStatus,
  CalendarFilters,
  CourtMapping,
  CRReservation,
  CREvent,
  TSEvent,
  TSLead,
} from '@/lib/types/calendar';
  
  // ── Timezone conversion ───────────────────────────────────────────
  
  /**
   * Converts a UTC ISO string to Eastern local "HH:MM" (24h).
   * Uses Intl.DateTimeFormat to avoid trailing-space quirks in toLocaleString.
   * Handles DST automatically — e.g. March 8 2026 clocks forward.
   */
  function toEasternHHMM(utcString: string): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(utcString));
  }
  
  /**
   * Converts a UTC ISO string to Eastern local date "YYYY-MM-DD".
   * en-CA locale forces YYYY-MM-DD format natively.
   */
  function toEasternDate(utcString: string): string {
    return new Date(utcString).toLocaleDateString('en-CA', {
      timeZone: 'America/New_York',
    });
  }
  
  // ── Time math ─────────────────────────────────────────────────────
  
  /**
   * Converts "HH:MM" to minutes from midnight.
   * Example: "13:30" -> 810
   */
  function toMinutes(timeStr: string): number {
    // Handle AM/PM format: "10:00 AM", "2:00 PM"
    const ampm = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (ampm) {
      let h = parseInt(ampm[1], 10);
      const m = parseInt(ampm[2], 10);
      const period = ampm[3].toUpperCase();
      if (period === 'AM' && h === 12) h = 0;
      if (period === 'PM' && h !== 12) h += 12;
      return h * 60 + m;
    }
    // Fallback: "HH:MM" 24h format
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }
  
  /**
   * Extracts "HH:MM" from a local datetime string.
   * Uses regex instead of slice to handle both "T" and space delimiters.
   * Example: "2026-02-21T13:00:00" -> "13:00"
   *          "2026-02-21 13:00:00" -> "13:00"
   */
  function localToHHMM(localString: string): string {
    // CourtReserve returns local Eastern strings like "2026-02-21T10:00:00"
    // Parse and format to AM/PM
    const match = localString.match(/(\d{2}):(\d{2})/);
    if (!match) return '12:00 AM';
    const h = parseInt(match[1], 10);
    const m = match[2];
    if (h === 0)  return `12:${m} AM`;
    if (h < 12)   return `${h}:${m} AM`;
    if (h === 12) return `12:${m} PM`;
    return `${h - 12}:${m} PM`;
  }
  
  // ── Status mapping ────────────────────────────────────────────────
  
  function mapCRStatus(raw: string | null): CalendarEventStatus {
    if (!raw) return 'confirmed';
    if (raw.toLowerCase().includes('cancel')) return 'cancelled';
    return 'confirmed';
  }
  
  function mapTSEventStatus(raw: string | null): CalendarEventStatus {
    switch (raw?.toUpperCase()) {
      case 'DEFINITE':  return 'confirmed';
      case 'TENTATIVE': return 'tentative';
      case 'PROSPECT':  return 'prospect';
      case 'CANCELLED':
      case 'LOST':      return 'cancelled';
      default:          return 'prospect';
    }
  }
  
  // ── Conflict detection ────────────────────────────────────────────
  
  /**
   * Marks events hasConflict = true when two confirmed/tentative events
   * on the same court overlap in time on the same date.
   *
   * Ghost leads (tripleseat_lead source or prospect status) are excluded —
   * they do not block time and should not trigger conflict warnings.
   *
   * Always run this on the FULL event set before applying UI filters.
   * Filtering first would erase real conflicts from the remaining events.
   */
  export function detectConflicts(events: CalendarEvent[]): CalendarEvent[] {
    const result = events.map(e => ({ ...e, hasConflict: false }));
  
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i];
        const b = result[j];
  
        if (a.date !== b.date) continue;
  
        // Ghost leads do not cause hard conflicts (Day 1 spec)
        if (a.source === 'tripleseat_lead' || b.source === 'tripleseat_lead') continue;
        if (a.status === 'prospect' || b.status === 'prospect') continue;
  
        const sharedCourt = a.courtMappingIds.some(id =>
          b.courtMappingIds.includes(id)
        );
        if (!sharedCourt) continue;
  
        const overlaps =
          a.startMinutes < b.endMinutes && a.endMinutes > b.startMinutes;
  
        if (overlaps) {
          result[i].hasConflict = true;
          result[j].hasConflict = true;
        }
      }
    }
  
    return result;
  }
  
  // ── CourtReserve transformer ──────────────────────────────────────
  
  export function transformCRReservation(
    r: CRReservation,
    courtMappings: CourtMapping[]
  ): CalendarEvent | null {
    if (!r.start_time || !r.end_time || !r.reservation_date) return null;
  
    const startTime = localToHHMM(r.start_time);
    const endTime = localToHHMM(r.end_time);
    const startMinutes = toMinutes(startTime);
    const endMinutes = toMinutes(endTime);
  
    // Guard: skip zero-length events to prevent broken grid blocks
    if (endMinutes <= startMinutes) return null;
  
    const mapping = r.court_mapping_id
      ? courtMappings.find(m => m.id === r.court_mapping_id)
      : null;
  
    const courtMappingIds = mapping ? [mapping.id] : [];
  
    return {
      id: `cr-${r.courtreserve_reservation_id}`,
      originalRecordId: r.id,
      source: 'courtreserve' as CalendarEventSource,
      courtMappingIds,
      courtNumber: mapping?.court_number ?? null,
      isMultiCourt: false,
      title: r.title ?? r.category ?? 'Reservation',
      category: r.category,
      status: mapCRStatus(r.status),
      hasConflict: false,
      date: r.reservation_date,
      startTime,
      endTime,
      startMinutes,
      endMinutes,
      durationMinutes: endMinutes - startMinutes,
      memberName: r.member_name,
      memberEmail: r.member_email,
      instructorName: r.instructor_name,
      guestCount: null,
      roomIds: [],
      contactName: null,
      contactEmail: null,
      eventType: null,
    };
  }

  // ── CourtReserve Event transformer (leagues, open play, clinics) ──

export function transformCREvent(
  e: CREvent,
  courtMappings: CourtMapping[]
): CalendarEvent | null {
  if (!e.start_datetime || !e.end_datetime) return null;
  if (e.is_canceled) return null;

  // start_datetime was stored from Eastern local strings with no TZ offset.
  // Postgres TIMESTAMPTZ appended +00:00 treating them as UTC — but the
  // actual clock values ARE Eastern local. Strip TZ suffix before parsing.
  const localStart = e.start_datetime.replace(/[+-]\d{2}:\d{2}$/, '').replace('Z', '');
  const localEnd   = e.end_datetime.replace(/[+-]\d{2}:\d{2}$/, '').replace('Z', '');

  const startTime    = localToHHMM(localStart);
  const endTime      = localToHHMM(localEnd);
  const startMinutes = toMinutes(startTime);
  const endMinutes   = toMinutes(endTime);

  if (endMinutes <= startMinutes) return null;

  const date = localStart.split('T')[0];

  // court_mapping_ids pre-computed in DB — resolve court numbers from mapping
  const courtMappingIds = e.court_mapping_ids ?? [];
  const firstMapping = courtMappingIds.length > 0
    ? courtMappings.find(m => m.id === courtMappingIds[0])
    : null;

  return {
    id: `cr-event-${e.courtreserve_event_id}-${localStart}`,
    originalRecordId: e.id,
    source: 'courtreserve_event' as CalendarEventSource,
    courtMappingIds,
    courtNumber: firstMapping?.court_number ?? null,
    isMultiCourt: courtMappingIds.length > 1,
    title: e.event_name ?? e.event_category_name ?? 'Event',
    category: e.event_category_name,
    status: 'confirmed',
    hasConflict: false,
    date,
    startTime,
    endTime,
    startMinutes,
    endMinutes,
    durationMinutes: endMinutes - startMinutes,
    memberName: null,
    memberEmail: null,
    instructorName: null,
    guestCount: e.registered_count,
    roomIds: [],
    contactName: null,
    contactEmail: null,
    eventType: e.event_category_name,
  };
}
  
  // ── Tripleseat Event transformer ──────────────────────────────────
  
  export function transformTSEvent(
    e: TSEvent,
    courtMappings: CourtMapping[]
  ): CalendarEvent | null {
    if (!e.event_start || !e.event_end) return null;
  
    const startTime = toEasternHHMM(e.event_start);
    const endTime = toEasternHHMM(e.event_end);
    const startMinutes = toMinutes(startTime);
    const endMinutes = toMinutes(endTime);
  
    // Guard: skip zero-length events
    if (endMinutes <= startMinutes) return null;
  
    const date = e.event_date ?? toEasternDate(e.event_start);
  
    const mappings = (e.room_ids ?? [])
      .map(roomId => courtMappings.find(m => m.tripleseat_room_id === roomId))
      .filter((m): m is CourtMapping => m !== undefined);
  
    const courtMappingIds = mappings.map(m => m.id);
  
    return {
      id: `ts-event-${e.tripleseat_event_id}`,
      originalRecordId: e.id,
      source: 'tripleseat_event' as CalendarEventSource,
      courtMappingIds,
      courtNumber: mappings.length === 1 ? mappings[0].court_number : null,
      isMultiCourt: courtMappingIds.length > 1,
      title: e.event_name ?? 'Event',
      category: e.event_type,
      status: mapTSEventStatus(e.status),
      hasConflict: false,
      date,
      startTime,
      endTime,
      startMinutes,
      endMinutes,
      durationMinutes: endMinutes - startMinutes,
      memberName: null,
      memberEmail: null,
      instructorName: null,
      guestCount: e.guest_count,
      roomIds: e.room_ids ?? [],
      contactName: e.contact_name,
      contactEmail: e.contact_email,
      eventType: e.event_type,
    };
  }
  
  // ── Tripleseat Lead transformer ───────────────────────────────────
  
  export function transformTSLead(
    l: TSLead,
    courtMappings: CourtMapping[]
  ): CalendarEvent | null {
    if (!l.desired_start || !l.desired_end) return null;
  
    const startTime = toEasternHHMM(l.desired_start);
    const endTime = toEasternHHMM(l.desired_end);
    const startMinutes = toMinutes(startTime);
    const endMinutes = toMinutes(endTime);
  
    // Guard: skip zero-length events
    if (endMinutes <= startMinutes) return null;
  
    const date = l.desired_date ?? toEasternDate(l.desired_start);
  
    const mappings = (l.room_ids ?? [])
      .map(roomId => courtMappings.find(m => m.tripleseat_room_id === roomId))
      .filter((m): m is CourtMapping => m !== undefined);
  
    const courtMappingIds = mappings.map(m => m.id);
  
    return {
      id: `ts-lead-${l.tripleseat_lead_id}`,
      originalRecordId: l.id,
      source: 'tripleseat_lead' as CalendarEventSource,
      courtMappingIds,
      courtNumber: mappings.length === 1 ? mappings[0].court_number : null,
      isMultiCourt: courtMappingIds.length > 1,
      title: l.lead_name ?? 'Lead Inquiry',
      category: l.lead_type,
      status: 'prospect',
      hasConflict: false,
      date,
      startTime,
      endTime,
      startMinutes,
      endMinutes,
      durationMinutes: endMinutes - startMinutes,
      memberName: null,
      memberEmail: null,
      instructorName: null,
      guestCount: l.guest_count,
      roomIds: l.room_ids ?? [],
      contactName: l.contact_name,
      contactEmail: null,
      eventType: l.lead_type,
    };
  }
  
  // ── Main transform entry point ────────────────────────────────────
  
  export function buildCalendarEvents(
    crReservations: CRReservation[],
    crEventRows: CREvent[],
    tsEvents: TSEvent[],
    tsLeads: TSLead[],
    courtMappings: CourtMapping[],
    filters?: CalendarFilters
  ): CalendarEvent[] {
    const crReservationEvents = crReservations
      .map(r => transformCRReservation(r, courtMappings))
      .filter((e): e is CalendarEvent => e !== null);
  
    const crProgramEvents = crEventRows
      .map(e => transformCREvent(e, courtMappings))
      .filter((e): e is CalendarEvent => e !== null);
  
    const tsEventsMapped = tsEvents
      .map(e => transformTSEvent(e, courtMappings))
      .filter((e): e is CalendarEvent => e !== null);
  
    const tsLeadsMapped = tsLeads
      .map(l => transformTSLead(l, courtMappings))
      .filter((e): e is CalendarEvent => e !== null);
  
    const all = [...crReservationEvents, ...crProgramEvents, ...tsEventsMapped, ...tsLeadsMapped];
  
    // Detect conflicts on full dataset BEFORE filtering.
    // Filtering first would erase real physical conflicts from remaining events.
    const withConflicts = detectConflicts(all);
  
    // Apply UI filters after conflict detection
    if (!filters) return withConflicts;
  
    return withConflicts.filter(e =>
      filters.sources.includes(e.source) &&
      filters.statuses.includes(e.status) &&
      (filters.courtIds.length === 0 ||
        e.courtMappingIds.some(id => filters.courtIds.includes(id)))
    );
  }