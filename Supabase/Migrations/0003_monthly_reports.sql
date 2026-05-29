-- 0003 — Monthly reports
--
-- DashTrees + Treelance share this Supabase project. Treelance's migration
-- 063 may already have created the base _monthly_report table; this
-- migration is fully idempotent and just adds the DashTrees-specific
-- recruiter_id scope column so non-admins can save their own reports
-- without colliding with admin / org-wide ones.
--
-- Reports are immutable HTML blobs:
--   - generate → insert row with html_content + filename
--   - list     → recruiter sees their own; admin sees all
--   - get      → download or inline preview
--   - delete   → drop the row
--
-- Rollback:
--   alter table _monthly_report drop column if exists recruiter_id;
--   (don't drop the table — Treelance owns it.)

create table if not exists _monthly_report (
  id              uuid primary key default gen_random_uuid(),
  client_label    text not null,
  workspace_id    text,
  period_year     smallint not null,
  period_month    smallint not null check (period_month between 1 and 12),
  period_label    text not null,
  filename        text not null,
  html_content    text not null,
  size_bytes      integer not null,
  generated_at    timestamptz not null default now()
);

-- DashTrees-specific scope. NULL = org-wide (admin, "All recruiters").
-- Set = scoped to one recruiter's roles/matches/talent pool.
alter table _monthly_report
  add column if not exists recruiter_id uuid;

create index if not exists idx_monthly_report_period
  on _monthly_report (period_year desc, period_month desc, generated_at desc);

create index if not exists idx_monthly_report_generated_at
  on _monthly_report (generated_at desc);

create index if not exists idx_monthly_report_recruiter
  on _monthly_report (recruiter_id, generated_at desc);
