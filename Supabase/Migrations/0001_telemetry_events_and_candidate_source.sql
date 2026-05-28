-- 0001 — Recruiter UX telemetry table + candidate source field
--
-- Adds:
--   - _telemetry_events : per-event row written by the in-house telemetry SDK
--     (src/lib/telemetry.ts) via POST /api/telemetry/batch. One row per
--     captured event; props is jsonb, no PII.
--   - _talent.source    : 'treelance' (default) | 'client_ats' | 'manual' | ...
--     Lets us separate Treelance-sourced candidates from client-ATS imports
--     during matching so the two databases never cross-contaminate.
--
-- Rollback:
--   drop table if exists _telemetry_events;
--   alter table _talent drop column if exists source;

-- ── Telemetry event store ───────────────────────────────────────────────────
create table if not exists _telemetry_events (
  id              uuid primary key default gen_random_uuid(),
  ts              timestamptz not null default now(),
  client_ts       timestamptz,
  session_id      text not null,
  recruiter_id    uuid,
  recruiter_email text,
  event_name      text not null,
  path            text,
  props           jsonb not null default '{}'::jsonb,
  user_agent      text,
  viewport_w      int,
  viewport_h      int
);

create index if not exists idx_telemetry_ts        on _telemetry_events (ts desc);
create index if not exists idx_telemetry_recruiter on _telemetry_events (recruiter_email, ts desc);
create index if not exists idx_telemetry_event     on _telemetry_events (event_name, ts desc);
create index if not exists idx_telemetry_session   on _telemetry_events (session_id, ts);

-- ── Candidate source field ──────────────────────────────────────────────────
-- Free-text (not enum) so adding a new source category is just an UPDATE, no
-- migration. Existing rows are backfilled to 'treelance' by the default.
alter table _talent add column if not exists source text not null default 'treelance';
create index if not exists idx_talent_source on _talent (source);
