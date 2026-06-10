// ── TET v2.0 sub-types ───────────────────────────────────────────────────────

export interface RoleCredentialRequirement {
  credential_id: string;
  mandatory: boolean;
}

export interface RoleDeliverableRequirement {
  deliverable_id: string;
  min_evidence_level: number;
  weight: number;
}

export interface ScoringOverrides {
  role_discipline_fit?: number | null;
  asset_system_fit?: number | null;
  deliverables_fit?: number | null;
  phase_fit?: number | null;
  seniority_authority_fit?: number | null;
  credentials_tools_fit?: number | null;
  region_context_fit?: number | null;
}

export interface ProvenanceRequirements {
  career_side_required?: string[];
  career_side_preferred?: string[];
  min_years_on_required_side?: number | null;
  education_recognition_required?: 'industry_global' | 'industry_regional' | 'national' | 'any' | null;
  education_field_required?: string[];
  international_experience_required?: boolean;
  min_countries_worked?: number | null;
  client_intake_notes?: string | null;
}

export interface IntakeMeta {
  stage_a_complete?: boolean;
  stage_b_complete?: boolean;
  intake_call_id?: string | null;
  last_intake_at?: string | null;
  completeness_pct?: number;
}

// ── Domain types ──────────────────────────────────────────────────────────────

export type LocationRequirement = 'remote' | 'onsite' | 'hybrid';
export type RoleStatus = 'draft' | 'open' | 'closed';

export interface Role {
  id: string;
  title: string;
  description: string;

  // Candidate-facing enrichment (extracted at JD ingestion, null when uncertain)
  hiring_company?: string | null;
  summary?: string | null;

  // Budget
  salary_min?: number;
  salary_max?: number;
  budget_currency?: string;

  // Location
  location_requirement: LocationRequirement;
  location_regions: string[];
  // Structured location: index-aligned parallel arrays (city[i] is in country[i]).
  city?: string[];
  country?: string[];

  // Requirements
  provides_sponsorship: boolean;
  start_deadline?: string;

  // Soft requirements / preferences
  minimum_education?: string;
  seniority_range?: string;
  industry_preference: string[];
  languages_required?: string[];
  no_budget?: boolean;

  // TET taxonomy (v1.1 baseline + v1.2 enrichment)
  job_family?: string;
  discipline?: string;
  tl_band_min?: number;
  tl_band_max?: number;
  regional_experience_required?: string[];
  asset_experience_required?: string[];
  role_archetype_required?: string[];
  deliverables_required?: string[];
  phase_exposure_required?: string[];

  // TET v2.0 taxonomy
  job_function_required?: string;
  discipline_required?: string;
  career_track_required?: string[];
  seniority_band_required?: string;
  seniority_band_flexibility?: number;
  authority_level_required?: string;
  asset_verticals_required?: string[];
  systems_required?: string[];
  phases_required?: string[];
  workstreams_required?: string[];
  work_environment_required?: string[];
  deliverables_required_v2?: RoleDeliverableRequirement[];
  credentials_required?: RoleCredentialRequirement[];
  preferred_credentials?: string[];
  preferred_tools?: string[];
  preferred_standards?: string[];
  preferred_vendors?: string[];
  preferred_regions?: string[];
  sponsorship_available?: boolean;
  scoring_overrides?: ScoringOverrides;
  intake_meta?: IntakeMeta;

  // Cascade filter priorities (0-5 per structural filter, from JD extraction)
  filter_priorities?: Record<string, number>;

  // TET v2.1 — Provenance requirements
  provenance_requirements?: ProvenanceRequirements;

  // Raw JD text for LLM scoring
  raw_jd_text?: string;

  // Meta
  created_by: string;
  created_at: string;
  status: RoleStatus;
}

export type RequirementCategory = 'hard_skill' | 'soft_skill' | 'education' | 'seniority' | 'industry';

export interface RoleRequirement {
  id: string;
  role_id: string;
  skill: string;
  min_years: number;
  required: boolean;
  priority: number;
  category: RequirementCategory;
}
