// app/(dashboard)/calendar/page.tsx
// Server Component — fetches today's calendar data directly from Supabase.
// Passes normalized data to <CalendarShell> (client component) as props.
// Subsequent day/week navigation is handled client-side via /api/calendar.

import { createAdminClient } from '@/lib/supabase/server';
import { buildCalendarEvents } from '@/lib/utils/calendar-transforms';
import { CalendarShell } from '@/components/calendar/CalendarShell';
import type {
  CalendarEvent,
  CalendarFilters,
  CourtMapping,
  CRReservation,
  CREvent,
  TSEvent,
  TSLead,
} from '@/lib/types/calendar';

// ── Location config ───────────────────────────────────────────────

const ORLANDO_UUID = 'ff344bbf-3e47-43b8-b3f7-49d38583970d';

// ── Server-side data fetch ────────────────────────────────────────

async function getInitialCalendarData(date: string): Promise<{
  courtMappings: CourtMapping[];
  events: CalendarEvent[];
  dates: string[];
} | null> {
  try {
    const supabase = createAdminClient();

    const [courtMappingsResult, crResult, crEventsResult, tsEventsResult, tsLeadsResult] =
      await Promise.all([
        supabase
          .from('court_mappings')
          .select('id, location_id, court_number, court_name, courtreserve_court_id, tripleseat_room_id, is_active')
          .eq('location_id', ORLANDO_UUID)
          .eq('is_active', true)
          .order('court_number'),

        supabase
          .from('cr_reservations')
          .select('id, location_id, courtreserve_reservation_id, court_id, court_mapping_id, category, title, reservation_date, start_time, end_time, member_name, member_email, instructor_name, status')
          .eq('location_id', ORLANDO_UUID)
          .gte('reservation_date', date)
          .lte('reservation_date', date),

        supabase
          .from('cr_events')
          .select('id, location_id, courtreserve_event_id, courtreserve_reservation_id, event_name, event_category_id, event_category_name, start_datetime, end_datetime, court_ids, court_mapping_ids, max_registrants, registered_count, waitlist_count, is_canceled, is_public, public_event_url')
          .eq('location_id', ORLANDO_UUID)
          .gte('start_datetime', `${date}T00:00:00`)
          .lte('start_datetime', `${date}T23:59:59`)
          .eq('is_canceled', false),

        supabase
          .from('ts_events')
          .select('id, location_id, tripleseat_event_id, event_name, event_type, status, contact_name, contact_email, event_date, event_start, event_end, guest_count, room_ids')
          .eq('location_id', ORLANDO_UUID)
          .gte('event_date', date)
          .lte('event_date', date),

        supabase
          .from('ts_leads')
          .select('id, location_id, tripleseat_lead_id, lead_name, lead_type, status, contact_name, desired_date, desired_start, desired_end, guest_count, room_ids')
          .eq('location_id', ORLANDO_UUID)
          .gte('desired_date', date)
          .lte('desired_date', date),
      ]);

      if (courtMappingsResult.error) {
        console.error('[calendar/page] court_mappings error:', courtMappingsResult.error.message);
        return null;
      }
      if (crResult.error) {
        console.error('[calendar/page] cr_reservations error:', crResult.error.message);
        return null;
      }
      if (crEventsResult.error) {
        console.error('[calendar/page] cr_events error:', crEventsResult.error.message);
        return null;
      }
      if (tsEventsResult.error) {
        console.error('[calendar/page] ts_events error:', tsEventsResult.error.message);
        return null;
      }
      if (tsLeadsResult.error) {
        console.error('[calendar/page] ts_leads error:', tsLeadsResult.error.message);
        return null;
      }
  
      const courtMappings = courtMappingsResult.data as CourtMapping[];
      const crReservations = crResult.data as CRReservation[];
      const crEventRows = crEventsResult.data as CREvent[];
      const tsEvents = tsEventsResult.data as TSEvent[];
      const tsLeads = tsLeadsResult.data as TSLead[];
  
      const filters: CalendarFilters = {
        sources: ['courtreserve', 'courtreserve_event', 'tripleseat_event', 'tripleseat_lead'],
        statuses: ['confirmed', 'tentative', 'prospect'],
        courtIds: [],
      };
  
      const events = buildCalendarEvents(
        crReservations,
        crEventRows,
        tsEvents,
        tsLeads,
        courtMappings,
        filters
      );

    return { courtMappings, events, dates: [date] };
  } catch (err) {
    console.error('[calendar/page] unexpected error:', err);
    return null;
  }
}

// ── Page ──────────────────────────────────────────────────────────

export default async function CalendarPage() {
  // Evaluate today in Eastern time — Vercel runs UTC, this forces Orlando's date
  const todayEastern = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  });

  const initialData = await getInitialCalendarData(todayEastern);

  return (
    <div className="flex flex-col h-full min-h-0 bg-(--bg-primary)">
      <CalendarShell
        initialDate={todayEastern}
        initialCourtMappings={initialData?.courtMappings ?? []}
        initialEvents={initialData?.events ?? []}
        initialDates={initialData?.dates ?? [todayEastern]}
      />
    </div>
  );
}