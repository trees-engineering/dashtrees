// Configurable CV / dossier export — orchestrates the option matrix:
// format (docx|pdf), tailorToJd, appendCv, includeInterview (transcript).
import { supabase } from '../db.js';
import { generateDossierConfig } from './dossier-llm.js';
import { generateDossierBuffer } from './dossier-builder.js';
import { generateDossierPdf, mergePdfs } from './dossier-pdf.js';

export interface ExportOptions {
  talentId: string;
  roleId: string;
  format: 'docx' | 'pdf';
  tailorToJd: boolean;
  appendCv: boolean;
  includeInterview: boolean;
  transcript?: string | null;
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';

function slug(s: string, max = 40): string {
  return (s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max) || 'X';
}

/** Best-effort fetch of the candidate's originally-uploaded CV from storage. */
async function fetchOriginalCv(storagePath: string | null | undefined): Promise<Buffer | null> {
  if (!storagePath || !supabase) return null;
  // cv_storage_path may be "bucket/key" or just "key" in a default bucket.
  const slash = storagePath.indexOf('/');
  const attempts: Array<[string, string]> = slash > 0
    ? [[storagePath.slice(0, slash), storagePath.slice(slash + 1)], ['cvs', storagePath], ['cv', storagePath]]
    : [['cvs', storagePath], ['cv', storagePath]];
  for (const [bucket, key] of attempts) {
    try {
      const { data, error } = await supabase.storage.from(bucket).download(key);
      if (!error && data) return Buffer.from(await data.arrayBuffer());
    } catch {
      // try next bucket
    }
  }
  console.warn('[export] could not fetch original CV from storage:', storagePath);
  return null;
}

export async function buildExport(opts: ExportOptions): Promise<ExportResult> {
  if (!supabase) throw new Error('Database not configured');

  const [{ data: talent }, { data: role }, { data: cv }] = await Promise.all([
    supabase.from('_talent').select('name, cv_storage_path').eq('id', opts.talentId).single(),
    supabase.from('_role').select('title, raw_jd_text, description, hiring_company').eq('id', opts.roleId).single(),
    supabase
      .from('_cv_extractions')
      .select('raw_cv_text')
      .eq('talent_id', opts.talentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  if (!talent) throw new Error('Talent not found');
  if (!role) throw new Error('Role not found');

  const cvText = (cv?.raw_cv_text as string) ?? '';
  if (!cvText.trim()) {
    throw new Error('No CV text on file for this candidate — cannot build the document');
  }
  const jdText = opts.tailorToJd ? ((role.raw_jd_text ?? role.description ?? '') as string) : '';
  const clientName = (role.hiring_company as string) || 'Client';
  const positionTitle = (role.title as string) || 'Role';

  const cfg = await generateDossierConfig({
    talentName: (talent.name as string) ?? null,
    cvText,
    jdText,
    transcript: opts.includeInterview ? (opts.transcript ?? null) : null,
    clientName,
    positionTitle,
  });

  // Appending the original CV requires PDF output (pdf-lib merges PDFs only).
  const format: 'docx' | 'pdf' = opts.appendCv ? 'pdf' : opts.format;

  let buffer: Buffer;
  let contentType: string;

  if (format === 'pdf') {
    buffer = await generateDossierPdf(cfg, { tailored: opts.tailorToJd });
    contentType = PDF_MIME;
    if (opts.appendCv) {
      const original = await fetchOriginalCv(talent.cv_storage_path as string | null);
      if (original) buffer = await mergePdfs([buffer, original]);
    }
  } else {
    buffer = await generateDossierBuffer(cfg, { tailored: opts.tailorToJd });
    contentType = DOCX_MIME;
  }

  const initials = slug(cfg.candidate.initials, 8);
  const client = slug(clientName);
  const prefix = opts.tailorToJd ? 'Dossier' : 'CV';
  const filename = `${prefix}_${initials}_${client}.${format}`;

  return { buffer, filename, contentType };
}
