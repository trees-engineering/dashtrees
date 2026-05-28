export interface Talent {
  id: string
  name: string
  location: string | null
  city: string | null
  country: string | null
  rotation_preference: string | null
  mobility_regions: string[] | null
  availability_status: 'yes' | 'maybe' | 'no' | null
  available_from: string | null
  notice_period_days: number | null
  rate: number | null
  rate_type: string | null
  currency: string | null
  visa_status: string | null
  work_rights: string | null
  certifications: string[] | null
  linkedin_url: string | null
  headline: string | null
  job_family: string | null
  discipline: string | null
  tl_band: string | null
  regional_experience: string[] | null
  asset_experience: string[] | null
  industries: string[] | null
  cv_storage_path: string | null
  created_at: string
}

export interface Role {
  id: string
  title: string
  description: string | null
  status: 'open' | 'closed' | 'draft'
  location_requirement: string | null
  location_regions: string[] | null
  salary_min: number | null
  salary_max: number | null
  budget_currency: string | null
  start_deadline: string | null
  provides_sponsorship: boolean | null
  created_by: string | null
  created_at: string
}

export interface RoleCounts {
  total: number
  shortlisted: number
  introduced: number
}

export interface RoleWithCounts extends Role {
  recruiter_email: string | null
  counts: RoleCounts
}

export interface ScoreDetails {
  step1_score?: number
  step1_reasoning?: string
  step2_score?: number
  step2_reasoning?: string
  skill_reasoning?: string
  experience_reasoning?: string
}

export type CascadeRunDirection = 'forward' | 'reverse'

export interface Match {
  id: string
  talent_id: string
  role_id: string
  cascade_run_id: string | null
  match_score: number | null
  skill_score: number | null
  experience_score: number | null
  status: 'suggested' | 'shortlisted' | 'introduced' | 'rejected' | 'closed' | 'screened_out'
  match_reason: string | null
  score_details: ScoreDetails | null
  created_at: string
  updated_at: string
}

export interface MatchWithTalent extends Match {
  talent: Talent | null
  cascade_run: { run_direction: CascadeRunDirection } | null
}

export interface Recruiter {
  id: string
  email: string
  name: string | null
  company: string | null
  verified: boolean | null
}
