import type { Talent, TalentSkill, EducationRecognitionLevel } from '../types/talent.js';
import type { Role, RoleRequirement, ProvenanceRequirements } from '../types/role.js';
import type { ScoringResult } from './types.js';
import { SCORE_WEIGHTS } from './types.js';
import { callLlm, callLlmWithModelOverride, getPrompt, type LlmOverride } from '../llm.js';

/** Build a text profile from structured talent fields when no CV document exists */
function synthesizeProfileText(t: Talent, skills: TalentSkill[]): string {
  const lines: string[] = [];
  lines.push(`Name: ${t.name}`);
  if (t.seniority_level) lines.push(`Seniority: ${t.seniority_level}`);
  if (t.education_level || t.education_field) {
    lines.push(`Education: ${[t.education_level, t.education_field].filter(Boolean).join(' in ')}`);
  }
  if (t.city || t.country || t.location) {
    lines.push(`Location: ${[t.city, t.country].filter(Boolean).join(', ') || t.location}`);
  }
  if (skills.length > 0) {
    const skillLines = skills.map(s => {
      const parts = [s.skill_name];
      if (s.years_experience != null) parts.push(`${s.years_experience}y`);
      return parts.join(' — ');
    });
    lines.push(`Skills: ${skillLines.join('; ')}`);
  }
  if (t.certifications?.length) lines.push(`Certifications: ${t.certifications.join(', ')}`);
  if (t.industries?.length) lines.push(`Industries: ${t.industries.join(', ')}`);
  if (t.soft_skills?.length) lines.push(`Soft skills: ${t.soft_skills.join(', ')}`);
  if (t.linkedin_url) lines.push(`LinkedIn: ${t.linkedin_url}`);
  return lines.join('\n');
}

function applyPromptTemplate(
  template: string,
  talent: Talent,
  role: Role,
  _requirements: RoleRequirement[],
  skills: TalentSkill[],
  cvText?: string,
): string {
  const candidateText = cvText ?? synthesizeProfileText(talent, skills);
  return template
    .replace('{{role_jd_text}}', role.raw_jd_text ?? role.description ?? 'Not available')
    .replace('{{role_budget}}', formatBudget(role))
    .replace('{{candidate_cv_text}}', candidateText)
    .replace('{{candidate_availability}}', formatAvailability(talent))
    .replace('{{candidate_rate}}', formatRate(talent))
    .replace('{{candidate_work_auth}}', formatWorkAuth(talent))
    .replace('{{candidate_location_pref}}', formatLocationPref(talent));
}

/** Format role budget — often not in the JD document */
function formatBudget(role: Role): string {
  if (role.salary_min == null && role.salary_max == null) return 'Not specified';
  const currency = role.budget_currency ?? '';
  if (role.salary_min != null && role.salary_max != null) return `${currency} ${role.salary_min} - ${role.salary_max}`;
  if (role.salary_max != null) return `Up to ${currency} ${role.salary_max}`;
  return `From ${currency} ${role.salary_min}`;
}

/** Format candidate availability — from onboarding conversation, not CV */
function formatAvailability(t: Talent): string {
  const parts: string[] = [];
  if (t.availability_status) parts.push(`Status: ${t.availability_status}`);
  if (t.available_from) parts.push(`Available from: ${t.available_from}`);
  if (t.notice_period_days != null) parts.push(`Notice period: ${t.notice_period_days} days`);
  return parts.join(', ') || 'Not specified';
}

/** Format candidate rate — from onboarding conversation, not CV */
function formatRate(t: Talent): string {
  if (t.rate == null) return 'Not specified';
  return `${t.currency ?? ''} ${t.rate}/${t.rate_type ?? 'day'}`.trim();
}

/** Format work authorization — from onboarding conversation, not CV */
function formatWorkAuth(t: Talent): string {
  const parts: string[] = [];
  if (t.visa_status) parts.push(t.visa_status);
  if (t.work_rights) parts.push(t.work_rights);
  return parts.join(' — ') || 'Not specified';
}

/** Format location preference — from onboarding conversation, not CV */
function formatLocationPref(t: Talent): string {
  const parts: string[] = [];
  if (t.rotation_preference) parts.push(`Preference: ${t.rotation_preference}`);
  if (t.mobility_regions?.length) parts.push(`Regions: ${t.mobility_regions.join(', ')}`);
  if (t.city || t.country) parts.push(`Current: ${[t.city, t.country].filter(Boolean).join(', ')}`);
  else if (t.location) parts.push(`Current: ${t.location}`);
  return parts.join(', ') || 'Not specified';
}

function parseScores(raw: string): Omit<ScoringResult, 'total_score'> {
  const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const clamp = (v: unknown) => Math.max(0, Math.min(100, Number(v) || 0));

  const role_discipline_fit = parsed.role_discipline_fit != null ? clamp(parsed.role_discipline_fit) : undefined;
  const asset_system_fit    = parsed.asset_system_fit != null    ? clamp(parsed.asset_system_fit)    : undefined;
  const deliverables_fit    = parsed.deliverables_fit != null    ? clamp(parsed.deliverables_fit)    : undefined;
  const phase_fit           = parsed.phase_fit != null           ? clamp(parsed.phase_fit)           : undefined;
  const seniority_authority_fit = parsed.seniority_authority_fit != null ? clamp(parsed.seniority_authority_fit) : undefined;
  const credentials_tools_fit  = parsed.credentials_tools_fit != null  ? clamp(parsed.credentials_tools_fit)  : undefined;
  const region_context_fit     = parsed.region_context_fit != null     ? clamp(parsed.region_context_fit)     : undefined;

  const skill_score = clamp(
    parsed.requirement_coverage ?? parsed.skill_score ?? role_discipline_fit ?? 0,
  );
  const experience_score = clamp(
    parsed.experience_match ?? parsed.experience_score ?? deliverables_fit ?? 0,
  );

  const eligible: boolean | undefined = parsed.eligible != null ? Boolean(parsed.eligible) : undefined;
  const recommended_action: string | undefined = typeof parsed.recommended_action === 'string'
    ? parsed.recommended_action : undefined;
  const missing_data_flags: string[] = Array.isArray(parsed.missing_data_flags)
    ? parsed.missing_data_flags.map(String) : [];
  const multipliers_applied: Record<string, number> | undefined =
    parsed.multipliers_applied && typeof parsed.multipliers_applied === 'object'
      ? parsed.multipliers_applied : undefined;

  return {
    skill_score,
    experience_score,
    availability_score: 0,
    location_score: 0,
    assessment_score: 0,
    reasoning: String(parsed.reasoning || ''),
    skill_reasoning: String(parsed.requirement_reasoning ?? parsed.skill_reasoning ?? ''),
    experience_reasoning: String(parsed.experience_reasoning || ''),
    availability_reasoning: '',
    location_reasoning: '',
    assessment_reasoning: '',
    role_discipline_fit,
    asset_system_fit,
    deliverables_fit,
    phase_fit,
    seniority_authority_fit,
    credentials_tools_fit,
    region_context_fit,
    eligible,
    recommended_action,
    missing_data_flags: missing_data_flags.length > 0 ? missing_data_flags : undefined,
    multipliers_applied,
  };
}

// ── TET v2.1 — Provenance scoring ────────────────────────────────────────────

const RECOGNITION_ORDER: EducationRecognitionLevel[] = [
  'industry_global', 'industry_regional', 'national', 'local', 'vocational', 'unclassified',
];

function hasProvenanceRequirements(pr: ProvenanceRequirements): boolean {
  return (
    (pr.career_side_required?.length ?? 0) > 0 ||
    (pr.education_recognition_required != null && pr.education_recognition_required !== 'any') ||
    pr.international_experience_required === true
  );
}

/** Returns provenance score 0-100, or null if role has no provenance requirements. */
function computeProvenanceFit(talent: Talent, role: Role): number | null {
  const pr = role.provenance_requirements;
  if (!pr || !hasProvenanceRequirements(pr)) return null;

  const ps = talent.provenance_summary;
  if (!ps) return 0;

  let careerSideScore = 1.0;
  if (pr.career_side_required?.length) {
    const primary = ps.primary_career_side;
    if (primary && pr.career_side_required.includes(primary)) {
      careerSideScore = 1.0;
    } else if (primary && (pr.career_side_preferred ?? []).includes(primary)) {
      careerSideScore = 0.7;
    } else {
      const maxYears = pr.career_side_required.reduce(
        (m, side) => Math.max(m, ps.career_side_distribution_years?.[side as keyof typeof ps.career_side_distribution_years] ?? 0), 0,
      );
      careerSideScore = maxYears > 2 ? 0.5 : 0.0;
    }
  }

  let minYearsScore = 1.0;
  if (pr.min_years_on_required_side && pr.career_side_required?.length) {
    const maxYears = pr.career_side_required.reduce(
      (m, side) => Math.max(m, ps.career_side_distribution_years?.[side as keyof typeof ps.career_side_distribution_years] ?? 0), 0,
    );
    minYearsScore = maxYears >= pr.min_years_on_required_side
      ? 1.0
      : maxYears / pr.min_years_on_required_side;
  }

  let edRecognitionScore = 1.0;
  const reqRec = pr.education_recognition_required;
  if (reqRec && reqRec !== 'any') {
    const levels = ps.education_recognition_levels_held ?? [];
    const requiredIdx = RECOGNITION_ORDER.indexOf(reqRec as EducationRecognitionLevel);
    const bestIdx = levels.reduce((best, l) => {
      const idx = RECOGNITION_ORDER.indexOf(l);
      return idx >= 0 && idx < best ? idx : best;
    }, RECOGNITION_ORDER.length);
    if (bestIdx <= requiredIdx) {
      edRecognitionScore = 1.0;
    } else if (bestIdx === requiredIdx + 1) {
      edRecognitionScore = 0.5;
    } else {
      edRecognitionScore = 0.0;
    }
  }

  let intlExpScore = 1.0;
  if (pr.international_experience_required && pr.min_countries_worked) {
    const count = ps.international_assignment_count ?? 0;
    intlExpScore = count >= pr.min_countries_worked ? 1.0 : count / pr.min_countries_worked;
  }

  return Math.round((0.40 * careerSideScore + 0.25 * minYearsScore + 0.20 * edRecognitionScore + 0.15 * intlExpScore) * 100);
}

/** Compute total score from v2.0/v2.1 dimension breakdown using role scoring_overrides (if any) */
function computeV2TotalScore(
  parsed: Omit<ScoringResult, 'total_score'>,
  role: Role,
): number | null {
  if (
    parsed.role_discipline_fit == null ||
    parsed.asset_system_fit == null ||
    parsed.deliverables_fit == null ||
    parsed.phase_fit == null ||
    parsed.seniority_authority_fit == null ||
    parsed.credentials_tools_fit == null ||
    parsed.region_context_fit == null
  ) {
    return null;
  }

  const overrides = role.scoring_overrides ?? {};
  let rdFitW    = (overrides.role_discipline_fit    ?? 25) / 100;
  const asW     = (overrides.asset_system_fit       ?? 20) / 100;
  const delW    = (overrides.deliverables_fit       ?? 20) / 100;
  const phW     = (overrides.phase_fit              ?? 15) / 100;
  let saFitW    = (overrides.seniority_authority_fit ?? 10) / 100;
  const credW   = (overrides.credentials_tools_fit  ??  5) / 100;
  const regW    = (overrides.region_context_fit     ??  5) / 100;

  const provenanceActive = parsed.provenance_fit !== undefined;
  const provenanceFit = parsed.provenance_fit ?? 0;
  let provW = 0;
  if (provenanceActive) {
    rdFitW  = Math.max(0, rdFitW  - 0.04);
    saFitW  = Math.max(0, saFitW  - 0.03);
    provW   = 0.07;
  }

  return Math.round((
    (parsed.role_discipline_fit     * rdFitW) +
    (parsed.asset_system_fit        * asW)    +
    (parsed.deliverables_fit        * delW)   +
    (parsed.phase_fit               * phW)    +
    (parsed.seniority_authority_fit * saFitW) +
    (parsed.credentials_tools_fit   * credW)  +
    (parsed.region_context_fit      * regW)   +
    (provenanceFit                  * provW)
  ) * 100) / 100;
}

export async function scoreTalentForRole(
  talent: Talent,
  role: Role,
  requirements: RoleRequirement[],
  skills: TalentSkill[],
  cvText?: string,
  options?: { promptOverride?: string; temperature?: number; model?: string; llmOverride?: LlmOverride },
): Promise<ScoringResult> {
  const template = options?.promptOverride ?? await getPrompt('cv-scoring');
  const prompt = applyPromptTemplate(template, talent, role, requirements, skills, cvText);
  const callOptions = { maxTokens: 2048, temperature: options?.temperature ?? 0, model: options?.model, operation: 'matching_score' };
  const response = options?.llmOverride
    ? await callLlmWithModelOverride(prompt, callOptions, options.llmOverride)
    : await callLlm(prompt, callOptions);
  let scores: Omit<ScoringResult, 'total_score'>;
  try {
    scores = parseScores(response.text);
  } catch (e) {
    const err = new Error(`Failed to parse LLM response as JSON: ${(e as Error).message}`);
    (err as Error & { rawResponse: string }).rawResponse = response.text;
    throw err;
  }

  const provenanceFit = computeProvenanceFit(talent, role);
  if (provenanceFit !== null) {
    scores = { ...scores, provenance_fit: provenanceFit };
  }

  const v2Total = computeV2TotalScore(scores, role);
  const total_score = v2Total ?? Math.round((
    scores.skill_score * SCORE_WEIGHTS.skill +
    scores.experience_score * SCORE_WEIGHTS.experience +
    scores.availability_score * SCORE_WEIGHTS.availability +
    scores.location_score * SCORE_WEIGHTS.location +
    scores.assessment_score * SCORE_WEIGHTS.assessment
  ) * 100) / 100;

  return {
    ...scores,
    total_score,
  };
}
