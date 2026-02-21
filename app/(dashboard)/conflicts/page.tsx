// app/(dashboard)/conflicts/page.tsx
// Server Component — loads court mappings on the server for instant
// render. Conflict data is fetched client-side by ConflictsView
// so staff can Refresh without a full page reload.

import { createAdminClient } from '@/lib/supabase/server';
import { ConflictsView } from '@/components/conflicts/ConflictsView';
import type { CourtMapping } from '@/lib/types/calendar';

const ORLANDO_UUID = 'ff344bbf-3e47-43b8-b3f7-49d38583970d';

export default async function ConflictsPage() {
  const supabase = createAdminClient();

  const { data: courtMappings } = await supabase
    .from('court_mappings')
    .select('id, location_id, court_number, court_name, courtreserve_court_id, tripleseat_room_id, is_active')
    .eq('location_id', ORLANDO_UUID)
    .eq('is_active', true)
    .order('court_number');

  return (
    <div className="flex flex-col h-full min-h-0 bg-(--bg-primary)">
      <ConflictsView
        courtMappings={(courtMappings ?? []) as CourtMapping[]}
      />
    </div>
  );
}