-- Persisted candidate shortlists per role.
-- One row per (role, talent) pair — unique so duplicate toggles are idempotent.
-- recruiter_id tracks who added the entry; null-safe on recruiter deletion.

create table if not exists _shortlists (
  id           uuid        primary key default gen_random_uuid(),
  role_id      uuid        not null references _role(id)       on delete cascade,
  talent_id    uuid        not null references _talent(id)     on delete cascade,
  recruiter_id uuid                    references _recruiters(id) on delete set null,
  created_at   timestamptz not null default now(),

  unique (role_id, talent_id)
);

create index if not exists _shortlists_role_id_idx      on _shortlists (role_id);
create index if not exists _shortlists_talent_id_idx    on _shortlists (talent_id);
create index if not exists _shortlists_recruiter_id_idx on _shortlists (recruiter_id);
