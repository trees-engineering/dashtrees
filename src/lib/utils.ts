// Score colours — saturated ink on a white surface; backgrounds use low-alpha tints.
export function scoreColor(score: number): string {
  if (score >= 70) return '#16a34a' // green
  if (score >= 40) return '#ca8a04' // yellow
  return '#ef4444'                  // red
}

export function scoreBg(score: number): string {
  if (score >= 70) return 'rgba(22,163,74,0.12)'
  if (score >= 40) return 'rgba(202,138,4,0.12)'
  return 'rgba(239,68,68,0.12)'
}

// All badge styles below are for the light theme — soft tinted fills, saturated
// coloured text + light border. Mirrors the .st classes in template.html.
export function availBadgeClass(status: string): string {
  switch (status) {
    case 'yes':
      return 'bg-green-100 text-green-700 border-green-200'
    case 'maybe':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'no':
      return 'bg-red-100 text-red-700 border-red-200'
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'hired':
    case 'started':
      return 'bg-green-100 text-green-700 border-green-200'
    case 'accepted':
    case 'offer_accepted':
      return 'bg-violet-100 text-violet-700 border-violet-200'
    case 'contract_signed':
      return 'bg-primary/15 text-primary border-primary/40'
    case 'introduced':
    case 'cv_sent':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'shortlisted':
      return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'suggested':
    case 'sourced':
      return 'bg-slate-100 text-slate-600 border-slate-200'
    case 'screening':
      return 'bg-blue-50 text-blue-700 border-blue-100'
    case 'client_iv_scheduled':
    case 'iv_scheduled':
      return 'bg-orange-100 text-orange-700 border-orange-200'
    case 'client_iv_done':
    case 'iv_done':
      return 'bg-orange-200 text-orange-800 border-orange-300'
    case 'offer':
      return 'bg-pink-100 text-pink-700 border-pink-200'
    case 'rejected':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'withdrawn':
    case 'closed':
    case 'screened_out':
      return 'bg-slate-100 text-slate-500 border-slate-200'
    case 'on_hold':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

// For a `shortlisted` match, the colour reveals who initiated the shortlist:
//   reverse  → candidate-driven  → purple
//   forward  → recruiter-driven  → pink
// All other statuses still go through statusBadgeClass().
export function shortlistedBadgeClass(
  direction: 'forward' | 'reverse' | null | undefined,
): string {
  return direction === 'reverse'
    ? 'bg-purple-100 text-purple-700 border-purple-200'
    : 'bg-pink-100 text-pink-700 border-pink-200'
}

/** Tailwind classes for the open/closed/draft pill used on role cards. */
export function roleStatusBadgeClass(status: string): string {
  switch (status) {
    case 'open':
      return 'bg-green-100 text-green-700 border-green-200'
    case 'closed':
      return 'bg-slate-100 text-slate-500 border-slate-200'
    case 'draft':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatBudget(
  min: number | null,
  max: number | null,
  currency: string | null
): string {
  const cur = currency ?? 'USD'
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 0,
    }).format(n)

  if (min !== null && max !== null) return `${fmt(min)} – ${fmt(max)}`
  if (max !== null) return `Up to ${fmt(max)}`
  if (min !== null) return `From ${fmt(min)}`
  return '—'
}

export function ensureHttps(url: string | null): string | null {
  if (!url) return null
  if (url.startsWith('http')) return url
  return `https://${url}`
}
