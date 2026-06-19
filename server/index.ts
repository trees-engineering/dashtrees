import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { ingestRoleFromBuffer, ingestRoleFromText } from './jd-import.js';
import { isSupported, extractText } from './document.js';
import { runMatching } from './matching/cascade.js';
import { buildExport, fetchTalentCvFile } from './export/index.js';
import { callLlmWithVision } from './llm.js';
import {
  extractFromCv,
  uploadCvToStorage,
  insertCvExtraction,
  saveTalentBasicFields,
  saveTalentTetFields,
} from './cv-extraction.js';
import { supabase } from './db.js';
import { authMiddleware, checkRoleOwnership } from './auth.js';
import {
  generateMonthlyReport,
  saveMonthlyReport,
  listMonthlyReports,
  getMonthlyReportById,
} from './monthly-report.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
// base64-in-JSON inflates payloads ~33% — raise the limit for file uploads.
app.use(express.json({ limit: '15mb' }));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// ── Feature A: JD upload → ingest → auto-run matching in the background ──────
app.post('/api/roles/upload', authMiddleware, async (req: Request, res: Response) => {
  const { filename, mime_type, content_base64, created_by } = (req.body ?? {}) as {
    filename?: string; mime_type?: string; content_base64?: string; created_by?: string;
  };

  if (!filename || !content_base64) {
    res.status(400).json({ error: 'filename and content_base64 are required' });
    return;
  }
  if (!isSupported(filename, mime_type)) {
    res.status(415).json({ error: 'Unsupported file type. Accepts PDF, DOCX, DOC, RTF, ODT, TXT.' });
    return;
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(content_base64, 'base64');
  } catch {
    res.status(400).json({ error: 'content_base64 is not valid base64' });
    return;
  }
  if (buffer.length === 0) {
    res.status(400).json({ error: 'Decoded file is empty' });
    return;
  }

  // Attribution rules:
  //   - Admin: can attribute to any recruiter UUID they send.
  //   - Non-admin: server forces created_by to their own recruiterId regardless
  //     of what the client sends, so a curious caller can't spoof attribution.
  let createdBy: string;
  if (req.auth!.isAdmin) {
    if (!created_by || !UUID_RE.test(created_by)) {
      res.status(400).json({ error: 'created_by must be a valid recruiter id' });
      return;
    }
    createdBy = created_by;
  } else {
    createdBy = req.auth!.recruiterId;
  }

  try {
    const result = await ingestRoleFromBuffer(buffer, filename, mime_type, createdBy);

    // Matching is no longer auto-started — the recruiter confirms the role in
    // the edit screen first, then POST /start-matching kicks off the cascade.
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[server] JD upload failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ── Feature A (text): paste a JD as plain text → ingest (no file) ─────────────
const JD_TEXT_MIN = 50;
const JD_TEXT_MAX = 100_000;
app.post('/api/roles/import-text', authMiddleware, async (req: Request, res: Response) => {
  const { text, created_by } = (req.body ?? {}) as { text?: string; created_by?: string };

  if (typeof text !== 'string' || text.trim().length < JD_TEXT_MIN) {
    res.status(400).json({ error: `text is required (min ${JD_TEXT_MIN} characters)` });
    return;
  }
  if (text.length > JD_TEXT_MAX) {
    res.status(413).json({ error: `text too long (max ${JD_TEXT_MAX} characters)` });
    return;
  }

  // Attribution — identical rule to /upload: admins attribute to any recruiter
  // UUID they send; non-admins are forced to their own id.
  let createdBy: string;
  if (req.auth!.isAdmin) {
    if (!created_by || !UUID_RE.test(created_by)) {
      res.status(400).json({ error: 'created_by must be a valid recruiter id' });
      return;
    }
    createdBy = created_by;
  } else {
    createdBy = req.auth!.recruiterId;
  }

  try {
    const result = await ingestRoleFromText(text, createdBy);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[server] JD text import failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ── Start matching (fire-and-forget) ─────────────────────────────────────────
// Called after the recruiter confirms a newly-uploaded role via the edit
// screen. The cascade makes 50-200 LLM calls and takes 30s-2min, so this
// returns immediately and the work happens in the background.
app.post('/api/roles/:roleId/start-matching', authMiddleware, async (req: Request, res: Response) => {
  if (!UUID_RE.test(req.params.roleId)) {
    res.status(400).json({ error: 'invalid role id' });
    return;
  }
  if (!(await checkRoleOwnership(req, res, req.params.roleId))) return;

  runMatching(req.params.roleId).catch(err => {
    console.error(`[server] background cascade failed for role ${req.params.roleId}:`, err);
  });
  res.json({ ok: true, started: true });
});

// ── Feature B: re-run the matching cascade for a role (awaited) ──────────────
app.post('/api/roles/:roleId/rerun-matches', authMiddleware, async (req: Request, res: Response) => {
  if (!UUID_RE.test(req.params.roleId)) {
    res.status(400).json({ error: 'invalid role id' });
    return;
  }
  if (!(await checkRoleOwnership(req, res, req.params.roleId))) return;

  try {
    const tree = await runMatching(req.params.roleId);
    res.json({
      ok: true,
      total: tree.total_candidates,
      scored: tree.scored.length,
      plan_b: tree.plan_b.length,
    });
  } catch (err) {
    console.error('[server] rerun-matches failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ── Manual role status update (e.g. close a job) ─────────────────────────────
app.patch('/api/roles/:roleId/status', authMiddleware, async (req: Request, res: Response) => {
  if (!UUID_RE.test(req.params.roleId)) {
    res.status(400).json({ error: 'invalid role id' });
    return;
  }
  const { status } = (req.body ?? {}) as { status?: string };
  if (status !== 'open' && status !== 'closed' && status !== 'draft') {
    res.status(400).json({ error: 'status must be one of: open, closed, draft' });
    return;
  }
  if (!supabase) {
    res.status(500).json({ error: 'database not configured' });
    return;
  }
  if (!(await checkRoleOwnership(req, res, req.params.roleId))) return;

  const { error } = await supabase.from('_role').update({ status }).eq('id', req.params.roleId);
  if (error) {
    console.error('[server] role status update failed:', error);
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, status });
});

// ── Manual role edit ─────────────────────────────────────────────────────────
// PATCH the basic, recruiter-editable fields. TET v2 / requirements stay
// LLM-only — if those need correcting, reupload the JD.
const ROLE_EDITABLE_FIELDS = [
  'title',
  'description',
  'status',
  'location_requirement',
  'location_regions',
  'city',
  'country',
  'salary_min',
  'salary_max',
  'budget_currency',
  'start_deadline',
  'provides_sponsorship',
] as const;
type RoleEditableField = (typeof ROLE_EDITABLE_FIELDS)[number];

function sanitizeRolePatch(body: Record<string, unknown>): Record<string, unknown> | string {
  const patch: Record<string, unknown> = {};
  for (const field of ROLE_EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    const v = body[field];
    switch (field as RoleEditableField) {
      case 'title': {
        if (typeof v !== 'string' || v.trim().length === 0) return 'title must be a non-empty string';
        patch.title = v.trim();
        break;
      }
      case 'description':
      case 'location_requirement':
      case 'budget_currency':
      case 'start_deadline': {
        if (v !== null && typeof v !== 'string') return `${field} must be a string or null`;
        patch[field] = v === null ? null : (v as string).trim() || null;
        break;
      }
      case 'status': {
        if (v !== 'open' && v !== 'closed' && v !== 'draft') {
          return 'status must be one of: open, closed, draft';
        }
        patch.status = v;
        break;
      }
      case 'location_regions':
      case 'city':
      case 'country': {
        if (v === null) { patch[field] = null; break; }
        if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) {
          return `${field} must be an array of strings or null`;
        }
        patch[field] = (v as string[]).map(s => s.trim()).filter(Boolean);
        break;
      }
      case 'salary_min':
      case 'salary_max': {
        if (v === null) { patch[field] = null; break; }
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return `${field} must be a non-negative number or null`;
        patch[field] = n;
        break;
      }
      case 'provides_sponsorship': {
        if (v !== null && typeof v !== 'boolean') return 'provides_sponsorship must be a boolean or null';
        patch.provides_sponsorship = v;
        break;
      }
    }
  }
  return patch;
}

app.patch('/api/roles/:roleId', authMiddleware, async (req: Request, res: Response) => {
  if (!UUID_RE.test(req.params.roleId)) {
    res.status(400).json({ error: 'invalid role id' });
    return;
  }
  if (!supabase) {
    res.status(500).json({ error: 'database not configured' });
    return;
  }
  if (!(await checkRoleOwnership(req, res, req.params.roleId))) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const sanitized = sanitizeRolePatch(body);
  if (typeof sanitized === 'string') {
    res.status(400).json({ error: sanitized });
    return;
  }
  if (Object.keys(sanitized).length === 0) {
    res.status(400).json({ error: 'no editable fields provided' });
    return;
  }

  // salary_min <= salary_max if both end up set after the patch. Load the
  // current row to enforce the invariant against the merged state.
  if ('salary_min' in sanitized || 'salary_max' in sanitized) {
    const { data: current, error: loadErr } = await supabase
      .from('_role')
      .select('salary_min, salary_max')
      .eq('id', req.params.roleId)
      .single();
    if (loadErr || !current) {
      res.status(404).json({ error: 'role not found' });
      return;
    }
    const nextMin = 'salary_min' in sanitized ? (sanitized.salary_min as number | null) : current.salary_min;
    const nextMax = 'salary_max' in sanitized ? (sanitized.salary_max as number | null) : current.salary_max;
    if (typeof nextMin === 'number' && typeof nextMax === 'number' && nextMin > nextMax) {
      res.status(400).json({ error: 'salary_min cannot exceed salary_max' });
      return;
    }
  }

  const { data, error } = await supabase
    .from('_role')
    .update({ ...sanitized, updated_at: new Date().toISOString() })
    .eq('id', req.params.roleId)
    .select('*')
    .single();
  if (error || !data) {
    console.error('[server] role update failed:', error);
    res.status(500).json({ error: error?.message ?? 'update failed' });
    return;
  }

  res.json({ ok: true, role: data });
});

// ── Recruiter UX telemetry: batch event ingest ───────────────────────────────
// Fire-and-forget for the client; we drop any malformed events silently
// rather than fail the batch. Hard cap of 200 events per call keeps a
// runaway client from flooding the table.
app.post('/api/telemetry/batch', async (req: Request, res: Response) => {
  const { events } = (req.body ?? {}) as { events?: Array<Record<string, unknown>> };
  if (!Array.isArray(events) || events.length === 0) {
    res.json({ ok: true, inserted: 0 });
    return;
  }
  if (events.length > 200) {
    res.status(400).json({ error: 'too many events in one batch (max 200)' });
    return;
  }

  const rows = events
    .filter(e => typeof e.event_name === 'string' && typeof e.session_id === 'string')
    .map(e => ({
      client_ts: typeof e.client_ts === 'string' ? e.client_ts : null,
      session_id: String(e.session_id).slice(0, 100),
      recruiter_email: typeof e.recruiter_email === 'string' ? e.recruiter_email.slice(0, 200) : null,
      event_name: String(e.event_name).slice(0, 100),
      path: typeof e.path === 'string' ? e.path.slice(0, 200) : null,
      props: typeof e.props === 'object' && e.props != null ? e.props : {},
      user_agent: typeof e.user_agent === 'string' ? e.user_agent.slice(0, 500) : null,
      viewport_w: typeof e.viewport_w === 'number' ? e.viewport_w : null,
      viewport_h: typeof e.viewport_h === 'number' ? e.viewport_h : null,
    }));

  if (rows.length === 0) {
    res.json({ ok: true, inserted: 0 });
    return;
  }
  if (!supabase) {
    res.json({ ok: true, inserted: 0 });
    return;
  }

  const { error } = await supabase.from('_telemetry_events').insert(rows);
  if (error) {
    console.warn('[telemetry] insert failed:', error.message);
    res.status(500).json({ error: 'insert failed' });
    return;
  }
  res.json({ ok: true, inserted: rows.length });
});

// ── Analytics: aggregated telemetry overview (admin-only) ────────────────────
// Reads are admin-only — the ingest endpoint above is public, but exposing one
// recruiter's click behavior to another is not. All aggregation happens in the
// analytics_overview() Postgres function; this handler just validates inputs
// and forwards the jsonb blob it returns. days is an allow-list (7|30|90);
// recruiter narrows to one email (org-wide when omitted).
app.get('/api/analytics/overview', authMiddleware, async (req: Request, res: Response) => {
  if (!req.auth!.isAdmin) {
    res.status(403).json({ error: 'admin only' });
    return;
  }
  if (!supabase) {
    res.status(500).json({ error: 'database not configured' });
    return;
  }

  const daysRaw = Number(req.query.days ?? 30);
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const recruiter =
    typeof req.query.recruiter === 'string' && req.query.recruiter
      ? req.query.recruiter.slice(0, 200)
      : null;

  const { data, error } = await supabase.rpc('analytics_overview', {
    p_days: days,
    p_recruiter: recruiter,
  });
  if (error) {
    console.error('[analytics] rpc failed:', error.message);
    res.status(500).json({ error: 'analytics query failed' });
    return;
  }
  res.json({ overview: data });
});

// ── Reports: monthly database HTML report ────────────────────────────────────
// Generate + download a self-contained HTML report scoped to the caller:
//   - non-admin: always scoped to their own recruiter id
//   - admin   : ?recruiter_id=<uuid> scopes to that recruiter
//               ?recruiter_id=all (or missing) → org-wide

async function resolveReportScope(req: Request, res: Response): Promise<
  { recruiterId: string | null; recruiterName: string | null } | null
> {
  const auth = req.auth!;
  if (!supabase) {
    res.status(500).json({ error: 'database not configured' });
    return null;
  }

  let targetRecruiterId: string | null;
  if (!auth.isAdmin) {
    targetRecruiterId = auth.recruiterId;
  } else {
    const param = (req.query.recruiter_id as string | undefined) ?? '';
    if (!param || param === 'all') targetRecruiterId = null;
    else if (UUID_RE.test(param)) targetRecruiterId = param;
    else {
      res.status(400).json({ error: 'recruiter_id must be a UUID or "all"' });
      return null;
    }
  }

  if (!targetRecruiterId) return { recruiterId: null, recruiterName: null };

  const { data: rec, error } = await supabase
    .from('_recruiters')
    .select('name, email')
    .eq('id', targetRecruiterId)
    .maybeSingle();
  if (error) {
    res.status(500).json({ error: error.message });
    return null;
  }
  if (!rec) {
    res.status(404).json({ error: 'recruiter not found' });
    return null;
  }
  return {
    recruiterId: targetRecruiterId,
    recruiterName: (rec.name as string | null) ?? (rec.email as string | null) ?? 'Recruiter',
  };
}

// Generate + persist + return the HTML.
app.post('/api/report/monthly', authMiddleware, async (req: Request, res: Response) => {
  const scope = await resolveReportScope(req, res);
  if (!scope) return;

  try {
    const { html, filename, period } = await generateMonthlyReport({
      recruiterId: scope.recruiterId,
      recruiterName: scope.recruiterName,
    });
    try {
      await saveMonthlyReport({ html, filename, period, recruiterId: scope.recruiterId });
    } catch (saveErr) {
      console.error('[monthly-report] save failed (continuing with download):', saveErr);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);
  } catch (err) {
    console.error('[monthly-report] generation failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'generation failed' });
  }
});

// List saved reports. Non-admin → only their own; admin → all by default, or
// scoped via ?recruiter_id=<uuid|all>.
app.get('/api/report/monthly/list', authMiddleware, async (req: Request, res: Response) => {
  const auth = req.auth!;
  const monthParam = req.query.month as string | undefined; // "YYYY-MM"
  let year: number | undefined;
  let month: number | undefined;
  if (monthParam) {
    const m = /^(\d{4})-(\d{2})$/.exec(monthParam);
    if (!m) { res.status(400).json({ error: 'month must be YYYY-MM' }); return; }
    year = Number(m[1]);
    month = Number(m[2]);
  }

  let recruiterScope = false;
  let recruiterId: string | null = null;
  if (!auth.isAdmin) {
    recruiterScope = true;
    recruiterId = auth.recruiterId;
  } else {
    const param = (req.query.recruiter_id as string | undefined) ?? '';
    if (param === 'all') { recruiterScope = true; recruiterId = null; }
    else if (param && UUID_RE.test(param)) { recruiterScope = true; recruiterId = param; }
    // missing param → recruiterScope=false → see everything
  }

  try {
    const reports = await listMonthlyReports({ year, month, recruiterId, recruiterScope });
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'list failed' });
  }
});

// Fetch a single saved report (HTML body). Non-admins can only fetch reports
// scoped to themselves. Admins can fetch any.
app.get('/api/report/monthly/:id', authMiddleware, async (req: Request, res: Response) => {
  if (!UUID_RE.test(req.params.id)) {
    res.status(400).json({ error: 'invalid report id' });
    return;
  }
  try {
    const r = await getMonthlyReportById(req.params.id);
    if (!r) { res.status(404).json({ error: 'report not found' }); return; }
    if (!req.auth!.isAdmin && r.recruiter_id !== req.auth!.recruiterId) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${r.filename}"`);
    res.send(r.html);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'fetch failed' });
  }
});

// Delete a saved report. Non-admins can only delete their own.
app.delete('/api/report/monthly/:id', authMiddleware, async (req: Request, res: Response) => {
  if (!UUID_RE.test(req.params.id)) {
    res.status(400).json({ error: 'invalid report id' });
    return;
  }
  if (!supabase) {
    res.status(500).json({ error: 'database not configured' });
    return;
  }
  // Load first so we can enforce ownership before deleting.
  const { data: row, error: loadErr } = await supabase
    .from('_monthly_report')
    .select('recruiter_id')
    .eq('id', req.params.id)
    .maybeSingle();
  if (loadErr) { res.status(500).json({ error: loadErr.message }); return; }
  if (!row) { res.status(404).json({ error: 'report not found' }); return; }
  if (!req.auth!.isAdmin && row.recruiter_id !== req.auth!.recruiterId) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const { error } = await supabase.from('_monthly_report').delete().eq('id', req.params.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

// ── Feature C: configurable CV / dossier export ──────────────────────────────
app.post('/api/talent/:talentId/export', authMiddleware, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    roleId?: string;
    format?: 'docx' | 'pdf';
    tailorToJd?: boolean;
    appendCv?: boolean;
    includeInterview?: boolean;
    transcript?: string;
  };
  if (!body.roleId) {
    res.status(400).json({ error: 'roleId is required' });
    return;
  }
  if (!UUID_RE.test(body.roleId)) {
    res.status(400).json({ error: 'invalid role id' });
    return;
  }
  // Non-admins can only export for roles they own.
  if (!(await checkRoleOwnership(req, res, body.roleId))) return;

  try {
    const result = await buildExport({
      talentId: req.params.talentId,
      roleId: body.roleId,
      recruiterId: req.auth!.recruiterId,
      format: body.format === 'pdf' ? 'pdf' : 'docx',
      tailorToJd: Boolean(body.tailorToJd),
      appendCv: Boolean(body.appendCv),
      includeInterview: Boolean(body.includeInterview),
      transcript: body.transcript ?? null,
    });
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  } catch (err) {
    console.error('[server] export failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ── View a candidate's original uploaded CV ──────────────────────────────────
// Streams the original file inline (PDF renders in the browser; other formats
// download). Role-scoped: non-admins can only view CVs under roles they own.
app.get('/api/talent/:talentId/cv', authMiddleware, async (req: Request, res: Response) => {
  if (!supabase) { res.status(500).json({ error: 'database not configured' }); return; }
  const { talentId } = req.params;
  if (!UUID_RE.test(talentId)) { res.status(400).json({ error: 'invalid talent id' }); return; }
  const roleId = typeof req.query.roleId === 'string' ? req.query.roleId : '';
  if (!UUID_RE.test(roleId)) { res.status(400).json({ error: 'roleId is required' }); return; }
  if (!(await checkRoleOwnership(req, res, roleId))) return;

  try {
    const cv = await fetchTalentCvFile(talentId);
    if (!cv) { res.status(404).json({ error: 'No CV on file for this candidate' }); return; }
    res.setHeader('Content-Type', cv.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${cv.filename}"`);
    res.send(cv.buffer);
  } catch (err) {
    console.error('[server] cv fetch failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ── Recruiter profile (self-service) ─────────────────────────────────────────
// Each recruiter edits their OWN _recruiters row. The server forces the target
// to req.auth.recruiterId, so a caller can never edit another recruiter. Email
// is immutable (it comes from Google login and is the identity key).
const ABOUT_MAX = 1000;
app.patch('/api/profile', authMiddleware, async (req: Request, res: Response) => {
  if (!supabase) { res.status(500).json({ error: 'database not configured' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;

  const patch: Record<string, string | null> = {};
  const setText = (key: string, max: number) => {
    if (!(key in body)) return;
    const raw = body[key];
    if (raw !== null && typeof raw !== 'string') return; // ignore wrong types
    const v = typeof raw === 'string' ? raw.trim() : '';
    patch[key] = v ? v.slice(0, max) : null;
  };
  setText('name', 200);
  setText('position', 200);
  setText('linkedin_url', 500);
  setText('booking_link', 500);

  if ('about' in body) {
    const v = typeof body.about === 'string' ? body.about.trim() : '';
    if (v.length > ABOUT_MAX) {
      res.status(400).json({ error: `about must be ${ABOUT_MAX} characters or fewer` });
      return;
    }
    patch.about = v || null;
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'no editable fields provided' });
    return;
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('_recruiters')
    .update(patch)
    .eq('id', req.auth!.recruiterId)
    .select('id, email, name, position, linkedin_url, booking_link, about')
    .single();
  if (error) {
    console.error('[profile] update failed:', error.message);
    res.status(500).json({ error: 'profile update failed' });
    return;
  }
  res.json({ profile: data });
});

// ── Upload a CV to create a new candidate ────────────────────────────────────
// Accepts PDF/DOCX, extracts text, creates a _talent row, runs basic + TET
// extraction. Basic is foreground (awaited before response); TET is background.
app.post('/api/candidates/upload', authMiddleware, async (req: Request, res: Response) => {
  if (!supabase) { res.status(500).json({ error: 'database not configured' }); return; }

  const { filename, mime_type, content_base64 } = (req.body ?? {}) as {
    filename?: string; mime_type?: string; content_base64?: string;
  };
  if (!filename || !content_base64) {
    res.status(400).json({ error: 'filename and content_base64 are required' });
    return;
  }
  if (!isSupported(filename, mime_type)) {
    res.status(415).json({ error: 'Unsupported file type. Accepts PDF, DOCX, DOC, RTF, ODT, TXT.' });
    return;
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(content_base64, 'base64');
  } catch {
    res.status(400).json({ error: 'Invalid base64 content' });
    return;
  }

  try {
    // 1. Extract text; fall back to vision OCR for scanned PDFs
    let rawCvText = await extractText(buffer, filename, mime_type);
    if (!rawCvText.trim()) {
      const { text } = await callLlmWithVision(
        'Extract all text from this document verbatim. Output only the extracted text, preserving structure.',
        'Extract all text from this CV/resume.',
        { fileData: content_base64, filename, mimeType: mime_type },
        { maxTokens: 4096, temperature: 0 },
      );
      rawCvText = text;
    }

    // 2. Basic extraction (foreground) — need the name before inserting the row
    const basicFields = await extractFromCv('cv_extraction_basic', rawCvText);
    const nameFromCv = typeof basicFields.name === 'string' ? basicFields.name.trim() : null;
    const fallbackName = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

    // 3. Create the _talent row
    const { data: newTalent, error: insertError } = await supabase
      .from('_talent')
      .insert({ name: nameFromCv || fallbackName, lifecycle_state: 'imported' })
      .select('id')
      .single();
    if (insertError || !newTalent) {
      res.status(500).json({ error: insertError?.message ?? 'Failed to create candidate' });
      return;
    }
    const talentId = (newTalent as { id: string }).id;

    // 4. Store CV in Supabase Storage + link to _talent
    const storagePath = await uploadCvToStorage(talentId, buffer, filename, mime_type ?? 'application/octet-stream');
    await supabase.from('_talent').update({ cv_storage_path: storagePath }).eq('id', talentId);

    // 5. Save basic fields + insert _cv_extractions row
    await saveTalentBasicFields(talentId, basicFields);
    const extractionId = await insertCvExtraction(talentId, rawCvText, basicFields);

    // 6. TET extraction (background — fire-and-forget)
    void (async () => {
      try {
        const tetFields = await extractFromCv('cv_extraction_tet', rawCvText);
        await saveTalentTetFields(talentId, tetFields);
        if (extractionId) {
          await supabase
            .from('_cv_extractions')
            .update({ llm_extracted: { ...basicFields, ...tetFields } })
            .eq('id', extractionId);
        }
      } catch (err) {
        console.error('[candidates/upload] TET extraction failed:', err);
      }
    })();

    res.json({ ok: true, talentId, name: nameFromCv || fallbackName });
  } catch (err) {
    console.error('[server] candidates/upload failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ── Import candidate from pasted CV text ─────────────────────────────────────
app.post('/api/candidates/import-text', authMiddleware, async (req: Request, res: Response) => {
  if (!supabase) { res.status(500).json({ error: 'database not configured' }); return; }
  const { text } = (req.body ?? {}) as { text?: string };
  if (!text || text.trim().length < 50) {
    res.status(400).json({ error: 'text must be at least 50 characters' }); return;
  }
  try {
    const rawCvText = text.trim();
    const basicFields = await extractFromCv('cv_extraction_basic', rawCvText);
    const nameFromCv = typeof basicFields.name === 'string' ? basicFields.name.trim() : null;
    const { data: newTalent, error: insertError } = await supabase
      .from('_talent').insert({ name: nameFromCv || 'New Candidate', lifecycle_state: 'imported' })
      .select('id').single();
    if (insertError || !newTalent) {
      res.status(500).json({ error: insertError?.message ?? 'Failed to create candidate' }); return;
    }
    const talentId = (newTalent as { id: string }).id;
    await saveTalentBasicFields(talentId, basicFields);
    const extractionId = await insertCvExtraction(talentId, rawCvText, basicFields);
    void (async () => {
      try {
        const tetFields = await extractFromCv('cv_extraction_tet', rawCvText);
        await saveTalentTetFields(talentId, tetFields);
        if (extractionId) {
          await supabase.from('_cv_extractions')
            .update({ llm_extracted: { ...basicFields, ...tetFields } }).eq('id', extractionId);
        }
      } catch (err) { console.error('[candidates/import-text] TET extraction failed:', err); }
    })();
    res.json({ ok: true, talentId, name: nameFromCv || 'New Candidate' });
  } catch (err) {
    console.error('[server] candidates/import-text failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ── List all candidates ────────────────────────────────────────────────────────
app.get('/api/candidates', authMiddleware, async (req: Request, res: Response) => {
  if (!supabase) { res.status(500).json({ error: 'database not configured' }); return; }
  const { data, error } = await supabase
    .from('_talent')
    .select('id,name,linkedin_url,city,country,availability_status,available_from,rate,rate_type,currency,email,visa_status,headline,lifecycle_state,notice_period_days')
    .not('name', 'is', null)
    .order('name', { ascending: true });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ candidates: data ?? [] });
});

// ── Fetch a single candidate + skills ─────────────────────────────────────────
app.get('/api/candidates/:talentId', authMiddleware, async (req: Request, res: Response) => {
  if (!supabase) { res.status(500).json({ error: 'database not configured' }); return; }
  const { talentId } = req.params;
  const [talentRes, skillsRes] = await Promise.all([
    supabase.from('_talent')
      .select('id,name,email,phone,city,country,linkedin_url,visa_status,availability_status,available_from,notice_period_days,rate,rate_type,currency,rotation_preference,work_rights,visa_expiration_date,certifications,languages')
      .eq('id', talentId).single(),
    supabase.from('_talent_skills').select('skill_name,years_experience').eq('talent_id', talentId),
  ]);
  if (talentRes.error || !talentRes.data) {
    res.status(404).json({ error: 'Candidate not found' }); return;
  }
  res.json({ ...talentRes.data, skills: skillsRes.data ?? [] });
});

// ── Update a candidate ─────────────────────────────────────────────────────────
app.patch('/api/candidates/:talentId', authMiddleware, async (req: Request, res: Response) => {
  if (!supabase) { res.status(500).json({ error: 'database not configured' }); return; }
  const { talentId } = req.params;
  const { skills, ...rawFields } = (req.body ?? {}) as { skills?: string[]; [key: string]: unknown };
  const ALLOWED = new Set([
    'name','email','phone','city','country','linkedin_url','visa_status',
    'availability_status','available_from','notice_period_days','rate','rate_type',
    'currency','rotation_preference','work_rights','visa_expiration_date',
    'certifications','languages',
  ]);
  const safeFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawFields)) {
    if (ALLOWED.has(k)) safeFields[k] = v ?? null;
  }
  if (Object.keys(safeFields).length > 0) {
    const { error } = await supabase.from('_talent').update(safeFields).eq('id', talentId);
    if (error) { res.status(500).json({ error: error.message }); return; }
  }
  if (Array.isArray(skills)) {
    await supabase.from('_talent_skills').delete().eq('talent_id', talentId);
    const rows = skills
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => ({ talent_id: talentId, skill_name: s.trim(), years_experience: null }));
    if (rows.length) await supabase.from('_talent_skills').insert(rows);
  }
  res.json({ ok: true });
});

// ── Shortlists ───────────────────────────────────────────────────────────────
// All authenticated users read all shortlists (admins see everything).
// recruiter_id records who added the entry for audit; not used for filtering.

app.get('/api/shortlists', authMiddleware, async (req: Request, res: Response) => {
  const roleId = req.query.roleId as string | undefined;
  if (!roleId || !UUID_RE.test(roleId)) return res.json({ talent_ids: [] });
  const { data, error } = await supabase
    .from('_shortlists')
    .select('talent_id')
    .eq('role_id', roleId);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ talent_ids: (data ?? []).map((r) => r.talent_id) });
});

// Count of unique tick-box shortlists added by the authenticated recruiter,
// used by the game to award XP for the _shortlists table (not _matches.status).
app.get('/api/shortlists/count', authMiddleware, async (req: Request, res: Response) => {
  const { count, error } = await supabase
    .from('_shortlists')
    .select('*', { count: 'exact', head: true })
    .eq('recruiter_id', req.auth!.recruiterId);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ count: count ?? 0 });
});

app.post('/api/shortlists/toggle', authMiddleware, async (req: Request, res: Response) => {
  const { role_id, talent_id } = (req.body ?? {}) as { role_id?: string; talent_id?: string };
  if (!role_id || !UUID_RE.test(role_id) || !talent_id || !UUID_RE.test(talent_id)) {
    return res.status(400).json({ error: 'role_id and talent_id must be valid UUIDs' });
  }
  const { data: existing } = await supabase
    .from('_shortlists')
    .select('id')
    .eq('role_id', role_id)
    .eq('talent_id', talent_id)
    .maybeSingle();
  if (existing) {
    await supabase.from('_shortlists').delete().eq('id', existing.id);
    return res.json({ added: false });
  }
  await supabase.from('_shortlists').insert({
    role_id,
    talent_id,
    recruiter_id: req.auth!.recruiterId,
  });
  return res.json({ added: true });
});

// ── Game leaderboard ─────────────────────────────────────────────────────────
// Aggregates XP across all recruiters server-side (requires service-role key so
// non-admin users can't fetch each other's individual role data, only the summary).
function leaderboardAchievementXP(roles: number, matches: number, sl: number, intros: number): number {
  let xp = 0
  if (roles   >= 1)  xp += 100
  if (roles   >= 5)  xp += 500
  if (roles   >= 10) xp += 1000
  if (matches >= 1)  xp += 50
  if (matches >= 10) xp += 200
  if (matches >= 50) xp += 500
  if (sl      >= 1)  xp += 75
  if (sl      >= 10) xp += 300
  if (intros  >= 1)  xp += 200
  if (intros  >= 5)  xp += 500
  if (intros  >= 10) xp += 1000
  if (intros  >= 20) xp += 2000
  return xp
}

app.get('/api/game/leaderboard', authMiddleware, async (_req: Request, res: Response) => {
  // First day of the current calendar month (UTC) — used for monthly bonus scoring
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const [rolesRes, matchesRes, shortlistsRes, recruitersRes] = await Promise.all([
    supabase.from('_role').select('id, created_by, created_at'),
    supabase.from('_matches').select('role_id, status'),
    supabase.from('_shortlists').select('recruiter_id, created_at'),
    supabase.from('_recruiters').select('id, email, name'),
  ])

  if (rolesRes.error)      return res.status(500).json({ error: rolesRes.error.message })
  if (matchesRes.error)    return res.status(500).json({ error: matchesRes.error.message })
  if (shortlistsRes.error) return res.status(500).json({ error: shortlistsRes.error.message })
  if (recruitersRes.error) return res.status(500).json({ error: recruitersRes.error.message })

  // Match counts per role
  const matchMap = new Map<string, { total: number; introduced: number }>()
  for (const m of (matchesRes.data ?? [])) {
    if (m.status === 'screened_out') continue
    const ex = matchMap.get(m.role_id) ?? { total: 0, introduced: 0 }
    ex.total++
    if (m.status === 'introduced') ex.introduced++
    matchMap.set(m.role_id, ex)
  }

  // Shortlist counts: all-time and this month, per recruiter
  // Also collect distinct active dates this month for participation scoring
  const shortlistAll = new Map<string, number>()
  const shortlistMonth = new Map<string, number>()
  const activeDatesMap = new Map<string, Set<string>>()

  const toDateStr = (iso: string) => iso.slice(0, 10) // 'YYYY-MM-DD'

  for (const s of (shortlistsRes.data ?? [])) {
    if (!s.recruiter_id) continue
    shortlistAll.set(s.recruiter_id, (shortlistAll.get(s.recruiter_id) ?? 0) + 1)
    if (s.created_at >= monthStart) {
      shortlistMonth.set(s.recruiter_id, (shortlistMonth.get(s.recruiter_id) ?? 0) + 1)
      if (!activeDatesMap.has(s.recruiter_id)) activeDatesMap.set(s.recruiter_id, new Set())
      activeDatesMap.get(s.recruiter_id)!.add(toDateStr(s.created_at))
    }
  }

  // Recruiter lookup
  const recruiterMap = new Map((recruitersRes.data ?? []).map((r) => [r.id, r]))

  // Aggregate per recruiter (UUID-shaped created_by only)
  const agg = new Map<string, {
    rolesTotal: number; rolesMonth: number
    matchesTotal: number; intros: number
  }>()
  for (const role of (rolesRes.data ?? [])) {
    if (!role.created_by || !UUID_RE.test(role.created_by)) continue
    const mc = matchMap.get(role.id) ?? { total: 0, introduced: 0 }
    const ex = agg.get(role.created_by) ?? { rolesTotal: 0, rolesMonth: 0, matchesTotal: 0, intros: 0 }
    ex.rolesTotal++
    if (role.created_at >= monthStart) {
      ex.rolesMonth++
      if (!activeDatesMap.has(role.created_by)) activeDatesMap.set(role.created_by, new Set())
      activeDatesMap.get(role.created_by)!.add(toDateStr(role.created_at))
    }
    ex.matchesTotal += mc.total
    ex.intros += mc.introduced
    agg.set(role.created_by, ex)
  }

  const leaderboard = [...agg.entries()]
    .map(([recruiterId, s]) => {
      const rec = recruiterMap.get(recruiterId)
      if (!rec) return null
      const shortlisted = shortlistAll.get(recruiterId) ?? 0
      const achievementXP = leaderboardAchievementXP(s.rolesTotal, s.matchesTotal, shortlisted, s.intros)
      const totalXP = s.rolesTotal * 100 + s.matchesTotal * 10 + shortlisted * 50 + s.intros * 200 + achievementXP
      // Monthly output XP
      const monthlyRoles = s.rolesMonth
      const monthlyShortlists = shortlistMonth.get(recruiterId) ?? 0
      // Participation: each distinct calendar day this month with any activity = +25 XP
      const activeDays = activeDatesMap.get(recruiterId)?.size ?? 0
      const participationXP = activeDays * 25
      const monthlyXP = monthlyRoles * 100 + monthlyShortlists * 50 + participationXP
      return {
        recruiter_id: recruiterId,
        recruiter_email: rec.email as string,
        recruiter_name: (rec.name as string | null) ?? null,
        totalXP,
        rolesTotal: s.rolesTotal,
        shortlisted,
        intros: s.intros,
        monthlyXP,
        monthlyRoles,
        monthlyShortlists,
        activeDays,
        participationXP,
      }
    })
    .filter(Boolean)
    // Sort by monthly XP (bonus fairness) with total XP as tiebreaker (career standing)
    .sort((a, b) => b!.monthlyXP - a!.monthlyXP || b!.totalXP - a!.totalXP)

  return res.json({ leaderboard, monthStart })
})

// ── Static frontend (production) ─────────────────────────────────────────────
const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback — anything not under /api serves index.html.
  app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[server] DashTrees API listening on http://localhost:${PORT}`);
});
