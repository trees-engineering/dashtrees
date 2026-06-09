-- 0004 — Recruiter profile fields + role detailed description + role edition stamp.
--
-- (1) _recruiters: columns the Profile tab lets each recruiter manage. `name`
--     and `linkedin_url` already exist; `email` is immutable (Google login).
--     New: position / booking_link / about.
--
-- (2) _role.detailed_description: a richer, ~1000-word structured overview
--     generated at ingest — sits between the short `description` and the full
--     `raw_jd_text`. Populated by server/jd-import.ts. Existing roles stay null
--     until re-ingested.
--
-- (3) _role.updated_at: an edition timestamp bumped on every recruiter edit. The
--     matching cascade uses it to skip candidates already scored against the
--     current role version (re-score only new or stale matches). Backfilled to
--     created_at so existing, up-to-date matches aren't treated as stale.
--
-- Add column if not exists + a re-run-safe backfill. Safe to run and re-run.

alter table _recruiters
  add column if not exists position     text,
  add column if not exists booking_link text,
  add column if not exists about        text;

alter table _role
  add column if not exists detailed_description text;

alter table _role add column if not exists updated_at timestamptz;
update _role set updated_at = created_at where updated_at is null;
alter table _role alter column updated_at set default now();
