-- Structured location for _role: parallel city[] / country[] arrays
-- (index-aligned, e.g. city['Kuala Lumpur','Paris'] + country['Malaysia','France']).
-- Replaces the free-form location_regions field in the role edit UI.
-- location_regions is kept (deprecated) for back-compat — no data is dropped.
alter table public._role
  add column if not exists city    text[],
  add column if not exists country text[];

-- ── Teach the role_extraction prompt to emit the new fields ──
-- Surgical injection into the JSON output schema so the rest of the ~19kB
-- prompt is untouched. Guarded so re-running is a no-op (the `"city":` check
-- prevents a double-insert) and so it only fires when the anchor is present.
update public._prompts
set text = replace(
      text,
      '"location_regions": ["region1", "region2"],',
      '"location_regions": ["region1", "region2"],'
        || E'\n  "city": ["work-location city, index-aligned with country (e.g. Kuala Lumpur, Paris). [] if not stated"],'
        || E'\n  "country": ["work-location country, index-aligned with city (e.g. Malaysia, France). [] if not stated"],'
    ),
    updated_at = now()
where key = 'role_extraction'
  and text like '%"location_regions": ["region1", "region2"],%'
  and text not like '%"city":%';
