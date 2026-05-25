// ── TET v2.0 sub-types ───────────────────────────────────────────────────────

export interface TalentCredential {
  credential_id: string;
  name_raw?: string | null;
  issuer?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  status: 'valid' | 'expired' | 'expired_recently' | 'pending' | 'unverifiable';
  evidence_source: 'cv' | 'interview' | 'certificate' | 'reference';
  evidence_url?: string | null;
  lifecycle_flag?: 'active' | 'legacy-active' | 'transition-risk' | 'deprecated' | null;
}

export interface TalentDeliverable {
  deliverable_id: string;
  evidence_level: number;
  evidence_source: 'cv' | 'interview' | 'certificate' | 'reference';
  last_used_year?: number | null;
}

export interface ExperienceDeliverable {
  deliverable_id: string;
  evidence_level: number;
  evidence_source: 'cv' | 'interview' | 'certificate' | 'reference';
  scale_note?: string | null;
}

export type CareerSide =
  | 'OPERATOR_IOC' | 'OPERATOR_NOC' | 'OPERATOR_INDEPENDENT'
  | 'OPERATOR_UTILITY' | 'OPERATOR_DEVELOPER' | 'OPERATOR_DC'
  | 'EPC' | 'OEM'
  | 'SERVICE_OILFIELD' | 'SERVICE_INSPECTION_CERT' | 'SERVICE_DRILLING'
  | 'CONSULTANCY_TECHNICAL' | 'CONSULTANCY_MANAGEMENT'
  | 'MANPOWER_AGENCY' | 'ACADEMIC' | 'PUBLIC_REGULATOR' | 'OTHER';

export type EducationRecognitionLevel =
  | 'industry_global' | 'industry_regional' | 'national'
  | 'local' | 'vocational' | 'unclassified';

export interface TalentEducation {
  level?: 'high_school' | 'diploma' | 'bachelors' | 'masters' | 'phd' | 'other' | null;
  field?: string | null;
  institution_name?: string | null;
  country?: string | null;
  recognition_level?: EducationRecognitionLevel | null;
  year?: number | null;
  raw?: string | null;
}

export interface ProvenanceSummary {
  primary_education_country?: string | null;
  education_recognition_levels_held?: EducationRecognitionLevel[];
  primary_career_side?: CareerSide | null;
  career_side_distribution_years?: Partial<Record<CareerSide, number>>;
  international_assignment_count?: number | null;
}

export interface TalentExperience {
  experience_id: string;
  employer?: string | null;
  employer_side?: CareerSide | null;
  client?: string | null;
  client_side?: CareerSide | null;
  project?: string | null;
  country?: string | null;
  region_code?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  title_raw?: string | null;
  role_archetype?: string | null;
  function?: string | null;
  discipline?: string | null;
  career_track?: string | null;
  seniority_band?: string | null;
  authority_level?: string | null;
  asset_verticals?: string[];
  systems?: string[];
  phases?: string[];
  workstreams?: string[];
  deliverables?: ExperienceDeliverable[];
  tools?: string[];
  vendors?: string[];
  scale_factors?: Record<string, string | number | null>;
  stage?: 'A' | 'B';
}

export interface EvidenceMeta {
  stage_a_complete?: boolean;
  stage_b_complete?: boolean;
  extraction_completeness_pct?: number;
  last_extracted_at?: string | null;
  last_interview_at?: string | null;
  core_fields_filled?: number;
  core_fields_total?: number;
}

export interface ScaleFactors {
  it_load_mw?: number | null;
  facility_total_mw?: number | null;
  tier_topology?: string | null;
  voltage_kv?: number | null;
  fault_level_mva?: number | null;
  project_capacity_mw?: number | null;
  mwh?: number | null;
  mtpa?: number | null;
  water_depth_m?: number | null;
  pressure_bar?: number | null;
  weld_inches?: number | null;
  free_form?: string | null;
}

// ── Lifecycle / domain types ──────────────────────────────────────────────────

export type LifecycleState =
  | 'imported'    // Admin/bulk seeded — no bot contact yet
  | 'pending'     // Started bot onboarding, no CV submitted yet
  | 'onboarded'   // Submitted CV, email not yet confirmed
  | 'verified';   // Email confirmed — eligible for matching

export type VisaStatus = 'citizen' | 'permanent_resident' | 'work_visa' | 'sponsorship_needed';
export type RateType = 'day' | 'hourly' | 'monthly';
export type RotationPreference = 'remote' | 'onsite' | 'hybrid';
export type AvailabilityStatus = 'yes' | 'maybe' | 'no';

export interface Talent {
  id: string;
  telegram_id?: number;
  name: string;
  email: string;
  phone?: string;
  location?: string; // legacy combined field — prefer city + country
  city?: string;
  country?: string;

  // Work authorization
  visa_status: VisaStatus;
  sponsorship_required: boolean;
  visa_expiration_date?: string; // ISO date
  work_rights?: string; // Additional text details

  // Work preferences
  rotation_preference: RotationPreference;
  mobility_regions: string[]; // e.g. ["EU", "UK", "Southeast Asia"]

  // Availability
  availability_status: AvailabilityStatus;
  available_from?: string; // ISO date
  notice_period_days?: number;
  availability_confidence?: number; // 0-1

  // Rate / Salary
  rate?: number;
  rate_type?: RateType;
  currency?: string;
  desired_salary_min?: number;
  desired_salary_max?: number;

  // Skills & Certs
  certifications: string[];
  soft_skills: string[];
  industries: string[];

  // Profile enrichment
  seniority_level?: string; // junior/mid/senior/lead/principal
  education_level?: string; // high_school/bachelors/masters/phd
  education_field?: string;
  headline?: string; // primary professional title from CV
  languages?: string[];
  referrals?: string[];

  // TET taxonomy (Treelance Energy Taxonomy — v1.1 baseline + v1.2 Step 2 enrichment)
  job_family?: string;
  discipline?: string;
  tl_band?: number;
  regional_experience?: string[];
  asset_experience?: string[];
  role_archetype?: string;
  deliverables?: string[];
  phase_exposure?: string[];
  age?: number;

  // TET v2.0 taxonomy
  job_function?: string;
  secondary_functions?: string[];
  primary_discipline?: string;
  secondary_disciplines?: string[];
  career_track?: string;
  authority_level?: string;
  asset_verticals?: string[];
  primary_systems?: string[];
  regions_worked?: string[];
  work_environments_experienced?: string[];
  phase_exposure_pct?: Record<string, number>;
  experiences?: TalentExperience[];
  credentials_v2?: TalentCredential[];
  deliverables_v2?: TalentDeliverable[];
  scale_factors?: ScaleFactors;
  evidence_meta?: EvidenceMeta;

  // TET v2.1 — Provenance axis
  education?: TalentEducation[];
  provenance_summary?: ProvenanceSummary;

  // LinkedIn
  linkedin_url?: string;

  // CV
  cv_storage_path?: string;
  cv_expires_at?: string; // ISO date, 90-day auto-delete

  // Lifecycle
  lifecycle_state: LifecycleState;
  consent_given_at?: string; // ISO timestamp
  last_active_at?: string;
  cv_roast_accepted_at?: string;
  email_verified?: boolean;
  email_verify_code?: string | null;
  email_verify_expires_at?: string | null;
  created_at: string;
  updated_at: string;

  // Dormant reach-out lifecycle
  last_reached_out_at?: string;
  reach_out_count?: number;
  not_looking_since?: string;
}

export interface TalentSkill {
  id: string;
  talent_id: string;
  skill_name: string;
  proficiency_level?: number; // 1-5
  years_experience?: number;
}
