// app/api/cron/sync/route.ts
// Automated data sync — triggered by Vercel Cron every 30 minutes.
// Also callable manually for debugging.
//
// Security: validates Authorization header against CRON_SECRET env var.
// Timeout: maxDuration = 300 (5 min) required — full sync takes 30-60s
// with pagination delays. Default 15s Vercel limit would kill it mid-run.
//
// TIMEZONE RULE: toISOEastern() used for all date-only API params.
// CourtReserve Events endpoint uses toISOString() (UTC) — correct for timestamps.

import { createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CR_ORG_ID = 13523;
const TS_LOCATION_ID = 27268;
const ORLANDO_UUID = 'ff344bbf-3e47-43b8-b3f7-49d38583970d';

// ── Date helpers ─────────────────────────────────────────────────

// For display/logging only. Use toISOEastern() for all API date parameters.
function toISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Eastern-aware date string for API calls. Prevents off-by-one errors for Orlando facility.
// TODO: replace 'America/New_York' with dynamic facility.timezone when multi-location supported
function toISOEastern(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}


// Wraps fetch with a 30s timeout so a slow API response can't hang the entire sync.
async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

// ── Date window ──────────────────────────────────────────────────

function getDateWindow(): { from: Date; to: Date } {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 14);
    const to = new Date(now);
    to.setDate(to.getDate() + 45);
    return { from, to };
  }

// ── Sync log helper ──────────────────────────────────────────────

async function logSync(
  supabase: ReturnType<typeof createAdminClient>,
  source: string,
  operation: string,
  endpoint: string,
  records: number,
  status: string,
  error: string | null = null,
  duration: number | null = null
): Promise<void> {
  await supabase.from('sync_log').insert({
    source,
    operation,
    endpoint,
    records_affected: records,
    status,
    error_message: error,
    duration_ms: duration,
  });
}

// ── Court mappings ───────────────────────────────────────────────

type CourtMappingRow = {
  id: string;
  court_number: number;
  courtreserve_court_id: number | null;
  tripleseat_room_id: number | null;
};

async function getCourtMappings(
  supabase: ReturnType<typeof createAdminClient>
): Promise<CourtMappingRow[]> {
  const { data, error } = await supabase
    .from('court_mappings')
    .select('id, court_number, courtreserve_court_id, tripleseat_room_id');
  if (error) throw new Error('Could not load court_mappings: ' + error.message);
  return data as CourtMappingRow[];
}

function parseCourtNumber(courtsString: string | null): number | null {
  if (!courtsString) return null;
  const match = courtsString.match(/Court #(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// ── CourtReserve Reservations ────────────────────────────────────

async function pullCourtReserve(
  supabase: ReturnType<typeof createAdminClient>,
  courtMappings: CourtMappingRow[],
  from: Date,
  to: Date
): Promise<number> {
  const crAuth = Buffer.from(
    `${process.env.COURTRESERVE_USERNAME}:${process.env.COURTRESERVE_PASSWORD}`
  ).toString('base64');

  let totalInserted = 0;
  const start = Date.now();

  const chunks: { from: Date; to: Date }[] = [];
  const chunkStart = new Date(from);
  while (chunkStart < to) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + 31);
    if (chunkEnd > to) chunkEnd.setTime(to.getTime());
    chunks.push({ from: new Date(chunkStart), to: new Date(chunkEnd) });
    chunkStart.setDate(chunkStart.getDate() + 31);
  }

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      reservationsFromDate: toISOEastern(chunk.from),
      reservationsToDate: toISOEastern(chunk.to),
    });

    const url = `https://api.courtreserve.com/api/v1/reservationreport/listactive?${params}`;

    let res: Response;
    try {
        res = await fetchWithTimeout(url, {
            headers: {
              Authorization: `Basic ${crAuth}`,
              'X-Org-Id': String(CR_ORG_ID),
            },
          });
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'network error';
      await logSync(supabase, 'courtreserve', 'read', url, 0, 'error', msg);
      continue;
    }

    if (!res.ok) {
      await logSync(supabase, 'courtreserve', 'read', url, 0, 'error', `HTTP ${res.status}`);
      continue;
    }

    const json = await res.json() as { Data?: unknown[]; data?: unknown[] };
    const reservations = json.Data ?? json.data ?? [];
    if (!Array.isArray(reservations) || reservations.length === 0) continue;

    const rows = reservations.map((r) => {
      const raw = r as Record<string, unknown>;
      const courtNum = parseCourtNumber(raw.Courts as string | null);
      const mapping = courtNum
        ? courtMappings.find(m => m.court_number === courtNum)
        : null;

      const players = raw.Players as Array<Record<string, unknown>> | undefined;
      const primaryPlayer = players?.[0] ?? null;
      const memberName = primaryPlayer
        ? `${primaryPlayer.FirstName ?? ''} ${primaryPlayer.LastName ?? ''}`.trim()
        : null;

      return {
        location_id: ORLANDO_UUID,
        courtreserve_reservation_id: String(raw.Id),
        court_id: courtNum,
        court_mapping_id: mapping?.id ?? null,
        category: raw.ReservationTypeName ?? null,
        title: raw.ReservationTypeName ?? null,
        reservation_date: typeof raw.StartTime === 'string' ? raw.StartTime.split('T')[0] : null,
        start_time: raw.StartTime ?? null,
        end_time: raw.EndTime ?? null,
        member_name: memberName || null,
        member_email: (primaryPlayer?.Email as string) ?? null,
        instructor_name: raw.Instructors ?? null,
        status: raw.CancelledOn ? 'Cancelled' : 'Active',
        raw_json: raw,
        source_updated_at: raw.UpdatedOnUtc ?? null,
      };
    });

    const { error } = await supabase
      .from('cr_reservations')
      .upsert(rows, { onConflict: 'location_id,courtreserve_reservation_id' });

    if (!error) totalInserted += rows.length;

    await new Promise(r => setTimeout(r, 200));
  }

  const duration = Date.now() - start;
  await logSync(supabase, 'courtreserve', 'read', '/api/v1/reservationreport/listactive', totalInserted, 'success', null, duration);
  return totalInserted;
}

// ── CourtReserve Events ──────────────────────────────────────────

async function pullCourtReserveEvents(
  supabase: ReturnType<typeof createAdminClient>,
  courtMappings: CourtMappingRow[],
  from: Date,
  to: Date
): Promise<number> {
  const crAuth = Buffer.from(
    `${process.env.COURTRESERVE_USERNAME}:${process.env.COURTRESERVE_PASSWORD}`
  ).toString('base64');

  const crCourtIdToMapping: Record<string, CourtMappingRow> = {};
  for (const m of courtMappings) {
    if (m.courtreserve_court_id) {
      crCourtIdToMapping[String(m.courtreserve_court_id)] = m;
    }
  }

  let totalInserted = 0;
  const start = Date.now();

  const chunks: { from: Date; to: Date }[] = [];
  const chunkStart = new Date(from);
  while (chunkStart < to) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + 30);
    if (chunkEnd > to) chunkEnd.setTime(to.getTime());
    chunks.push({ from: new Date(chunkStart), to: new Date(chunkEnd) });
    chunkStart.setDate(chunkStart.getDate() + 30);
  }

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      startDate: chunk.from.toISOString(),
      endDate: chunk.to.toISOString(),
      status: 'Active',
    });

    const url = `https://api.courtreserve.com/api/v1/eventcalendar/eventlist?${params}`;

    let res: Response;
    try {
        res = await fetchWithTimeout(url, {
            headers: {
              Authorization: `Basic ${crAuth}`,
              'X-Org-Id': String(CR_ORG_ID),
            },
          });
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'network error';
      await logSync(supabase, 'courtreserve_events', 'read', url, 0, 'error', msg);
      continue;
    }

    if (!res.ok) {
      await logSync(supabase, 'courtreserve_events', 'read', url, 0, 'error', `HTTP ${res.status}`);
      continue;
    }

    const json = await res.json() as { Data?: unknown[] };
    const events = json.Data ?? [];
    if (!Array.isArray(events) || events.length === 0) continue;

    // Deduplicate recurring events within chunk
    const seen = new Set<string>();
    const dedupedEvents: unknown[] = [];
    for (const e of events) {
      const raw = e as Record<string, unknown>;
      const key = `${raw.EventId}__${raw.StartDateTime}`;
      if (!seen.has(key)) {
        seen.add(key);
        dedupedEvents.push(e);
      }
    }

    const rows = dedupedEvents.map((e) => {
      const raw = e as Record<string, unknown>;
      const courts = raw.Courts as Array<Record<string, unknown>> | undefined;
      const crCourtIds = (courts ?? []).map(c => c.Id as number);
      const courtMappingIds = crCourtIds
        .map(id => crCourtIdToMapping[String(id)]?.id)
        .filter(Boolean);

      return {
        location_id: ORLANDO_UUID,
        courtreserve_event_id: raw.EventId,
        courtreserve_reservation_id: raw.ReservationId ?? null,
        event_name: raw.EventName ?? null,
        event_category_id: raw.EventCategoryId ?? null,
        event_category_name: raw.EventCategoryName ?? null,
        start_datetime: raw.StartDateTime ?? null,
        end_datetime: raw.EndDateTime ?? null,
        court_ids: crCourtIds,
        court_mapping_ids: courtMappingIds,
        max_registrants: raw.MaxRegistrants ?? null,
        registered_count: raw.RegisteredCount ?? null,
        waitlist_count: raw.WaitlistCount ?? null,
        is_canceled: raw.IsCanceled ?? false,
        is_public: raw.IsPublicBookingAllowed ?? false,
        public_event_url: raw.PublicEventUrl ?? null,
        raw_json: raw,
        synced_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from('cr_events')
      .upsert(rows, { onConflict: 'location_id,courtreserve_event_id,start_datetime' });

    if (!error) totalInserted += rows.length;

    await new Promise(r => setTimeout(r, 200));
  }

  const duration = Date.now() - start;
  await logSync(supabase, 'courtreserve_events', 'read', '/api/v1/eventcalendar/eventlist', totalInserted, 'success', null, duration);
  return totalInserted;
}

// ── Tripleseat Events ────────────────────────────────────────────

async function pullTripleseatEvents(
  supabase: ReturnType<typeof createAdminClient>,
  from: Date,
  to: Date
): Promise<number> {
  let totalInserted = 0;
  let page = 1;
  const start = Date.now();

  while (true) {
    const url = `https://api.tripleseat.com/v1/events?location_id=${TS_LOCATION_ID}&start_date=${toISOEastern(from)}&end_date=${toISOEastern(to)}&page=${page}`;

    let res: Response;
    try {
        res = await fetchWithTimeout(url, {
            headers: { Authorization: `Bearer ${process.env.TRIPLESEAT_BEARER_TOKEN}` },
          });
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'network error';
      await logSync(supabase, 'tripleseat', 'read', url, 0, 'error', msg);
      break;
    }

    if (!res.ok) {
      await logSync(supabase, 'tripleseat', 'read', url, 0, 'error', `HTTP ${res.status}`);
      break;
    }

    const json = await res.json() as { results?: unknown[]; total_pages?: number };
    const events = json.results ?? [];
    if (!Array.isArray(events) || events.length === 0) break;

    const rows = events.map((e) => {
      const raw = e as Record<string, unknown>;
      const rooms = raw.rooms as Array<Record<string, unknown>> | undefined;
      const roomIds = (rooms ?? []).map(r => r.id as number);
      return {
        location_id: ORLANDO_UUID,
        tripleseat_event_id: String(raw.id),
        event_name: raw.name ?? null,
        event_type: raw.type ?? null,
        status: ((raw.status as string) ?? 'prospect').toLowerCase(),
        contact_name: raw.contact_name ?? null,
        contact_email: raw.contact_email ?? null,
        event_date: raw.start_date ?? null,
        event_start: raw.event_start_iso8601 ?? null,
        event_end: raw.event_end_iso8601 ?? null,
        guest_count: raw.guest_count ?? null,
        room_ids: roomIds,
        raw_json: raw,
      };
    });

    const { error } = await supabase
      .from('ts_events')
      .upsert(rows, { onConflict: 'location_id,tripleseat_event_id' });

    if (!error) totalInserted += rows.length;

    if (page >= (json.total_pages ?? 1)) break;
    page++;
    await new Promise(r => setTimeout(r, 200));
  }

  const duration = Date.now() - start;
  await logSync(supabase, 'tripleseat', 'read', '/v1/events', totalInserted, 'success', null, duration);
  return totalInserted;
}

// ── Tripleseat Leads ─────────────────────────────────────────────

async function pullTripleseatLeads(
  supabase: ReturnType<typeof createAdminClient>,
  from: Date,
  to: Date
): Promise<number> {
  let totalInserted = 0;
  let page = 1;
  const start = Date.now();

  while (true) {
    const url = `https://api.tripleseat.com/v1/leads?location_id=${TS_LOCATION_ID}&start_date=${toISOEastern(from)}&end_date=${toISOEastern(to)}&page=${page}`;

    let res: Response;
    try {
        res = await fetchWithTimeout(url, {
            headers: { Authorization: `Bearer ${process.env.TRIPLESEAT_BEARER_TOKEN}` },
          });
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'network error';
      await logSync(supabase, 'tripleseat', 'read', url, 0, 'error', msg);
      break;
    }

    if (!res.ok) {
      await logSync(supabase, 'tripleseat', 'read', url, 0, 'error', `HTTP ${res.status}`);
      break;
    }

    const json = await res.json() as { leads?: unknown[] };
    const leads = json.leads ?? [];
    if (!Array.isArray(leads) || leads.length === 0) break;

    const rows = leads.map((l) => {
      const raw = l as Record<string, unknown>;
      const locations = raw.locations as Array<Record<string, unknown>> | undefined;
      const roomIds = (locations ?? [])
        .flatMap(loc => {
          const rooms = loc.rooms as Array<Record<string, unknown>> | undefined;
          return (rooms ?? []).map(r => r.id as number);
        });

      const contact = raw.contact as Record<string, unknown> | undefined;

      return {
        location_id: ORLANDO_UUID,
        tripleseat_lead_id: String(raw.id),
        lead_name: raw.name ?? null,
        lead_type: raw.type ?? null,
        status: ((raw.status as string) ?? 'prospect').toLowerCase(),
        contact_name: contact
          ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || null
          : null,
        desired_date: raw.first_event_date ?? null,
        desired_start: raw.start_time ?? null,
        desired_end: raw.end_time ?? null,
        guest_count: raw.guest_count ?? null,
        room_ids: roomIds,
        raw_json: raw,
      };
    });

    const { error } = await supabase
      .from('ts_leads')
      .upsert(rows, { onConflict: 'location_id,tripleseat_lead_id' });

    if (!error) totalInserted += rows.length;

    if (leads.length < 50) break;
    page++;
    await new Promise(r => setTimeout(r, 200));
  }

  const duration = Date.now() - start;
  await logSync(supabase, 'tripleseat', 'read', '/v1/leads', totalInserted, 'success', null, duration);
  return totalInserted;
}

// ── GET handler ──────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Validate CRON_SECRET
  const authHeader = request.headers.get('Authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const syncStart = Date.now();

  try {
    const supabase = createAdminClient();
    const { from, to } = getDateWindow();
    const courtMappings = await getCourtMappings(supabase);

    const [crReservations, crEvents, tsEvents, tsLeads] = await Promise.all([
      pullCourtReserve(supabase, courtMappings, from, to),
      pullCourtReserveEvents(supabase, courtMappings, from, to),
      pullTripleseatEvents(supabase, from, to),
      pullTripleseatLeads(supabase, from, to),
    ]);

    return NextResponse.json({
      success: true,
      duration_ms: Date.now() - syncStart,
      window: { from: toISO(from), to: toISO(to) },
      records: {
        cr_reservations: crReservations,
        cr_events: crEvents,
        ts_events: tsEvents,
        ts_leads: tsLeads,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message, duration_ms: Date.now() - syncStart },
      { status: 500 }
    );
  }
}