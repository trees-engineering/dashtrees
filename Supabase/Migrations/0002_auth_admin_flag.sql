-- 0002 — Auth: admin flag for recruiters
--
-- Adds:
--   - _recruiters.is_admin : boolean, default false. Marks the two Trees
--     Engineering operators who see every recruiter's roles in the
--     dashboard. Everyone else is scoped to roles they created.
--
-- Used by the frontend auth gate (src/lib/auth.ts):
--   1. Supabase Google OAuth populates auth.users.email
--   2. Frontend looks up _recruiters by email (case-insensitive)
--   3. row + is_admin=true  → dropdown visible, "All recruiters" default
--      row + is_admin=false → dropdown hidden, filter locked to own email
--      no row               → NoAccess screen ("join Treelance" CTA)
--
-- The lower(email) index keeps the per-login lookup cheap as the
-- recruiter table grows.
--
-- Rollback:
--   drop index if exists idx_recruiters_email_lower;
--   alter table _recruiters drop column if exists is_admin;

alter table _recruiters
  add column if not exists is_admin boolean not null default false;

update _recruiters
  set is_admin = true
  where lower(email) in (
    'eric@trees-engineering.com',
    'quentin@trees-engineering.com'
  );

create index if not exists idx_recruiters_email_lower
  on _recruiters (lower(email));
