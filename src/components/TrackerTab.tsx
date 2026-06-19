import { useState, useMemo } from 'react'
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { useCandidates } from '../hooks/useCandidates'
import { useRoles } from '../hooks/useRoles'
import { useShortlist } from '../hooks/useShortlist'
import { ensureHttps } from '../lib/utils'

interface TrackerTabProps {
  recruiterFilter: string
  trackerRoleId: string
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

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const CLOSING_DEFAULT =
  'Should any of the profiles be of interest, I would be happy to arrange interviews at your convenience and provide any further information required. We are actively sourcing for the other roles and will forward suitable profiles as they come through.'

const SIGNATURE_HTML = `<p style="margin:0;font-size:13px;color:#555;line-height:1.9;">
  Trees Engineering<br>
  Block C, Level 27, Unit 3A, KL Trillion, Jalan Tun Razak, Kuala Lumpur 50400, Malaysia<br>
  Trade Reg. Nr. 202001041675 (1397996-T)
</p>`

export function TrackerTab({ recruiterFilter, trackerRoleId, onTrackerRoleChange }: TrackerTabProps) {
  const { data: candidates, isLoading: candidatesLoading } = useCandidates()
  const { data: roles } = useRoles()
  const { talentIds: trackerTalentIds, isLoading: shortlistLoading } = useShortlist(trackerRoleId || null)
  const isLoading = candidatesLoading || shortlistLoading

  // Document fields
  const [clientLabel, setClientLabel] = useState('')
  const [contactName, setContactName] = useState('')
  const [introText, setIntroText] = useState(
    'Further to our discussion, please find below shortlisted candidates for your review.'
  )
  const [expectedSalaries, setExpectedSalaries] = useState<Record<string, string>>({})

  // Email draft fields
  const [showEmailDraft, setShowEmailDraft] = useState(false)
  const [closingText, setClosingText] = useState(CLOSING_DEFAULT)
  const [emailCopied, setEmailCopied] = useState(false)

  const visibleRoles = useMemo(
    () => (roles ?? []).filter(r => !recruiterFilter || r.recruiter_email === recruiterFilter),
    [roles, recruiterFilter]
  )

  const selectedRole = visibleRoles.find(r => r.id === trackerRoleId)

  const shortlisted = useMemo(
    () => (candidates ?? []).filter(c => trackerTalentIds.has(c.id)),
    [candidates, trackerTalentIds]
  )

  // Generate the email HTML from the current state
  const emailHtml = useMemo(() => {
    const td = 'border:1px solid #cbbea0;padding:8px 12px;vertical-align:top;'
    const th = `${td}font-weight:600;background-color:#faf7f2;text-align:left;`

    const rows = shortlisted.map(c => {
      const nameHtml = c.linkedin_url
        ? `<a href="${esc(ensureHttps(c.linkedin_url) ?? '#')}" style="color:#2563eb;text-decoration:none;">${esc(c.name ?? '—')}</a>`
        : esc(c.name ?? '—')
      return `<tr>
        <td style="${td}">${nameHtml}</td>
        <td style="${td}">${esc(noticeLabel(c.notice_period_days))}</td>
        <td style="${td}">${esc(rateLabel(c.rate, c.rate_type, c.currency))}</td>
        <td style="${td}">${esc(expectedSalaries[c.id] ?? '—')}</td>
        <td style="${td}font-size:13px;">${esc(c.headline ?? '—')}</td>
      </tr>`
    }).join('')

    return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;max-width:750px;">
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="padding:14px 20px;background-color:#1a2744;border-radius:6px;"><span style="color:white;font-weight:bold;font-size:14px;">TREES${clientLabel ? ` – ${esc(clientLabel)}` : ''}</span></td></tr></table>
<p style="margin:0 0 4px;">Dear ${esc(contactName || '[Contact Name]')},</p>
<p style="margin:0 0 16px;">${esc(introText)}</p>
${selectedRole ? `<p style="margin:16px 0 8px;font-weight:bold;color:#1a2744;">${esc(selectedRole.title)}</p>` : ''}
<table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
  <thead><tr>
    <th style="${th}">Candidate</th>
    <th style="${th}">Notice</th>
    <th style="${th}">Last Drawn Salary</th>
    <th style="${th}">Expected Salary</th>
    <th style="${th}">Summary</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<p style="margin:0 0 16px;">${esc(closingText)}</p>
<p style="margin:0 0 4px;">Thank you!</p>
<br>
${SIGNATURE_HTML}
</div>`
  }, [shortlisted, clientLabel, contactName, introText, selectedRole, closingText, expectedSalaries])

  async function copyEmail() {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': new Blob([emailHtml], { type: 'text/html' }) }),
      ])
    } catch {
      // Safari / older browsers: fall back to plain text
      await navigator.clipboard.writeText(emailHtml)
    }
    setEmailCopied(true)
    setTimeout(() => setEmailCopied(false), 2000)
  }

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
        <>
          {/* ── Shortlist document ───────────────────────────────────── */}
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

          {/* ── Email draft ──────────────────────────────────────────── */}
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => setShowEmailDraft(v => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-treeTextSec hover:text-treeText transition-colors py-1"
            >
              {showEmailDraft
                ? <ChevronDown size={14} />
                : <ChevronRight size={14} />}
              Email Draft
            </button>

            {showEmailDraft && (
              <div className="mt-2 bg-white border border-treeBorder rounded-xl overflow-hidden">
                {/* Closing paragraph */}
                <div className="px-6 pt-5 pb-4 space-y-1">
                  <label className="block text-xs font-semibold text-treeTextSec uppercase tracking-wider mb-2">
                    Closing paragraph
                  </label>
                  <textarea
                    value={closingText}
                    onChange={e => setClosingText(e.target.value)}
                    rows={3}
                    className="w-full text-sm border border-treeBorder rounded-lg px-3 py-2 text-treeText focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                </div>

                {/* Static signature preview */}
                <div className="px-6 pb-5 text-sm space-y-0.5">
                  <p className="text-treeText">Thank you!</p>
                  <div className="mt-2 text-treeTextSec text-xs leading-relaxed">
                    <p className="font-medium text-treeText">Trees Engineering</p>
                    <p>Block C, Level 27, Unit 3A, KL Trillion, Jalan Tun Razak, Kuala Lumpur 50400, Malaysia</p>
                    <p>Trade Reg. Nr. 202001041675 (1397996-T)</p>
                  </div>
                </div>

                {/* Copy action */}
                <div className="px-6 py-4 border-t border-treeBorder flex items-center justify-between gap-4">
                  <p className="text-xs text-treeTextSec">
                    Paste directly into Gmail compose — tables and formatting are preserved.
                  </p>
                  <button
                    onClick={copyEmail}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      emailCopied
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-primary text-white hover:bg-primary/90 active:scale-95'
                    }`}
                  >
                    {emailCopied
                      ? <><Check size={14} /> Copied!</>
                      : <><Copy size={14} /> Copy email</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
