// JD ingestion — adapted from Treelance's scripts/bulk-import-jds.ts.
// Turns a single uploaded file buffer into a _role row + _role_requirements,
// using the live `role_extraction` prompt. Persists legacy + TET v2 taxonomy.
import { supabase } from './db.js';
import { getPrompt, callLlmWithMessages, callLlmWithVision } from './llm.js';
import { extractText, resolveExtension } from './document.js';

export interface IngestResult {
  roleId: string;
  title: string;
  requirementsInserted: number;
  tetCompleteness: number;
  visionUsed: boolean;
  jdTextLength: number;
}

// ── Filter-priority sanitisation (same keys/defaults as Treelance onboarding) ──
const FILTER_PRIORITY_KEYS = [
  'work_authorization', 'required_certifications', 'availability_timing',
  'salary_budget', 'location_mobility', 'education',
];

function sanitizeFilterPriorities(raw: unknown): Record<string, number> {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const key of FILTER_PRIORITY_KEYS) {
    const val = Number(obj[key]);
    result[key] = Number.isFinite(val) ? Math.max(0, Math.min(5, Math.round(val))) : 3;
  }
  return result;
}

// ── TET taxonomy validators — drop entries with the wrong ID prefix ──
function strPrefix(v: unknown, prefix: string): string | undefined {
  return typeof v === 'string' && v.toUpperCase().startsWith(prefix) ? v : undefined;
}
function arrPrefix(v: unknown, prefix: string): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.toUpperCase().startsWith(prefix));
}
function bandTL(v: unknown): string | undefined {
  return typeof v === 'string' && /^TL[0-7]$/i.test(v) ? v.toUpperCase() : undefined;
}
function phasesP(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && /^P[0-8]$/i.test(x))
    .map(x => x.toUpperCase());
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
/** Drop hallucinated past deadlines — keep only today-or-future ISO dates. */
function futureDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.getTime() >= Date.now() - 86_400_000 ? v : undefined;
}

const TET_V2_FIELDS = [
  'job_function_required', 'discipline_required', 'career_track_required',
  'seniority_band_required', 'authority_level_required', 'asset_verticals_required',
  'systems_required', 'phases_required', 'workstreams_required',
  'work_environment_required', 'deliverables_required_v2', 'credentials_required',
] as const;

function isFilled(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

// ── Vision OCR fallback for scanned/empty documents ──
async function visionOcr(buffer: Buffer, filename: string, mimeType?: string): Promise<string> {
  const ext = resolveExtension(filename, mimeType);
  const mime = ext === '.pdf' ? 'application/pdf' : mimeType;
  const result = await callLlmWithVision(
    'You are an OCR assistant. Extract ALL text content from this document exactly as written. Preserve structure (headings, lists, paragraphs). Return only the extracted text, no commentary.',
    'Extract all text from this document.',
    { fileData: buffer.toString('base64'), filename, mimeType: mime },
    { temperature: 0, operation: 'vision_ocr' },
  );
  return result.text;
}

// ── LLM role extraction using the live role_extraction prompt ──
async function extractRoleFromText(jdText: string, promptTemplate: string): Promise<Record<string, unknown>> {
  const prompt = promptTemplate.replace('{{jd_text}}', jdText.substring(0, 8000));
  const { text } = await callLlmWithMessages(
    [
      { role: 'system', content: 'You extract structured role requirements from job descriptions. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { jsonMode: true, temperature: 0.1, maxTokens: 4096, operation: 'role_extraction' },
  );
  return JSON.parse(text) as Record<string, unknown>;
}

// ── Insert the role + requirements ──
async function insertRole(
  extracted: Record<string, unknown>,
  jdText: string,
  createdBy: string | null,
): Promise<{ roleId: string; requirementsInserted: number }> {
  if (!supabase) throw new Error('Database not configured');

  const row: Record<string, unknown> = {
    title: String(extracted.title),
    description: (extracted.description as string) ?? '',
    status: 'open',
    salary_min: (extracted.salary_min as number) ?? null,
    salary_max: (extracted.salary_max as number) ?? null,
    budget_currency: (extracted.budget_currency as string) ?? 'USD',
    location_requirement: (extracted.location_requirement as string) ?? 'remote',
    location_regions: strArray(extracted.location_regions),
    provides_sponsorship: (extracted.provides_sponsorship as boolean) ?? false,
    start_deadline: futureDate(extracted.start_deadline) ?? null,
    created_by: createdBy,
    minimum_education: (extracted.minimum_education as string) ?? null,
    seniority_range: (extracted.seniority_range as string) ?? null,
    industry_preference: strArray(extracted.industry_preference),
    languages_required: strArray(extracted.languages_required),
    filter_priorities: sanitizeFilterPriorities(extracted.filter_priorities),
    raw_jd_text: jdText.substring(0, 16_000),
    hiring_company: (extracted.hiring_company as string) ?? null,
    summary: (extracted.summary as string) ?? null,
  };

  // ── Legacy TET v1 fields (accepted as-is) ──
  if (isFilled(extracted.job_family))  row.job_family = extracted.job_family;
  if (isFilled(extracted.discipline))  row.discipline = extracted.discipline;
  if (extracted.tl_band_min != null)   row.tl_band_min = Number(extracted.tl_band_min);
  if (extracted.tl_band_max != null)   row.tl_band_max = Number(extracted.tl_band_max);
  const regionalExp = strArray(extracted.regional_experience_required);
  if (regionalExp.length) row.regional_experience_required = regionalExp;
  const assetExp = strArray(extracted.asset_experience_required);
  if (assetExp.length) row.asset_experience_required = assetExp;
  const archetypes = strArray(extracted.role_archetype_required);
  if (archetypes.length) row.role_archetype_required = archetypes;
  const delivLegacy = strArray(extracted.deliverables_required);
  if (delivLegacy.length) row.deliverables_required = delivLegacy;
  const phaseExp = phasesP(extracted.phase_exposure_required);
  if (phaseExp.length) row.phase_exposure_required = phaseExp;

  // ── TET v2 fields (prefix-validated; wrong-prefix entries dropped) ──
  const jobFunc = strPrefix(extracted.job_function_required, 'FUNC-');
  if (jobFunc) row.job_function_required = jobFunc;
  const disc = strPrefix(extracted.discipline_required, 'DISC-');
  if (disc) row.discipline_required = disc;
  const tracks = arrPrefix(extracted.career_track_required, 'TRACK-');
  if (tracks.length) row.career_track_required = tracks;
  const band = bandTL(extracted.seniority_band_required);
  if (band) row.seniority_band_required = band;
  const auth = strPrefix(extracted.authority_level_required, 'AUTH-');
  if (auth) row.authority_level_required = auth;
  const verticals = arrPrefix(extracted.asset_verticals_required, 'VERT-');
  if (verticals.length) row.asset_verticals_required = verticals;
  const systems = arrPrefix(extracted.systems_required, 'SYS-');
  if (systems.length) row.systems_required = systems;
  const phasesV2 = arrPrefix(extracted.phases_required, 'PHASE-');
  if (phasesV2.length) row.phases_required = phasesV2;
  const workstreams = arrPrefix(extracted.workstreams_required, 'WS-');
  if (workstreams.length) row.workstreams_required = workstreams;
  const envs = arrPrefix(extracted.work_environment_required, 'ENV-');
  if (envs.length) row.work_environment_required = envs;
  const prefTools = strArray(extracted.preferred_tools);
  if (prefTools.length) row.preferred_tools = prefTools;
  const prefStandards = strArray(extracted.preferred_standards);
  if (prefStandards.length) row.preferred_standards = prefStandards;
  const prefCreds = strArray(extracted.preferred_credentials);
  if (prefCreds.length) row.preferred_credentials = prefCreds;
  if (typeof extracted.sponsorship_available === 'boolean') {
    row.sponsorship_available = extracted.sponsorship_available;
  }

  const { data: role, error: roleErr } = await supabase
    .from('_role')
    .insert(row)
    .select('id')
    .single();
  if (roleErr || !role) throw new Error(`Role insert failed: ${roleErr?.message}`);

  // ── Requirements: hard skills, soft requirements, certifications ──
  let requirementsInserted = 0;
  const reqRows: Array<Record<string, unknown>> = [];

  const skills = extracted.skills as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(skills)) {
    for (const s of skills) {
      if (!s?.skill) continue;
      reqRows.push({
        role_id: role.id,
        skill: String(s.skill),
        min_years: Number(s.min_years) || 0,
        required: Boolean(s.required) ?? false,
        priority: Number(s.priority) || 1,
        category: (s.category as string) ?? 'hard_skill',
      });
    }
  }

  const softReqs = extracted.soft_requirements as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(softReqs)) {
    for (const s of softReqs) {
      if (!s?.skill) continue;
      reqRows.push({
        role_id: role.id,
        skill: String(s.skill),
        min_years: 0,
        required: false,
        priority: Number(s.priority) || 1,
        category: (s.category as string) ?? 'soft_skill',
      });
    }
  }

  const certs = extracted.certifications_required as string[] | undefined;
  if (Array.isArray(certs)) {
    for (const cert of certs) {
      if (typeof cert !== 'string' || !cert.trim()) continue;
      reqRows.push({
        role_id: role.id,
        skill: cert,
        min_years: 0,
        required: true,
        priority: 5,
        category: 'hard_skill',
      });
    }
  }

  if (reqRows.length) {
    const { error: reqErr } = await supabase.from('_role_requirements').insert(reqRows);
    if (reqErr) console.warn('[jd-import] requirement insert failed:', reqErr.message);
    else requirementsInserted = reqRows.length;
  }

  return { roleId: role.id, requirementsInserted };
}

/**
 * Ingest a single JD file buffer into a new _role. Throws on any hard failure.
 */
export async function ingestRoleFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string | undefined,
  createdBy: string | null,
): Promise<IngestResult> {
  const promptTemplate = await getPrompt('role_extraction');
  if (!promptTemplate) throw new Error('role_extraction prompt not found in _prompts table');

  // 1. Extract text — fall back to vision OCR for scanned/empty documents.
  let jdText = '';
  let visionUsed = false;
  try {
    jdText = await extractText(buffer, filename, mimeType);
  } catch (err) {
    console.warn('[jd-import] text extraction failed:', (err as Error).message);
  }
  if (!jdText.trim()) {
    try {
      jdText = await visionOcr(buffer, filename, mimeType);
      visionUsed = true;
    } catch (err) {
      console.warn('[jd-import] vision OCR failed:', (err as Error).message);
    }
  }
  if (!jdText.trim()) {
    throw new Error('Could not extract any text from the document, even with vision OCR');
  }

  // 2. LLM extraction.
  const extracted = await extractRoleFromText(jdText, promptTemplate);
  if (!extracted.title) {
    throw new Error('The role_extraction prompt could not identify a role title in this document');
  }

  // 3. Insert role + requirements.
  const { roleId, requirementsInserted } = await insertRole(extracted, jdText, createdBy);

  // 4. TET v2 completeness — share of v2 taxonomy fields the extraction filled.
  const filledV2 = TET_V2_FIELDS.filter(f => isFilled(extracted[f])).length;
  const tetCompleteness = Math.round((filledV2 / TET_V2_FIELDS.length) * 100);

  return {
    roleId,
    title: String(extracted.title),
    requirementsInserted,
    tetCompleteness,
    visionUsed,
    jdTextLength: jdText.length,
  };
}
