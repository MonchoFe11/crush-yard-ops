import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// ── Types ─────────────────────────────────────────────────────────

interface BriefRequestBody {
  originalRecordId: string;
  source: 'tripleseat_event' | 'tripleseat_lead';
}

// ── Prompt ────────────────────────────────────────────────────────

const FACILITY_PROMPT = `You are an expert operations assistant for Crush Yard, a 10-court indoor pickleball and tennis facility in Orlando, FL.

FACILITY LAYOUT:
Crush Yard has 10 courts divided into three operational zones:

Courts 1–4 (Social Zone):
Located nearest to the lounge, bar, and dining area.
Best for social events, birthday parties, corporate happy hours, casual group outings, and any event where eating, drinking, and a lively atmosphere are priorities.

Courts 5–7 (Flex Zone):
The middle courts. Primarily used for standard reservations, open play, and overflow. Flexible for any event type.

Courts 8–10 (VIP/Corporate Zone):
Located nearest to the large VIP room.
Best for corporate events, company seminars, formal tournaments, pro-driven structured play, and any event requiring a presentation space, formal setup, or VIP catering service.

STAFFING CONTEXT:
Any pickleball pro or front desk staff member can manage events. What matters is the ratio of pickleball staff to guests. Always provide a specific recommended number (e.g. "2 pickleball pros recommended") based on guest count and event type.

RULES:
- Only reference fields and documents that explicitly appear in the raw event data. Do not assume or invent details.
- Be concise and tactical. Avoid redundant confirmations.
- Limit Action Flags to 3–5 items maximum. Prioritize only high-impact operational risks.

TASK:
Given the raw Tripleseat event data below, generate a concise operational brief for the facility manager.

Use this exact format with bold headers:

**Event Summary**
One sentence describing what this event is and who is attending.

**Space & Logistics Analysis**
- Analyze the assigned courts. Based on the facility zones above, confirm whether the court assignment makes sense for this event type, or recommend a better zone with a reason.
- If no courts are assigned yet, recommend the best zone based on the event description.
- Guest count and specific recommended number of pickleball staff needed.
- Catering, AV, VIP room, or any special setup requirements mentioned in the data.

**Key Contacts**
Primary contact name and email, if available.

**Action Flags**
3–5 critical items only. Explicitly list missing information or high-impact risks needed before the event. If nothing is missing, write: "No immediate flags."

Keep the tone professional and tactical. Prioritize clarity and actionability over verbosity.

Raw event data:`;

// ── Route ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── Clients (instantiated per-request to avoid build-time errors) ──
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      timeout: 30_000,
    });

    const body: unknown = await req.json();

    if (
      typeof body !== 'object' ||
      body === null ||
      !('originalRecordId' in body) ||
      !('source' in body) ||
      typeof (body as Record<string, unknown>).originalRecordId !== 'string' ||
      typeof (body as Record<string, unknown>).source !== 'string'
    ) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { originalRecordId, source } = body as BriefRequestBody;

    // ── Basic abuse protection ─────────────────────────────────────
    if (originalRecordId.length > 100) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    if (source !== 'tripleseat_event' && source !== 'tripleseat_lead') {
      return NextResponse.json({ error: 'Unsupported source' }, { status: 400 });
    }

    const briefType = source === 'tripleseat_event' ? 'event' : 'lead';

    // ── 1. Check cache ─────────────────────────────────────────────
    const { data: cached } = await supabase
      .from('ai_event_briefs')
      .select('generated_content, edited_content, is_edited')
      .eq('ts_event_id', originalRecordId)
      .eq('brief_type', briefType)
      .maybeSingle();

    if (cached) {
      const content = cached.is_edited
        ? cached.edited_content
        : cached.generated_content;
      return NextResponse.json({ brief: content as string, cached: true });
    }

    // ── 2. Fetch raw_json ──────────────────────────────────────────
    const table = source === 'tripleseat_event' ? 'ts_events' : 'ts_leads';

    const { data: row, error: fetchError } = await supabase
      .from(table)
      .select('raw_json, location_id')
      .eq('id', originalRecordId)
      .single();

    if (fetchError || !row) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // ── 3. Generate brief ──────────────────────────────────────────
    // Slice to 15,000 chars to guard against unusually large blobs
    const rawJsonString = JSON.stringify(row.raw_json, null, 2).slice(0, 15_000);
    const prompt = `${FACILITY_PROMPT}\n${rawJsonString}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });

    const brief = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // ── 4. Cache result ────────────────────────────────────────────
    const { error: insertError } = await supabase
  .from('ai_event_briefs')
  .upsert(
    {
      ts_event_id: originalRecordId,
      location_id: row.location_id as string,
      brief_type: briefType,
      generated_content: brief,
      model_used: 'claude-sonnet-4-6',
      prompt_tokens: message.usage.input_tokens,
      completion_tokens: message.usage.output_tokens,
    },
    { onConflict: 'ts_event_id,brief_type' }
  );

    if (insertError) {
      console.error('[briefs] Cache insert failed:', insertError.message);
    }

    return NextResponse.json({ brief, cached: false });

  } catch (err) {
    console.error('[briefs] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}