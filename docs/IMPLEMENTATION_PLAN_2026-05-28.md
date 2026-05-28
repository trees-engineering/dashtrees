# DashTrees — Implementation Plan, 2026-05-28

> Single-day plan covering: recruiter UX telemetry (custom, Supabase-backed), dashboard features & fixes, candidate-source schema change, and an LLM evaluation harness for Gemini vs Mistral Small.

---

## 0. Scope at a glance

| # | Item | Bucket | Files / tables touched |
|---|---|---|---|
| 1 | Manual close-job button | Dashboard | `RolesTab.tsx`, new endpoint, no schema change |
| 2 | Manual missing-info form on JD upload | Dashboard | `UploadJDButton.tsx`, `jd-import.ts`, ingest endpoint |
| 3 | "Contact on WhatsApp" link on shortlist | Dashboard | `MatchCard.tsx` (wa.me deep link) |
| 4 | Tooltips for "shortlisted" / "introduit" | Dashboard | `MatchCard.tsx`, `IntrosTab.tsx` |
| 5 | Location city/country desync bug | Dashboard | candidate edit form + mutation |
| 6 | Budget UI: monthly + USD default | Dashboard | role form, `formatBudget` util |
| 7 | CV/JD summary prompt → bullets | LLM | `_prompts` table rows |
| 8 | NAT dashboard / Voice deploy | Infra | **BLOCKED — needs clarification** |
| 9 | Candidate `source` field | Schema | `_talent` migration, cascade filter, MatchCard badge |
| 10 | Recruiter UX telemetry (Supabase-backed) | Analytics | new table + SDK + endpoint + viewer |
| 11 | Gemini + Mistral Small providers + eval | LLM | `server/llm.ts`, new eval script |
| 12 | "Buttons everywhere" prompt | LLM | **SKIPPED — Eric flagged as different problem** |

Items 8 and 12 are out of scope today. Everything else ships.

---

## 1. DB migrations (run once in Supabase SQL editor)

Bundle migration. Drop into the Supabase SQL editor before deploying the code.

```sql
-- ── 1a. Telemetry event store ───────────────────────────────────────────────
create table if not exists _telemetry_events (
  id           uuid primary key default gen_random_uuid(),
  ts           timestamptz not null default now(),
  client_ts    timestamptz,
  session_id   text not null,
  recruiter_id uuid,
  recruiter_email text,
  event_name   text not null,
  path         text,          -- active tab id when event fired
  props        jsonb not null default '{}'::jsonb,
  user_agent   text,
  viewport_w   int,
  viewport_h   int
);

create index if not exists idx_telemetry_ts on _telemetry_events (ts desc);
create index if not exists idx_telemetry_recruiter on _telemetry_events (recruiter_email, ts desc);
create index if not exists idx_telemetry_event on _telemetry_events (event_name, ts desc);
create index if not exists idx_telemetry_session on _telemetry_events (session_id, ts);

-- ── 1b. Candidate source field ──────────────────────────────────────────────
-- Values used in v1: 'treelance' (default), 'client_ats', 'manual'.
-- Free-text (not enum) so adding a new source is just an UPDATE, no migration.
alter table _talent add column if not exists source text not null default 'treelance';
create index if not exists idx_talent_source on _talent (source);

-- ── 1c. Role closure ────────────────────────────────────────────────────────
-- _role.status enum already includes 'closed'; nothing to do — verify by:
--   select distinct status from _role;
-- If status is text-typed, existing 'draft'/'open'/'closed' values are fine.
```

**Rollback plan:** `drop table _telemetry_events`, `alter table _talent drop column source`. The candidate source default leaves existing rows correctly labelled `'treelance'`, which is the desired backfill.

---

## 2. Recruiter UX telemetry — design

This is the largest greenfield piece. Designing it explicitly so the code review can focus on shape, not bikeshedding.

### 2.1 Goals (what Eric asked for)
1. **Where they are** — time per tab, session length, return frequency
2. **What they did** — event stream (upload, view, shortlist, introduit, re-run, export…)
3. **Where they got stuck** — rage clicks, dead clicks, abandoned flows, error frustration

### 2.2 Non-goals (v1)
- No session replay (Eric chose events-only — lower privacy surface)
- No heatmaps (compute later from event coordinates if needed)
- No A/B testing framework
- No third-party SDKs — fully Supabase-backed

### 2.3 Architecture

```
                  React app
   ┌──────────────────────────────────────────┐
   │  src/lib/telemetry.ts                    │
   │  ┌────────────────────────────────────┐  │
   │  │ identify(email) → sets recruiter   │  │
   │  │ capture(event, props) → queue      │  │
   │  │ trackPageTime(tabId)               │  │
   │  │ rageClickDetector(global listener) │  │
   │  │ deadClickDetector(global listener) │  │
   │  │ flushOnInterval() | onBeforeUnload │  │
   │  └────────────────────────────────────┘  │
   └────────────────┬─────────────────────────┘
                    │ batches of ≤50 events
                    ▼  POST /api/telemetry/batch
       ┌──────────────────────────────┐
       │ server/index.ts route        │  → INSERT into _telemetry_events
       └──────────────────────────────┘
                    │
                    ▼
       ┌──────────────────────────────┐
       │ GET /api/telemetry/overview  │  → aggregates for the viewer
       └──────────────────────────────┘
                    │
                    ▼
       AnalyticsTab.tsx (in-app dashboard)
```

### 2.4 Frontend SDK — `src/lib/telemetry.ts`

Single-file module. ~200 lines.

**Public surface:**
```ts
telemetry.identify(email: string, recruiterId?: string): void
telemetry.capture(eventName: string, props?: Record<string, unknown>): void
telemetry.trackTab(tabId: string): void  // call on tab change; auto-emits previous tab_time
telemetry.flush(): Promise<void>          // forced flush
```

**Internals:**
- `sessionId` — generated once per app load, kept in `sessionStorage` so a refresh in the same tab continues the session; new tab = new session.
- Event queue array, max 50 entries before forced flush.
- `setInterval` flush every 5s.
- `addEventListener('beforeunload', flushSync)` using `navigator.sendBeacon` for guaranteed delivery.
- Page-time: on `trackTab(newId)`, compute `now - lastTabSwitchAt`, emit `tab_time` event with `{ tab, ms }`, set `lastTabSwitchAt = now`.
- Rage clicks: global `mousedown` listener. Maintains a ring buffer of the last 5 clicks with `{ target, ts }`. If ≥4 clicks on the same closest element ID/text within 1.5s, emit `rage_click` with target descriptor.
- Dead clicks: track every click on non-interactive targets that didn't trigger a `change`/`navigation`/`scroll`/`mutation` within 500ms. Emit `dead_click` with target descriptor. (Conservative — false positives are OK; under-reporting is the failure mode.)
- All payloads exclude PII inputs by default. Free-text field values never enter `props`.

**Imports & init in `main.tsx`:**
```ts
import { telemetry } from './lib/telemetry'
telemetry.init({ endpoint: '/api/telemetry/batch' })
```

`identify` is called by `App.tsx` when `selectedRecruiter` changes (and on boot if `localStorage` has one).

### 2.5 Backend endpoint — `POST /api/telemetry/batch`

```ts
app.post('/api/telemetry/batch', async (req, res) => {
  const { events } = req.body as { events: TelemetryEventInput[] };
  if (!Array.isArray(events) || events.length === 0) {
    res.json({ ok: true, inserted: 0 });
    return;
  }
  if (events.length > 100) {
    res.status(400).json({ error: 'Too many events in one batch (max 100)' });
    return;
  }
  const rows = events.map(e => ({
    client_ts: e.client_ts ?? null,
    session_id: e.session_id,
    recruiter_email: e.recruiter_email ?? null,
    event_name: e.event_name,
    path: e.path ?? null,
    props: e.props ?? {},
    user_agent: e.user_agent ?? null,
    viewport_w: e.viewport_w ?? null,
    viewport_h: e.viewport_h ?? null,
  }));
  if (!supabase) { res.json({ ok: true, inserted: 0 }); return; }
  const { error } = await supabase.from('_telemetry_events').insert(rows);
  if (error) {
    console.warn('[telemetry] insert failed:', error.message);
    res.status(500).json({ error: 'insert failed' });
    return;
  }
  res.json({ ok: true, inserted: rows.length });
});
```

Fire-and-forget. Failures are logged but never block the recruiter.

### 2.6 Event taxonomy (v1)

| Event | Where | Props |
|---|---|---|
| `app_loaded` | `main.tsx` boot | `{ has_recruiter }` |
| `recruiter_identified` | `App.tsx` on selection | `{ email }` |
| `tab_viewed` | `App.tsx` `handleTabChange` | `{ tab, prev_tab }` |
| `tab_time` | telemetry auto | `{ tab, ms }` |
| `jd_upload_started` | `UploadJDButton` | `{ filename, size_bytes }` |
| `jd_upload_completed` | `UploadJDButton` | `{ filename, requirements, tet_completeness, vision_used }` |
| `jd_upload_failed` | `UploadJDButton` | `{ filename, error_message }` |
| `match_viewed` | `MatchCard` expand | `{ role_id, talent_id, score }` |
| `match_status_changed` | future status mutation | `{ role_id, talent_id, from, to }` |
| `matches_rerun` | `RerunMatchesButton` | `{ role_id }` |
| `dossier_export_started` | `ExportDocumentPanel` submit | `{ talent_id, role_id, format, tailor, append_cv }` |
| `dossier_export_completed` | `ExportDocumentPanel` success | `{ filename, ms }` |
| `dossier_export_failed` | `ExportDocumentPanel` error | `{ error_message }` |
| `role_closed_manually` | RolesTab close button | `{ role_id }` |
| `whatsapp_contact_clicked` | MatchCard WhatsApp button | `{ talent_id, role_id }` |
| `api_error_shown` | `Toast` `'error'` variant | `{ message }` (no PII) |
| `rage_click` | telemetry auto | `{ target, count, ms, tab }` |
| `dead_click` | telemetry auto | `{ target, tab }` |

### 2.7 Aggregates endpoint — `GET /api/telemetry/overview`

Returns the shape consumed by the viewer:

```ts
{
  windowDays: number,
  activeRecruiters: { email: string, sessions: number, events: number, last_seen: string }[],
  eventsPerDay: { day: string, count: number }[],
  topEvents: { event_name: string, count: number }[],
  rageClickHotSpots: { target: string, count: number }[],
  deadClickHotSpots: { target: string, count: number }[],
  tabTime: { tab: string, total_ms: number, sessions: number }[],
  funnel: {
    upload: number,
    match_viewed: number,
    match_shortlisted: number,
    introduit: number,
  },
  errors: { count: number, samples: { message: string, ts: string }[] },
}
```

Implemented as a single Supabase query batch (or RPC if perf becomes an issue — not v1 concern, table size is going to be <1M rows for a long time).

### 2.8 Viewer — `AnalyticsTab.tsx`

New tab `'analytics'` added to the bottom nav. Icon: `BarChart3` from `lucide-react`. Initial scope:
- KPI strip: active recruiters (7d), events (7d), avg session length, error count
- Tab-time bar (which tab consumes most attention)
- Funnel: Upload → Match viewed → Shortlisted → Introduit
- Rage-click hot spots — clickable list (top 10)
- Recent errors — last 20 `api_error_shown`

No chart library yet — flat CSS bars + numbers. If we hit Sankey territory later, add `recharts`.

### 2.9 Privacy posture
- No PII flows into `props` — only IDs, counts, durations.
- `event_name` is fixed, hand-authored — never a raw string from the DOM.
- `target` for rage/dead clicks is the *closest stable selector* (id || `[data-ph-id]` || nearest button text), not the full innerText.
- Candidate names/emails/phone never leave the client — they live in React state only.

---

## 3. Dashboard features & fixes

### 3.1 Manual close-job button
- **Files:** `server/index.ts` (new endpoint), `src/lib/api.ts`, `src/components/RolesTab.tsx`.
- **Endpoint:** `PATCH /api/roles/:roleId/status` with body `{ status: 'open' | 'closed' }`.
- **UI:** in `RoleAccordion` expanded view, add a "Close job" button next to "View Matches" when `role.status === 'open'`. Confirm modal: "Close 'X'? Existing matches stay visible; no new matches will be scored."
- **Verification:** click button → status flips → `roleStatusBadgeClass('closed')` styles applied → confirmed roles disappear from `'open'` filter.

### 3.2 Manual missing-info form on JD upload
- **Files:** `server/index.ts`, `server/jd-import.ts`, `src/lib/api.ts`, `src/components/UploadJDButton.tsx`, new `src/components/JDMissingInfoModal.tsx`.
- **Required-field set:** `title`, `discipline_required` || `discipline`, `seniority_band_required` || `seniority_range`, `location_requirement`, `budget` (salary_min or salary_max or `no_budget: true`).
- **Backend:** after `ingestRoleFromBuffer` completes, scan the inserted row for missing required fields and return `missingFields: string[]` in the response. Cascade still kicks off in background.
- **Frontend:** if `missingFields.length > 0`, open the modal pre-filled with what extraction got, fields highlighted that need attention. PATCH the role on submit.
- **New endpoint:** `PATCH /api/roles/:roleId` accepting a small allowlist of editable fields.
- **Verification:** upload a deliberately incomplete JD → modal opens → fill in fields → save → role updates → no more banner on the role.

### 3.3 WhatsApp wa.me deep link
- **Files:** `src/components/MatchCard.tsx`.
- **Render rule:** show button only if `match.status === 'shortlisted'` AND `talent.phone` is non-empty.
- **Link shape:** `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(template)}`.
  - `normalizedPhone` strips spaces, dashes, parentheses; preserves leading `+`.
  - Template: `Hi {{name}}, I'm {{recruiter}} from Trees Engineering. We have a role that looks like a strong match for you — would you be open to a quick chat?` (replace `{{name}}` and `{{recruiter}}` client-side).
- **Verification:** open match card on a shortlisted candidate with a phone → button visible → click opens WA web (or app on mobile) with prefilled body.

### 3.4 Tooltips for "shortlisted" / "introduit"
- **Files:** `MatchCard.tsx`, `IntrosTab.tsx`.
- **Pattern:** wrap the status badge in a `<span title="…">` with the explanation. Possibly upgrade to a real popover later if hover-on-mobile becomes an issue.
- **Copy:**
  - `shortlisted`: *"You marked this candidate as a strong fit. Next step is to introduce them to the client."*
  - `introduit`: *"Candidate has been formally presented to the client and is awaiting their decision."*

### 3.5 Location city/country desync bug
- **Symptom:** editing one of city/country doesn't update both correctly.
- **Repro plan:** open candidate edit form, change city → save → reload → check city + country fields + the legacy `location` field.
- **Likely cause (hypothesis):** the form posts `city` only but the read path falls back to `location` (which may not have been updated), so the UI looks stale. Or the form clears `country` to empty string when only `city` changed.
- **Fix:** ensure the mutation sets both `city` AND `country` (whichever the user touched, the other read from current state), and also rebuilds the legacy `location` string `"city, country"` for back-compat with the cascade scorer (which reads `talent.location`).
- **Verification:** edit city only → both `city` and `country` persist correctly → legacy `location` matches.

### 3.6 Budget UI: monthly + USD default
- **Files:** `src/lib/utils.ts` (`formatBudget`), wherever budget is edited (likely role edit form — may not yet exist; if not, just the display side).
- **Display change:** `formatBudget` adds a "/mo" suffix and treats empty currency as `USD`.
- **Edit change:** if a role-edit form exists, label the field "Monthly budget" and default the currency dropdown to `USD`.
- **JD ingest:** `jd-import.ts:114` already defaults `budget_currency` to `'USD'` — no change needed there.
- **Verification:** display shows "USD 8,000–12,000 / mo" instead of "8,000–12,000". Empty-currency rows render "USD" not blank.

### 3.7 CV/JD summary prompt → bullet points
- **Storage:** prompts live in the Supabase `_prompts` table (key + text), accessed via `getPrompt(key)` in `server/llm.ts`.
- **Likely prompt keys to update:**
  - `role_extraction` — the JD summary lives in `summary` field; tweak the schema spec to require bullets in summary
  - `dossier_*` — dossier reasoning paragraphs (probably out of scope here, dossier needs prose)
  - The CV summary key — exact name to be confirmed by inspecting `_prompts` table contents
- **Approach:** instead of editing prompts blindly, in the doc I include a SQL stub. Eric runs `SELECT key, length(text) FROM _prompts;` first, then we know which keys matter.
- **Verification:** upload a fresh JD → role summary now reads as a 4-6 line bullet list, not prose. Same for the candidate summary when one is generated.

---

## 4. Candidate `source` field

- **Schema:** see §1b.
- **Backend:** in `server/matching/cascade.ts`, when fetching candidates, default to `source = 'treelance'`. If `role.allowed_sources` ever becomes a column, honour it. v1: hard-coded filter, no role-level override.
  - **Smaller v1:** *don't* filter at all yet — just add the column and the badge. Filtering can come once client ATS candidates actually exist in the table.
- **Frontend:** `MatchCard.tsx` displays a small grey "src: client_ats" badge when `talent.source !== 'treelance'`.
- **Why filter is deferred:** the table is going to be 100% `treelance` source for a while. Adding the column + badge today keeps us ready; adding the filter prematurely could mask a real bug (no candidates surfaced).
- **Verification:** column exists, all rows show `'treelance'`, badge only renders for non-treelance.

---

## 5. LLM evaluation harness — Gemini + Mistral Small

### 5.1 Provider abstraction in `server/llm.ts`
- New env: `LLM_PROVIDER=openai|gemini|mistral` (default `openai`).
- New env: `GEMINI_API_KEY`, `GEMINI_MODEL` (e.g. `gemini-2.5-flash`), `MISTRAL_API_KEY`, `MISTRAL_MODEL=mistral-small-latest`.
- `getClient()` switches by provider. Mistral can use its OpenAI-compatible base URL (`https://api.mistral.ai/v1`) so it slots into the existing `OpenAI` SDK with zero code change beyond `baseURL`/`apiKey`. Gemini needs `@google/generative-ai` and a thin adapter that mimics the `chat.completions.create` shape we use.
- All public functions (`callLlm`, `callLlmWithMessages`, `callLlmWithVision`, `callLlmWithModelOverride`) keep their signatures — cascade and dossier code is untouched.
- `callLlmWithVision` may not work on Mistral v1 (limited vision support); document the fallback to OpenAI for vision OCR specifically.

### 5.2 Eval harness — `server/scripts/llm-eval.ts`
- **Run:** `tsx server/scripts/llm-eval.ts --pairs 20 --temps 0,0.3,0.7 --providers openai,gemini,mistral`.
- **Input:** picks N (role, candidate) pairs from `_matches` where `match_score` is high (proxy for "good ground truth"). Could also accept a hand-curated CSV later.
- **Output:** writes `eval-results-<timestamp>.csv` to repo root with columns `role_id, talent_id, provider, model, temperature, total_score, latency_ms, input_tokens, output_tokens, reasoning_snippet`.
- **What we compare:**
  - Score stability across providers (does Gemini rank candidates the same way as OpenAI?)
  - Latency
  - Cost (we have Gemini credits — useful to know how much they buy)
  - Reasoning quality (manual spot-check from the CSV)
- **Not in scope today:** auto-grading reasoning. Just collect data, eyeball results, decide whether Gemini can replace OpenAI as the default.

### 5.3 Gemini free credits note
Quentin confirmed $8600 MYR in free Gemini credits valid until **Dec 2026**. That is a meaningful runway for Step 1-5 batch scoring (which is most of the LLM cost). The eval tells us whether the quality tradeoff is acceptable.

---

## 6. Order of execution today

```
PHASE 0  →  Schema migration (Eric runs SQL once)
PHASE 1  →  Quick UI wins (tooltips, budget, close-job)         ~45 min
PHASE 2  →  Location bug fix                                     ~30 min
PHASE 3  →  WhatsApp wa.me link                                  ~20 min
PHASE 4  →  Candidate source field (badge only, no filter)       ~25 min
PHASE 5  →  Telemetry SDK + backend + wire-up                    ~2h
PHASE 6  →  Analytics viewer (KPI cards + tab time + funnel)     ~1.5h
PHASE 7  →  JD missing-info modal                                ~1.5h
PHASE 8  →  Prompt rewrites (bullets) — needs _prompts inspect   ~20 min
PHASE 9  →  Gemini + Mistral providers in llm.ts                 ~1h
PHASE 10 →  Eval harness script                                  ~45 min
```

Total: ~9h of focused work. Phases 1-4 can ship as one PR ("UI polish + source field"), 5-6 as another ("recruiter telemetry v1"), 7 as another ("JD missing-info flow"), 9-10 as another ("LLM eval kit"). Phase 8 piggybacks on whatever PR is touching prompts.

---

## 7. Blocked / out of scope today

- **NAT dashboard / Voice deploy** — need clarification on what `NAT` refers to and what `Voice` means in this context. Treat as Wednesday-or-later once Eric tells me. (Is NAT a person's account name? A branch? A separate dashboard for native English-speaking candidates? A backend service?)
- **"Buttons everywhere" prompt fix** — Eric flagged this as a different problem, ignoring for now.

---

## 8. Risks & open questions

1. **Telemetry under-recording on tab close.** `sendBeacon` is required (sync XHR is deprecated); browsers may drop the final batch occasionally. Acceptable in v1; document the limitation.
2. **Rage-click false positives in long-press / drag interactions.** Mitigation: ignore mousedowns where the target changes within the 1.5s window.
3. **Source filter deferred** — explicitly NOT filtering yet. Make sure the badge ships so we don't *forget* the filter when client ATS data lands.
4. **Mistral via OpenAI-compatible base URL** — most endpoints work but `response_format: { type: 'json_object' }` support varies. May need to fall back to manual JSON parsing for Mistral. The cascade's existing `parseBatchScores` already cleans markdown fencing, so it should degrade gracefully.
5. **No PII in telemetry props** — relies on discipline at every `capture()` call site. Easy to slip up; consider a runtime `props` sanitizer that strips strings looking like emails/phones if we end up adding many event types.
6. **Schema change applied via SQL editor, not a migration tool.** Standard for this project per existing pattern, but worth noting that rollback discipline is on us.

---

## 9. Done-checklist

Each item considered done only when verified end-to-end (see Verification lines above):

- [ ] SQL migration run, three tables/columns confirmed
- [ ] Tooltips appear on shortlisted/introduit badges
- [ ] Budget displays "/ mo" and defaults to USD
- [ ] Close-job button flips status, badge updates
- [ ] Location edit saves both city + country + legacy `location`
- [ ] WA button visible on shortlisted matches with phone, opens with prefilled message
- [ ] Candidate badge: existing rows show no badge (treelance), test row with `source='client_ats'` shows badge
- [ ] Telemetry SDK loaded, `app_loaded` event in `_telemetry_events`
- [ ] Tab switch produces `tab_time` event with non-zero `ms`
- [ ] Forced rage-click produces `rage_click` event
- [ ] Analytics tab renders, KPI numbers match raw SQL spot-checks
- [ ] JD upload with incomplete extraction shows modal, save persists
- [ ] Updated prompt produces bullet-formatted summaries on next JD ingest
- [ ] `LLM_PROVIDER=gemini` end-to-end: cascade Step 1 batch returns scores
- [ ] `LLM_PROVIDER=mistral` end-to-end: same
- [ ] `llm-eval.ts` writes a CSV with 3 providers × 3 temps × N pairs

---

*Last updated: 2026-05-28. This doc is the source of truth for today's work — every commit should map back to a section here.*
