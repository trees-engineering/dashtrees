// In-house recruiter UX telemetry — queues events client-side and POSTs to
// /api/telemetry/batch which writes to Supabase `_telemetry_events`.
//
// Liberal by design: it's cheaper to delete event rows later than to discover
// next month that a frustration signal was never captured. Add new events
// freely; only PII (candidate names/emails/phones/JD text) must never enter
// `props` — pass IDs and counts instead.

interface TelemetryEvent {
  client_ts: string
  session_id: string
  recruiter_email: string | null
  event_name: string
  path: string | null
  props: Record<string, unknown>
  user_agent?: string
  viewport_w?: number
  viewport_h?: number
}

interface InitOptions {
  endpoint?: string
  flushIntervalMs?: number
  maxQueueSize?: number
  disabled?: boolean
}

const DEFAULT_ENDPOINT = '/api/telemetry/batch'
const DEFAULT_FLUSH_INTERVAL_MS = 5000
const DEFAULT_MAX_QUEUE = 50
const SESSION_KEY = 'dt_telemetry_session'

let endpoint = DEFAULT_ENDPOINT
let maxQueueSize = DEFAULT_MAX_QUEUE
let flushTimer: number | null = null
let disabled = false
let initialised = false
let recruiterEmail: string | null = null
let activeTab: string | null = null
let lastTabSwitchAt = 0
let queue: TelemetryEvent[] = []
let sessionId = ''

function ensureSession(): string {
  if (sessionId) return sessionId
  try {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) { sessionId = stored; return sessionId }
  } catch { /* sessionStorage blocked — fine, ephemeral session */ }
  sessionId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  try { sessionStorage.setItem(SESSION_KEY, sessionId) } catch { /* ignore */ }
  return sessionId
}

function nowIso(): string {
  return new Date().toISOString()
}

function enqueue(eventName: string, props: Record<string, unknown> = {}) {
  if (disabled || !initialised) return
  ensureSession()
  queue.push({
    client_ts: nowIso(),
    session_id: sessionId,
    recruiter_email: recruiterEmail,
    event_name: eventName,
    path: activeTab,
    props,
    user_agent: navigator.userAgent,
    viewport_w: window.innerWidth,
    viewport_h: window.innerHeight,
  })
  if (queue.length >= maxQueueSize) void flush()
}

async function flush(): Promise<void> {
  if (queue.length === 0) return
  const batch = queue
  queue = []
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    })
  } catch {
    // Network failure — drop silently. The recruiter should never see a
    // telemetry error. If this becomes a problem we can persist to
    // localStorage and retry, but v1 prioritises non-intrusion.
  }
}

function flushSync(): void {
  if (queue.length === 0) return
  const payload = JSON.stringify({ events: queue })
  queue = []
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }))
      return
    }
  } catch { /* fallthrough to fetch */ }
  try {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    })
  } catch { /* swallow */ }
}

// ── Target descriptor (used by rage/dead click detectors) ───────────────────
// Prefer explicit `data-telemetry-id` attrs — they're stable across copy
// changes. Falls back to id, then button/anchor text, then tag name. Never
// returns raw innerText longer than 30 chars so candidate names in card text
// don't leak into props.
function describeTarget(el: Element | null): string {
  if (!el) return 'unknown'
  let cursor: HTMLElement | null = el as HTMLElement
  for (let depth = 0; depth < 5 && cursor; depth++) {
    const dataId = cursor.dataset?.telemetryId
    if (dataId) return `[tid=${dataId}]`
    if (cursor.id) return `#${cursor.id}`
    if (cursor.tagName === 'BUTTON' || cursor.tagName === 'A') {
      const text = (cursor.textContent ?? '').trim().slice(0, 30)
      return `${cursor.tagName.toLowerCase()}:"${text}"`
    }
    cursor = cursor.parentElement
  }
  return (el as HTMLElement).tagName.toLowerCase()
}

function isInteractive(el: Element | null): boolean {
  if (!el) return false
  const e = el as HTMLElement
  if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'].includes(e.tagName)) return true
  if (e.getAttribute('role') === 'button') return true
  if (e.closest('button, a, input, select, textarea, label, [role="button"]')) return true
  return false
}

// ── Rage click detector ─────────────────────────────────────────────────────
const RAGE_WINDOW_MS = 1500
const RAGE_THRESHOLD = 4
let recentClicks: Array<{ target: string; ts: number }> = []

function onMouseDown(e: MouseEvent) {
  const target = describeTarget(e.target as Element)
  const ts = Date.now()
  recentClicks.push({ target, ts })
  recentClicks = recentClicks.filter(c => ts - c.ts <= RAGE_WINDOW_MS)
  const sameTarget = recentClicks.filter(c => c.target === target)
  if (sameTarget.length >= RAGE_THRESHOLD) {
    enqueue('rage_click', {
      target,
      count: sameTarget.length,
      window_ms: RAGE_WINDOW_MS,
    })
    recentClicks = recentClicks.filter(c => c.target !== target)
  }
}

// ── Dead click detector ─────────────────────────────────────────────────────
// Fires when a click on a non-interactive target produces no observable
// change (scroll, focus, mutation, navigation) within 500ms. Conservative —
// some false positives are acceptable; we'd rather over-report dead clicks.
const DEAD_CLICK_WAIT_MS = 500

function onClick(e: MouseEvent) {
  const target = e.target as Element | null
  if (!target || isInteractive(target)) return
  const desc = describeTarget(target)
  const beforeScroll = window.scrollY
  const beforeFocus = document.activeElement
  const beforeHref = location.href
  let mutated = false
  const mo = new MutationObserver(() => { mutated = true })
  mo.observe(document.body, { childList: true, subtree: true, attributes: true })
  window.setTimeout(() => {
    mo.disconnect()
    const changed =
      mutated ||
      window.scrollY !== beforeScroll ||
      document.activeElement !== beforeFocus ||
      location.href !== beforeHref
    if (!changed) enqueue('dead_click', { target: desc })
  }, DEAD_CLICK_WAIT_MS)
}

// ── Scroll depth (per active tab) ───────────────────────────────────────────
const SCROLL_BUCKETS = [25, 50, 75, 100]
let scrollBucketsHit = new Set<number>()
let scrollResetTab: string | null = null

function onScroll() {
  if (scrollResetTab !== activeTab) {
    scrollResetTab = activeTab
    scrollBucketsHit = new Set()
  }
  const scrollable = document.querySelector('main') as HTMLElement | null
  const target: HTMLElement = scrollable ?? document.documentElement
  const maxScroll = target.scrollHeight - target.clientHeight
  if (maxScroll <= 0) return
  const pct = Math.round((target.scrollTop / maxScroll) * 100)
  for (const bucket of SCROLL_BUCKETS) {
    if (pct >= bucket && !scrollBucketsHit.has(bucket)) {
      scrollBucketsHit.add(bucket)
      enqueue('scroll_depth', { tab: activeTab, pct: bucket })
    }
  }
}

// ── Visibility / network / window errors ────────────────────────────────────
function onVisibilityChange() {
  if (document.hidden) {
    if (activeTab && lastTabSwitchAt > 0) {
      enqueue('tab_time', { tab: activeTab, ms: Date.now() - lastTabSwitchAt, reason: 'hidden' })
      lastTabSwitchAt = 0
    }
    enqueue('app_hidden', {})
    flushSync()
  } else {
    lastTabSwitchAt = Date.now()
    enqueue('app_visible', {})
  }
}

function onOnline() { enqueue('network_online', {}) }
function onOffline() { enqueue('network_offline', {}) }

function onWindowError(e: ErrorEvent) {
  enqueue('client_error', {
    message: (e.message ?? '').slice(0, 200),
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
  })
}

function onUnhandledRejection(e: PromiseRejectionEvent) {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason)
  enqueue('unhandled_rejection', { message: msg.slice(0, 200) })
}

let resizeTimer: number | null = null
function onResize() {
  if (resizeTimer != null) window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    enqueue('viewport_resized', { w: window.innerWidth, h: window.innerHeight })
  }, 500) as unknown as number
}

// ── Public API ──────────────────────────────────────────────────────────────
export const telemetry = {
  init(opts: InitOptions = {}) {
    if (typeof window === 'undefined' || initialised) return
    endpoint = opts.endpoint ?? DEFAULT_ENDPOINT
    maxQueueSize = opts.maxQueueSize ?? DEFAULT_MAX_QUEUE
    disabled = Boolean(opts.disabled)
    if (disabled) return

    ensureSession()
    initialised = true

    flushTimer = window.setInterval(flush, opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS) as unknown as number

    document.addEventListener('mousedown', onMouseDown, { capture: true, passive: true })
    document.addEventListener('click', onClick, { capture: true, passive: true })
    // Scroll listener lives on the scrollable <main> in this app, but we
    // attach to the document for safety — handler is a fast bucket check.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    window.addEventListener('resize', onResize, { passive: true })
    window.addEventListener('beforeunload', flushSync)
    window.addEventListener('pagehide', flushSync)

    const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    enqueue('app_loaded', {
      referrer: document.referrer || null,
      lang: navigator.language,
      online: navigator.onLine,
      load_ms: perf ? Math.round(perf.loadEventEnd - perf.startTime) : null,
      dom_ready_ms: perf ? Math.round(perf.domContentLoadedEventEnd - perf.startTime) : null,
    })
  },

  identify(email: string | null) {
    const next = email && email.length > 0 ? email : null
    if (recruiterEmail === next) return
    recruiterEmail = next
    enqueue('recruiter_identified', { email: recruiterEmail })
  },

  trackTab(tabId: string) {
    const now = Date.now()
    if (activeTab && lastTabSwitchAt > 0) {
      enqueue('tab_time', { tab: activeTab, ms: now - lastTabSwitchAt, reason: 'switch' })
    }
    enqueue('tab_viewed', { tab: tabId, prev_tab: activeTab })
    activeTab = tabId
    lastTabSwitchAt = now
  },

  capture(eventName: string, props: Record<string, unknown> = {}) {
    enqueue(eventName, props)
  },

  /**
   * Wraps an async operation and emits `slow_operation` when it exceeds
   * thresholdMs (default 3000ms), or `operation_failed` on rejection.
   * Always rethrows — callers see the original error.
   */
  async timed<T>(
    name: string,
    fn: () => Promise<T>,
    opts: { thresholdMs?: number; props?: Record<string, unknown> } = {},
  ): Promise<T> {
    const threshold = opts.thresholdMs ?? 3000
    const start = performance.now()
    try {
      const result = await fn()
      const ms = Math.round(performance.now() - start)
      enqueue('operation_completed', { name, ms, ...opts.props })
      if (ms >= threshold) enqueue('slow_operation', { name, ms, threshold_ms: threshold, ...opts.props })
      return result
    } catch (err) {
      const ms = Math.round(performance.now() - start)
      enqueue('operation_failed', {
        name,
        ms,
        message: (err as Error).message?.slice(0, 200),
        ...opts.props,
      })
      throw err
    }
  },

  flush(): Promise<void> {
    return flush()
  },

  _shutdown() {
    // Test helper — tears down listeners and the flush timer.
    if (flushTimer != null) window.clearInterval(flushTimer)
    document.removeEventListener('mousedown', onMouseDown, { capture: true } as EventListenerOptions)
    document.removeEventListener('click', onClick, { capture: true } as EventListenerOptions)
    document.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('error', onWindowError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('beforeunload', flushSync)
    window.removeEventListener('pagehide', flushSync)
    initialised = false
  },
}
