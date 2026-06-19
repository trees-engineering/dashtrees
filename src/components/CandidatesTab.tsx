import { useState, useMemo } from 'react'
import { Search, ExternalLink } from 'lucide-react'
import { useCandidates } from '../hooks/useCandidates'
import { useRoles } from '../hooks/useRoles'
import { availBadgeClass, formatDate, ensureHttps } from '../lib/utils'
import { telemetry } from '../lib/telemetry'

interface CandidatesTabProps {
  recruiterFilter: string
}

export function CandidatesTab({ recruiterFilter }: CandidatesTabProps) {
  const { data: candidates, isLoading } = useCandidates()
  const { data: roles } = useRoles()

  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const countries = useMemo(() => {
    const seen = new Set<string>()
    for (const c of candidates ?? []) {
      if (c.country) seen.add(c.country)
    }
    return [...seen].sort()
  }, [candidates])

  const visibleRoles = useMemo(
    () =>
      (roles ?? []).filter(
        (r) => r.status === 'open' && (!recruiterFilter || r.recruiter_email === recruiterFilter),
      ),
    [roles, recruiterFilter],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (candidates ?? []).filter((c) => {
      if (countryFilter && c.country !== countryFilter) return false
      if (q) {
        const haystack = [c.name, c.email, c.headline].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [candidates, search, countryFilter])

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleRoleChange(roleId: string) {
    setSelectedRoleId(roleId)
    setSelectedIds(new Set())
    telemetry.capture('candidates_role_selected', { role_id: roleId || null })
  }

  const showCheckboxes = Boolean(selectedRoleId)
  const colSpan = showCheckboxes ? 8 : 7

  return (
    <div className="p-4 space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-treeTextSec pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search name, email, headline…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 text-sm rounded-lg border border-treeBorder bg-treeSurface text-treeText focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="h-9 px-3 text-sm rounded-lg border border-treeBorder bg-treeSurface text-treeText focus:outline-none appearance-none"
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={selectedRoleId}
          onChange={(e) => handleRoleChange(e.target.value)}
          className="h-9 px-3 text-sm rounded-lg border border-treeBorder bg-treeSurface text-treeText focus:outline-none appearance-none"
        >
          <option value="">— Shortlist for role —</option>
          {visibleRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-9 bg-treeSurface border border-treeBorder rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <p className="text-xs text-treeTextSec">
            {filtered.length} candidate{filtered.length !== 1 ? 's' : ''}
            {showCheckboxes && selectedIds.size > 0 && (
              <span className="ml-2 text-primary font-medium">{selectedIds.size} selected</span>
            )}
          </p>

          <div className="overflow-x-auto rounded-xl border border-treeBorder">
            <table className="w-full text-xs border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-treeSurface border-b border-treeBorder">
                  {showCheckboxes && <th className="w-8 px-3 py-2" />}
                  <th className="text-left px-3 py-2 font-semibold text-treeTextSec uppercase tracking-wider whitespace-nowrap">
                    Name
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-treeTextSec uppercase tracking-wider whitespace-nowrap">
                    Location
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-treeTextSec uppercase tracking-wider whitespace-nowrap">
                    Availability
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-treeTextSec uppercase tracking-wider whitespace-nowrap">
                    Rate
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-treeTextSec uppercase tracking-wider whitespace-nowrap">
                    Email
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-treeTextSec uppercase tracking-wider whitespace-nowrap">
                    Work auth
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-treeTextSec uppercase tracking-wider whitespace-nowrap">
                    Headline
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="text-center py-10 text-treeTextSec">
                      No candidates match your filters
                    </td>
                  </tr>
                ) : (
                  filtered.map((c, i) => {
                    const isSelected = selectedIds.has(c.id)
                    return (
                      <tr
                        key={c.id}
                        onClick={showCheckboxes ? () => toggleId(c.id) : undefined}
                        className={[
                          'border-b border-treeBorderLight last:border-0 transition-colors',
                          showCheckboxes ? 'cursor-pointer' : '',
                          isSelected
                            ? 'bg-primary/5'
                            : i % 2 === 0
                            ? 'bg-white'
                            : 'bg-treeSurface/40',
                          'hover:bg-primary/5',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {showCheckboxes && (
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleId(c.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-3.5 h-3.5 accent-primary cursor-pointer"
                            />
                          </td>
                        )}

                        {/* Name + LinkedIn */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {c.linkedin_url ? (
                            <a
                              href={ensureHttps(c.linkedin_url) ?? '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                            >
                              {c.name ?? '—'}
                              <ExternalLink size={10} className="opacity-50 flex-shrink-0" />
                            </a>
                          ) : (
                            <span className="font-medium text-treeText">{c.name ?? '—'}</span>
                          )}
                        </td>

                        {/* Location */}
                        <td className="px-3 py-2 whitespace-nowrap text-treeTextSec">
                          {[c.city, c.country].filter(Boolean).join(', ') || '—'}
                        </td>

                        {/* Availability */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {c.availability_status ? (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${availBadgeClass(c.availability_status)}`}
                              >
                                {c.availability_status === 'yes'
                                  ? 'Available'
                                  : c.availability_status === 'maybe'
                                  ? 'Maybe'
                                  : 'No'}
                              </span>
                            ) : null}
                            {c.available_from && (
                              <span className="text-treeTextSec">{formatDate(c.available_from)}</span>
                            )}
                            {!c.availability_status && !c.available_from && '—'}
                          </div>
                        </td>

                        {/* Rate */}
                        <td className="px-3 py-2 whitespace-nowrap text-treeTextSec">
                          {c.rate != null ? (
                            <span>
                              <span className="text-treeText font-medium">{c.rate}</span>
                              {c.currency && ` ${c.currency}`}
                              {c.rate_type && `/${c.rate_type}`}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>

                        {/* Email */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {c.email ? (
                            <a
                              href={`mailto:${c.email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline"
                            >
                              {c.email}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>

                        {/* Work auth */}
                        <td
                          className="px-3 py-2 max-w-[140px] truncate text-treeTextSec"
                          title={c.work_rights ?? undefined}
                        >
                          {c.work_rights || '—'}
                        </td>

                        {/* Headline */}
                        <td
                          className="px-3 py-2 max-w-[220px] truncate text-treeTextSec"
                          title={c.headline ?? undefined}
                        >
                          {c.headline || '—'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
