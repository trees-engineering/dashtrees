# DashTrees — Analytics Dashboard, 2026-06-04

> Visualize the recruiter UX telemetry already landing in `_telemetry_events`.
> Aggregation lives in Postgres (one `analytics_overview` RPC returning jsonb);
> Express is a thin admin-gated passthrough; the browser renders Recharts.

---

## 0. Scope at a glance

| # | Item | Layer | Files / tables touched |
|---|---|---|---|
| 1 | `analytics_overview(p_days, p_recruiter)` RPC | DB | `Supabase/Migrations/0002_analytics_overview.sql` |
| 2 | `GET /api/analytics/overview` (admin-only) | API | `server/index.ts` |
| 3 | `fetchAnalyticsOverview` client + types | API | `src/lib/api.ts` |
| 4 | Recharts dependency | Build | `package.json` |
| 5 | `AnalyticsTab` + admin-only nav item | UI | `src/components/AnalyticsTab.tsx`, `src/App.tsx` |

**Out of scope today:** real-time/streaming, CSV export, per-session replay,
date-range picker beyond a `days` selector (7/30/90), funnel editor.

---

## 1. Design decisions

- **Aggregation in SQL, not Node.** GROUP BY / percentiles stay in Postgres so
  the table can grow without the server pulling raw rows. One `language sql`
  function returns a single jsonb blob; the server passes it straight through.
- **Admin-only reads.** The ingest endpoint (`/api/telemetry/batch`) is public,
  but *reading* behavior across recruiters is sensitive. The tab and the
  endpoint are both gated to `is_admin`. Scope follows the existing header
  dropdown: `recruiter=<email>` narrows to one recruiter, omitted = org-wide.
- **One round trip.** `analytics_overview` assembles every section so the tab
  loads with a single RPC. If a section gets heavy later we split it out.
- **`props` is jsonb, untyped.** We read it defensively: `props->>'tab'`,
  `(props->>'ms')::numeric`, `props->>'target'`, `props->>'name'`. Nulls are
  expected and filtered per-section.

---

## 2. DB migration — `0002_analytics_overview.sql`

A single function. `p_days` bounds the window (default 30); `p_recruiter`
narrows by email when non-null. Returns jsonb with these keys:

| Key | Shape | Source events |
|---|---|---|
| `summary` | one object: counts + avg load | all, `app_loaded` |
| `by_day` | `[{day, events, sessions}]` | all |
| `tabs` | `[{tab, views, total_ms, avg_ms}]` | `tab_viewed`, `tab_time` |
| `frustration` | `[{target, kind, count}]` | `rage_click`, `dead_click` |
| `errors` | `[{ts, recruiter, name, message}]` last 50 | `client_error`, `unhandled_rejection`, `operation_failed` |
| `performance` | `[{name, count, p50_ms, p95_ms}]` | `operation_completed`, `slow_operation` |
| `scroll` | `[{tab, pct, count}]` | `scroll_depth` |

```sql
-- 0002 — Analytics overview RPC over _telemetry_events.
-- Read-only aggregation. Safe to re-run (create or replace).
-- Rollback: drop function if exists analytics_overview(int, text);

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
    'summary', (
      select jsonb_build_object(
        'total_events',     count(*),
        'sessions',         count(distinct session_id),
        'active_recruiters',count(distinct recruiter_email) filter (where recruiter_email is not null),
        'rage_clicks',      count(*) filter (where event_name = 'rage_click'),
        'dead_clicks',      count(*) filter (where event_name = 'dead_click'),
        'errors',           count(*) filter (where event_name in ('client_error','unhandled_rejection','operation_failed')),
        'avg_load_ms',      coalesce(round(avg((props->>'load_ms')::numeric) filter (where event_name = 'app_loaded' and props->>'load_ms' is not null)), 0)
      )
      from base
    ),
    'by_day', coalesce((
      select jsonb_agg(d order by d.day)
      from (
        select date_trunc('day', ts)::date as day,
               count(*) as events,
               count(distinct session_id) as sessions
        from base group by 1
      ) d
    ), '[]'::jsonb),
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
    'performance', coalesce((
      select jsonb_agg(p order by p.count desc)
      from (
        select props->>'name' as name,
               count(*) as count,
               round(percentile_cont(0.5) within group (order by (props->>'ms')::numeric)) as p50_ms,
               round(percentile_cont(0.95) within group (order by (props->>'ms')::numeric)) as p95_ms
        from base
        where event_name in ('operation_completed','slow_operation')
          and props->>'ms' is not null and props->>'name' is not null
        group by props->>'name'
      ) p
    ), '[]'::jsonb),
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
```

**Note for Eric:** this migration only adds a function — no table/column
changes, safe to run and re-run. Run it in the Supabase SQL editor before the
backend deploy that calls it.

---

## 3. Server endpoint — `server/index.ts`

Admin-only. Validates `days` (7/30/90 allow-list, default 30) and optional
`recruiter` email, calls the RPC, returns the jsonb verbatim.

```ts
// ── Analytics: aggregated telemetry overview (admin-only) ────────────────────
app.get('/api/analytics/overview', authMiddleware, async (req, res) => {
  if (!req.auth!.isAdmin) { res.status(403).json({ error: 'admin only' }); return; }
  if (!supabase) { res.status(500).json({ error: 'database not configured' }); return; }

  const daysRaw = Number(req.query.days ?? 30);
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const recruiter = typeof req.query.recruiter === 'string' && req.query.recruiter
    ? req.query.recruiter : null;

  const { data, error } = await supabase.rpc('analytics_overview', {
    p_days: days, p_recruiter: recruiter,
  });
  if (error) {
    console.error('[analytics] rpc failed:', error.message);
    res.status(500).json({ error: 'analytics query failed' });
    return;
  }
  res.json({ overview: data });
});
```

---

## 4. Client — `src/lib/api.ts`

Typed `fetchAnalyticsOverview({ days, recruiterScope })`. Mirrors
`listSavedReports`: builds a querystring, sends auth headers, unwraps `overview`.

```ts
export interface AnalyticsOverview {
  summary: { total_events: number; sessions: number; active_recruiters: number;
    rage_clicks: number; dead_clicks: number; errors: number; avg_load_ms: number }
  by_day: { day: string; events: number; sessions: number }[]
  tabs: { tab: string; views: number; total_ms: number; avg_ms: number }[]
  frustration: { target: string; kind: 'rage' | 'dead'; count: number }[]
  errors: { ts: string; recruiter: string | null; name: string; message: string }[]
  performance: { name: string; count: number; p50_ms: number; p95_ms: number }[]
  scroll: { tab: string; pct: number; count: number }[]
}
// fetchAnalyticsOverview(days, recruiterScope?) → GET /api/analytics/overview
```

---

## 5. UI — `AnalyticsTab.tsx` + nav

- New `TabId 'analytics'`; nav item rendered **only when `isAdmin`** (filter
  `NAV_ITEMS`). Icon: `BarChart3` (lucide).
- Controls: `days` segmented control (7/30/90). Recruiter scope reuses the
  existing header dropdown (`recruiterFilter` prop, same as ReportsTab).
- Layout (top → bottom):
  1. **Stat tiles** — sessions, active recruiters, rage clicks, dead clicks,
     errors, avg load (reuse `StatCard` styling).
  2. **Activity** — Recharts `LineChart`: events + sessions per day.
  3. **Tab engagement** — `BarChart`: avg seconds per tab.
  4. **Frustration** 🐛 — ranked table by target, rage vs dead badge. The
     highest-signal view; put it above the fold-ish.
  5. **Performance** — table: op name, count, p50, p95 (ms).
  6. **Errors** — recent-feed list (ts · recruiter · name · message).
  7. **Scroll depth** — small stacked `BarChart` per tab (optional if noisy).
- Loading: skeleton pulse like ReportsTab. Empty: italic "No telemetry for this
  window." Errors fetching: red banner.
- Telemetry-on-telemetry: `telemetry.capture('analytics_viewed', { days, scope })`
  and `telemetry.timed('analytics_overview_fetch', …)` — dogfood the SDK.

---

## 6. Verification

- `npx tsc -b` clean (web) + `tsc -p tsconfig.server.json` clean (server).
- `vite build` succeeds with recharts in the bundle.
- Manual: as admin, open Analytics → tiles + charts populate; switch days /
  recruiter → refetches. As non-admin, nav item absent + endpoint 403s.
```
