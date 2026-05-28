// Score colours — bright on the dark surface; backgrounds use low-alpha tints.
export function scoreColor(score: number): string {
  if (score >= 70) return '#4ade80' // green
  if (score >= 40) return '#fbbf24' // yellow
  return '#f87171'                  // red
}

export function scoreBg(score: number): string {
  if (score >= 70) return 'rgba(74,222,128,0.18)'
  if (score >= 40) return 'rgba(251,191,36,0.18)'
  return 'rgba(248,113,113,0.18)'
}

// All badge styles below are for the dark navy theme — translucent fills,
// matching coloured text + soft border. Mirrors the .st classes in template.html.
export function availBadgeClass(status: string): string {
  switch (status) {
    case 'yes':
      return 'bg-green-500/15 text-green-300 border-green-500/30'
    case 'maybe':
      return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
    case 'no':
      return 'bg-red-500/15 text-red-300 border-red-500/30'
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/30'
  }
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'hired':
    case 'started':
      return 'bg-green-500/20 text-green-300 border-green-500/30'
    case 'accepted':
    case 'offer_accepted':
      return 'bg-violet-500/20 text-violet-300 border-violet-500/30'
    case 'contract_signed':
      return 'bg-primary/20 text-primary border-primary/40'
    case 'introduced':
    case 'cv_sent':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    case 'shortlisted':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    case 'suggested':
    case 'sourced':
      return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    case 'screening':
      return 'bg-blue-500/10 text-blue-300 border-blue-500/20'
    case 'client_iv_scheduled':
    case 'iv_scheduled':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30'
    case 'client_iv_done':
    case 'iv_done':
      return 'bg-orange-500/25 text-orange-300 border-orange-500/40'
    case 'offer':
      return 'bg-pink-500/15 text-pink-300 border-pink-500/30'
    case 'rejected':
      return 'bg-red-500/15 text-red-300 border-red-500/30'
    case 'withdrawn':
    case 'closed':
    case 'screened_out':
      return 'bg-slate-500/15 text-slate-400 border-slate-500/25'
    case 'on_hold':
      return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/25'
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
    ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    : 'bg-pink-500/15 text-pink-300 border-pink-500/30'
}

/** Tailwind classes for the open/closed/draft pill used on role cards. */
export function roleStatusBadgeClass(status: string): string {
  switch (status) {
    case 'open':
      return 'bg-green-500/15 text-green-300 border-green-500/30'
    case 'closed':
      return 'bg-slate-500/15 text-slate-400 border-slate-500/25'
    case 'draft':
      return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/25'
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
