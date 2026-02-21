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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing Supabase credentials in .env.local');
}
if (!CR_USERNAME || !CR_PASSWORD) {
  throw new Error('Missing COURTRESERVE_USERNAME or COURTRESERVE_PASSWORD in .env.local');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CR_ORG_ID = 13523;

const now = new Date();
const FROM_DATE = new Date(now);
FROM_DATE.setDate(FROM_DATE.getDate() - 30);
const TO_DATE = new Date(now);
TO_DATE.setDate(TO_DATE.getDate() + 90);

function toISO(date) {
  return date.toISOString().split('T')[0];
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

// Parse "Court #7" or "Court #1, Court #2" -> first court number integer
function parseCourtNumber(courtsString) {
  if (!courtsString) return null;
  const match = courtsString.match(/Court #(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

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
      reservationsFromDate: toISO(chunk.from),
      reservationsToDate: toISO(chunk.to),
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

async function main() {
  console.log('Crush Yard Data Pull');
  console.log(`Date window: ${toISO(FROM_DATE)} -> ${toISO(TO_DATE)}\n`);

  const locationUUID = await getOrlandoLocationId();
  console.log(`Orlando location UUID: ${locationUUID}`);

  const courtMappings = await getCourtMappings();
  console.log(`Court mappings loaded: ${courtMappings.length} courts`);

  // NOTE: Tripleseat skipped -- bearer token is Mt Pleasant only
  // Restore pullTripleseatEvents + pullTripleseatLeads tomorrow after Evan generates Orlando token

  await pullCourtReserve(locationUUID, courtMappings);

  console.log('\n Data pull complete');
}

main().catch(err => {
  console.error('\n Fatal error:', err.message);
  process.exit(1);
});