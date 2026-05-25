import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, FileDown } from 'lucide-react'
import type { MatchWithTalent } from '../types'
import {
  scoreColor,
  scoreBg,
  scoreLabel,
  availBadgeClass,
  statusBadgeClass,
  formatDate,
  ensureHttps,
} from '../lib/utils'
import { ExportDocumentPanel } from './ExportDocumentPanel'

interface MatchCardProps {
  match: MatchWithTalent
  roleId: string
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-treeTextSec">{label}</span>
        <span className="font-semibold" style={{ color: scoreColor(score) }}>
          {score}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-treeBorderLight overflow-hidden">
        <div
          className="h-full rounded-full score-bar"
          style={{
            width: `${score}%`,
            backgroundColor: scoreColor(score),
          }}
        />
      </div>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-xs bg-treeBg border border-treeBorder text-treeTextSec px-2 py-0.5 rounded-full">
      {children}
    </span>
  )
}

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-treeTextSec w-28 flex-shrink-0">{label}</span>
      <span className="text-treeText font-medium flex-1">{value}</span>
    </div>
  )
}

export function MatchCard({ match, roleId }: MatchCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const { talent } = match
  const score = match.match_score ?? 0
  const skillScore = match.skill_score ?? 0
  const expScore = match.experience_score ?? 0

  return (
    <>
    <div className="bg-treeSurface border border-treeBorder rounded-xl overflow-hidden shadow-sm">
      {/* Summary row */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left p-4 flex items-center gap-3 active:bg-treeBg transition-colors"
      >
        {/* Score badge */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-base"
          style={{ backgroundColor: scoreBg(score), color: scoreColor(score) }}
        >
          {score}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-treeText text-sm truncate">
            {talent?.name ?? 'Unknown'}
          </p>
          {talent?.headline && (
            <p className="text-xs text-treeTextSec truncate mt-0.5">{talent.headline}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium border ${statusBadgeClass(match.status)}`}
            >
              {match.status}
            </span>
            {talent?.availability_status && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium border ${availBadgeClass(talent.availability_status)}`}
              >
                {talent.availability_status === 'yes'
                  ? 'Available'
                  : talent.availability_status === 'maybe'
                  ? 'Maybe'
                  : 'Not Available'}
              </span>
            )}
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium border"
              style={{ backgroundColor: scoreBg(score), color: scoreColor(score), borderColor: scoreColor(score) + '33' }}
            >
              {scoreLabel(score)}
            </span>
          </div>
        </div>

        {expanded ? (
          <ChevronUp size={18} className="text-treeTextSec flex-shrink-0" />
        ) : (
          <ChevronDown size={18} className="text-treeTextSec flex-shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-treeBorderLight px-4 pb-4 pt-3 space-y-4">
          {/* Profile section */}
          <div>
            <h4 className="text-xs font-semibold text-treeTextSec uppercase tracking-wider mb-2">
              Profile
            </h4>
            <div className="space-y-1.5">
              {talent?.headline && <ProfileRow label="Headline" value={talent.headline} />}
              {talent?.job_family && <ProfileRow label="Job Family" value={talent.job_family} />}
              {talent?.discipline && <ProfileRow label="Discipline" value={talent.discipline} />}
              {talent?.tl_band && <ProfileRow label="TL Band" value={talent.tl_band} />}
              <ProfileRow
                label="Location"
                value={
                  [talent?.city, talent?.country].filter(Boolean).join(', ') ||
                  talent?.location ||
                  null
                }
              />
              {talent?.rotation_preference && (
                <ProfileRow label="Rotation" value={talent.rotation_preference} />
              )}
            </div>
          </div>

          {/* Availability & Work Auth */}
          <div>
            <h4 className="text-xs font-semibold text-treeTextSec uppercase tracking-wider mb-2">
              Availability & Work Auth
            </h4>
            <div className="space-y-1.5">
              {talent?.availability_status && (
                <ProfileRow
                  label="Available"
                  value={
                    <span
                      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium border ${availBadgeClass(talent.availability_status)}`}
                    >
                      {talent.availability_status === 'yes'
                        ? 'Yes'
                        : talent.availability_status === 'maybe'
                        ? 'Maybe'
                        : 'No'}
                    </span>
                  }
                />
              )}
              {talent?.available_from && (
                <ProfileRow label="From" value={formatDate(talent.available_from)} />
              )}
              {talent?.notice_period_days !== null && talent?.notice_period_days !== undefined && (
                <ProfileRow label="Notice" value={`${talent.notice_period_days} days`} />
              )}
              {talent?.visa_status && <ProfileRow label="Visa Status" value={talent.visa_status} />}
              {talent?.work_rights && <ProfileRow label="Work Rights" value={talent.work_rights} />}
              {(talent?.rate !== null && talent?.rate !== undefined) && (
                <ProfileRow
                  label="Rate"
                  value={`${talent.currency ?? ''} ${talent.rate} ${talent.rate_type ?? ''}`.trim()}
                />
              )}
            </div>
          </div>

          {/* Experience tags */}
          {(talent?.regional_experience?.length ||
            talent?.asset_experience?.length ||
            talent?.industries?.length ||
            talent?.certifications?.length) ? (
            <div>
              <h4 className="text-xs font-semibold text-treeTextSec uppercase tracking-wider mb-2">
                Experience
              </h4>
              <div className="space-y-2">
                {talent?.regional_experience?.length ? (
                  <div>
                    <p className="text-xs text-treeTextSec mb-1">Regions</p>
                    <div className="flex flex-wrap gap-1">
                      {talent.regional_experience.map((r) => <Tag key={r}>{r}</Tag>)}
                    </div>
                  </div>
                ) : null}
                {talent?.asset_experience?.length ? (
                  <div>
                    <p className="text-xs text-treeTextSec mb-1">Assets</p>
                    <div className="flex flex-wrap gap-1">
                      {talent.asset_experience.map((a) => <Tag key={a}>{a}</Tag>)}
                    </div>
                  </div>
                ) : null}
                {talent?.industries?.length ? (
                  <div>
                    <p className="text-xs text-treeTextSec mb-1">Industries</p>
                    <div className="flex flex-wrap gap-1">
                      {talent.industries.map((i) => <Tag key={i}>{i}</Tag>)}
                    </div>
                  </div>
                ) : null}
                {talent?.certifications?.length ? (
                  <div>
                    <p className="text-xs text-treeTextSec mb-1">Certifications</p>
                    <div className="flex flex-wrap gap-1">
                      {talent.certifications.map((c) => <Tag key={c}>{c}</Tag>)}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Score breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-treeTextSec uppercase tracking-wider mb-3">
              Score Breakdown
            </h4>
            <div className="space-y-3">
              <ScoreBar score={skillScore} label="Requirements Coverage (50%)" />
              <ScoreBar score={expScore} label="Experience Match (50%)" />
              {match.score_details?.step1_score !== undefined && (
                <ScoreBar score={match.score_details.step1_score} label="Step 1 Score" />
              )}
              {match.score_details?.step2_score !== undefined && (
                <ScoreBar score={match.score_details.step2_score} label="Step 2 Score" />
              )}
            </div>

            {/* Reasoning texts */}
            {match.score_details?.skill_reasoning && (
              <div className="mt-3 p-3 bg-treeBg rounded-lg">
                <p className="text-xs font-medium text-treeTextSec mb-1">Requirements reasoning</p>
                <p className="text-xs text-treeText leading-relaxed">
                  {match.score_details.skill_reasoning}
                </p>
              </div>
            )}
            {match.score_details?.experience_reasoning && (
              <div className="mt-2 p-3 bg-treeBg rounded-lg">
                <p className="text-xs font-medium text-treeTextSec mb-1">Experience reasoning</p>
                <p className="text-xs text-treeText leading-relaxed">
                  {match.score_details.experience_reasoning}
                </p>
              </div>
            )}
            {match.score_details?.step1_reasoning && (
              <div className="mt-2 p-3 bg-treeBg rounded-lg">
                <p className="text-xs font-medium text-treeTextSec mb-1">Step 1 reasoning</p>
                <p className="text-xs text-treeText leading-relaxed">
                  {match.score_details.step1_reasoning}
                </p>
              </div>
            )}
            {match.score_details?.step2_reasoning && (
              <div className="mt-2 p-3 bg-treeBg rounded-lg">
                <p className="text-xs font-medium text-treeTextSec mb-1">Step 2 reasoning</p>
                <p className="text-xs text-treeText leading-relaxed">
                  {match.score_details.step2_reasoning}
                </p>
              </div>
            )}
            {match.match_reason && !match.score_details?.step1_reasoning && (
              <div className="mt-3 p-3 bg-treeBg rounded-lg">
                <p className="text-xs font-medium text-treeTextSec mb-1">Match reason</p>
                <p className="text-xs text-treeText leading-relaxed">{match.match_reason}</p>
              </div>
            )}
          </div>

          {/* Export & LinkedIn */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-primary text-primary text-sm font-medium active:bg-primary/10 transition-colors"
            >
              <FileDown size={16} />
              Export Document
            </button>
            {talent?.linkedin_url && (
              <a
                href={ensureHttps(talent.linkedin_url) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-treeBorder text-treeTextSec text-sm font-medium active:bg-treeBg transition-colors"
              >
                <ExternalLink size={16} />
                LinkedIn Profile
              </a>
            )}
          </div>
        </div>
      )}
    </div>
    {showExport && talent && (
      <ExportDocumentPanel
        talentId={match.talent_id}
        roleId={roleId}
        talentName={talent.name ?? 'Unknown'}
        onClose={() => setShowExport(false)}
      />
    )}
    </>
  )
}
