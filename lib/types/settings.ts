// lib/types/settings.ts
// Shared types for the Settings page and its child components.
// Kept separate from calendar.ts since these are admin/ops domain types.

export type SyncLogEntry = {
    id: string;
    created_at: string;
    source: string;
    operation: string | null;
    records_affected: number | null;
    status: string;
    error_message: string | null;
    duration_ms: number | null;
  };