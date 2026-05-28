import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { ingestRoleFromBuffer } from './jd-import.js';
import { isSupported } from './document.js';
import { runCascadePipeline } from './matching/cascade.js';
import { buildExport } from './export/index.js';
import { supabase } from './db.js';

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
app.post('/api/roles/upload', async (req: Request, res: Response) => {
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

  try {
    const createdBy = created_by && UUID_RE.test(created_by) ? created_by : null;
    const result = await ingestRoleFromBuffer(buffer, filename, mime_type, createdBy);

    // Auto-run matching in the background — the pipeline makes 50-200 LLM calls
    // and takes 30s-2min, so we never make the HTTP response wait for it.
    runCascadePipeline(result.roleId).catch(err => {
      console.error(`[server] background cascade failed for role ${result.roleId}:`, err);
    });

    res.json({ ok: true, matchingStarted: true, ...result });
  } catch (err) {
    console.error('[server] JD upload failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ── Feature B: re-run the matching cascade for a role (awaited) ──────────────
app.post('/api/roles/:roleId/rerun-matches', async (req: Request, res: Response) => {
  try {
    const tree = await runCascadePipeline(req.params.roleId);
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
app.patch('/api/roles/:roleId/status', async (req: Request, res: Response) => {
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
  const { error } = await supabase.from('_role').update({ status }).eq('id', req.params.roleId);
  if (error) {
    console.error('[server] role status update failed:', error);
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, status });
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

// ── Feature C: configurable CV / dossier export ──────────────────────────────
app.post('/api/talent/:talentId/export', async (req: Request, res: Response) => {
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

  try {
    const result = await buildExport({
      talentId: req.params.talentId,
      roleId: body.roleId,
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
