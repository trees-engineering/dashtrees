import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { ingestRoleFromBuffer } from './jd-import.js';
import { isSupported } from './document.js';
import { runCascadePipeline } from './matching/cascade.js';
import { buildExport } from './export/index.js';

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
