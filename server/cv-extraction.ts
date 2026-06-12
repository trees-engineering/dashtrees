import { supabase } from './db.js';
import { getPrompt, callLlmWithMessages } from './llm.js';

const CV_TEXT_CAP = 50_000;

export async function extractFromCv(
  promptKey: 'cv_extraction_basic' | 'cv_extraction_tet',
  cvText: string,
): Promise<Record<string, unknown>> {
  const prompt = await getPrompt(promptKey);
  if (!prompt) {
    console.warn(`[cv-extraction] Prompt not found: ${promptKey}`);
    return {};
  }
  const { text: raw } = await callLlmWithMessages(
    [
      { role: 'system', content: prompt },
      { role: 'user', content: cvText.slice(0, CV_TEXT_CAP) },
    ],
    { jsonMode: true, temperature: 0, maxTokens: 4096 },
  );
  try {
    return (JSON.parse(raw) as Record<string, unknown>) ?? {};
  } catch {
    console.warn(`[cv-extraction] JSON parse failed for ${promptKey}`);
    return {};
  }
}

/** Upload a CV buffer to the documents bucket. Returns the storage key. */
export async function uploadCvToStorage(
  talentId: string,
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  if (!supabase) throw new Error('Database not configured');
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `cvs/${talentId}/${safeName}`;
  const { error } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return storagePath;
}

/** Insert a new _cv_extractions row. Returns the new row's id. */
export async function insertCvExtraction(
  talentId: string,
  rawCvText: string,
  llmExtracted: Record<string, unknown>,
): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('_cv_extractions')
    .insert({ talent_id: talentId, raw_cv_text: rawCvText, llm_extracted: llmExtracted })
    .select('id')
    .single();
  if (error) {
    console.warn('[cv-extraction] Failed to insert _cv_extractions:', error.message);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

// ---------------------------------------------------------------------------
// Enum maps
// ---------------------------------------------------------------------------

const VISA_STATUS_MAP: Record<string, string> = {
  citizen: 'citizen',
  permanent_resident: 'permanent_resident',
  work_visa: 'work_visa',
  sponsorship_needed: 'sponsorship_needed',
  'work visa': 'work_visa',
  'permanent resident': 'permanent_resident',
};

const RATE_TYPE_MAP: Record<string, string> = {
  day: 'day', daily: 'day', day_rate: 'day', daily_rate: 'day',
  hourly: 'hourly', hourly_rate: 'hourly',
  monthly: 'monthly', monthly_rate: 'monthly',
};

const AVAIL_MAP: Record<string, string> = {
  yes: 'yes', maybe: 'maybe',
  no: 'maybe', // per Treelance extraction rules: never hard "no"
};

const ROTATION_MAP: Record<string, string> = {
  remote: 'remote', hybrid: 'hybrid',
  onsite: 'onsite', 'on-site': 'onsite', office: 'onsite',
};

const SENIORITY_MAP: Record<string, string> = {
  junior: 'junior', mid: 'mid', intermediate: 'mid', senior: 'senior',
  staff: 'staff', lead: 'lead', principal: 'principal', executive: 'executive',
};

const EDUC_LEVEL_MAP: Record<string, string> = {
  high_school: 'high_school', vocational: 'vocational',
  bachelor: 'bachelor', masters: 'master', master: 'master',
  phd: 'phd', doctorate: 'phd',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function arr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}
function mapEnum(v: unknown, map: Record<string, string>): string | null {
  const s = str(v);
  return s ? (map[s.toLowerCase()] ?? null) : null;
}
function prefixArr(v: unknown, prefix: string): string[] {
  return arr(v).filter(s => s.startsWith(prefix));
}
function bandTL(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  const i = Math.round(n);
  return i >= 0 && i <= 7 ? i : null;
}

// ---------------------------------------------------------------------------
// Field savers
// ---------------------------------------------------------------------------

export async function saveTalentBasicFields(
  talentId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  if (!supabase) return;

  const update: Record<string, unknown> = {};
  const setStr = (k: string) => { const v = str(fields[k]); if (v) update[k] = v; };
  setStr('name'); setStr('email'); setStr('phone');
  setStr('city'); setStr('country'); setStr('linkedin_url');

  const visaStatus = mapEnum(fields.visa_status, VISA_STATUS_MAP);
  if (visaStatus) {
    update.visa_status = visaStatus;
    if (visaStatus === 'sponsorship_needed') update.sponsorship_required = true;
  }
  const avail = mapEnum(fields.availability, AVAIL_MAP);
  if (avail) update.availability_status = avail;
  if (str(fields.available_from)) update.available_from = str(fields.available_from);
  const noticeDays = num(fields.notice_period_days);
  if (noticeDays !== null) update.notice_period_days = Math.round(noticeDays);
  const rate = num(fields.rate);
  if (rate !== null) update.rate = rate;
  const rateType = mapEnum(fields.rate_type, RATE_TYPE_MAP);
  if (rateType) update.rate_type = rateType;
  setStr('currency');
  const certs = arr(fields.certifications);
  if (certs.length) update.certifications = certs;

  if (Object.keys(update).length) {
    const { error } = await supabase.from('_talent').update(update).eq('id', talentId);
    if (error) console.warn('[cv-extraction] Basic field save failed:', error.message);
  }

  // Skills go in a separate join table
  const skills = Array.isArray(fields.skills) ? fields.skills : [];
  if (skills.length) {
    await supabase.from('_talent_skills').delete().eq('talent_id', talentId);
    const rows = skills
      .filter((s): s is Record<string, unknown> => s !== null && typeof s === 'object')
      .map(s => ({
        talent_id: talentId,
        skill_name: str(s.name) ?? str(s.skill) ?? (typeof s === 'string' ? s : null),
        years_experience: num(s.years) ?? null,
      }))
      .filter((r): r is { talent_id: string; skill_name: string; years_experience: number | null } =>
        r.skill_name !== null,
      );
    if (rows.length) await supabase.from('_talent_skills').insert(rows);
  }
}

export async function saveTalentTetFields(
  talentId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  if (!supabase) return;

  const update: Record<string, unknown> = {};
  const setStr = (k: string) => { const v = str(fields[k]); if (v) update[k] = v; };
  setStr('headline'); setStr('education_field');

  const seniority = mapEnum(fields.seniority_level, SENIORITY_MAP);
  if (seniority) update.seniority_level = seniority;
  const educLevel = mapEnum(fields.education_level, EDUC_LEVEL_MAP);
  if (educLevel) update.education_level = educLevel;
  const rotation = mapEnum(fields.rotation_preference, ROTATION_MAP);
  if (rotation) update.rotation_preference = rotation;
  const tl = bandTL(fields.tl_band);
  if (tl !== null) update.tl_band = tl;

  const industries = arr(fields.industries);
  if (industries.length) update.industries = industries;
  const languages = arr(fields.languages);
  if (languages.length) update.languages = languages;
  const softSkills = arr(fields.soft_skills);
  if (softSkills.length) update.soft_skills = softSkills;

  // TET v2.0 — prefix-validated codes only
  const jf = str(fields.job_function);
  if (jf?.startsWith('FUNC-')) update.job_function = jf;
  const secFuncs = prefixArr(fields.secondary_functions, 'FUNC-');
  if (secFuncs.length) update.secondary_functions = secFuncs;
  const pd = str(fields.primary_discipline);
  if (pd?.startsWith('DISC-')) update.primary_discipline = pd;
  const secDiscs = prefixArr(fields.secondary_disciplines, 'DISC-');
  if (secDiscs.length) update.secondary_disciplines = secDiscs;
  const ct = str(fields.career_track);
  if (ct?.startsWith('TRACK-')) update.career_track = ct;
  const avVerts = prefixArr(fields.asset_verticals, 'VERT-');
  if (avVerts.length) update.asset_verticals = avVerts;
  const sys = prefixArr(fields.primary_systems, 'SYS-');
  if (sys.length) update.primary_systems = sys;
  const regs = prefixArr(fields.regions_worked, 'REG-');
  if (regs.length) update.regions_worked = regs;

  if (Array.isArray(fields.credentials_v2) && fields.credentials_v2.length)
    update.credentials_v2 = fields.credentials_v2;
  if (Array.isArray(fields.deliverables_v2) && fields.deliverables_v2.length)
    update.deliverables_v2 = fields.deliverables_v2;
  if (Array.isArray(fields.experiences) && fields.experiences.length)
    update.experiences = fields.experiences;
  if (Array.isArray(fields.education) && fields.education.length)
    update.education = fields.education;
  if (fields.provenance_summary && typeof fields.provenance_summary === 'object')
    update.provenance_summary = fields.provenance_summary;

  if (Object.keys(update).length) {
    const { error } = await supabase.from('_talent').update(update).eq('id', talentId);
    if (error) console.warn('[cv-extraction] TET field save failed:', error.message);
  }
}
