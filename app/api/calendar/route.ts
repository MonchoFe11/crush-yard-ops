// app/api/calendar/route.ts
// Route Handler: fetches calendar data from Supabase and returns
// normalized CalendarEvent objects ready for the grid to render.
//
// Query params:
//   date     — YYYY-MM-DD anchor date (required)
//   mode     — "day" | "week" | "agenda" (default: "day")
//   location — location code e.g. "ORL" | "NSH" (default: "ORL")
//
// Example: GET /api/calendar?date=2026-02-21&mode=day&location=ORL

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { buildCalendarEvents } from '@/lib/utils/calendar-transforms';
import type {
  CalendarFilters,
  CalendarViewMode,
  CourtMapping,
  CRReservation,
  TSEvent,
  TSLead,
} from '@/lib/types/calendar';

// ── Location registry ─────────────────────────────────────────────
// Add new venues here as they open. UUIDs from the locations table.

const LOCATION_UUIDS: Record<string, string> = {
  ORL: 'ff344bbf-3e47-43b8-b3f7-49d38583970d',
  // NSH: 'uuid-here-when-nashville-opens',
};

const DEFAULT_LOCATION = 'ORL';

// ── Date range helpers ────────────────────────────────────────────

function getVisibleDates(anchor: string, mode: CalendarViewMode): string[] {
  if (mode === 'day' || mode === 'agenda') return [anchor];

  const dates: string[] = [];

  // Force UTC to prevent Vercel server-timezone date shifting.
  // new Date('2026-02-21T00:00:00Z') is always Feb 21 regardless of region.
  const start = new Date(anchor + 'T00:00:00Z');

  // Week starts Monday
  const dow = start.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  start.setUTCDate(start.getUTCDate() + mondayOffset);

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  return dates;
}

// ── Route Handler ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const date = searchParams.get('date');
  const mode = (searchParams.get('mode') ?? 'day') as CalendarViewMode;
  const locationCode = (searchParams.get('location') ?? DEFAULT_LOCATION).toUpperCase();

  // Validate date param
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'Missing or invalid date param. Expected YYYY-MM-DD.' },
      { status: 400 }
    );
  }

  // Validate location param
  const locationUUID = LOCATION_UUIDS[locationCode];
  if (!locationUUID) {
    return NextResponse.json(
      { error: `Unknown location code: ${locationCode}. Valid codes: ${Object.keys(LOCATION_UUIDS).join(', ')}` },
      { status: 400 }
    );
  }

  const visibleDates = getVisibleDates(date, mode);
  const fromDate = visibleDates[0];
  const toDate = visibleDates[visibleDates.length - 1];

  const supabase = createAdminClient();

  // ── Parallel Supabase queries ─────────────────────────────────
  // All queries scoped to locationUUID — prevents data bleed across venues.

  const [courtMappingsResult, crResult, tsEventsResult, tsLeadsResult] =
    await Promise.all([
        supabase
        .from('court_mappings')
        .select('id, location_id, court_number, court_name, courtreserve_court_id, tripleseat_room_id, is_active')
        .eq('location_id', locationUUID)
        .eq('is_active', true)
        .order('court_number'),

      supabase
        .from('cr_reservations')
        .select('id, location_id, courtreserve_reservation_id, court_id, court_mapping_id, category, title, reservation_date, start_time, end_time, member_name, member_email, instructor_name, status')
        .eq('location_id', locationUUID)
        .gte('reservation_date', fromDate)
        .lte('reservation_date', toDate),

      supabase
        .from('ts_events')
        .select('id, location_id, tripleseat_event_id, event_name, event_type, status, contact_name, contact_email, event_date, event_start, event_end, guest_count, room_ids')
        .eq('location_id', locationUUID)
        .gte('event_date', fromDate)
        .lte('event_date', toDate),

      supabase
        .from('ts_leads')
        .select('id, location_id, tripleseat_lead_id, lead_name, lead_type, status, contact_name, desired_date, desired_start, desired_end, guest_count, room_ids')
        .eq('location_id', locationUUID)
        .gte('desired_date', fromDate)
        .lte('desired_date', toDate),
    ]);

  // ── Error handling ────────────────────────────────────────────

  if (courtMappingsResult.error) {
    console.error('[calendar/route] court_mappings error:', courtMappingsResult.error.message);
    return NextResponse.json({ error: 'Failed to load courts' }, { status: 500 });
  }
  if (crResult.error) {
    console.error('[calendar/route] cr_reservations error:', crResult.error.message);
    return NextResponse.json({ error: 'Failed to load CourtReserve data' }, { status: 500 });
  }
  if (tsEventsResult.error) {
    console.error('[calendar/route] ts_events error:', tsEventsResult.error.message);
    return NextResponse.json({ error: 'Failed to load Tripleseat events' }, { status: 500 });
  }
  if (tsLeadsResult.error) {
    console.error('[calendar/route] ts_leads error:', tsLeadsResult.error.message);
    return NextResponse.json({ error: 'Failed to load Tripleseat leads' }, { status: 500 });
  }

  // ── Build normalized events ───────────────────────────────────

  const courtMappings = courtMappingsResult.data as CourtMapping[];
  const crReservations = crResult.data as CRReservation[];
  const tsEvents = tsEventsResult.data as TSEvent[];
  const tsLeads = tsLeadsResult.data as TSLead[];

  const filters: CalendarFilters = {
    sources: ['courtreserve', 'tripleseat_event', 'tripleseat_lead'],
    statuses: ['confirmed', 'tentative', 'prospect'],
    courtIds: [],
  };

  const events = buildCalendarEvents(
    crReservations,
    tsEvents,
    tsLeads,
    courtMappings,
    filters
  );

  // ── Response ──────────────────────────────────────────────────

  return NextResponse.json({
    dates: visibleDates,
    courtMappings,
    events,
    meta: {
      location: locationCode,
      fromDate,
      toDate,
      mode,
      counts: {
        courts: courtMappings.length,
        crReservations: crReservations.length,
        tsEvents: tsEvents.length,
        tsLeads: tsLeads.length,
        eventsAfterTransform: events.length,
        conflicts: events.filter(e => e.hasConflict).length,
      },
    },
  });
}