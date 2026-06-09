export interface FilterResult {
  passed: boolean;
  reason: string;
  filter_name: string;
  borderline?: boolean; // true = nearly passed, within tolerance band
}

export interface ScoringResult {
  total_score: number;
  skill_score: number;
  experience_score: number;
  availability_score: number;
  location_score: number;
  assessment_score: number;
  reasoning: string;
  skill_reasoning: string;
  experience_reasoning: string;
  availability_reasoning: string;
  location_reasoning: string;
  assessment_reasoning: string;
  // TET v2.0 7-dimension score breakdown
  role_discipline_fit?: number;
  asset_system_fit?: number;
  deliverables_fit?: number;
  phase_fit?: number;
  seniority_authority_fit?: number;
  credentials_tools_fit?: number;
  region_context_fit?: number;
  // TET v2.1 — provenance dimension (0 when role has no provenance_requirements)
  provenance_fit?: number;
  eligible?: boolean;
  recommended_action?: string;
  missing_data_flags?: string[];
  multipliers_applied?: Record<string, number>;
}

export interface PipelineResult {
  talent_id: string;
  talent_name: string;
  passed_filters: boolean;
  filter_results: FilterResult[];
  scores: ScoringResult | null;
  availability_status?: string;
  available_from?: string;
  notice_period_days?: number;
  location?: string;
  linkedin_url?: string;
}

// Default weights for Step 3 scoring.
export const SCORE_WEIGHTS = {
  skill: 0.50,
  experience: 0.50,
  availability: 0.00,
  location: 0.00,
  assessment: 0.00,
} as const;

export interface ScoreWeights {
  skill: number;
  experience: number;
  availability: number;
  location: number;
  assessment: number;
}

// ============================================================================
// TET v2.0 — Per-step survivor configuration
// ============================================================================

export interface StepSurvivorConfig {
  survivor_pct: number;
  survivor_cap: number;
  survivor_min: number;
}

export function computeSurvivors(poolSize: number, cfg: StepSurvivorConfig): number {
  if (poolSize <= cfg.survivor_min) return poolSize;
  return Math.max(cfg.survivor_min, Math.min(cfg.survivor_cap, Math.floor(poolSize * cfg.survivor_pct)));
}

export const DEFAULT_STEP_CONFIGS: Record<'step1' | 'step2' | 'step3' | 'step4' | 'step5', StepSurvivorConfig> = {
  step1: { survivor_pct: 0.40, survivor_cap: 100, survivor_min: 5 },
  step2: { survivor_pct: 0.50, survivor_cap: 50,  survivor_min: 5 },
  step3: { survivor_pct: 0.60, survivor_cap: 25,  survivor_min: 3 },
  step4: { survivor_pct: 0.70, survivor_cap: 15,  survivor_min: 3 },
  step5: { survivor_pct: 0.70, survivor_cap: 10,  survivor_min: 3 },
};

export interface CascadeConfig {
  weights?: Partial<ScoreWeights>;
  min_survivors?: number;
  salary_tolerance_pct?: number;
  availability_tolerance_days?: number;
  step_configs?: Partial<Record<'step1' | 'step2' | 'step3' | 'step4' | 'step5', StepSurvivorConfig>>;
}

export interface ResolvedCascadeConfig {
  weights: ScoreWeights;
  min_survivors: number;
  salary_tolerance_pct: number;
  availability_tolerance_days: number;
  step_configs?: Partial<Record<'step1' | 'step2' | 'step3' | 'step4' | 'step5', StepSurvivorConfig>>;
}

export const DEFAULT_CASCADE_CONFIG: ResolvedCascadeConfig = {
  weights: { ...SCORE_WEIGHTS },
  min_survivors: 15,
  salary_tolerance_pct: 10,
  availability_tolerance_days: 14,
};

export function mergeConfig(overrides?: CascadeConfig): ResolvedCascadeConfig {
  if (!overrides) return { ...DEFAULT_CASCADE_CONFIG, weights: { ...DEFAULT_CASCADE_CONFIG.weights } };
  return {
    weights: { ...DEFAULT_CASCADE_CONFIG.weights, ...overrides.weights },
    min_survivors: overrides.min_survivors ?? DEFAULT_CASCADE_CONFIG.min_survivors,
    salary_tolerance_pct: overrides.salary_tolerance_pct ?? DEFAULT_CASCADE_CONFIG.salary_tolerance_pct,
    availability_tolerance_days: overrides.availability_tolerance_days ?? DEFAULT_CASCADE_CONFIG.availability_tolerance_days,
    step_configs: overrides.step_configs,
  };
}

export function resolveStepConfig(
  step: 'step1' | 'step2' | 'step3' | 'step4' | 'step5',
  cfg: ResolvedCascadeConfig,
): StepSurvivorConfig {
  return { ...DEFAULT_STEP_CONFIGS[step], ...cfg.step_configs?.[step] };
}

// ============================================================================
// Cascade types
// ============================================================================

export interface CascadePrunedCandidate {
  talent_id: string;
  talent_name: string;
  reason: string;
  borderline: boolean;
  skill_coverage?: {
    score: number;
    matched: string[];
    unmatched: string[];
  };
}

export type FilterBehavior = 'skip' | 'borderline' | 'hard_reject';

export interface CascadeNode {
  filter_name: string;
  filter_description: string;
  filter_priority: number;
  filter_behavior: FilterBehavior;
  candidates_in: number;
  candidates_out: number;
  pruned: CascadePrunedCandidate[];
  survived_ids: string[];
}

export interface PlanBCandidate {
  talent_id: string;
  talent_name: string;
  missed_filter: string;
  missed_reason: string;
  borderline: boolean;
  soft_score: number;
}

export interface CascadeAlert {
  filter_name: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface CascadeTree {
  role_id: string;
  role_title: string;
  total_candidates: number;
  nodes: CascadeNode[];
  hard_filter_nodes: CascadeNode[];
  soft_filter_nodes: CascadeNode[];
  plan_b: PlanBCandidate[];
  scored: Array<PipelineResult & { rank: number }>;
  alerts: CascadeAlert[];
  threshold_hit: boolean;
  config: ResolvedCascadeConfig;
  created_at: string;
  // Incremental-matching support (set on full runs; carried by incremental runs).
  // Per-step minimum surviving effective score (score × completeness), so a later
  // newcomer can be judged against the same bar without re-ranking the pool.
  step_cutoffs?: { floor: number; step1: number; step2: number; step3: number; step4: number; step5: number };
  // Every verified candidate the run considered — used to detect new candidates.
  evaluated_talent_ids?: string[];
  mode?: 'full' | 'incremental';
}

export const MIN_SURVIVORS_THRESHOLD = 15;
export const PLAN_B_SURFACE_THRESHOLD = 3;
