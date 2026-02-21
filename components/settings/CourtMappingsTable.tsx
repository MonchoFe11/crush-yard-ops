// components/settings/CourtMappingsTable.tsx
// Read-only table showing all court mappings with their
// CourtReserve and Tripleseat IDs.
// Editing is Week 2 (requires admin auth).

import { CheckCircle, XCircle } from 'lucide-react';
import type { CourtMapping } from '@/lib/types/calendar';

interface CourtMappingsTableProps {
  courtMappings: CourtMapping[];
}

export function CourtMappingsTable({ courtMappings }: CourtMappingsTableProps) {
  if (courtMappings.length === 0) {
    return (
      <div className="rounded-xl border border-(--border-medium) bg-(--bg-secondary) p-8 text-center">
        <p className="text-sm text-(--text-muted)">No court mappings found</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-(--border-medium) overflow-x-auto">
      <table className="w-full text-sm min-w-[600px]">
        <thead>
          <tr className="border-b border-(--border-light) bg-(--bg-secondary)">
            <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">
              Court
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">
              CourtReserve ID
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">
              Tripleseat Room ID
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--border-light) bg-(--bg-primary)">
          {courtMappings.map(court => (
            <tr
              key={court.id}
              className="hover:bg-(--bg-secondary) transition-colors"
            >
              <td className="px-4 py-3 font-medium text-(--text-primary)">
                {court.court_name}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-(--text-secondary)">
                {court.courtreserve_court_id ?? (
                  <span className="text-(--text-muted)">—</span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-(--text-secondary)">
                {court.tripleseat_room_id ?? (
                  <span className="text-(--text-muted)">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {court.is_active ? (
                  <span
                    className="flex items-center gap-1 text-xs"
                    style={{ color: 'var(--color-success)' }}
                  >
                    <CheckCircle size={13} />
                    Active
                  </span>
                ) : (
                  <span
                    className="flex items-center gap-1 text-xs"
                    style={{ color: 'var(--color-error)' }}
                  >
                    <XCircle size={13} />
                    Inactive
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}