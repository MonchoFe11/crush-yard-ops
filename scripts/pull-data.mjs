// scripts/pull-data.mjs
// Run: node scripts/pull-data.mjs
// Requires: .env.local in project root

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load .env.local manually
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#'))
    .map(line => {
      const [key, ...rest] = line.split('=');
      return [key.trim(), rest.join('=').trim()];
    })
);

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_SERVICE_KEY = env['SUPABASE_SERVICE_KEY'];
const CR_USERNAME = env['COURTRESERVE_USERNAME'];
const CR_PASSWORD = env['COURTRESERVE_PASSWORD'];
const TS_BEARER_TOKEN = env['TRIPLESEAT_BEARER_TOKEN'];

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing Supabase credentials in .env.local');
}
if (!CR_USERNAME || !CR_PASSWORD) {
  throw new Error('Missing COURTRESERVE_USERNAME or COURTRESERVE_PASSWORD in .env.local');
}
if (!TS_BEARER_TOKEN) {
  throw new Error('Missing TRIPLESEAT_BEARER_TOKEN in .env.local');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CR_ORG_ID = 13523;
const TS_LOCATION_ID = 27268; // Crush Yard - Orlando

const now = new Date();
const FROM_DATE = new Date(now);
FROM_DATE.setDate(FROM_DATE.getDate() - 30);
const TO_DATE = new Date(now);
TO_DATE.setDate(TO_DATE.getDate() + 90);

// For display/logging only. Use toISOEastern() for all API date parameters.
function toISO(date) {
  return date.toISOString().split('T')[0];
}

// Eastern-aware date string for API calls. Prevents off-by-one errors for Orlando facility.
// TODO: replace 'America/New_York' with dynamic facility.timezone when multi-location supported
function toISOEastern(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function logSync(source, operation, endpoint, records, status, error = null, duration = null) {
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

async function getOrlandoLocationId() {
  const { data, error } = await supabase
    .from('locations')
    .select('id')
    .eq('code', 'ORL')
    .single();
  if (error) throw new Error('Could not find ORL location: ' + error.message);
  return data.id;
}

async function getCourtMappings() {
  const { data, error } = await supabase
    .from('court_mappings')
    .select('id, court_number, courtreserve_court_id, tripleseat_room_id');
  if (error) throw new Error('Could not load court_mappings: ' + error.message);
  return data;
}

function parseCourtNumber(courtsString) {
  if (!courtsString) return null;
  const match = courtsString.match(/Court #(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// ── CourtReserve Reservations ──────────────────────────────────────

async function pullCourtReserve(locationUUID, courtMappings) {
  console.log('\n── CourtReserve Reservations ──');
  const crAuth = Buffer.from(`${CR_USERNAME}:${CR_PASSWORD}`).toString('base64');
  let totalInserted = 0;
  const start = Date.now();

  const chunks = [];
  let chunkStart = new Date(FROM_DATE);
  while (chunkStart < TO_DATE) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + 31);
    if (chunkEnd > TO_DATE) chunkEnd.setTime(TO_DATE.getTime());
    chunks.push({ from: new Date(chunkStart), to: new Date(chunkEnd) });
    chunkStart.setDate(chunkStart.getDate() + 31);
  }

  console.log(`  Fetching ${chunks.length} chunks (31-day max per request)`);

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      reservationsFromDate: toISOEastern(chunk.from),
      reservationsToDate: toISOEastern(chunk.to),
    });

    const url = `https://api.courtreserve.com/api/v1/reservationreport/listactive?${params}`;

    let res;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Basic ${crAuth}`,
          'X-Org-Id': String(CR_ORG_ID),
        },
      });
    } catch (fetchErr) {
      console.error(`  Chunk ${toISO(chunk.from)} network error:`, fetchErr.message);
      await logSync('courtreserve', 'read', url, 0, 'error', fetchErr.message);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`  Chunk ${toISO(chunk.from)} HTTP ${res.status}: ${body.slice(0, 200)}`);
      await logSync('courtreserve', 'read', url, 0, 'error', `HTTP ${res.status}`);
      continue;
    }

    const json = await res.json();
    const reservations = json.Data ?? json.data ?? [];

    if (!Array.isArray(reservations) || reservations.length === 0) {
      console.log(`  ${toISO(chunk.from)}: 0 reservations`);
      continue;
    }

    const rows = reservations.map(r => {
      const courtNum = parseCourtNumber(r.Courts);
      const mapping = courtNum
        ? courtMappings.find(m => m.court_number === courtNum)
        : null;

      const primaryPlayer = r.Players?.[0] ?? null;
      const memberName = primaryPlayer
        ? `${primaryPlayer.FirstName ?? ''} ${primaryPlayer.LastName ?? ''}`.trim()
        : null;
      const memberEmail = primaryPlayer?.Email ?? null;

      return {
        location_id: locationUUID,
        courtreserve_reservation_id: String(r.Id),
        court_id: courtNum,
        court_mapping_id: mapping?.id ?? null,
        category: r.ReservationTypeName ?? null,
        title: r.ReservationTypeName ?? null,
        reservation_date: r.StartTime ? r.StartTime.split('T')[0] : null,
        start_time: r.StartTime ?? null,
        end_time: r.EndTime ?? null,
        member_name: memberName,
        member_email: memberEmail,
        instructor_name: r.Instructors ?? null,
        status: r.CancelledOn ? 'Cancelled' : 'Active',
        raw_json: r,
        source_updated_at: r.UpdatedOnUtc ?? null,
      };
    });

    const { error } = await supabase
      .from('cr_reservations')
      .upsert(rows, { onConflict: 'location_id,courtreserve_reservation_id' });

    if (error) {
      console.error(`  Chunk ${toISO(chunk.from)} upsert error:`, error.message);
    } else {
      totalInserted += rows.length;
      console.log(`  ${toISO(chunk.from)} -> ${toISO(chunk.to)}: ${rows.length} reservations upserted`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  const duration = Date.now() - start;
  await logSync('courtreserve', 'read', '/api/v1/reservationreport/listactive', totalInserted, 'success', null, duration);
  console.log(`  Total inserted: ${totalInserted} | Duration: ${duration}ms`);
}

// ── CourtReserve Events (leagues, clinics, open play, round robins) ─

async function pullCourtReserveEvents(locationUUID, courtMappings) {
  console.log('\n── CourtReserve Events (eventcalendar) ──');
  const crAuth = Buffer.from(`${CR_USERNAME}:${CR_PASSWORD}`).toString('base64');
  const start = Date.now();
  let totalInserted = 0;

  // Build CR court ID -> mapping lookup
  const crCourtIdToMapping = {};
  for (const m of courtMappings) {
    if (m.courtreserve_court_id) {
      crCourtIdToMapping[String(m.courtreserve_court_id)] = m;
    }
  }

  // 30-day chunks
  const chunks = [];
  let chunkStart = new Date(FROM_DATE);
  while (chunkStart < TO_DATE) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + 30);
    if (chunkEnd > TO_DATE) chunkEnd.setTime(TO_DATE.getTime());
    chunks.push({ from: new Date(chunkStart), to: new Date(chunkEnd) });
    chunkStart.setDate(chunkStart.getDate() + 30);
  }

  console.log(`  Fetching ${chunks.length} chunks`);

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      startDate: chunk.from.toISOString(),
      endDate: chunk.to.toISOString(),
      status: 'Active',
    });

    const url = `https://api.courtreserve.com/api/v1/eventcalendar/eventlist?${params}`;

    let res;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Basic ${crAuth}`,
          'X-Org-Id': String(CR_ORG_ID),
        },
      });
    } catch (fetchErr) {
      console.error(`  Chunk ${toISO(chunk.from)} network error:`, fetchErr.message);
      await logSync('courtreserve_events', 'read', url, 0, 'error', fetchErr.message);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`  Chunk ${toISO(chunk.from)} HTTP ${res.status}: ${body.slice(0, 200)}`);
      await logSync('courtreserve_events', 'read', url, 0, 'error', `HTTP ${res.status}`);
      continue;
    }

    const json = await res.json();
    const events = json.Data ?? [];

    if (!Array.isArray(events) || events.length === 0) {
      console.log(`  ${toISO(chunk.from)}: 0 events`);
      continue;
    }

    // Deduplicate within chunk by eventId + startDateTime
    // Recurring events share EventId but differ by StartDateTime + ReservationId
    const seen = new Set();
    const dedupedEvents = [];
    for (const e of events) {
      const key = `${e.EventId}__${e.StartDateTime}`;
      if (!seen.has(key)) {
        seen.add(key);
        dedupedEvents.push(e);
      }
    }

    const dupeCount = events.length - dedupedEvents.length;
    if (dupeCount > 0) {
      console.log(`  ${toISO(chunk.from)}: removed ${dupeCount} duplicate occurrences`);
    }

    const rows = dedupedEvents.map(e => {
      const crCourtIds = (e.Courts ?? []).map(c => c.Id);
      const courtMappingIds = crCourtIds
        .map(id => crCourtIdToMapping[String(id)]?.id)
        .filter(Boolean);

      const unmapped = crCourtIds.length - courtMappingIds.length;
      if (unmapped > 0) {
        console.log(`  ⚠ Event ${e.EventId} "${e.EventName}": ${unmapped} court(s) not mapped`);
      }

      return {
        location_id: locationUUID,
        courtreserve_event_id: e.EventId,
        courtreserve_reservation_id: e.ReservationId ?? null,
        event_name: e.EventName ?? null,
        event_category_id: e.EventCategoryId ?? null,
        event_category_name: e.EventCategoryName ?? null,
        start_datetime: e.StartDateTime ?? null,
        end_datetime: e.EndDateTime ?? null,
        court_ids: crCourtIds,
        court_mapping_ids: courtMappingIds,
        max_registrants: e.MaxRegistrants ?? null,
        registered_count: e.RegisteredCount ?? null,
        waitlist_count: e.WaitlistCount ?? null,
        is_canceled: e.IsCanceled ?? false,
        is_public: e.IsPublicBookingAllowed ?? false,
        public_event_url: e.PublicEventUrl ?? null,
        raw_json: e,
        synced_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from('cr_events')
      .upsert(rows, { 
        onConflict: 'location_id,courtreserve_event_id,start_datetime' 
      });

    if (error) {
      console.error(`  Chunk ${toISO(chunk.from)} upsert error:`, error.message);
    } else {
      totalInserted += rows.length;
      console.log(`  ${toISO(chunk.from)} -> ${toISO(chunk.to)}: ${rows.length} events upserted`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  const duration = Date.now() - start;
  await logSync('courtreserve_events', 'read', '/api/v1/eventcalendar/eventlist', totalInserted, 'success', null, duration);
  console.log(`  Total inserted: ${totalInserted} | Duration: ${duration}ms`);
}

// ── Tripleseat Events ──────────────────────────────────────────────

async function pullTripleseatEvents(locationUUID, courtMappings) {
  console.log('\n── Tripleseat Events ──');
  const start = Date.now();
  let totalInserted = 0;
  let page = 1;

  const roomToMapping = {};
  for (const m of courtMappings) {
    if (m.tripleseat_room_id) roomToMapping[m.tripleseat_room_id] = m;
  }

  while (true) {
    const url = `https://api.tripleseat.com/v1/events?location_id=${TS_LOCATION_ID}&start_date=${toISOEastern(FROM_DATE)}&end_date=${toISOEastern(TO_DATE)}&page=${page}`;

    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${TS_BEARER_TOKEN}` },
      });
    } catch (fetchErr) {
      console.error(`  Page ${page} network error:`, fetchErr.message);
      await logSync('tripleseat', 'read', url, 0, 'error', fetchErr.message);
      break;
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`  Page ${page} HTTP ${res.status}: ${body.slice(0, 200)}`);
      await logSync('tripleseat', 'read', url, 0, 'error', `HTTP ${res.status}`);
      break;
    }

    const json = await res.json();
    const events = json.results ?? [];

    if (events.length === 0) {
      console.log(`  Page ${page}: 0 events — done`);
      break;
    }

    const rows = events.map(e => {
      const roomIds = (e.rooms ?? []).map(r => r.id);
      return {
        location_id: locationUUID,
        tripleseat_event_id: String(e.id),
        event_name: e.name ?? null,
        event_type: e.type ?? null,
        status: (e.status ?? 'prospect').toLowerCase(),
        contact_name: e.contact_name ?? null,
        contact_email: e.contact_email ?? null,
        event_date: e.start_date ?? null,
        event_start: e.event_start_iso8601 ?? null,
        event_end: e.event_end_iso8601 ?? null,
        guest_count: e.guest_count ?? null,
        room_ids: roomIds,
        raw_json: e,
      };
    });

    const { error } = await supabase
      .from('ts_events')
      .upsert(rows, { onConflict: 'location_id,tripleseat_event_id' });

    if (error) {
      console.error(`  Page ${page} upsert error:`, error.message);
    } else {
      totalInserted += rows.length;
      console.log(`  Page ${page}: ${rows.length} events upserted`);
    }

    if (page >= json.total_pages) break;
    page++;
    await new Promise(r => setTimeout(r, 200));
  }

  const duration = Date.now() - start;
  await logSync('tripleseat', 'read', '/v1/events', totalInserted, 'success', null, duration);
  console.log(`  Total inserted: ${totalInserted} | Duration: ${duration}ms`);
}

// ── Tripleseat Leads ───────────────────────────────────────────────

async function pullTripleseatLeads(locationUUID) {
  console.log('\n── Tripleseat Leads ──');
  const start = Date.now();
  let totalInserted = 0;
  let page = 1;

  while (true) {
    const url = `https://api.tripleseat.com/v1/leads?location_id=${TS_LOCATION_ID}&start_date=${toISOEastern(FROM_DATE)}&end_date=${toISOEastern(TO_DATE)}&page=${page}`;

    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${TS_BEARER_TOKEN}` },
      });
    } catch (fetchErr) {
      console.error(`  Page ${page} network error:`, fetchErr.message);
      await logSync('tripleseat', 'read', url, 0, 'error', fetchErr.message);
      break;
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`  Page ${page} HTTP ${res.status}: ${body.slice(0, 200)}`);
      await logSync('tripleseat', 'read', url, 0, 'error', `HTTP ${res.status}`);
      break;
    }

    const json = await res.json();
    const leads = json.leads ?? [];

    if (leads.length === 0) {
      console.log(`  Page ${page}: 0 leads — done`);
      break;
    }

    const rows = leads.map(l => {
      const roomIds = (l.locations ?? [])
        .flatMap(loc => (loc.rooms ?? []).map(r => r.id));

      return {
        location_id: locationUUID,
        tripleseat_lead_id: String(l.id),
        lead_name: l.name ?? null,
        lead_type: l.type ?? null,
        status: (l.status ?? 'prospect').toLowerCase(),
        contact_name: l.contact
          ? `${l.contact.first_name ?? ''} ${l.contact.last_name ?? ''}`.trim()
          : null,
        desired_date: l.first_event_date ?? null,
        desired_start: l.start_time ?? null,
        desired_end: l.end_time ?? null,
        guest_count: l.guest_count ?? null,
        room_ids: roomIds,
        raw_json: l,
      };
    });

    const { error } = await supabase
      .from('ts_leads')
      .upsert(rows, { onConflict: 'location_id,tripleseat_lead_id' });

    if (error) {
      console.error(`  Page ${page} upsert error:`, error.message);
    } else {
      totalInserted += rows.length;
      console.log(`  Page ${page}: ${rows.length} leads upserted`);
    }

    if (leads.length < 50) break;
    page++;
    await new Promise(r => setTimeout(r, 200));
  }

  const duration = Date.now() - start;
  await logSync('tripleseat', 'read', '/v1/leads', totalInserted, 'success', null, duration);
  console.log(`  Total inserted: ${totalInserted} | Duration: ${duration}ms`);
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('Crush Yard Data Pull');
  console.log(`Date window: ${toISO(FROM_DATE)} -> ${toISO(TO_DATE)}\n`);

  const locationUUID = await getOrlandoLocationId();
  console.log(`Orlando location UUID: ${locationUUID}`);

  const courtMappings = await getCourtMappings();
  console.log(`Court mappings loaded: ${courtMappings.length} courts`);

  await pullCourtReserve(locationUUID, courtMappings);
  await pullCourtReserveEvents(locationUUID, courtMappings);
  await pullTripleseatEvents(locationUUID, courtMappings);
  await pullTripleseatLeads(locationUUID);

  console.log('\n✓ Data pull complete');
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message);
  process.exit(1);
});