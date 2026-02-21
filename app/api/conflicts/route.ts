// app/api/conflicts/route.ts
// Returns conflict groups — events sharing the same court at
// overlapping times — across a forward-looking date window.
// Reuses buildCalendarEvents pipeline for consistent conflict
// detection with the calendar grid.
//
// Query params:
//   days     — how many days forward to scan (default: 14, max: 60)
//   location — location code (default: ORL)
//
// Example: GET /api/conflicts?days=14&location=ORL

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { buildCalendarEvents } from '@/lib/utils/calendar-transforms';
import type {
  CalendarFilters,
  CourtMapping,
  CRReservation,
  TSEvent,
  TSLead,
} from '@/lib/types/calendar';

const LOCATION_UUIDS: Record<string, string> = {
  ORL: 'ff344bbf-3e47-43b8-b3f7-49d38583970d',
};

function minutesToAmPm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const days = Math.min(parseInt(searchParams.get('days') ?? '14', 10), 60);
  const locationCode = (searchParams.get('location') ?? 'ORL').toUpperCase();

  const locationUUID = LOCATION_UUIDS[locationCode];
  if (!locationUUID) {
    return NextResponse.json(
      { error: `Unknown location: ${locationCode}. Valid codes: ${Object.keys(LOCATION_UUIDS).join(', ')}` },
      { status: 400 }
    );
  }

  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  });
  const future = new Date(today + 'T00:00:00Z');
  future.setUTCDate(future.getUTCDate() + days);
  const toDate = future.toISOString().split('T')[0];

  const supabase = createAdminClient();

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
        .gte('reservation_date', today)
        .lte('reservation_date', toDate),

      supabase
        .from('ts_events')
        .select('id, location_id, tripleseat_event_id, event_name, event_type, status, contact_name, contact_email, event_date, event_start, event_end, guest_count, room_ids')
        .eq('location_id', locationUUID)
        .gte('event_date', today)
        .lte('event_date', toDate),

      supabase
        .from('ts_leads')
        .select('id, location_id, tripleseat_lead_id, lead_name, lead_type, status, contact_name, desired_date, desired_start, desired_end, guest_count, room_ids')
        .eq('location_id', locationUUID)
        .gte('desired_date', today)
        .lte('desired_date', toDate),
    ]);

  if (courtMappingsResult.error) {
    console.error('[conflicts/route] court_mappings error:', courtMappingsResult.error.message);
    return NextResponse.json({ error: 'Failed to load courts' }, { status: 500 });
  }
  if (crResult.error) {
    console.error('[conflicts/route] cr_reservations error:', crResult.error.message);
    return NextResponse.json({ error: 'Failed to load CourtReserve data' }, { status: 500 });
  }
  if (tsEventsResult.error) {
    console.error('[conflicts/route] ts_events error:', tsEventsResult.error.message);
    return NextResponse.json({ error: 'Failed to load Tripleseat events' }, { status: 500 });
  }
  if (tsLeadsResult.error) {
    console.error('[conflicts/route] ts_leads error:', tsLeadsResult.error.message);
    return NextResponse.json({ error: 'Failed to load Tripleseat leads' }, { status: 500 });
  }

  const filters: CalendarFilters = {
    sources: ['courtreserve', 'tripleseat_event', 'tripleseat_lead'],
    statuses: ['confirmed', 'tentative', 'prospect'],
    courtIds: [],
  };

  const allEvents = buildCalendarEvents(
    crResult.data as CRReservation[],
    tsEventsResult.data as TSEvent[],
    tsLeadsResult.data as TSLead[],
    courtMappingsResult.data as CourtMapping[],
    filters
  );

  const conflictingEvents = allEvents.filter(e => e.hasConflict);

  // Group by date + court for overlap clusters
  const grouped: Record<string, typeof conflictingEvents> = {};
  for (const event of conflictingEvents) {
    const key = `${event.date}::${event.courtMappingIds[0] ?? 'unknown'}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(event);
  }

  // Compute true overlap window per group (intersection, not union)
  const conflictGroups = Object.values(grouped).map(group => {
    const overlapStartMinutes = Math.max(...group.map(e => e.startMinutes));
    const overlapEndMinutes = Math.min(...group.map(e => e.endMinutes));
    return {
      events: group,
      overlapStart: minutesToAmPm(overlapStartMinutes),
      overlapEnd: minutesToAmPm(overlapEndMinutes),
      overlapMinutes: Math.max(0, overlapEndMinutes - overlapStartMinutes),
    };
  });

  return NextResponse.json({
    fromDate: today,
    toDate,
    totalConflicts: conflictingEvents.length,
    conflictGroups,
    courtMappings: courtMappingsResult.data,
    meta: {
      location: locationCode,
      scanWindowDays: days,
      generatedAt: new Date().toISOString(),
    },
  });
}