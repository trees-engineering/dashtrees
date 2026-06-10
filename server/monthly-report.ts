// Monthly database report generator (HTML). Ported from Treelance's
// src/api/monthly-report.ts, white-labelled for Trees Engineering and
// extended with per-recruiter scoping:
//
//   - recruiterId = null → org-wide report (admin "All recruiters")
//   - recruiterId set    → only roles created_by that recruiter, only
//                          matches on those roles, only talents in those
//                          matches, only conversations with those talents.
//
// The HTML is self-contained: the Trees Engineering logo is inlined as a
// base64 data URI so a downloaded file works offline.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { supabase } from './db.js';

const CLIENT_LABEL = 'Trees Engineering';
const WORKSPACE_ID = 'TREES-MY-01';
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Logo: read once, cache the data URI. Looked up under public/ which is the
// Vite/static asset folder. If the file is missing, an empty src is rendered
// (browser shows a broken-image icon, but the rest of the report is fine).
let cachedLogo: string | null = null;
function getLogoDataUri(): string {
  if (cachedLogo != null) return cachedLogo;
  // Vite copies public/* → dist/* at build time, so prod paths live under
  // dist/. Check both so dev and prod work without a separate config.
  const candidates = [
    'public/icons/Trees_logo.jpeg',
    'public/Trees_logo.jpeg',
    'dist/icons/Trees_logo.jpeg',
    'dist/Trees_logo.jpeg',
  ];
  for (const rel of candidates) {
    try {
      const buf = readFileSync(path.resolve(process.cwd(), rel));
      cachedLogo = `data:image/jpeg;base64,${buf.toString('base64')}`;
      return cachedLogo;
    } catch {
      // try next candidate
    }
  }
  console.warn('[monthly-report] Trees logo not found under public/; report will render without it');
  cachedLogo = '';
  return cachedLogo;
}

// ── Period helpers ──────────────────────────────────────────────────────────
export type Period = {
  year: number;
  month: number;          // 1-12
  monthLabel: string;     // "April 2026"
  start: string;          // ISO of first day 00:00 UTC
  end: string;            // ISO of next month's first day 00:00 UTC (exclusive)
  prevStart: string;      // start of month before, for delta
  prevEnd: string;        // = start
  issuedLabel: string;    // "1 May 2026"
  refreshedLabel: string; // "30 Apr 2026 23:59 MYT"
};

export function previousMonthPeriod(now: Date = new Date()): Period {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const py = m === 0 ? y - 1 : y;
  const pm = m === 0 ? 11 : m - 1;
  const start = new Date(Date.UTC(py, pm, 1));
  const end = new Date(Date.UTC(py, pm + 1, 1));
  const prevStart = new Date(Date.UTC(py, pm - 1, 1));
  const lastDay = new Date(Date.UTC(py, pm + 1, 0));
  return {
    year: py,
    month: pm + 1,
    monthLabel: `${MONTHS[pm]} ${py}`,
    start: start.toISOString(),
    end: end.toISOString(),
    prevStart: prevStart.toISOString(),
    prevEnd: start.toISOString(),
    issuedLabel: `${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`,
    refreshedLabel: `${lastDay.getUTCDate()} ${MONTHS[pm].slice(0, 3)} ${py} 23:59 MYT`,
  };
}

// ── Data shapes ─────────────────────────────────────────────────────────────
type Bar = { label: string; count: number; pct: number };
type RoleRow = {
  title: string;
  location: string;
  matches: number;
  asap: number;
  in30d: number;
  in90d: number;
  pipeline: number;
};

type Stats = {
  period: Period;
  scope: { recruiterName: string | null };
  totals: {
    profiles: number;
    profilesDeltaPct: number | null;
    newThisMonth: number;
    newDeltaPct: number | null;
    active90d: number;
    active90dPct: number;
    inactive: number;
    inactivePct: number;
    reachedByTreelance: number;
    reachedDeltaPct: number | null;
    intros: number;
    introsConfirmed: number;
  };
  activity: {
    profilesUpdated: number;
    botReplyRatePct: number | null;
    avgReplyTime: string | null;
    docsRenewed: number | null;
    docsExpiring30d: number | null;
  };
  byDiscipline: Bar[];
  byCountry: Bar[];
  currentlyInMy: { count: number; pct: number };
  bySeniority: Bar[];
  byContract: Bar[] | null;
  byLanguage: Bar[];
  deployability: { asap: number | null; in30d: number | null; in90d: number | null };
  openRoles: RoleRow[];
  rolesAggregate: { matches: number; asap: number; in30d: number; in90d: number; pipeline: number; openCount: number };
  botIntel: {
    convsOpened: number;
    repliesReceived: number;
    replyRatePct: number | null;
    avgReplyTime: string | null;
    topLanguage: string | null;
    mostUpdatedField: string | null;
    cvReuploads: number | null;
    certRenewalsConfirmed: number | null;
    workersPaused: number | null;
    netActive90d: number | null;
  };
};

// ── Fetch helpers ───────────────────────────────────────────────────────────
async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  if (!supabase) return [];
  const PAGE = 1000;
  const out: T[] = [];
  for (let start = 0; start < 200_000; start += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(start, start + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

// ── Row types pulled from Supabase ──────────────────────────────────────────
type TalentRow = {
  id: string;
  created_at: string;
  last_active_at: string | null;
  lifecycle_state: string | null;
  country: string | null;
  city: string | null;
  discipline: string | null;
  job_family: string | null;
  tl_band: number | null;
  languages: string[] | null;
  availability_status: string | null;
  available_from: string | null;
  notice_period_days: number | null;
};

type RoleSimple = {
  id: string;
  title: string;
  location_regions: string[] | null;
  city: string[] | null;
  country: string[] | null;
  status: string;
  created_at: string;
  created_by: string | null;
};

type MatchSimple = {
  id: string;
  role_id: string;
  talent_id: string;
  status: string;
  match_score: number | null;
  created_at: string;
};

type ConvRow = {
  talent_id: string;
  direction: string;
  created_at: string;
};

const SENIORITY_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: 'Junior · 0–3 y',  min: 0, max: 1 },
  { label: 'Mid · 3–7 y',     min: 2, max: 3 },
  { label: 'Senior · 7–15 y', min: 4, max: 5 },
  { label: 'Expert · 15 y +', min: 6, max: 7 },
];

function bucketize(map: Map<string, number>, total: number, top: number): Bar[] {
  const arr: Bar[] = [...map.entries()]
    .map(([label, count]) => ({ label, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }));
  arr.sort((a, b) => b.count - a.count);
  return arr.slice(0, top);
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

// Display location for a role. Prefers the structured, index-aligned city/country
// arrays ("City, Country" per location, joined by " · "); falls back to the
// deprecated location_regions for roles imported before the split (not backfilled).
function roleLocation(r: RoleSimple): string {
  const cities = r.city ?? [];
  const countries = r.country ?? [];
  if (cities.length > 0 || countries.length > 0) {
    const n = Math.max(cities.length, countries.length);
    const pairs: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = [cities[i], countries[i]].filter(Boolean).join(', ');
      if (part) pairs.push(part);
    }
    if (pairs.length > 0) return pairs.join(' · ');
  }
  const regions = r.location_regions ?? [];
  return regions.length > 0 ? regions.join(', ') : '—';
}

// ── Stats aggregation (scoped by recruiterId, null = org-wide) ──────────────
async function buildStats(period: Period, recruiterId: string | null, recruiterName: string | null): Promise<Stats> {
  if (!supabase) throw new Error('DB not configured');

  const [allTalents, allRoles, allMatches, allConvs] = await Promise.all([
    fetchAll<TalentRow>('_talent', 'id, created_at, last_active_at, lifecycle_state, country, city, discipline, job_family, tl_band, languages, availability_status, available_from, notice_period_days'),
    fetchAll<RoleSimple>('_role', 'id, title, location_regions, city, country, status, created_at, created_by'),
    fetchAll<MatchSimple>('_matches', 'id, role_id, talent_id, status, match_score, created_at'),
    fetchAll<ConvRow>('_conversation', 'talent_id, direction, created_at'),
  ]);

  // Apply recruiter scope. Filter roles → matches restricted to those roles
  // → talents restricted to talent_ids in those matches → conversations
  // restricted to those talents.
  let roles: RoleSimple[] = allRoles;
  let matches: MatchSimple[] = allMatches;
  let talents: TalentRow[] = allTalents;
  let convs: ConvRow[] = allConvs;
  if (recruiterId) {
    roles = allRoles.filter(r => r.created_by === recruiterId);
    const myRoleIds = new Set(roles.map(r => r.id));
    matches = allMatches.filter(m => myRoleIds.has(m.role_id));
    const myTalentIds = new Set(matches.map(m => m.talent_id));
    talents = allTalents.filter(t => myTalentIds.has(t.id));
    convs = allConvs.filter(c => myTalentIds.has(c.talent_id));
  }

  const startMs = Date.parse(period.start);
  const endMs = Date.parse(period.end);
  const prevStartMs = Date.parse(period.prevStart);
  const ninetyDaysAgoMs = endMs - 90 * 86400_000;

  // ── Totals
  const profilesAtPeriodEnd = talents.filter(t => Date.parse(t.created_at) < endMs).length;
  const profilesAtPrevEnd = talents.filter(t => Date.parse(t.created_at) < startMs).length;
  const newThisMonth = talents.filter(t => {
    const c = Date.parse(t.created_at);
    return c >= startMs && c < endMs;
  }).length;
  const newPrevMonth = talents.filter(t => {
    const c = Date.parse(t.created_at);
    return c >= prevStartMs && c < startMs;
  }).length;

  const convsByTalent = new Map<string, number>();
  const lastConvByTalent = new Map<string, number>();
  for (const c of convs) {
    const ms = Date.parse(c.created_at);
    if (ms >= endMs) continue;
    const prev = lastConvByTalent.get(c.talent_id) ?? 0;
    if (ms > prev) lastConvByTalent.set(c.talent_id, ms);
    if (c.direction === 'inbound') convsByTalent.set(c.talent_id, (convsByTalent.get(c.talent_id) ?? 0) + 1);
  }

  let active90d = 0;
  for (const t of talents) {
    if (Date.parse(t.created_at) >= endMs) continue;
    const lastActive = t.last_active_at ? Date.parse(t.last_active_at) : (lastConvByTalent.get(t.id) ?? 0);
    if (lastActive >= ninetyDaysAgoMs) active90d++;
  }
  const inactive = profilesAtPeriodEnd - active90d;

  const reachedThisMonth = new Set<string>();
  const reachedPrevMonth = new Set<string>();
  let repliesReceivedInMonth = 0;
  let outboundInMonth = 0;
  const reply_deltas_ms: number[] = [];
  const byTalent = new Map<string, ConvRow[]>();
  for (const c of convs) {
    const arr = byTalent.get(c.talent_id) ?? [];
    arr.push(c);
    byTalent.set(c.talent_id, arr);
  }
  for (const list of byTalent.values()) {
    list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    let lastOutboundMs: number | null = null;
    for (const c of list) {
      const ms = Date.parse(c.created_at);
      const inMonth = ms >= startMs && ms < endMs;
      const inPrev = ms >= prevStartMs && ms < startMs;
      if (c.direction === 'outbound') {
        lastOutboundMs = ms;
        if (inMonth) { outboundInMonth++; reachedThisMonth.add(c.talent_id); }
        if (inPrev) reachedPrevMonth.add(c.talent_id);
      } else if (c.direction === 'inbound') {
        if (inMonth) {
          repliesReceivedInMonth++;
          if (lastOutboundMs !== null) reply_deltas_ms.push(ms - lastOutboundMs);
        }
      }
    }
  }
  const convsOpened = outboundInMonth;

  const intros = matches.filter(m => {
    const c = Date.parse(m.created_at);
    return c >= startMs && c < endMs && ['introduced', 'shortlisted', 'accepted', 'hired'].includes(m.status);
  }).length;
  const introsConfirmed = matches.filter(m => {
    const c = Date.parse(m.created_at);
    return c >= startMs && c < endMs && ['accepted', 'hired'].includes(m.status);
  }).length;

  const totals: Stats['totals'] = {
    profiles: profilesAtPeriodEnd,
    profilesDeltaPct: pctDelta(profilesAtPeriodEnd, profilesAtPrevEnd),
    newThisMonth,
    newDeltaPct: pctDelta(newThisMonth, newPrevMonth),
    active90d,
    active90dPct: profilesAtPeriodEnd > 0 ? Math.round((active90d / profilesAtPeriodEnd) * 100) : 0,
    inactive,
    inactivePct: profilesAtPeriodEnd > 0 ? Math.round((inactive / profilesAtPeriodEnd) * 100) : 0,
    reachedByTreelance: reachedThisMonth.size,
    reachedDeltaPct: pctDelta(reachedThisMonth.size, reachedPrevMonth.size),
    intros,
    introsConfirmed,
  };

  const replyRate = outboundInMonth > 0 ? Math.round((repliesReceivedInMonth / outboundInMonth) * 100) : null;
  let avgReplyTime: string | null = null;
  if (reply_deltas_ms.length > 0) {
    const avgMs = reply_deltas_ms.reduce((a, b) => a + b, 0) / reply_deltas_ms.length;
    const hours = Math.floor(avgMs / 3_600_000);
    const mins = Math.floor((avgMs % 3_600_000) / 60_000);
    avgReplyTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  const updatedSet = new Set<string>();
  for (const c of convs) {
    const ms = Date.parse(c.created_at);
    if (ms >= startMs && ms < endMs && c.direction === 'inbound') updatedSet.add(c.talent_id);
  }

  const activity: Stats['activity'] = {
    profilesUpdated: updatedSet.size,
    botReplyRatePct: replyRate,
    avgReplyTime,
    docsRenewed: null,
    docsExpiring30d: null,
  };

  // Demographics — snapshot at end of period
  const talentsAtPeriod = talents.filter(t => Date.parse(t.created_at) < endMs);
  const totalAtPeriod = talentsAtPeriod.length;

  const discMap = new Map<string, number>();
  for (const t of talentsAtPeriod) {
    if (t.discipline) discMap.set(t.discipline, (discMap.get(t.discipline) ?? 0) + 1);
  }
  const byDiscipline = bucketize(discMap, totalAtPeriod, 11);

  const countryMap = new Map<string, number>();
  for (const t of talentsAtPeriod) {
    if (t.country) countryMap.set(t.country, (countryMap.get(t.country) ?? 0) + 1);
  }
  const byCountry = bucketize(countryMap, totalAtPeriod, 10);

  const inMyCount = talentsAtPeriod.filter(t => /malaysia|^my$/i.test(t.country ?? '')).length;
  const currentlyInMy = {
    count: inMyCount,
    pct: totalAtPeriod > 0 ? Math.round((inMyCount / totalAtPeriod) * 100) : 0,
  };

  const senMap = new Map<string, number>();
  for (const t of talentsAtPeriod) {
    if (t.tl_band == null) continue;
    const bucket = SENIORITY_BUCKETS.find(b => t.tl_band! >= b.min && t.tl_band! <= b.max);
    if (bucket) senMap.set(bucket.label, (senMap.get(bucket.label) ?? 0) + 1);
  }
  const bySeniority: Bar[] = SENIORITY_BUCKETS
    .map(b => ({ label: b.label, count: senMap.get(b.label) ?? 0 }))
    .map(x => ({ ...x, pct: totalAtPeriod > 0 ? Math.round((x.count / totalAtPeriod) * 100) : 0 }));

  const byContract: Bar[] | null = null;

  const langMap = new Map<string, number>();
  for (const t of talentsAtPeriod) {
    if (!Array.isArray(t.languages)) continue;
    for (const raw of t.languages) {
      if (typeof raw !== 'string') continue;
      const l = raw.trim();
      if (!l) continue;
      langMap.set(l, (langMap.get(l) ?? 0) + 1);
    }
  }
  const byLanguage = bucketize(langMap, totalAtPeriod, 5);

  // Deployability
  let asap = 0, in30d = 0, in90d = 0;
  const asapDeadline = endMs + 7 * 86400_000;
  const m30Deadline  = endMs + 30 * 86400_000;
  const m90Deadline  = endMs + 90 * 86400_000;
  let anyDeployabilityData = false;
  for (const t of talentsAtPeriod) {
    if (!t.availability_status && !t.available_from) continue;
    anyDeployabilityData = true;
    const fromMs = t.available_from ? Date.parse(t.available_from) : endMs;
    if (t.availability_status === 'yes' && fromMs <= asapDeadline) asap++;
    else if (fromMs <= m30Deadline) in30d++;
    else if (fromMs <= m90Deadline) in90d++;
  }
  const deployability = anyDeployabilityData
    ? { asap, in30d, in90d }
    : { asap: null, in30d: null, in90d: null };

  // Open roles + matches per role
  const openRoles = roles.filter(r => r.status === 'open');
  const matchesByRole = new Map<string, MatchSimple[]>();
  for (const m of matches) {
    if ((m.match_score ?? 0) < 70) continue;
    const arr = matchesByRole.get(m.role_id) ?? [];
    arr.push(m);
    matchesByRole.set(m.role_id, arr);
  }
  const talentById = new Map(talentsAtPeriod.map(t => [t.id, t] as const));
  const roleRows: RoleRow[] = [];
  let totMatches = 0, totAsap = 0, totM1 = 0, totM3 = 0, totPipe = 0;
  for (const r of openRoles) {
    const list = matchesByRole.get(r.id) ?? [];
    let rAsap = 0, rM1 = 0, rM3 = 0, rPipe = 0;
    for (const m of list) {
      const t = talentById.get(m.talent_id);
      if (t) {
        const fromMs = t.available_from ? Date.parse(t.available_from) : endMs;
        if (t.availability_status === 'yes' && fromMs <= asapDeadline) rAsap++;
        else if (fromMs <= m30Deadline) rM1++;
        else if (fromMs <= m90Deadline) rM3++;
      }
      if (['introduced', 'shortlisted', 'accepted', 'hired'].includes(m.status)) rPipe++;
    }
    const loc = roleLocation(r);
    roleRows.push({
      title: r.title || '(untitled role)',
      location: loc,
      matches: list.length,
      asap: rAsap,
      in30d: rM1,
      in90d: rM3,
      pipeline: rPipe,
    });
    totMatches += list.length; totAsap += rAsap; totM1 += rM1; totM3 += rM3; totPipe += rPipe;
  }
  roleRows.sort((a, b) => b.matches - a.matches);
  const rolesAggregate = {
    matches: totMatches,
    asap: totAsap,
    in30d: totM1,
    in90d: totM3,
    pipeline: totPipe,
    openCount: openRoles.length,
  };

  const botIntel: Stats['botIntel'] = {
    convsOpened,
    repliesReceived: repliesReceivedInMonth,
    replyRatePct: replyRate,
    avgReplyTime,
    topLanguage: byLanguage[0] ? `${byLanguage[0].label} · ${byLanguage[0].pct}%` : null,
    mostUpdatedField: null,
    cvReuploads: null,
    certRenewalsConfirmed: null,
    workersPaused: null,
    netActive90d: null,
  };

  return {
    period,
    scope: { recruiterName },
    totals,
    activity,
    byDiscipline,
    byCountry,
    currentlyInMy,
    bySeniority,
    byContract,
    byLanguage,
    deployability,
    openRoles: roleRows,
    rolesAggregate,
    botIntel,
  };
}

// ── HTML rendering ──────────────────────────────────────────────────────────
function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch] as string));
}

function renderBars(rows: Bar[], goldFill = false): string {
  if (rows.length === 0) return '<div class="row" style="color:#9ca3af;font-style:italic;font-size:8pt">— no data tracked yet —</div>';
  const max = Math.max(...rows.map(r => r.count), 1);
  return rows.map(r => {
    const w = Math.max(2, Math.round((r.count / max) * 100));
    return `<div class="row"><div class="lbl">${escapeHtml(r.label)}</div><div class="bar"><div class="fill${goldFill ? ' gold' : ''}" style="width:${w}%"></div></div><div class="v">${fmt(r.count)} <span class="pct">${r.pct}%</span></div></div>`;
  }).join('');
}

function renderRoleRow(r: RoleRow): string {
  return `<tr>
        <td><div class="role">${escapeHtml(r.title)}</div><div class="loc">${escapeHtml(r.location)}</div></td>
        <td class="num">${fmt(r.matches)}</td>
        <td class="num"><span class="chip asap">${fmt(r.asap)}</span></td>
        <td class="num"><span class="chip m1">${fmt(r.in30d)}</span></td>
        <td class="num"><span class="chip m3">${fmt(r.in90d)}</span></td>
        <td class="num">${fmt(r.pipeline)}</td>
      </tr>`;
}

function renderHtml(stats: Stats): string {
  const p = stats.period;
  const t = stats.totals;
  const a = stats.activity;
  const b = stats.botIntel;
  const logo = getLogoDataUri();
  const scopeLabel = stats.scope.recruiterName
    ? `Recruiter scope · ${stats.scope.recruiterName}`
    : 'Org-wide · All recruiters';

  const newDelta = t.newDeltaPct == null ? '—' : `${t.newDeltaPct > 0 ? '↑ +' : ''}${t.newDeltaPct}% vs prev. month`;
  const newDeltaCls = t.newDeltaPct == null ? 'flat' : (t.newDeltaPct > 0 ? '' : (t.newDeltaPct < 0 ? 'down' : 'flat'));
  const profilesDelta = t.profilesDeltaPct == null ? '—' : `${t.profilesDeltaPct > 0 ? '↑ +' : ''}${t.profilesDeltaPct}% vs prev. month`;
  const profilesDeltaCls = t.profilesDeltaPct == null ? 'flat' : (t.profilesDeltaPct > 0 ? '' : (t.profilesDeltaPct < 0 ? 'down' : 'flat'));
  const reachedDelta = t.reachedDeltaPct == null ? '—' : `${t.reachedDeltaPct > 0 ? '↑ +' : ''}${t.reachedDeltaPct}% vs prev. month`;
  const reachedDeltaCls = t.reachedDeltaPct == null ? 'flat' : (t.reachedDeltaPct > 0 ? '' : (t.reachedDeltaPct < 0 ? 'down' : 'flat'));

  const openCount = stats.rolesAggregate.openCount;
  const totMatched = stats.rolesAggregate.matches;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${CLIENT_LABEL} — Monthly Database Report — ${p.monthLabel}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=IBM+Plex+Serif:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --blue:#01195b; --blue-2:#0a2a8a; --blue-soft:#eef1f9; --blue-line:#cfd6ec;
    --gold:#9e690b; --gold-soft:#f7ecd1; --gold-line:#e6cf91;
    --ink:#0b1430; --ink-2:#374151; --muted:#6b7280; --line:#e5e7eb; --bg:#f8f8f6;
    --green:#117a3d; --amber:#b45309; --red:#9a1c1c; --white:#ffffff;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--ink);background:var(--bg);font-size:9.5pt;line-height:1.4;-webkit-font-smoothing:antialiased;}
  @page{ size:A4; margin:9mm 11mm; }
  .sheet{width:210mm;min-height:297mm;margin:0 auto 14px;background:var(--white);padding:12mm 12mm 9mm;box-shadow:0 2px 14px rgba(11,20,48,.07);page-break-after:always;position:relative;}
  .sheet:last-child{page-break-after:auto;margin-bottom:0}
  @media print{body{background:white}.sheet{box-shadow:none;margin:0;padding:0;width:auto;min-height:auto}}
  .top{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:8pt;border-bottom:1.5pt solid var(--blue);margin-bottom:10pt;}
  .top .left{display:flex;align-items:center;gap:10pt}
  .logo{height:38pt;width:auto;display:block;}
  .brand-stack .by{color:var(--muted);font-size:7.5pt;letter-spacing:.08em;text-transform:uppercase;font-weight:500;}
  .brand-stack .doc-title{font-family:'IBM Plex Serif',serif;color:var(--blue);font-size:14pt;font-weight:500;line-height:1.15;margin-top:1pt;}
  .top .right{text-align:right;}
  .client-pill{display:inline-block;background:var(--blue);color:var(--white);font-weight:700;letter-spacing:.06em;font-size:10pt;padding:5pt 10pt 4pt;border-radius:3pt;}
  .period{color:var(--ink-2);font-size:8.5pt;margin-top:5pt;font-weight:500;}
  .period .of{color:var(--muted);font-weight:400}
  .meta-line{color:var(--muted);font-size:7pt;margin-top:2pt;letter-spacing:.04em;text-transform:uppercase;}
  .h{font-family:'IBM Plex Serif',serif;color:var(--blue);font-size:11pt;font-weight:500;margin:9pt 0 5pt;display:flex;align-items:baseline;gap:6pt;}
  .h::before{content:"";width:14pt;height:1.5pt;background:var(--gold);display:inline-block;transform:translateY(-2pt);}
  .h .sub{margin-left:auto;color:var(--muted);font-family:'Inter',sans-serif;font-weight:400;font-size:7.5pt;letter-spacing:.04em;text-transform:uppercase;}
  .kpi-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:5pt;margin-bottom:6pt;}
  .kpi{background:var(--white);border:1pt solid var(--line);border-top:2pt solid var(--blue);padding:7pt 8pt 6pt;border-radius:2pt;}
  .kpi.gold{border-top-color:var(--gold)}
  .kpi.muted{border-top-color:var(--muted)}
  .kpi .lbl{color:var(--muted);font-size:7pt;letter-spacing:.06em;text-transform:uppercase;font-weight:500;line-height:1.2;}
  .kpi .num{color:var(--blue);font-size:17pt;font-weight:700;line-height:1.05;margin-top:3pt;font-variant-numeric:tabular-nums;}
  .kpi.gold .num{color:var(--gold)}
  .kpi .delta{font-size:7pt;margin-top:2pt;color:var(--green);font-weight:600;}
  .kpi .delta.down{color:var(--red)}
  .kpi .delta.flat{color:var(--muted)}
  .act-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5pt;margin-bottom:6pt;}
  .act{background:var(--blue-soft);border:1pt solid var(--blue-line);padding:6pt 8pt;border-radius:2pt;display:flex;align-items:baseline;justify-content:space-between;gap:8pt;}
  .act .label{color:var(--blue);font-size:7.5pt;font-weight:600;letter-spacing:.02em;}
  .act .v{color:var(--blue);font-size:11pt;font-weight:700;font-variant-numeric:tabular-nums;}
  .act .v small{font-size:7pt;color:var(--muted);font-weight:500;margin-left:2pt}
  .demo-grid{display:grid;grid-template-columns:1.15fr 1fr 0.9fr;gap:8pt;}
  .demo-col{background:var(--white);border:1pt solid var(--line);padding:7pt 8pt 6pt;border-radius:2pt;}
  .col-title{font-size:8pt;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5pt;padding-bottom:3pt;border-bottom:0.5pt solid var(--gold);display:flex;justify-content:space-between;align-items:baseline;}
  .col-title .total{color:var(--muted);font-weight:500;font-size:7pt;letter-spacing:.04em;}
  .row{display:grid;grid-template-columns:74pt 1fr 56pt;align-items:center;gap:6pt;margin-bottom:3pt;font-size:8pt;}
  .row .lbl{color:var(--ink);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .row .bar{height:5pt;background:var(--blue-soft);border-radius:3pt;overflow:hidden;position:relative;}
  .row .fill{height:100%;background:linear-gradient(90deg,var(--blue) 0%,var(--blue-2) 100%);border-radius:3pt;}
  .row .fill.gold{background:linear-gradient(90deg,var(--gold) 0%,#c08416 100%);}
  .row .v{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink-2);font-weight:600;}
  .row .v .pct{color:var(--muted);font-weight:500;margin-left:3pt;font-size:7pt;}
  .deploy{display:grid;grid-template-columns:repeat(3,1fr);gap:6pt;margin-bottom:5pt;}
  .deploy .card{background:var(--blue);color:var(--white);padding:9pt 10pt;border-radius:3pt;position:relative;overflow:hidden;}
  .deploy .card.mid{background:#012680}
  .deploy .card.late{background:#0a3199}
  .deploy .tag{color:var(--gold-soft);font-size:7pt;letter-spacing:.08em;text-transform:uppercase;font-weight:600;}
  .deploy .num{color:var(--white);font-size:22pt;font-weight:800;font-variant-numeric:tabular-nums;line-height:1;margin-top:3pt;}
  .deploy .desc{color:rgba(255,255,255,.78);font-size:7.5pt;margin-top:3pt;line-height:1.3;}
  .deploy .desc strong{color:var(--gold-soft);font-weight:600}
  table.req{width:100%;border-collapse:collapse;margin-top:3pt;font-size:8pt;}
  table.req thead th{background:var(--blue-soft);color:var(--blue);text-align:left;font-weight:700;font-size:7pt;letter-spacing:.05em;text-transform:uppercase;padding:5pt 6pt;border-bottom:1pt solid var(--blue-line);}
  table.req thead th.num{text-align:right}
  table.req tbody td{padding:5pt 6pt;border-bottom:0.5pt solid var(--line);vertical-align:middle;}
  table.req tbody td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;}
  table.req tbody tr:nth-child(even){background:#fbfbf9}
  .role{font-weight:600;color:var(--ink)}
  .loc{color:var(--muted);font-size:7.5pt;margin-top:1pt}
  .chip{display:inline-block;padding:1pt 5pt;font-size:7pt;font-weight:700;border-radius:9pt;font-variant-numeric:tabular-nums;min-width:30pt;text-align:center;}
  .chip.asap{background:#e6f4ec;color:var(--green)}
  .chip.m1{background:var(--gold-soft);color:var(--gold)}
  .chip.m3{background:var(--blue-soft);color:var(--blue)}
  .two-col{display:grid;grid-template-columns:1.4fr 1fr;gap:8pt;margin-top:6pt;}
  .panel{background:var(--white);border:1pt solid var(--line);padding:7pt 8pt 6pt;border-radius:2pt;}
  .panel.gold-edge{border-left:2pt solid var(--gold)}
  .mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:5pt 8pt;margin-top:3pt;}
  .mini{display:flex;align-items:baseline;justify-content:space-between;border-bottom:0.5pt dotted var(--line);padding:3pt 0;font-size:8pt;}
  .mini .k{color:var(--muted);font-size:7.5pt}
  .mini .v{font-weight:700;color:var(--blue);font-variant-numeric:tabular-nums;}
  .alerts{display:grid;grid-template-columns:repeat(3,1fr);gap:5pt;margin-top:5pt;}
  .alert{padding:6pt 8pt;border-radius:2pt;border-left:2pt solid var(--gold);background:#fefaf0;}
  .alert.red{border-left-color:var(--red);background:#fdf3f3}
  .alert.green{border-left-color:var(--green);background:#f1faf3}
  .alert .a-num{font-size:13pt;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1;}
  .alert .a-lbl{font-size:7pt;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-top:2pt;}
  .foot{margin-top:8pt;padding-top:6pt;border-top:1pt solid var(--blue);display:flex;justify-content:space-between;align-items:center;font-size:6.5pt;color:var(--muted);line-height:1.4;}
  .foot .left{max-width:60%}
  .foot strong{color:var(--blue);font-weight:600}
  .foot .stamp{text-align:right;font-style:italic;font-family:'IBM Plex Serif',serif;color:var(--gold);}
  .small{font-size:7.5pt;color:var(--muted);margin-top:2pt}
  .legend{display:flex;gap:9pt;font-size:7pt;color:var(--muted);align-items:center;margin-top:5pt;}
  .swatch{display:inline-block;width:7pt;height:7pt;border-radius:1pt;vertical-align:middle;margin-right:3pt;}
  .swatch.b{background:var(--blue)}
  .swatch.g{background:var(--gold)}
</style>
</head>
<body>

<!-- =========== PAGE 1 =========== -->
<section class="sheet">

  <div class="top">
    <div class="left">
      <img class="logo" src="${logo}" alt="Trees Engineering">
      <div class="brand-stack">
        <div class="by">Powered by Trees OS · Treelance Workforce Agent</div>
        <div class="doc-title">Monthly Database Report</div>
      </div>
    </div>
    <div class="right">
      <div class="client-pill">${escapeHtml(CLIENT_LABEL)}</div>
      <div class="period">${escapeHtml(p.monthLabel)} <span class="of">· issued ${escapeHtml(p.issuedLabel)}</span></div>
      <div class="meta-line">Confidential · ${escapeHtml(scopeLabel)} · ${escapeHtml(WORKSPACE_ID)}</div>
    </div>
  </div>

  <div class="h">At a glance <span class="sub">Database health · ${escapeHtml(p.monthLabel)}</span></div>
  <div class="kpi-grid">
    <div class="kpi">
      <div class="lbl">Total profiles</div>
      <div class="num">${fmt(t.profiles)}</div>
      <div class="delta ${profilesDeltaCls}">${profilesDelta}</div>
    </div>
    <div class="kpi gold">
      <div class="lbl">New this month</div>
      <div class="num">${fmt(t.newThisMonth)}</div>
      <div class="delta ${newDeltaCls}">${newDelta}</div>
    </div>
    <div class="kpi">
      <div class="lbl">Active (90 d)</div>
      <div class="num">${fmt(t.active90d)}</div>
      <div class="delta flat">${t.active90dPct}% of base</div>
    </div>
    <div class="kpi muted">
      <div class="lbl">Inactive · no AI reply</div>
      <div class="num">${fmt(t.inactive)}</div>
      <div class="delta down">${t.inactivePct}% of base · re-engage</div>
    </div>
    <div class="kpi gold">
      <div class="lbl">Reached by Treelance</div>
      <div class="num">${fmt(t.reachedByTreelance)}</div>
      <div class="delta ${reachedDeltaCls}">${reachedDelta}</div>
    </div>
    <div class="kpi">
      <div class="lbl">Intros to ${escapeHtml(CLIENT_LABEL)}</div>
      <div class="num">${fmt(t.intros)}</div>
      <div class="delta">${fmt(t.introsConfirmed)} confirmed (Double Opt-In)</div>
    </div>
  </div>

  <div class="act-grid">
    <div class="act"><span class="label">Profiles updated this month</span><span class="v">${fmt(a.profilesUpdated)}</span></div>
    <div class="act"><span class="label">Treelance bot reply rate</span><span class="v">${a.botReplyRatePct == null ? '—' : a.botReplyRatePct + '%'}<small>${a.avgReplyTime ? 'avg ' + escapeHtml(a.avgReplyTime) : ''}</small></span></div>
    <div class="act"><span class="label">Documents renewed</span><span class="v">${fmt(a.docsRenewed)}</span></div>
    <div class="act"><span class="label">Documents expiring &lt; 30 d</span><span class="v">${fmt(a.docsExpiring30d)}</span></div>
  </div>

  <div class="h">Who is in your database <span class="sub">Treelance Taxonomy 2.0</span></div>
  <div class="demo-grid">

    <div class="demo-col">
      <div class="col-title"><span>By discipline</span><span class="total">${fmt(t.profiles)} profiles</span></div>
      ${renderBars(stats.byDiscipline)}
    </div>

    <div class="demo-col">
      <div class="col-title"><span>By country of origin</span><span class="total">${stats.byCountry.length} regions</span></div>
      ${renderBars(stats.byCountry, true)}
      <div class="row"><div class="lbl" style="font-weight:600;color:var(--blue)">Currently in MY</div><div class="bar"><div class="fill" style="width:${Math.min(100, stats.currentlyInMy.pct)}%"></div></div><div class="v">${fmt(stats.currentlyInMy.count)} <span class="pct">${stats.currentlyInMy.pct}%</span></div></div>
    </div>

    <div class="demo-col">
      <div class="col-title"><span>By seniority</span><span class="total">years</span></div>
      ${renderBars(stats.bySeniority)}

      <div class="col-title" style="margin-top:8pt"><span>Contract preference</span><span class="total">declared</span></div>
      ${stats.byContract == null ? '<div class="row" style="color:#9ca3af;font-style:italic;font-size:8pt">— not yet tracked —</div>' : renderBars(stats.byContract, true)}

      <div class="col-title" style="margin-top:8pt"><span>Languages spoken</span><span class="total">top 5</span></div>
      ${renderBars(stats.byLanguage)}
    </div>
  </div>

  <div class="legend">
    <span><span class="swatch b"></span>Profile counts</span>
    <span><span class="swatch g"></span>Geography &amp; preferences</span>
    <span style="margin-left:auto">Source: Trees OS · Treelance Taxonomy 2.0 · refreshed ${escapeHtml(p.refreshedLabel)}</span>
  </div>

  <div class="foot">
    <div class="left">
      <strong>Trees Engineering Sdn. Bhd.</strong> · Block C, Level 27, Unit 3A, KL Trillion, Jalan Tun Razak, Kuala Lumpur 50400, Malaysia · Trade Reg. 202001041675 (1397996-T)
    </div>
    <div class="stamp">Page 1 of 2</div>
  </div>

</section>


<!-- =========== PAGE 2 =========== -->
<section class="sheet">

  <div class="top">
    <div class="left">
      <img class="logo" src="${logo}" alt="Trees Engineering">
      <div class="brand-stack">
        <div class="by">${escapeHtml(CLIENT_LABEL)} · Monthly Database Report · ${escapeHtml(p.monthLabel)}</div>
        <div class="doc-title">Deployability &amp; Open Requisitions</div>
      </div>
    </div>
    <div class="right">
      <div class="client-pill">${escapeHtml(CLIENT_LABEL)}</div>
      <div class="period">${fmt(openCount)} open requisitions <span class="of">· ${fmt(totMatched)} matched</span></div>
      <div class="meta-line">${escapeHtml(scopeLabel)} · Permissioned Intros</div>
    </div>
  </div>

  <div class="h">Deployability snapshot <span class="sub">Active workers · ${fmt(t.active90d)} base</span></div>
  <div class="deploy">
    <div class="card">
      <div class="tag">Deployable ASAP</div>
      <div class="num">${fmt(stats.deployability.asap)}</div>
      <div class="desc">Within <strong>7 days</strong> · valid docs, confirmed availability in last 14 d, no active assignment</div>
    </div>
    <div class="card mid">
      <div class="tag">Deployable in 1 month</div>
      <div class="num">${fmt(stats.deployability.in30d)}</div>
      <div class="desc">Within <strong>30 days</strong> · finishing rotation, doc renewal in flight, or 2–4 wk notice</div>
    </div>
    <div class="card late">
      <div class="tag">Deployable in 3 months</div>
      <div class="num">${fmt(stats.deployability.in90d)}</div>
      <div class="desc">Within <strong>90 days</strong> · long-rotation, mobilisation prep, or training pipeline</div>
    </div>
  </div>
  <div class="small">Deployability flags are computed from each Worker's self-declared availability, document validity, and last-confirmation date. Re-confirmed automatically by Treelance every 21 days.</div>

  <div class="h">Open requisitions · matched workers <span class="sub">Match score ≥ 70 · ${escapeHtml(p.monthLabel)}</span></div>
  ${stats.openRoles.length === 0 ? '<div class="small" style="font-style:italic">— no open requisitions in this period —</div>' : `<table class="req">
    <thead>
      <tr>
        <th style="width:38%">Role &amp; Location</th>
        <th class="num">Total<br>matches</th>
        <th class="num">ASAP<br>(7 d)</th>
        <th class="num">1 month<br>(30 d)</th>
        <th class="num">3 months<br>(90 d)</th>
        <th class="num">In pipeline<br>(intro sent)</th>
      </tr>
    </thead>
    <tbody>
      ${stats.openRoles.map(renderRoleRow).join('\n      ')}
      <tr style="background:var(--blue);color:white;font-weight:700">
        <td style="color:white;font-weight:700">Across all ${stats.rolesAggregate.openCount} open requisitions</td>
        <td class="num" style="color:white">${fmt(stats.rolesAggregate.matches)}</td>
        <td class="num" style="color:white">${fmt(stats.rolesAggregate.asap)}</td>
        <td class="num" style="color:white">${fmt(stats.rolesAggregate.in30d)}</td>
        <td class="num" style="color:white">${fmt(stats.rolesAggregate.in90d)}</td>
        <td class="num" style="color:white">${fmt(stats.rolesAggregate.pipeline)}</td>
      </tr>
    </tbody>
  </table>`}
  <div class="small">"Matches" = workers passing the role criteria with score ≥ 70. "Pipeline" = Treelance has sent the Permissioned Intro to the Worker; Double Opt-In confirmation pending or completed.</div>

  <div class="two-col">

    <div class="panel gold-edge">
      <div class="col-title"><span>Treelance bot intelligence</span><span class="total">last 30 d</span></div>
      <div class="mini-grid">
        <div class="mini"><span class="k">Conversations opened</span><span class="v">${fmt(b.convsOpened)}</span></div>
        <div class="mini"><span class="k">Replies received</span><span class="v">${fmt(b.repliesReceived)}</span></div>
        <div class="mini"><span class="k">Reply rate</span><span class="v">${b.replyRatePct == null ? '—' : b.replyRatePct + '%'}</span></div>
        <div class="mini"><span class="k">Avg reply time</span><span class="v">${b.avgReplyTime ?? '—'}</span></div>
        <div class="mini"><span class="k">Top conv. language</span><span class="v">${b.topLanguage ? escapeHtml(b.topLanguage) : '—'}</span></div>
        <div class="mini"><span class="k">Most updated field</span><span class="v">${b.mostUpdatedField ?? '—'}</span></div>
        <div class="mini"><span class="k">CV re-uploads</span><span class="v">${fmt(b.cvReuploads)}</span></div>
        <div class="mini"><span class="k">Cert renewals confirmed</span><span class="v">${fmt(b.certRenewalsConfirmed)}</span></div>
        <div class="mini"><span class="k">Workers paused (opt-out)</span><span class="v">${fmt(b.workersPaused)}</span></div>
        <div class="mini"><span class="k">Net active (90 d)</span><span class="v">${fmt(b.netActive90d)}</span></div>
      </div>
    </div>

    <div class="panel">
      <div class="col-title"><span>Certification coverage</span><span class="total">in date · top 5</span></div>
      <div class="row" style="color:#9ca3af;font-style:italic;font-size:8pt">— not yet tracked —</div>

      <div class="col-title" style="margin-top:7pt"><span>Mobilisation readiness</span><span class="total">on active base</span></div>
      <div class="row" style="color:#9ca3af;font-style:italic;font-size:8pt">— not yet tracked —</div>
    </div>

  </div>

  <div class="h">Compliance alerts &amp; what we are doing about them <span class="sub">auto-flagged by Treelance</span></div>
  <div class="alerts">
    <div class="alert green">
      <div class="a-num">—</div>
      <div class="a-lbl">Documents renewed this month · auto-confirmed</div>
    </div>
    <div class="alert">
      <div class="a-num">—</div>
      <div class="a-lbl">Expiring within 30 days · Treelance reminder sent</div>
    </div>
    <div class="alert red">
      <div class="a-num">—</div>
      <div class="a-lbl">Already expired · escalated to Workers + flagged on profile</div>
    </div>
  </div>

  <div class="foot">
    <div class="left">
      <strong>Trees Engineering Sdn. Bhd.</strong> · Trees OS Workforce Operating System · Treelance is the Worker-facing AI agent · Software-as-a-service, no placement or success fees.<br>
      Questions: <strong>quentin@trees-engineering.com</strong> · WhatsApp Malaysia <strong>+60 12 242 1849</strong> · Booking: <strong>calendar.app.google/HLfcvtmSVVJjtb7n7</strong>
    </div>
    <div class="stamp">Page 2 of 2 · Generated ${escapeHtml(p.issuedLabel)}</div>
  </div>

</section>

</body>
</html>`;
}

// ── Public API ──────────────────────────────────────────────────────────────
export async function generateMonthlyReport(opts: {
  recruiterId: string | null;
  recruiterName: string | null;
  period?: Period;
}): Promise<{ html: string; filename: string; period: Period }> {
  const p = opts.period ?? previousMonthPeriod();
  const stats = await buildStats(p, opts.recruiterId, opts.recruiterName);
  const html = renderHtml(stats);
  const slug = opts.recruiterName
    ? opts.recruiterName.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'Recruiter'
    : 'All_Recruiters';
  const filename = `TreesEngineering_Monthly_Database_Report_${slug}_${MONTHS[p.month - 1]}_${p.year}.html`;
  return { html, filename, period: p };
}

export type SavedReport = {
  id: string;
  client_label: string;
  workspace_id: string | null;
  recruiter_id: string | null;
  period_year: number;
  period_month: number;
  period_label: string;
  filename: string;
  size_bytes: number;
  generated_at: string;
};

const SAVED_REPORT_COLUMNS =
  'id, client_label, workspace_id, recruiter_id, period_year, period_month, period_label, filename, size_bytes, generated_at';

export async function saveMonthlyReport(args: {
  html: string;
  filename: string;
  period: Period;
  recruiterId: string | null;
}): Promise<SavedReport> {
  if (!supabase) throw new Error('DB not configured');
  const { html, filename, period, recruiterId } = args;
  const { data, error } = await supabase
    .from('_monthly_report')
    .insert({
      client_label: CLIENT_LABEL,
      workspace_id: WORKSPACE_ID,
      recruiter_id: recruiterId,
      period_year: period.year,
      period_month: period.month,
      period_label: period.monthLabel,
      filename,
      html_content: html,
      size_bytes: Buffer.byteLength(html, 'utf8'),
    })
    .select(SAVED_REPORT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as SavedReport;
}

export async function listMonthlyReports(filter: {
  year?: number;
  month?: number;
  recruiterId?: string | null;
  /** If true, restrict to recruiterId (or NULL when recruiterId is null).
   *  If false, ignore the recruiterId filter (admin sees everything). */
  recruiterScope: boolean;
}): Promise<SavedReport[]> {
  if (!supabase) throw new Error('DB not configured');
  let q = supabase
    .from('_monthly_report')
    .select(SAVED_REPORT_COLUMNS)
    .order('generated_at', { ascending: false })
    .limit(500);
  if (filter.year != null) q = q.eq('period_year', filter.year);
  if (filter.month != null) q = q.eq('period_month', filter.month);
  if (filter.recruiterScope) {
    if (filter.recruiterId == null) q = q.is('recruiter_id', null);
    else q = q.eq('recruiter_id', filter.recruiterId);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedReport[];
}

export async function getMonthlyReportById(id: string): Promise<{
  html: string;
  filename: string;
  recruiter_id: string | null;
} | null> {
  if (!supabase) throw new Error('DB not configured');
  const { data, error } = await supabase
    .from('_monthly_report')
    .select('html_content, filename, recruiter_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    html: data.html_content as string,
    filename: data.filename as string,
    recruiter_id: (data.recruiter_id as string | null) ?? null,
  };
}
