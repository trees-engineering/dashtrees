export function scoreColor(score: number): string {
  if (score >= 70) return '#155724'
  if (score >= 40) return '#856404'
  return '#721c24'
}

export function scoreBg(score: number): string {
  if (score >= 70) return '#d4edda'
  if (score >= 40) return '#fff3cd'
  return '#f8d7da'
}

export function scoreLabel(score: number): string {
  if (score >= 70) return 'High'
  if (score >= 40) return 'Medium'
  return 'Low'
}

export function availBadgeClass(status: string): string {
  switch (status) {
    case 'yes':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'maybe':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'no':
      return 'bg-red-100 text-red-800 border-red-200'
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'hired':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'accepted':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'introduced':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'shortlisted':
      return 'bg-purple-100 text-purple-800 border-purple-200'
    case 'suggested':
      return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'rejected':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'closed':
      return 'bg-gray-100 text-gray-500 border-gray-200'
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200'
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
