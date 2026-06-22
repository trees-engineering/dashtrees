// Configurable CV / dossier export — orchestrates the option matrix:
// format (docx|pdf), tailorToJd, appendCv, includeInterview (transcript).
import { supabase } from '../db.js';
import { generateDossierConfig, FOUNDER_CONTACT } from './dossier-llm.js';
import { generateDossierBuffer } from './dossier-builder.js';
import { generateDossierPdf, mergePdfs } from './dossier-pdf.js';

export interface ExportOptions {
  talentId: string;
  /** Target role for JD tailoring. Omit/null for an untailored "plain CV". */
  roleId?: string | null;
  /** The exporting recruiter — sources the dossier's contact block. */
  recruiterId: string;
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
  // CVs live in the `documents` bucket, keyed by the full cv_storage_path
  // (e.g. "cvs/<talent>/<file>.pdf"). Fall back to treating it as "bucket/key"
  // or a bare key in a cvs/cv bucket for any older rows stored differently.
  const slash = storagePath.indexOf('/');
  const attempts: Array<[string, string]> = [
    ['documents', storagePath],
    ...(slash > 0
      ? [[storagePath.slice(0, slash), storagePath.slice(slash + 1)] as [string, string]]
      : []),
    ['cvs', storagePath],
    ['cv', storagePath],
  ];
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

const MIME_BY_EXT: Record<string, string> = {
  pdf: PDF_MIME,
  docx: DOCX_MIME,
  doc: 'application/msword',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  txt: 'text/plain',
};

function extOf(path: string): string {
  const clean = path.split(/[?#]/)[0];
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

export interface TalentCvFile {
  buffer: Buffer;
  contentType: string;
  ext: string;
  filename: string;
}

/** Load a talent's original uploaded CV (buffer + content type) for inline
 *  preview or download. Returns null if the talent has no CV on file or it
 *  can't be found in storage. */
export async function fetchTalentCvFile(talentId: string): Promise<TalentCvFile | null> {
  if (!supabase) return null;
  const { data: talent } = await supabase
    .from('_talent')
    .select('name, cv_storage_path')
    .eq('id', talentId)
    .single();
  const storagePath = talent?.cv_storage_path as string | null | undefined;
  if (!storagePath) return null;
  const buffer = await fetchOriginalCv(storagePath);
  if (!buffer) return null;
  const ext = extOf(storagePath) || 'pdf';
  const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
  const filename = `${slug(talent?.name || 'candidate')}_CV.${ext}`;
  return { buffer, contentType, ext, filename };
}

export async function buildExport(opts: ExportOptions): Promise<ExportResult> {
  if (!supabase) throw new Error('Database not configured');

  const [{ data: talent }, { data: cv }, { data: recruiter }] = await Promise.all([
    supabase.from('_talent').select('name, cv_storage_path').eq('id', opts.talentId).single(),
    supabase
      .from('_cv_extractions')
      .select('raw_cv_text')
      .eq('talent_id', opts.talentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    supabase.from('_recruiters').select('name, position, email, booking_link, linkedin_url, about').eq('id', opts.recruiterId).single(),
  ]);

  if (!talent) throw new Error('Talent not found');

  // Role is optional — only fetched when supplied (to tailor to its JD).
  let role: { title?: string | null; raw_jd_text?: string | null; description?: string | null; hiring_company?: string | null } | null = null;
  if (opts.roleId) {
    const { data } = await supabase
      .from('_role')
      .select('title, raw_jd_text, description, hiring_company')
      .eq('id', opts.roleId)
      .single();
    if (!data) throw new Error('Role not found');
    role = data;
  }

  // Contact block = the exporting recruiter's profile, with the founder contact
  // as a per-field fallback so an unconfigured profile never breaks the document
  // (booking_link especially — the builders feed it straight into a hyperlink).
  // linkedin / about are optional in the dossier — omit them when the recruiter
  // hasn't set them rather than falling back to the founder's.
  const rec = recruiter as {
    name?: string | null; position?: string | null; email?: string | null;
    booking_link?: string | null; linkedin_url?: string | null; about?: string | null;
  } | null;
  const contact = {
    name: rec?.name?.trim() || rec?.email || FOUNDER_CONTACT.name,
    role: rec?.position?.trim() || 'Trees Engineering',
    email: rec?.email || FOUNDER_CONTACT.email,
    booking_link: rec?.booking_link?.trim() || FOUNDER_CONTACT.booking_link,
    linkedin: rec?.linkedin_url?.trim() || undefined,
    about: rec?.about?.trim() || undefined,
  };

  const cvText = (cv?.raw_cv_text as string) ?? '';
  if (!cvText.trim()) {
    throw new Error('No CV text on file for this candidate — cannot build the document');
  }
  // Tailoring needs a role. Without one we always produce the untailored CV.
  const tailored = opts.tailorToJd && !!role;
  const jdText = tailored ? ((role!.raw_jd_text ?? role!.description ?? '') as string) : '';
  const clientName = role ? ((role.hiring_company as string) || 'Client') : '';
  const positionTitle = role ? ((role.title as string) || 'Role') : '';

  const cfg = await generateDossierConfig({
    talentName: (talent.name as string) ?? null,
    cvText,
    jdText,
    transcript: opts.includeInterview ? (opts.transcript ?? null) : null,
    clientName,
    positionTitle,
    contact,
  });

  // Appending the original CV requires PDF output (pdf-lib merges PDFs only).
  const format: 'docx' | 'pdf' = opts.appendCv ? 'pdf' : opts.format;

  let buffer: Buffer;
  let contentType: string;

  if (format === 'pdf') {
    buffer = await generateDossierPdf(cfg, { tailored });
    contentType = PDF_MIME;
    if (opts.appendCv) {
      const original = await fetchOriginalCv(talent.cv_storage_path as string | null);
      if (original) buffer = await mergePdfs([buffer, original]);
    }
  } else {
    buffer = await generateDossierBuffer(cfg, { tailored });
    contentType = DOCX_MIME;
  }

  const initials = slug(cfg.candidate.initials, 8);
  const prefix = tailored ? 'Dossier' : 'CV';
  // Append the client only when there's a role; a plain CV has no client.
  const filename = role
    ? `${prefix}_${initials}_${slug(clientName)}.${format}`
    : `${prefix}_${initials}.${format}`;

  return { buffer, filename, contentType };
}
