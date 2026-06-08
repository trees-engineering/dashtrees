-- 0002 — Analytics overview RPC over _telemetry_events.
--
-- Read-only aggregation for the admin Analytics tab. Returns a single jsonb
-- blob assembling every dashboard section so the frontend loads with one RPC.
-- Adds a function only — no table/column changes. Safe to run and re-run.
--
-- Params:
--   p_days      : window size in days (bounded to >= 1; UI sends 7 | 30 | 90)
--   p_recruiter : recruiter_email to narrow to, or null for org-wide
--
-- Rollback:
--   drop function if exists analytics_overview(int, text);

create or replace function analytics_overview(
  p_days int default 30,
  p_recruiter text default null
)
returns jsonb
language sql
stable
as $$
  with base as (
    select *
    from _telemetry_events
    where ts >= now() - make_interval(days => greatest(p_days, 1))
      and (p_recruiter is null or recruiter_email = p_recruiter)
  )
  select jsonb_build_object(
    -- ── Summary tiles ──────────────────────────────────────────────────────
    'summary', (
      select jsonb_build_object(
        'total_events',      count(*),
        'sessions',          count(distinct session_id),
        'active_recruiters', count(distinct recruiter_email) filter (where recruiter_email is not null),
        'rage_clicks',       count(*) filter (where event_name = 'rage_click'),
        'dead_clicks',       count(*) filter (where event_name = 'dead_click'),
        'errors',            count(*) filter (where event_name in ('client_error','unhandled_rejection','operation_failed')),
        'avg_load_ms',       coalesce(round(avg((props->>'load_ms')::numeric) filter (where event_name = 'app_loaded' and props->>'load_ms' is not null)), 0)
      )
      from base
    ),
    -- ── Activity per day ───────────────────────────────────────────────────
    'by_day', coalesce((
      select jsonb_agg(d order by d.day)
      from (
        select date_trunc('day', ts)::date as day,
               count(*) as events,
               count(distinct session_id) as sessions
        from base
        group by 1
      ) d
    ), '[]'::jsonb),
    -- ── Tab engagement (views + dwell time) ────────────────────────────────
    'tabs', coalesce((
      select jsonb_agg(t)
      from (
        select props->>'tab' as tab,
               count(*) filter (where event_name = 'tab_viewed') as views,
               coalesce(sum((props->>'ms')::numeric) filter (where event_name = 'tab_time'), 0) as total_ms,
               coalesce(round(avg((props->>'ms')::numeric) filter (where event_name = 'tab_time')), 0) as avg_ms
        from base
        where event_name in ('tab_viewed','tab_time') and props->>'tab' is not null
        group by props->>'tab'
        order by views desc nulls last
      ) t
    ), '[]'::jsonb),
    -- ── Frustration signals by target ──────────────────────────────────────
    'frustration', coalesce((
      select jsonb_agg(f)
      from (
        select props->>'target' as target,
               case when event_name = 'rage_click' then 'rage' else 'dead' end as kind,
               count(*) as count
        from base
        where event_name in ('rage_click','dead_click') and props->>'target' is not null
        group by 1, 2
        order by count desc
        limit 25
      ) f
    ), '[]'::jsonb),
    -- ── Recent error feed ──────────────────────────────────────────────────
    'errors', coalesce((
      select jsonb_agg(e order by e.ts desc)
      from (
        select ts,
               recruiter_email as recruiter,
               event_name as name,
               left(coalesce(props->>'message', props->>'name', ''), 200) as message
        from base
        where event_name in ('client_error','unhandled_rejection','operation_failed')
        order by ts desc
        limit 50
      ) e
    ), '[]'::jsonb),
    -- ── Operation latency percentiles ──────────────────────────────────────
    'performance', coalesce((
      select jsonb_agg(p order by p.count desc)
      from (
        select props->>'name' as name,
               count(*) as count,
               round(percentile_cont(0.5)  within group (order by (props->>'ms')::numeric)) as p50_ms,
               round(percentile_cont(0.95) within group (order by (props->>'ms')::numeric)) as p95_ms
        from base
        where event_name in ('operation_completed','slow_operation')
          and props->>'ms' is not null and props->>'name' is not null
        group by props->>'name'
      ) p
    ), '[]'::jsonb),
    -- ── Scroll depth buckets per tab ───────────────────────────────────────
    'scroll', coalesce((
      select jsonb_agg(s)
      from (
        select props->>'tab' as tab,
               (props->>'pct')::int as pct,
               count(*) as count
        from base
        where event_name = 'scroll_depth' and props->>'pct' is not null
        group by 1, 2
        order by 1, 2
      ) s
    ), '[]'::jsonb)
  );
$$;
