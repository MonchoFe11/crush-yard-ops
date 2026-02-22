// lib/types/calendar.ts
// TypeScript types for the Crush Yard calendar grid
//
// TIMEZONE RULE: All CalendarEvent times must be normalized to America/New_York
// before constructing a CalendarEvent object.
// - CourtReserve: already local Eastern time, no conversion needed
// - Tripleseat: UTC strings must be converted via Intl before use
// This ensures DST correctness (e.g. March 8 2026 clocks forward)
//
// STATUS RULE: Source-specific status strings (e.g. "DEFINITE", "Active")
// must be mapped to CalendarEventStatus before constructing CalendarEvent.
// No raw source status values should appear in UI components.

// ── Raw DB row types ──────────────────────────────────────────────

export type CourtMapping = {
    id: string;
    location_id: string;
    court_number: number;
    court_name: string;
    courtreserve_court_id: number | null;
    tripleseat_room_id: number | null;
    is_active: boolean;
  };
  
  export type CRReservation = {
    id: string;
    location_id: string;
    courtreserve_reservation_id: string;
    court_id: number | null;
    court_mapping_id: string | null;
    category: string | null;
    title: string | null;
    reservation_date: string | null;   // YYYY-MM-DD
    start_time: string | null;         // Local Eastern e.g. "2026-02-21T13:00:00"
    end_time: string | null;
    member_name: string | null;
    member_email: string | null;
    instructor_name: string | null;
    status: string | null;
  };

  export type CREvent = {
    id: string;
    location_id: string;
    courtreserve_event_id: number;
    courtreserve_reservation_id: number | null;
    event_name: string | null;
    event_category_id: number | null;
    event_category_name: string | null;
    start_datetime: string | null;     // stored as TIMESTAMPTZ but values are Eastern local
    end_datetime: string | null;
    court_ids: number[];
    court_mapping_ids: string[];       // pre-computed UUIDs — no lookup needed
    max_registrants: number | null;
    registered_count: number | null;
    waitlist_count: number | null;
    is_canceled: boolean;
    is_public: boolean;
    public_event_url: string | null;
  };
  
  export type TSEvent = {
    id: string;
    location_id: string;
    tripleseat_event_id: number;
    event_name: string | null;
    event_type: string | null;
    status: string | null;
    contact_name: string | null;
    contact_email: string | null;
    event_date: string | null;         // YYYY-MM-DD
    event_start: string | null;        // UTC ISO string -- must convert to Eastern
    event_end: string | null;
    guest_count: number | null;
    room_ids: number[];
  };
  
  export type TSLead = {
    id: string;
    location_id: string;
    tripleseat_lead_id: number;
    lead_name: string | null;
    lead_type: string | null;
    status: string | null;
    contact_name: string | null;
    desired_date: string | null;       // YYYY-MM-DD
    desired_start: string | null;      // UTC ISO string -- must convert to Eastern
    desired_end: string | null;
    guest_count: number | null;
    room_ids: number[];
  };
  
  // ── Calendar display types ────────────────────────────────────────
  
  export type CalendarEventSource = 'courtreserve' | 'courtreserve_event' | 'tripleseat_event' | 'tripleseat_lead';
  
  export type CalendarEventStatus =
    | 'confirmed'    // CR: Active  |  TS: DEFINITE
    | 'tentative'    // TS: TENTATIVE
    | 'prospect'     // TS: PROSPECT + all leads
    | 'cancelled';   // CR: Cancelled  |  TS: CANCELLED / LOST
  
  export type CalendarEvent = {
    id: string;                        // unique: "{source}-{originalRecordId}"
    originalRecordId: string;          // DB record ID for slide-over fetching
    source: CalendarEventSource;
  
    // Multi-court support: Tripleseat events can span multiple rooms
  courtMappingIds: string[];         // court_mapping UUIDs this event occupies
  courtNumber: number | null;        // first court number, for display labels
  isMultiCourt: boolean;             // true when courtMappingIds.length > 1
  
    title: string;
    category: string | null;          // "Indoor Pickleball", "Beginner Session", etc.
    status: CalendarEventStatus;
    hasConflict: boolean;             // true = render red pulse border
  
    date: string;                     // YYYY-MM-DD Eastern
    startTime: string;                // "HH:MM" 24h Eastern local
    endTime: string;                  // "HH:MM" 24h Eastern local
    startMinutes: number;             // minutes from midnight, for CSS grid positioning
    endMinutes: number;
    durationMinutes: number;
  
    memberName: string | null;
    memberEmail: string | null;
    instructorName: string | null;
    guestCount: number | null;
  
    // Tripleseat-specific (null for CourtReserve events)
    roomIds: number[];
    contactName: string | null;
    contactEmail: string | null;
    eventType: string | null;
  };
  
  // ── Calendar grid types ───────────────────────────────────────────
  
  export type CourtRow = {
    courtMapping: CourtMapping;
    events: CalendarEvent[];
  };
  
  export type CalendarDay = {
    date: string;                     // YYYY-MM-DD
    label: string;                    // "Sat Feb 21"
    isToday: boolean;
    courtRows: CourtRow[];
  };
  
  export type CalendarViewMode = 'day' | 'week' | 'agenda';
  
  export type CalendarState = {
    viewMode: CalendarViewMode;
    selectedDate: string;             // YYYY-MM-DD anchor date
    visibleDates: string[];           // 1 date (day view) or 7 dates (week view)
  };
  
  // ── Filter types ──────────────────────────────────────────────────
  
  export type CalendarFilters = {
    sources: CalendarEventSource[];   // which sources to show
    statuses: CalendarEventStatus[];  // which statuses to show
    courtIds: string[];               // court_mapping UUIDs to show (empty = all)
  };
  
  export const DEFAULT_FILTERS: CalendarFilters = {
    sources: ['courtreserve', 'courtreserve_event', 'tripleseat_event', 'tripleseat_lead'],
    statuses: ['confirmed', 'tentative', 'prospect'],
    courtIds: [],
  };