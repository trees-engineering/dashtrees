import pLimit from 'p-limit';
import { supabase } from '../db.js';
import type { Talent, TalentSkill } from '../types/talent.js';
import type { Role, RoleRequirement } from '../types/role.js';
import type {
  CascadeTree, CascadeNode, CascadePrunedCandidate,
  PipelineResult, ScoringResult, CascadeAlert, CascadeConfig, ResolvedCascadeConfig,
} from './types.js';
import { mergeConfig, resolveStepConfig, computeSurvivors } from './types.js';
import { scoreTalentForRole } from './scorer.js';
import { callLlmWithMessages } from '../llm.js';

// ============================================================================
// TET v2.0 — 5-Step LLM Scoring Funnel + Step 6 Full LLM Scoring
//
// Step 1: Function + Job Identity          → top ~40% (cap 100)
// Step 2: Asset Verticals + Systems        → top ~50% (cap 50)
// Step 3: Seniority + Track + Authority    → top ~60% (cap 25)
// Step 4: Phase + Workstream               → top ~70% (cap 15)
// Step 5: Deliverable Evidence + Creds     → top ~70% (cap 10)
// Step 6: Full LLM Scoring (individual)    — calls scoreTalentForRole()
// ============================================================================

const STEP6_CONCURRENCY = 5;

interface BatchScore {
  talent_id: string;
  score: number;
  reasoning: string;
}

function computeCoreFieldsFilled(t: Talent): number {
  let filled = 0;
  if (t.job_function ?? t.job_family) filled++;
  if (t.primary_discipline ?? t.discipline) filled++;
  if (t.career_track) filled++;
  if ((t.asset_verticals?.length ?? 0) > 0 || (t.asset_experience?.length ?? 0) > 0) filled++;
  if ((t.primary_systems?.length ?? 0) > 0) filled++;
  if (t.tl_band != null) filled++;
  if ((t.credentials_v2?.length ?? 0) > 0 || (t.certifications?.length ?? 0) > 0) filled++;
  if ((t.deliverables_v2?.length ?? 0) > 0 || (t.deliverables?.length ?? 0) > 0) filled++;
  if ((t.experiences?.length ?? 0) > 0) filled++;
  return filled; // out of 9
}

function parseBatchScores(
  raw: string,
  fallbackCandidates: Array<{ id: string }>,
  stepLabel: string,
): BatchScore[] {
  try {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const arr: Array<{ id: string; score: number; reasoning?: string }> = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.candidates) ? parsed.candidates
      : Array.isArray(parsed.results) ? parsed.results
      : Array.isArray(parsed.scores) ? parsed.scores
      : [];
    if (arr.length === 0) {
      console.warn(`[cascade] ${stepLabel} batch: LLM returned unexpected shape:`, Array.isArray(parsed) ? '[]' : Object.keys(parsed));
      return fallbackCandidates.map(c => ({ talent_id: c.id, score: 50, reasoning: 'Unexpected LLM response shape' }));
    }
    return arr.map(p => ({
      talent_id: p.id,
      score: Math.max(0, Math.min(100, Number(p.score) || 0)),
      reasoning: p.reasoning ?? '',
    }));
  } catch (err) {
    console.error(`[cascade] ${stepLabel} batch parse failed:`, err);
    return fallbackCandidates.map(c => ({ talent_id: c.id, score: 50, reasoning: 'Parse error — default score' }));
  }
}

function prunePool(
  candidates: Talent[],
  scores: Map<string, BatchScore>,
  completenessMultiplier: (t: Talent) => number,
  targetCount: number,
  stepLabel: string,
): { survivors: Talent[]; pruned: CascadePrunedCandidate[] } {
  const ranked = [...candidates].sort((a, b) => {
    const sa = (scores.get(a.id)?.score ?? 0) * completenessMultiplier(a);
    const sb = (scores.get(b.id)?.score ?? 0) * completenessMultiplier(b);
    return sb - sa;
  });

  if (candidates.length <= targetCount) {
    return { survivors: ranked, pruned: [] };
  }

  const survivors = ranked.slice(0, targetCount);
  const pruned: CascadePrunedCandidate[] = ranked.slice(targetCount).map(t => {
    const s = scores.get(t.id);
    const mult = completenessMultiplier(t);
    return {
      talent_id: t.id,
      talent_name: t.name,
      reason: `${stepLabel} score: ${s?.score ?? 0}/100 (×${(mult * 100).toFixed(0)}% completeness) — ${s?.reasoning ?? 'no reasoning'}`,
      borderline: false,
    };
  });

  return { survivors, pruned };
}

// ============================================================================
// Step 1: Function + Job Identity
// ============================================================================

const STEP1_BATCH_SIZE = 30;

async function scoreStep1Batch(
  role: Role,
  candidates: Array<{ id: string; headline: string; job_function: string; job_family: string; primary_discipline: string; discipline: string; career_track: string; industries: string[] }>,
): Promise<BatchScore[]> {
  if (candidates.length === 0) return [];

  const roleCtx = [
    `Title: "${role.title}"`,
    role.job_function_required ? `Function required: ${role.job_function_required}` : role.job_family ? `TET Family: ${role.job_family}` : null,
    role.discipline_required ? `Discipline required: ${role.discipline_required}` : role.discipline ? `Discipline: ${role.discipline}` : null,
    role.career_track_required?.length ? `Career tracks accepted: ${role.career_track_required.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const candidateList = candidates.map((c, i) =>
    `${i + 1}. ID: "${c.id}" | Function: ${c.job_function || c.job_family || 'not specified'} | Discipline: ${c.primary_discipline || c.discipline || 'not specified'} | Track: ${c.career_track || 'not specified'} | Headline: ${c.headline || 'not specified'} | Industries: ${c.industries.length ? c.industries.join(', ') : 'not specified'}`,
  ).join('\n');

  const response = await callLlmWithMessages([
    {
      role: 'system',
      content: 'You are a specialist recruiter. Score each candidate\'s function and job identity alignment to the role. Return valid JSON only.',
    },
    {
      role: 'user',
      content: `## Role\n${roleCtx}\n\n## Task\nScore each candidate 0-100 on function + job identity match:\n- 80-100: Function/discipline directly matches role requirements\n- 50-79: Adjacent function, plausible fit\n- 20-49: Weak overlap — transferable but different function\n- 0-19: Wrong function entirely\n\nFocus on FUNC-* and DISC-* alignment, not skill depth.\n\n## Candidates\n${candidateList}\n\nReturn JSON array: [{"id": "talent_id", "score": 0-100, "reasoning": "one sentence"}]`,
    },
  ], { jsonMode: true, temperature: 0, maxTokens: 4096, operation: 'matching_step1' });

  return parseBatchScores(response.text, candidates, 'Step 1');
}

async function runStep1(
  role: Role,
  candidates: Talent[],
  cfg: ResolvedCascadeConfig,
): Promise<{ scores: Map<string, BatchScore>; survivors: Talent[]; pruned: CascadePrunedCandidate[] }> {
  const stepCfg = resolveStepConfig('step1', cfg);
  const targetCount = computeSurvivors(candidates.length, stepCfg);
  const scores = new Map<string, BatchScore>();

  if (candidates.length <= stepCfg.survivor_min) {
    for (const t of candidates) scores.set(t.id, { talent_id: t.id, score: 100, reasoning: 'Small pool — all proceed' });
    return { scores, survivors: candidates, pruned: [] };
  }

  const batches: Array<Array<{ id: string; headline: string; job_function: string; job_family: string; primary_discipline: string; discipline: string; career_track: string; industries: string[] }>> = [];
  for (let i = 0; i < candidates.length; i += STEP1_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + STEP1_BATCH_SIZE).map(t => ({
      id: t.id,
      headline: t.headline ?? '',
      job_function: t.job_function ?? '',
      job_family: t.job_family ?? '',
      primary_discipline: t.primary_discipline ?? '',
      discipline: t.discipline ?? '',
      career_track: t.career_track ?? '',
      industries: t.industries ?? [],
    })));
  }

  console.log(`[cascade] Step 1: Function+Identity screening ${candidates.length} candidates in ${batches.length} batches → target ${targetCount}`);
  const batchResults = await Promise.all(batches.map(batch => scoreStep1Batch(role, batch)));
  for (const results of batchResults) {
    for (const r of results) scores.set(r.talent_id, r);
  }

  const mult = (t: Talent) => Math.max(0.4, computeCoreFieldsFilled(t) / 9);
  return { scores, ...prunePool(candidates, scores, mult, targetCount, 'Step 1 (Function+Identity)') };
}

// ============================================================================
// Step 2: Asset Verticals + Systems
// ============================================================================

const STEP2_BATCH_SIZE = 20;

async function scoreStep2Batch(
  role: Role,
  candidates: Array<{ id: string; asset_verticals: string[]; asset_experience: string[]; primary_systems: string[]; work_environments_experienced: string[] }>,
): Promise<BatchScore[]> {
  if (candidates.length === 0) return [];

  const verticals = role.asset_verticals_required?.length ? role.asset_verticals_required
    : role.asset_experience_required?.length ? role.asset_experience_required : [];
  const systems = role.systems_required?.length ? role.systems_required : [];
  const envs = role.work_environment_required?.length ? role.work_environment_required : [];

  const roleCtx = [
    `Title: "${role.title}"`,
    verticals.length ? `Asset verticals required: ${verticals.join(', ')}` : null,
    systems.length ? `Systems required: ${systems.join(', ')}` : null,
    envs.length ? `Work environment required: ${envs.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const candidateList = candidates.map((c, i) => {
    const verts = [...(c.asset_verticals ?? []), ...(c.asset_experience ?? [])].filter(Boolean);
    return `${i + 1}. ID: "${c.id}" | Asset verticals: ${verts.length ? verts.join(', ') : 'not specified'} | Systems: ${c.primary_systems.length ? c.primary_systems.join(', ') : 'not specified'} | Environments: ${c.work_environments_experienced.length ? c.work_environments_experienced.join(', ') : 'not specified'}`;
  }).join('\n');

  const systemsNote = systems.length ? '' : '\nNote: No specific systems required — score purely on asset vertical alignment.';

  const response = await callLlmWithMessages([
    {
      role: 'system',
      content: 'You are a specialist recruiter. Score each candidate\'s asset vertical and systems alignment to the role. Adjacency counts — partial credit for adjacent verticals. Return valid JSON only.',
    },
    {
      role: 'user',
      content: `## Role\n${roleCtx}${systemsNote}\n\n## Task\nScore each candidate 0-100 on asset verticals + systems alignment:\n- 90-100: Direct match on both verticals and systems\n- 70-89: Vertical match, partial systems\n- 50-69: Adjacent vertical with some system overlap\n- 20-49: Weak adjacency — some transferable experience\n- 0-19: Unrelated verticals\n\n## Candidates\n${candidateList}\n\nReturn JSON array: [{"id": "talent_id", "score": 0-100, "reasoning": "one sentence"}]`,
    },
  ], { jsonMode: true, temperature: 0, maxTokens: 4096, operation: 'matching_step2' });

  return parseBatchScores(response.text, candidates, 'Step 2');
}

async function runStep2(
  role: Role,
  candidates: Talent[],
  cfg: ResolvedCascadeConfig,
): Promise<{ scores: Map<string, BatchScore>; survivors: Talent[]; pruned: CascadePrunedCandidate[] }> {
  const stepCfg = resolveStepConfig('step2', cfg);
  const targetCount = computeSurvivors(candidates.length, stepCfg);
  const scores = new Map<string, BatchScore>();

  if (candidates.length <= stepCfg.survivor_min) {
    for (const t of candidates) scores.set(t.id, { talent_id: t.id, score: 100, reasoning: 'Small pool — all proceed' });
    return { scores, survivors: candidates, pruned: [] };
  }

  const batches: Array<Array<{ id: string; asset_verticals: string[]; asset_experience: string[]; primary_systems: string[]; work_environments_experienced: string[] }>> = [];
  for (let i = 0; i < candidates.length; i += STEP2_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + STEP2_BATCH_SIZE).map(t => ({
      id: t.id,
      asset_verticals: t.asset_verticals ?? [],
      asset_experience: t.asset_experience ?? [],
      primary_systems: t.primary_systems ?? [],
      work_environments_experienced: t.work_environments_experienced ?? [],
    })));
  }

  console.log(`[cascade] Step 2: Asset+Systems scoring ${candidates.length} candidates in ${batches.length} batches → target ${targetCount}`);
  const batchResults = await Promise.all(batches.map(batch => scoreStep2Batch(role, batch)));
  for (const results of batchResults) {
    for (const r of results) scores.set(r.talent_id, r);
  }

  const mult = (t: Talent) => Math.max(0.4, computeCoreFieldsFilled(t) / 9);
  return { scores, ...prunePool(candidates, scores, mult, targetCount, 'Step 2 (Asset+Systems)') };
}

// ============================================================================
// Step 3: Seniority + Career Track + Authority
// ============================================================================

const STEP3_BATCH_SIZE = 15;

async function scoreStep3Batch(
  role: Role,
  candidates: Array<{ id: string; tl_band: string; career_track: string; authority_level: string; seniority_level: string }>,
): Promise<BatchScore[]> {
  if (candidates.length === 0) return [];

  const flexibility = role.seniority_band_flexibility ?? 1;
  const roleCtx = [
    `Title: "${role.title}"`,
    role.seniority_band_required ? `Seniority band required: ${role.seniority_band_required} (±${flexibility} band flexibility)` : null,
    (role.tl_band_min != null || role.tl_band_max != null)
      ? `TL Band range: TL${role.tl_band_min ?? '?'} – TL${role.tl_band_max ?? '?'}`
      : null,
    role.career_track_required?.length ? `Career tracks required: ${role.career_track_required.join(', ')}` : null,
    role.authority_level_required ? `Authority level required: ${role.authority_level_required}` : null,
  ].filter(Boolean).join('\n');

  const candidateList = candidates.map((c, i) =>
    `${i + 1}. ID: "${c.id}" | TL Band: ${c.tl_band || 'not specified'} | Career track: ${c.career_track || 'not specified'} | Authority: ${c.authority_level || 'not specified'} | Seniority: ${c.seniority_level || 'not specified'}`,
  ).join('\n');

  const response = await callLlmWithMessages([
    {
      role: 'system',
      content: 'You are a specialist recruiter. Score each candidate\'s seniority, career track, and authority level alignment to the role. authority_level="not specified" is unknown, not disqualifying. Return valid JSON only.',
    },
    {
      role: 'user',
      content: `## Role\n${roleCtx}\n\n## Task\nScore each candidate 0-100 on seniority + track + authority:\n- 90-100: TL band within range, track matches, authority confirmed or not required\n- 70-89: TL band close (1 band off), track adjacent\n- 40-69: TL band 2 bands off or track mismatch\n- 0-39: Clearly wrong seniority tier or incompatible track\n\nNote: missing authority_level = unknown, not disqualifying. TL band must be read together with career_track (TL4 engineer != TL4 technician).\n\n## Candidates\n${candidateList}\n\nReturn JSON array: [{"id": "talent_id", "score": 0-100, "reasoning": "one sentence"}]`,
    },
  ], { jsonMode: true, temperature: 0, maxTokens: 4096, operation: 'matching_step3' });

  return parseBatchScores(response.text, candidates, 'Step 3');
}

async function runStep3(
  role: Role,
  candidates: Talent[],
  cfg: ResolvedCascadeConfig,
): Promise<{ scores: Map<string, BatchScore>; survivors: Talent[]; pruned: CascadePrunedCandidate[] }> {
  const stepCfg = resolveStepConfig('step3', cfg);
  const targetCount = computeSurvivors(candidates.length, stepCfg);
  const scores = new Map<string, BatchScore>();

  if (candidates.length <= stepCfg.survivor_min) {
    for (const t of candidates) scores.set(t.id, { talent_id: t.id, score: 100, reasoning: 'Small pool — all proceed' });
    return { scores, survivors: candidates, pruned: [] };
  }

  const batches: Array<Array<{ id: string; tl_band: string; career_track: string; authority_level: string; seniority_level: string }>> = [];
  for (let i = 0; i < candidates.length; i += STEP3_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + STEP3_BATCH_SIZE).map(t => ({
      id: t.id,
      tl_band: t.tl_band != null ? `TL${t.tl_band}` : '',
      career_track: t.career_track ?? '',
      authority_level: t.authority_level ?? 'not specified',
      seniority_level: t.seniority_level ?? '',
    })));
  }

  console.log(`[cascade] Step 3: Seniority+Track+Auth scoring ${candidates.length} candidates in ${batches.length} batches → target ${targetCount}`);
  const batchResults = await Promise.all(batches.map(batch => scoreStep3Batch(role, batch)));
  for (const results of batchResults) {
    for (const r of results) scores.set(r.talent_id, r);
  }

  const mult = (_t: Talent) => 1.0;
  return { scores, ...prunePool(candidates, scores, mult, targetCount, 'Step 3 (Seniority+Track+Auth)') };
}

// ============================================================================
// Step 4: Phase + Workstream
// ============================================================================

const STEP4_BATCH_SIZE = 15;

function formatPhaseExposurePct(phasePct: Record<string, number> | undefined | null): string {
  if (!phasePct || Object.keys(phasePct).length === 0) return 'phase history not specified';
  return Object.entries(phasePct)
    .sort((a, b) => b[1] - a[1])
    .map(([phase, pct]) => `${Math.round(pct * 100)}% ${phase}`)
    .join(', ');
}

async function scoreStep4Batch(
  role: Role,
  candidates: Array<{ id: string; phase_exposure_pct_str: string; phase_exposure: string[]; workstreams: string[] }>,
): Promise<BatchScore[]> {
  if (candidates.length === 0) return [];

  const roleCtx = [
    `Title: "${role.title}"`,
    role.phases_required?.length ? `Phases required: ${role.phases_required.join(', ')}` : role.phase_exposure_required?.length ? `Phases required: ${role.phase_exposure_required.join(', ')}` : null,
    role.workstreams_required?.length ? `Workstreams required: ${role.workstreams_required.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const candidateList = candidates.map((c, i) =>
    `${i + 1}. ID: "${c.id}" | Phase distribution: ${c.phase_exposure_pct_str} | Phase exposure: ${c.phase_exposure.length ? c.phase_exposure.join(', ') : 'not specified'} | Workstreams: ${c.workstreams.length ? c.workstreams.join(', ') : 'not specified'}`,
  ).join('\n');

  const response = await callLlmWithMessages([
    {
      role: 'system',
      content: 'You are a specialist recruiter. Score each candidate\'s project phase exposure and workstream alignment. If all phase data is null, treat as "phase history not specified" — do not penalise heavily for missing data. Return valid JSON only.',
    },
    {
      role: 'user',
      content: `## Role\n${roleCtx}\n\n## Task\nScore each candidate 0-100 on phase + workstream fit:\n- 90-100: Primary phase clearly matches required phases, workstream aligns\n- 70-89: Phase touched but not primary, workstream adjacent\n- 40-69: Some phase exposure but mismatch on primary\n- 20-39: Weak phase alignment\n- 0-19: No relevant phase/workstream exposure\n\nNote: phase_distribution = % of last 5 years per phase. "phase history not specified" means the data hasn't been collected yet — apply moderate score (40-60) rather than penalising.\n\n## Candidates\n${candidateList}\n\nReturn JSON array: [{"id": "talent_id", "score": 0-100, "reasoning": "one sentence"}]`,
    },
  ], { jsonMode: true, temperature: 0, maxTokens: 4096, operation: 'matching_step4' });

  return parseBatchScores(response.text, candidates, 'Step 4');
}

async function runStep4(
  role: Role,
  candidates: Talent[],
  cfg: ResolvedCascadeConfig,
): Promise<{ scores: Map<string, BatchScore>; survivors: Talent[]; pruned: CascadePrunedCandidate[] }> {
  const stepCfg = resolveStepConfig('step4', cfg);
  const targetCount = computeSurvivors(candidates.length, stepCfg);
  const scores = new Map<string, BatchScore>();

  if (candidates.length <= stepCfg.survivor_min) {
    for (const t of candidates) scores.set(t.id, { talent_id: t.id, score: 100, reasoning: 'Small pool — all proceed' });
    return { scores, survivors: candidates, pruned: [] };
  }

  const batches: Array<Array<{ id: string; phase_exposure_pct_str: string; phase_exposure: string[]; workstreams: string[] }>> = [];
  for (let i = 0; i < candidates.length; i += STEP4_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + STEP4_BATCH_SIZE).map(t => {
      const expWorkstreams = (t.experiences ?? []).flatMap(e => e.workstreams ?? []);
      const expPhases = (t.experiences ?? []).flatMap(e => e.phases ?? []);
      const allPhases = [...new Set([...(t.phase_exposure ?? []), ...expPhases])];
      const allWorkstreams = [...new Set(expWorkstreams)];
      return {
        id: t.id,
        phase_exposure_pct_str: formatPhaseExposurePct(t.phase_exposure_pct),
        phase_exposure: allPhases,
        workstreams: allWorkstreams,
      };
    }));
  }

  console.log(`[cascade] Step 4: Phase+Workstream scoring ${candidates.length} candidates in ${batches.length} batches → target ${targetCount}`);
  const batchResults = await Promise.all(batches.map(batch => scoreStep4Batch(role, batch)));
  for (const results of batchResults) {
    for (const r of results) scores.set(r.talent_id, r);
  }

  const mult = (_t: Talent) => 1.0;
  return { scores, ...prunePool(candidates, scores, mult, targetCount, 'Step 4 (Phase+Workstream)') };
}

// ============================================================================
// Step 5: Deliverable Evidence + Credentials
// ============================================================================

const STEP5_BATCH_SIZE = 10;

async function scoreStep5Batch(
  role: Role,
  candidates: Array<{
    id: string;
    deliverables_summary: string;
    credentials_summary: string;
  }>,
): Promise<BatchScore[]> {
  if (candidates.length === 0) return [];

  const delRequired = role.deliverables_required_v2?.length
    ? role.deliverables_required_v2.map(d => `${d.deliverable_id} (min evidence level ${d.min_evidence_level ?? 3}, weight ${d.weight ?? 1.0})`).join(', ')
    : role.deliverables_required?.length ? role.deliverables_required.join(', ') : 'not specified';

  const credsRequired = role.credentials_required?.length
    ? role.credentials_required.map(c => `${c.credential_id}${c.mandatory ? ' [MANDATORY]' : ' [preferred]'}`).join(', ')
    : 'not specified';

  const roleCtx = [
    `Title: "${role.title}"`,
    `Deliverables required: ${delRequired}`,
    `Credentials required: ${credsRequired}`,
    role.preferred_tools?.length ? `Preferred tools: ${role.preferred_tools.join(', ')}` : null,
    role.preferred_standards?.length ? `Preferred standards: ${role.preferred_standards.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const candidateList = candidates.map((c, i) =>
    `${i + 1}. ID: "${c.id}"\n   Deliverables: ${c.deliverables_summary}\n   Credentials: ${c.credentials_summary}`,
  ).join('\n\n');

  const response = await callLlmWithMessages([
    {
      role: 'system',
      content: 'You are a specialist recruiter. Score each candidate\'s deliverable evidence and credential alignment. Evidence level scale: 0=Mentioned, 1=Exposed, 2=Contributor, 3=Owner, 4=Reviewer/Lead, 5=Approver. Levels 3+ score much higher than 0-1. Mandatory credentials: "pass" if valid, "unknown" if no record (do NOT exclude), "fail" if expired. Return valid JSON only.',
    },
    {
      role: 'user',
      content: `## Role\n${roleCtx}\n\n## Task\nScore each candidate 0-100 on deliverable evidence + credentials:\n- 90-100: Owns (level 3+) most required deliverables, all mandatory credentials valid\n- 70-89: Owns some, contributed to others, credentials mostly clear\n- 50-69: Contributed (level 2) to most deliverables, credentials partially unknown\n- 30-49: Only exposed (level 0-1) to required deliverables\n- 0-29: Little/no evidence of required deliverables\n\nNote: A required deliverable with evidence_level=1 = ~30-40% of weight. Missing/unknown credentials are NOT a disqualifier.\n\n## Candidates\n${candidateList}\n\nReturn JSON array: [{"id": "talent_id", "score": 0-100, "reasoning": "2 sentences"}]`,
    },
  ], { jsonMode: true, temperature: 0, maxTokens: 4096, operation: 'matching_step5' });

  return parseBatchScores(response.text, candidates, 'Step 5');
}

function buildDeliverablesSummary(t: Talent): string {
  const expDels = (t.experiences ?? []).flatMap(e =>
    (e.deliverables ?? []).map(d => `${d.deliverable_id} (level ${d.evidence_level})`)
  );
  const v2Dels = (t.deliverables_v2 ?? []).map(d => `${d.deliverable_id} (level ${d.evidence_level})`);
  const legacyDels = t.deliverables ?? [];
  const all = [...expDels, ...v2Dels, ...legacyDels.filter(d => !expDels.some(e => e.startsWith(d)))];
  return all.length ? all.slice(0, 15).join(', ') : 'not specified';
}

function buildCredentialsSummary(t: Talent): string {
  const v2 = (t.credentials_v2 ?? []).map(c => `${c.credential_id} (${c.status})`);
  const legacy = (t.certifications ?? []).filter(c => !v2.some(v => v.startsWith(c)));
  const all = [...v2, ...legacy];
  return all.length ? all.slice(0, 10).join(', ') : 'not specified';
}

async function runStep5(
  role: Role,
  candidates: Talent[],
  cfg: ResolvedCascadeConfig,
): Promise<{ scores: Map<string, BatchScore>; survivors: Talent[]; pruned: CascadePrunedCandidate[] }> {
  const stepCfg = resolveStepConfig('step5', cfg);
  const targetCount = computeSurvivors(candidates.length, stepCfg);
  const scores = new Map<string, BatchScore>();

  if (candidates.length <= stepCfg.survivor_min) {
    for (const t of candidates) scores.set(t.id, { talent_id: t.id, score: 100, reasoning: 'Small pool — all proceed' });
    return { scores, survivors: candidates, pruned: [] };
  }

  const batches: Array<Array<{ id: string; deliverables_summary: string; credentials_summary: string }>> = [];
  for (let i = 0; i < candidates.length; i += STEP5_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + STEP5_BATCH_SIZE).map(t => ({
      id: t.id,
      deliverables_summary: buildDeliverablesSummary(t),
      credentials_summary: buildCredentialsSummary(t),
    })));
  }

  console.log(`[cascade] Step 5: Deliverables+Credentials scoring ${candidates.length} candidates in ${batches.length} batches → target ${targetCount}`);
  const batchResults = await Promise.all(batches.map(batch => scoreStep5Batch(role, batch)));
  for (const results of batchResults) {
    for (const r of results) scores.set(r.talent_id, r);
  }

  const mult = (_t: Talent) => 1.0;
  return { scores, ...prunePool(candidates, scores, mult, targetCount, 'Step 5 (Deliverables+Creds)') };
}

// ============================================================================
// Compute hard gate results for mandatory credentials (Step 5 post-processing)
// ============================================================================

function computeHardGateResults(
  talent: Talent,
  role: Role,
): { results: Record<string, 'pass' | 'fail' | 'unknown'>; missingFlags: string[] } {
  const results: Record<string, 'pass' | 'fail' | 'unknown'> = {};
  const missingFlags: string[] = [];

  const mandatoryCreds = (role.credentials_required ?? []).filter(c => c.mandatory);
  for (const req of mandatoryCreds) {
    const found = (talent.credentials_v2 ?? []).find(c => c.credential_id === req.credential_id);
    if (!found) {
      results[req.credential_id] = 'unknown';
      missingFlags.push(`mandatory credential ${req.credential_id} not on file — certificate upload needed`);
    } else if (found.status === 'expired' || found.status === 'expired_recently') {
      results[req.credential_id] = 'fail';
      missingFlags.push(`mandatory credential ${req.credential_id} is ${found.status}`);
    } else {
      results[req.credential_id] = 'pass';
    }
  }

  return { results, missingFlags };
}

// ============================================================================
// Main pipeline: 5-step funnel + Step 6 full LLM scoring
// ============================================================================

export async function runCascadePipeline(
  roleId: string,
  configOverrides?: CascadeConfig,
  opts?: { jobId?: string },
): Promise<CascadeTree> {
  if (!supabase) throw new Error('Database not configured');

  let effectiveOverrides = configOverrides;
  if (!effectiveOverrides) {
    const { data: lastRun } = await supabase
      .from('_cascade_runs')
      .select('cascade_tree')
      .eq('role_id', roleId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (lastRun?.cascade_tree?.config) {
      console.log(`[cascade] Loaded config from last run for role ${roleId}`);
      effectiveOverrides = lastRun.cascade_tree.config as CascadeConfig;
    }
  }
  const cfg = mergeConfig(effectiveOverrides);

  const { data: role, error: roleErr } = await supabase
    .from('_role')
    .select('*')
    .eq('id', roleId)
    .single();
  if (roleErr || !role) throw new Error(`Role not found: ${roleId}`);

  const { data: requirements } = await supabase
    .from('_role_requirements')
    .select('*')
    .eq('role_id', roleId);
  const allReqs = (requirements ?? []) as RoleRequirement[];

  const { data: talents, error: talentsErr } = await supabase
    .from('_talent')
    .select('*')
    .in('lifecycle_state', ['verified']);
  if (talentsErr) console.error('[cascade] Failed to fetch candidates:', talentsErr);
  console.log(`[cascade] Fetched ${talents?.length ?? 0} candidates from _talent`);
  const allCandidates = (talents ?? []) as Talent[];

  if (allCandidates.length === 0) {
    const emptyTree: CascadeTree = {
      role_id: roleId,
      role_title: (role as Role).title,
      total_candidates: 0,
      nodes: [],
      hard_filter_nodes: [],
      soft_filter_nodes: [],
      plan_b: [],
      scored: [],
      alerts: [{
        filter_name: 'overall',
        message: 'No eligible candidates in the pool. Candidates must be verified with a confirmed email.',
        severity: 'error',
      }],
      threshold_hit: false,
      config: cfg,
      created_at: new Date().toISOString(),
    };
    await storeCompletedCascadeRun(roleId, emptyTree, opts?.jobId);
    return emptyTree;
  }

  const cascadeRunId = await beginCascadeRun(roleId, opts?.jobId);

  try {

  const allCandidateIds = allCandidates.map(t => t.id);
  const skillsByTalent = new Map<string, TalentSkill[]>();

  for (let i = 0; i < allCandidateIds.length; i += 200) {
    const chunk = allCandidateIds.slice(i, i + 200);
    const { data: chunkSkills } = await supabase
      .from('_talent_skills')
      .select('*')
      .in('talent_id', chunk);
    for (const s of (chunkSkills ?? []) as TalentSkill[]) {
      if (!skillsByTalent.has(s.talent_id)) skillsByTalent.set(s.talent_id, []);
      skillsByTalent.get(s.talent_id)!.push(s);
    }
  }

  const tooThinCandidates: Talent[] = [];
  const eligibleCandidates: Talent[] = [];
  for (const t of allCandidates) {
    if (computeCoreFieldsFilled(t) < 3) {
      tooThinCandidates.push(t);
    } else {
      eligibleCandidates.push(t);
    }
  }

  if (tooThinCandidates.length > 0) {
    console.log(`[cascade] Pre-filter: ${tooThinCandidates.length} candidates below minimum-viable profile floor (< 3 core fields) — writing ineligible matches`);
    const db = supabase;
    for (const t of tooThinCandidates) {
      await db.from('_matches').upsert({
        talent_id: t.id,
        role_id: roleId,
        cascade_run_id: cascadeRunId,
        match_score: 0,
        skill_score: 0,
        experience_score: 0,
        availability_score: 0,
        location_score: 0,
        assessment_score: 0,
        match_reason: 'Profile too thin for scoring: fewer than 3 core fields present',
        eligible: false,
        recommended_action: 'schedule_interview_to_close_gaps',
        missing_data_flags: ['profile too thin for scoring: fewer than 3 core fields present'],
        multipliers_applied: { completeness: computeCoreFieldsFilled(t) / 9 },
        status: 'screened_out',
      }, { onConflict: 'talent_id,role_id' });
    }
  }

  console.log(`[cascade] Starting 5-step funnel for role "${(role as Role).title}" with ${eligibleCandidates.length} eligible candidates (${tooThinCandidates.length} below floor)`);

  const step1 = await runStep1(role as Role, eligibleCandidates, cfg);
  console.log(`[cascade] Step 1 complete: ${eligibleCandidates.length} → ${step1.survivors.length} candidates`);

  const step1Node: CascadeNode = {
    filter_name: 'function_job_identity',
    filter_description: `Step 1: Function + Job Identity — FUNC-*/DISC-* alignment for "${(role as Role).title}"`,
    filter_priority: 3,
    filter_behavior: 'hard_reject',
    candidates_in: eligibleCandidates.length,
    candidates_out: step1.survivors.length,
    pruned: step1.pruned,
    survived_ids: step1.survivors.map(t => t.id),
  };

  const step2 = await runStep2(role as Role, step1.survivors, cfg);
  console.log(`[cascade] Step 2 complete: ${step1.survivors.length} → ${step2.survivors.length} candidates`);

  const step2Node: CascadeNode = {
    filter_name: 'asset_systems',
    filter_description: 'Step 2: Asset Verticals + Systems — VERT-*/SYS-* alignment',
    filter_priority: 3,
    filter_behavior: 'hard_reject',
    candidates_in: step1.survivors.length,
    candidates_out: step2.survivors.length,
    pruned: step2.pruned,
    survived_ids: step2.survivors.map(t => t.id),
  };

  const step3 = await runStep3(role as Role, step2.survivors, cfg);
  console.log(`[cascade] Step 3 complete: ${step2.survivors.length} → ${step3.survivors.length} candidates`);

  const step3Node: CascadeNode = {
    filter_name: 'seniority_track_authority',
    filter_description: 'Step 3: Seniority + Career Track + Authority — TL band + TRACK-*/AUTH-* alignment',
    filter_priority: 3,
    filter_behavior: 'hard_reject',
    candidates_in: step2.survivors.length,
    candidates_out: step3.survivors.length,
    pruned: step3.pruned,
    survived_ids: step3.survivors.map(t => t.id),
  };

  const step4 = await runStep4(role as Role, step3.survivors, cfg);
  console.log(`[cascade] Step 4 complete: ${step3.survivors.length} → ${step4.survivors.length} candidates`);

  const step4Node: CascadeNode = {
    filter_name: 'phase_workstream',
    filter_description: 'Step 4: Phase Exposure + Workstream — PHASE-P*/WS-* alignment',
    filter_priority: 3,
    filter_behavior: 'hard_reject',
    candidates_in: step3.survivors.length,
    candidates_out: step4.survivors.length,
    pruned: step4.pruned,
    survived_ids: step4.survivors.map(t => t.id),
  };

  const step5 = await runStep5(role as Role, step4.survivors, cfg);
  console.log(`[cascade] Step 5 complete: ${step4.survivors.length} → ${step5.survivors.length} candidates`);

  const step5Node: CascadeNode = {
    filter_name: 'deliverables_credentials',
    filter_description: 'Step 5: Deliverable Evidence + Credentials — DEL-*/CRED-* alignment',
    filter_priority: 3,
    filter_behavior: 'hard_reject',
    candidates_in: step4.survivors.length,
    candidates_out: step5.survivors.length,
    pruned: step5.pruned,
    survived_ids: step5.survivors.map(t => t.id),
  };

  const toScore = step5.survivors;
  console.log(`[cascade] Step 6: Full LLM scoring ${toScore.length} candidates (concurrency ${STEP6_CONCURRENCY})`);

  const step6Limit = pLimit(STEP6_CONCURRENCY);
  const db = supabase;
  const scored: Array<PipelineResult & { rank: number }> = await Promise.all(
    toScore.map((talent) => step6Limit(async () => {
      const skills = skillsByTalent.get(talent.id) ?? [];

      const { data: cvExtraction } = await db
        .from('_cv_extractions')
        .select('raw_cv_text')
        .eq('talent_id', talent.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      const cvText = (cvExtraction?.raw_cv_text as string) ?? undefined;

      let scores: ScoringResult | null = null;
      try {
        scores = await scoreTalentForRole(talent, role as Role, allReqs, skills, cvText);
        if (scores) {
          const coreFieldsFilled = computeCoreFieldsFilled(talent);
          const completenessMultiplier = Math.max(0.4, coreFieldsFilled / 9);
          scores.multipliers_applied = { ...scores.multipliers_applied, completeness: completenessMultiplier };
          scores.total_score = Math.round(scores.total_score * completenessMultiplier * 100) / 100;
        }
      } catch (err) {
        console.error(`[cascade] Step 6 scoring failed for talent ${talent.id}:`, err);
      }

      return {
        talent_id: talent.id,
        talent_name: talent.name,
        passed_filters: true,
        filter_results: [],
        scores,
        availability_status: talent.availability_status,
        available_from: talent.available_from,
        notice_period_days: talent.notice_period_days,
        location: talent.location,
        linkedin_url: talent.linkedin_url,
        rank: 0,
      };
    })),
  );

  scored.sort((a, b) => {
    const scoreDiff = (b.scores?.total_score ?? -1) - (a.scores?.total_score ?? -1);
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
    const aDate = a.available_from ? new Date(a.available_from).getTime() : 0;
    const bDate = b.available_from ? new Date(b.available_from).getTime() : 0;
    if (aDate !== bDate) return aDate - bDate;
    return a.talent_id.localeCompare(b.talent_id);
  });
  scored.forEach((s, i) => { s.rank = i + 1; });

  const alerts: CascadeAlert[] = [];

  if (step1.pruned.length > 0 && step1.survivors.length < 5) {
    alerts.push({
      filter_name: 'function_job_identity',
      message: `Only ${step1.survivors.length} candidates matched the function/discipline for "${(role as Role).title}". The candidate pool may be too small or too specialized.`,
      severity: 'warning',
    });
  }

  if (step5.survivors.length < 3) {
    alerts.push({
      filter_name: 'deliverables_credentials',
      message: `Only ${step5.survivors.length} candidates passed all 5 funnel steps. Consider broadening seniority range or asset/region requirements.`,
      severity: 'warning',
    });
  }

  if (scored.length > 0 && scored[0].scores && scored[0].scores.total_score < 50) {
    alerts.push({
      filter_name: 'overall',
      message: `Best candidate scored ${scored[0].scores.total_score.toFixed(0)}/100. No strong matches found for this role.`,
      severity: 'warning',
    });
  }

  const nodes: CascadeNode[] = [step1Node, step2Node, step3Node, step4Node, step5Node];

  const tree: CascadeTree = {
    role_id: roleId,
    role_title: (role as Role).title,
    total_candidates: allCandidates.length,
    nodes,
    hard_filter_nodes: [nodes[0]],
    soft_filter_nodes: nodes.slice(1),
    plan_b: [],
    scored,
    alerts,
    threshold_hit: false,
    config: cfg,
    created_at: new Date().toISOString(),
  };

    for (const s of scored) {
      const talent = toScore.find(t => t.id === s.talent_id);
      const { results: hardGateResults, missingFlags: gateFlags } = talent
        ? computeHardGateResults(talent, role as Role)
        : { results: {}, missingFlags: [] };

      const allMissingFlags = [...(s.scores?.missing_data_flags ?? []), ...gateFlags];

      await supabase.from('_matches').upsert({
        talent_id: s.talent_id,
        role_id: roleId,
        cascade_run_id: cascadeRunId,
        match_score: s.scores?.total_score ?? 0,
        skill_score: s.scores?.skill_score ?? 0,
        experience_score: s.scores?.experience_score ?? 0,
        availability_score: s.scores?.availability_score ?? 0,
        location_score: s.scores?.location_score ?? 0,
        assessment_score: s.scores?.assessment_score ?? 0,
        match_reason: s.scores?.reasoning ?? 'Scoring failed',
        role_discipline_fit: s.scores?.role_discipline_fit ?? null,
        asset_system_fit: s.scores?.asset_system_fit ?? null,
        deliverables_fit: s.scores?.deliverables_fit ?? null,
        phase_fit: s.scores?.phase_fit ?? null,
        seniority_authority_fit: s.scores?.seniority_authority_fit ?? null,
        credentials_tools_fit: s.scores?.credentials_tools_fit ?? null,
        region_context_fit: s.scores?.region_context_fit ?? null,
        provenance_fit: s.scores?.provenance_fit ?? null,
        eligible: s.scores?.eligible ?? true,
        recommended_action: s.scores?.recommended_action ?? null,
        missing_data_flags: allMissingFlags,
        multipliers_applied: s.scores?.multipliers_applied ?? {},
        score_details: {
          skill_reasoning: s.scores?.skill_reasoning,
          experience_reasoning: s.scores?.experience_reasoning,
          availability_reasoning: s.scores?.availability_reasoning,
          location_reasoning: s.scores?.location_reasoning,
          assessment_reasoning: s.scores?.assessment_reasoning,
          step1_score: step1.scores.get(s.talent_id)?.score,
          step1_reasoning: step1.scores.get(s.talent_id)?.reasoning,
          step2_score: step2.scores.get(s.talent_id)?.score,
          step2_reasoning: step2.scores.get(s.talent_id)?.reasoning,
          step3_score: step3.scores.get(s.talent_id)?.score,
          step3_reasoning: step3.scores.get(s.talent_id)?.reasoning,
          step4_score: step4.scores.get(s.talent_id)?.score,
          step4_reasoning: step4.scores.get(s.talent_id)?.reasoning,
          step5_score: step5.scores.get(s.talent_id)?.score,
          step5_reasoning: step5.scores.get(s.talent_id)?.reasoning,
          hard_gate_results: hardGateResults,
        },
        status: s.scores ? 'suggested' : 'screened_out',
      }, { onConflict: 'talent_id,role_id' });
    }

    await completeCascadeRun(cascadeRunId, tree);

    console.log(`[cascade] Pipeline complete: ${allCandidates.length} → ${eligibleCandidates.length} (floor) → ${step1.survivors.length} → ${step2.survivors.length} → ${step3.survivors.length} → ${step4.survivors.length} → ${step5.survivors.length} → ${scored.length} scored`);
    return tree;
  } catch (err) {
    await failCascadeRun(cascadeRunId, err);
    throw err;
  }
}

// ============================================================================
// _cascade_runs lifecycle helpers
// ============================================================================

async function beginCascadeRun(roleId: string, jobId?: string): Promise<string> {
  if (!supabase) throw new Error('Database not configured');
  const { data, error } = await supabase
    .from('_cascade_runs')
    .insert({
      role_id: roleId,
      total_candidates: 0,
      cascade_tree: {},
      status: 'running',
      started_at: new Date().toISOString(),
      job_id: jobId ?? null,
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`Failed to begin cascade_run for role ${roleId}: ${error?.message ?? 'no data'}`);
  }
  return data.id;
}

async function completeCascadeRun(cascadeRunId: string, tree: CascadeTree): Promise<void> {
  if (!supabase) return;
  await supabase.from('_cascade_runs').update({
    total_candidates: tree.total_candidates,
    cascade_tree: tree,
    status: 'completed',
    completed_at: new Date().toISOString(),
  }).eq('id', cascadeRunId);
}

async function failCascadeRun(cascadeRunId: string, err: unknown): Promise<void> {
  if (!supabase) return;
  const errorMessage = err instanceof Error ? err.message : String(err);
  await supabase.from('_cascade_runs').update({
    status: 'failed',
    error_message: errorMessage.slice(0, 2000),
    completed_at: new Date().toISOString(),
  }).eq('id', cascadeRunId);
}

async function storeCompletedCascadeRun(
  roleId: string,
  tree: CascadeTree,
  jobId?: string,
): Promise<string | null> {
  if (!supabase) return null;
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('_cascade_runs')
    .insert({
      role_id: roleId,
      total_candidates: tree.total_candidates,
      cascade_tree: tree,
      status: 'completed',
      started_at: now,
      completed_at: now,
      job_id: jobId ?? null,
    })
    .select('id')
    .single();

  return data?.id ?? null;
}
