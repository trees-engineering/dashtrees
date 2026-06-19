import { useState, useMemo } from 'react'
import { useCandidates } from '../hooks/useCandidates'
import { useRoles } from '../hooks/useRoles'
import { ensureHttps } from '../lib/utils'

interface TrackerTabProps {
  recruiterFilter: string
  trackerRoleId: string
  trackerTalentIds: Set<string>
  onTrackerRoleChange: (roleId: string) => void
}

function rateLabel(rate: number | null, rateType: string | null, currency: string | null): string {
  if (rate == null) return '—'
  const type =
    rateType === 'monthly' ? 'month'
    : rateType === 'daily' || rateType === 'day' ? 'day'
    : rateType === 'hourly' ? 'hour'
    : rateType ?? ''
  const parts: string[] = [rate.toLocaleString()]
  if (currency) parts.push(currency)
  return type ? `${parts.join(' ')}/${type}` : parts.join(' ')
}

function noticeLabel(days: number | null | undefined): string {
  if (days === 0) return 'Immediate'
  if (days == null) return '—'
  return `${days} days`
}

export function TrackerTab({ recruiterFilter, trackerRoleId, trackerTalentIds, onTrackerRoleChange }: TrackerTabProps) {
  const { data: candidates, isLoading } = useCandidates()
  const { data: roles } = useRoles()

  const [clientLabel, setClientLabel] = useState('')
  const [contactName, setContactName] = useState('')
  const [introText, setIntroText] = useState(
    'Further to our discussion, please find below shortlisted candidates for your review.'
  )
  const [expectedSalaries, setExpectedSalaries] = useState<Record<string, string>>({})

  const visibleRoles = useMemo(
    () => (roles ?? []).filter(r => !recruiterFilter || r.recruiter_email === recruiterFilter),
    [roles, recruiterFilter]
  )

  const selectedRole = visibleRoles.find(r => r.id === trackerRoleId)

  const shortlisted = useMemo(
    () => (candidates ?? []).filter(c => trackerTalentIds.has(c.id)),
    [candidates, trackerTalentIds]
  )

  const isEmpty = trackerTalentIds.size === 0

  return (
    <div className="p-4 space-y-4">
      {/* Role picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-semibold text-treeTextSec uppercase tracking-wider whitespace-nowrap">
          Shortlist for
        </label>
        <select
          value={trackerRoleId}
          onChange={e => onTrackerRoleChange(e.target.value)}
          className="flex-1 max-w-sm h-9 px-3 text-sm rounded-lg border border-treeBorder bg-treeSurface text-treeText focus:outline-none appearance-none"
        >
          <option value="">— Select role —</option>
          {visibleRoles.map(r => (
            <option key={r.id} value={r.id}>
              {r.status === 'closed' ? `[Closed] ${r.title}` : r.title}
            </option>
          ))}
        </select>
        {trackerTalentIds.size > 0 && (
          <span className="text-xs text-treeTextSec">
            {trackerTalentIds.size} candidate{trackerTalentIds.size !== 1 ? 's' : ''} shortlisted
          </span>
        )}
      </div>

      {!trackerRoleId || isEmpty ? (
        <div className="text-center py-20 text-treeTextSec text-sm space-y-2">
          <p className="text-3xl">📋</p>
          <p>
            {!trackerRoleId
              ? 'Select a role above, then tick candidates from the Candidates or Matches tab'
              : 'No candidates shortlisted yet — tick candidates in the Candidates or Matches tab'}
          </p>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto">
          <div className="rounded-xl overflow-hidden shadow-md border border-gray-200">
            {/* Gradient header */}
            <div
              className="px-6 py-4"
              style={{ background: 'linear-gradient(to right, #1a2744, #5c440c)' }}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-white font-bold text-sm flex-shrink-0">TREES –</span>
                <input
                  value={clientLabel}
                  onChange={e => setClientLabel(e.target.value)}
                  placeholder="Client / Company name"
                  className="text-white font-bold text-sm bg-transparent placeholder-white/40 focus:outline-none border-b border-white/20 focus:border-white/50 flex-1 min-w-0"
                />
              </div>
            </div>

            {/* Body */}
            <div className="bg-white px-8 py-6 space-y-4">
              {/* Salutation */}
              <div className="text-sm text-gray-700 space-y-1">
                <p>
                  Dear{' '}
                  <input
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    placeholder="Contact name"
                    className="border-b border-gray-300 focus:border-gray-600 focus:outline-none placeholder-gray-300 w-36"
                  />
                  ,
                </p>
                <textarea
                  value={introText}
                  onChange={e => setIntroText(e.target.value)}
                  rows={2}
                  className="w-full text-sm text-gray-700 leading-relaxed focus:outline-none resize-none bg-transparent"
                />
              </div>

              {/* Role heading */}
              {selectedRole && (
                <p className="font-bold text-[#1a2744] text-sm">{selectedRole.title}</p>
              )}

              {/* Shortlist table */}
              <div className="border border-[#cbbea0] rounded-lg overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[#cbbea0] bg-[#faf7f2]">
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-800 w-[16%]">Candidate</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-800 w-[10%]">Notice</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-800 w-[15%] leading-tight">
                        Last Drawn<br />Salary
                      </th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-800 w-[15%] leading-tight">
                        Expected<br />Salary
                      </th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-800">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading
                      ? [...Array(trackerTalentIds.size)].map((_, i) => (
                          <tr key={i} className="border-b border-[#e8dcc8]">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="h-4 rounded bg-gray-100 animate-pulse" />
                            </td>
                          </tr>
                        ))
                      : shortlisted.map(c => (
                          <tr key={c.id} className="border-b border-[#e8dcc8] last:border-0 align-top">
                            <td className="px-4 py-3">
                              {c.linkedin_url ? (
                                <a
                                  href={ensureHttps(c.linkedin_url) ?? '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline font-medium leading-snug"
                                >
                                  {c.name ?? '—'}
                                </a>
                              ) : (
                                <span className="font-medium text-gray-800">{c.name ?? '—'}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {noticeLabel(c.notice_period_days)}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {rateLabel(c.rate, c.rate_type, c.currency)}
                            </td>
                            <td className="px-4 py-3">
                              <input
                                value={expectedSalaries[c.id] ?? ''}
                                onChange={e =>
                                  setExpectedSalaries(prev => ({ ...prev, [c.id]: e.target.value }))
                                }
                                placeholder="Enter expected…"
                                className="w-full text-sm text-gray-700 bg-transparent focus:outline-none border-b border-transparent focus:border-gray-400 placeholder-gray-300"
                              />
                            </td>
                            <td className="px-4 py-3 text-gray-600 leading-relaxed text-xs">
                              {c.headline ?? '—'}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
