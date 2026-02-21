// app/(dashboard)/settings/page.tsx
// Server Component — all data fetched server-side.
// Settings are read-only in Week 1. No client-side refresh needed
// since this data only changes when the pull-data script runs.

import { createAdminClient } from '@/lib/supabase/server';
import { CourtMappingsTable } from '@/components/settings/CourtMappingsTable';
import { IntegrationStatusCard } from '@/components/settings/IntegrationStatusCard';
import { SyncLogTable } from '@/components/settings/SyncLogTable';
import type { CourtMapping } from '@/lib/types/calendar';
import type { SyncLogEntry } from '@/lib/types/settings';

const ORLANDO_UUID = 'ff344bbf-3e47-43b8-b3f7-49d38583970d';

export default async function SettingsPage() {
  const supabase = createAdminClient();

  // Court mappings are critical — page cannot render without them.
  // Sync log is non-critical — failure shows empty state, not 500.
  const { data: courtMappingsData } = await supabase
    .from('court_mappings')
    .select('id, location_id, court_number, court_name, courtreserve_court_id, tripleseat_room_id, is_active')
    .eq('location_id', ORLANDO_UUID)
    .order('court_number');

  let syncLog: SyncLogEntry[] = [];
  try {
    const { data, error } = await supabase
      .from('sync_log')
      .select('id, created_at, source, operation, records_affected, status, error_message, duration_ms')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error && data) syncLog = data as SyncLogEntry[];
  } catch {
    // Sync log unavailable — degrade gracefully, courts still render
  }

  const courtMappings = (courtMappingsData ?? []) as CourtMapping[];

  // Derive latest sync per source — log is already ordered descending
  // so first match is always the most recent for each source
  const latestBySource: Record<string, SyncLogEntry> = {};
  for (const entry of syncLog) {
    if (!latestBySource[entry.source]) {
      latestBySource[entry.source] = entry;
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-(--bg-primary)">

      {/* ── Header ── */}
      <div className="flex items-center px-6 py-3 border-b border-(--border-light) shrink-0">
        <h2 className="text-base font-semibold text-(--text-primary)">Settings</h2>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
        <div className="max-w-4xl space-y-8">

          {/* Integration Status */}
          <section>
            <h3 className="text-sm font-semibold text-(--text-secondary) uppercase tracking-wider mb-3">
              Integration Status
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <IntegrationStatusCard
                name="CourtReserve"
                description="Reservations · 10 courts"
                latestSync={latestBySource['courtreserve'] ?? null}
              />
              <IntegrationStatusCard
                name="Tripleseat"
                description="Events · Leads"
                latestSync={latestBySource['tripleseat'] ?? null}
                pendingMessage="Awaiting Orlando bearer token"
              />
            </div>
          </section>

          {/* Court Mappings */}
          <section>
            <h3 className="text-sm font-semibold text-(--text-secondary) uppercase tracking-wider mb-3">
              Court Mappings
            </h3>
            <CourtMappingsTable courtMappings={courtMappings} />
          </section>

          {/* Sync Log */}
          <section>
            <h3 className="text-sm font-semibold text-(--text-secondary) uppercase tracking-wider mb-3">
              Sync Log
            </h3>
            <SyncLogTable entries={syncLog} />
          </section>

        </div>
      </div>
    </div>
  );
}