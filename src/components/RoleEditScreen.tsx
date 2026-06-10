import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRoles } from '../hooks/useRoles'
import { updateRole, type RolePatch, type RoleStatus } from '../lib/api'
import { useToast } from './Toast'
import { telemetry } from '../lib/telemetry'
import type { RoleWithCounts } from '../types'

interface RoleEditScreenProps {
  roleId: string
  /** Called for the back button (no save). */
  onClose: () => void
  /** Called after a successful save, with the saved role id, so the parent
   *  can decide what comes next (e.g. start matching on a fresh upload). */
  onSaved: (roleId: string) => void
}

// Edit form for the basic recruiter-editable fields of a role. TET v2 /
// requirements are not exposed here — if they need correcting, reupload
// the JD so the LLM re-extracts them.
export function RoleEditScreen({ roleId, onClose, onSaved }: RoleEditScreenProps) {
  const { data: roles, isLoading } = useRoles()
  const role = useMemo(
    () => (roles ?? []).find((r) => r.id === roleId),
    [roles, roleId],
  )

  // Form reports its dirty state up so the back button can prompt before
  // discarding work.
  const [isDirty, setIsDirty] = useState(false)
  const handleBack = () => {
    if (isDirty) {
      const ok = window.confirm('Discard unsaved changes?')
      if (!ok) {
        telemetry.capture('role_edit_discard_cancelled', { role_id: roleId })
        return
      }
      telemetry.capture('role_edit_discarded', { role_id: roleId })
    }
    onClose()
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-treeBg">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-4 h-[50px] flex items-center gap-3 z-10">
        <button
          data-telemetry-id="role-edit-back"
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900 -ml-2 px-2 py-1 rounded"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <h1 className="text-sm font-semibold text-slate-800 truncate flex-1">
          {role?.title ?? 'Edit role'}
        </h1>
        {isDirty && (
          <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">
            Unsaved
          </span>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-6">
            <div className="h-12 bg-treeSurface border border-treeBorder rounded-xl animate-pulse" />
          </div>
        ) : !role ? (
          <div className="p-6 text-center text-treeTextSec text-sm">
            Role not found.
          </div>
        ) : (
          <RoleEditForm
            role={role}
            onSaved={() => onSaved(role.id)}
            onDirtyChange={setIsDirty}
          />
        )}
      </main>
    </div>
  )
}

// ─── Form ──────────────────────────────────────────────────────────────────

interface RoleEditFormProps {
  role: RoleWithCounts
  onSaved: () => void
  onDirtyChange: (dirty: boolean) => void
}

function RoleEditForm({ role, onSaved, onDirtyChange }: RoleEditFormProps) {
  const toast = useToast()
  const queryClient = useQueryClient()

  // Form state mirrors the editable fields. Empty strings for text inputs
  // are converted to null on save (so "clear the field" works).
  const [title, setTitle] = useState(role.title ?? '')
  const [description, setDescription] = useState(role.description ?? '')
  const [status, setStatus] = useState<RoleStatus>(role.status)
  const [locationRequirement, setLocationRequirement] = useState(role.location_requirement ?? '')
  // City and Country are index-aligned parallel arrays, edited as comma lists.
  const [city, setCity] = useState((role.city ?? []).join(', '))
  const [country, setCountry] = useState((role.country ?? []).join(', '))
  const [salaryMin, setSalaryMin] = useState(
    role.salary_min != null ? String(role.salary_min) : '',
  )
  const [salaryMax, setSalaryMax] = useState(
    role.salary_max != null ? String(role.salary_max) : '',
  )
  const [budgetCurrency, setBudgetCurrency] = useState(role.budget_currency ?? '')
  const [startDeadline, setStartDeadline] = useState(
    role.start_deadline ? role.start_deadline.slice(0, 10) : '',
  )
  const [sponsorship, setSponsorship] = useState<'unknown' | 'yes' | 'no'>(
    role.provides_sponsorship === true ? 'yes'
      : role.provides_sponsorship === false ? 'no'
      : 'unknown',
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dirty tracking — true when any field diverges from the persisted role.
  // Compared against the same normalisations used to initialise the form so
  // a string-trim or array-join doesn't falsely flag dirty.
  const isDirty = useMemo(() => {
    return (
      title !== (role.title ?? '') ||
      description !== (role.description ?? '') ||
      status !== role.status ||
      locationRequirement !== (role.location_requirement ?? '') ||
      city !== (role.city ?? []).join(', ') ||
      country !== (role.country ?? []).join(', ') ||
      salaryMin !== (role.salary_min != null ? String(role.salary_min) : '') ||
      salaryMax !== (role.salary_max != null ? String(role.salary_max) : '') ||
      budgetCurrency !== (role.budget_currency ?? '') ||
      startDeadline !== (role.start_deadline ? role.start_deadline.slice(0, 10) : '') ||
      sponsorship !== (
        role.provides_sponsorship === true ? 'yes'
          : role.provides_sponsorship === false ? 'no'
          : 'unknown'
      )
    )
  }, [
    role, title, description, status, locationRequirement, city, country,
    salaryMin, salaryMax, budgetCurrency, startDeadline, sponsorship,
  ])

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  // Re-sync if the underlying role changes (e.g. background refetch).
  useEffect(() => {
    setTitle(role.title ?? '')
    setDescription(role.description ?? '')
    setStatus(role.status)
    setLocationRequirement(role.location_requirement ?? '')
    setCity((role.city ?? []).join(', '))
    setCountry((role.country ?? []).join(', '))
    setSalaryMin(role.salary_min != null ? String(role.salary_min) : '')
    setSalaryMax(role.salary_max != null ? String(role.salary_max) : '')
    setBudgetCurrency(role.budget_currency ?? '')
    setStartDeadline(role.start_deadline ? role.start_deadline.slice(0, 10) : '')
    setSponsorship(
      role.provides_sponsorship === true ? 'yes'
        : role.provides_sponsorship === false ? 'no'
        : 'unknown',
    )
  }, [role])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    const min = salaryMin.trim() ? Number(salaryMin) : null
    const max = salaryMax.trim() ? Number(salaryMax) : null
    if (min != null && !Number.isFinite(min)) { setError('Salary min must be a number.'); return }
    if (max != null && !Number.isFinite(max)) { setError('Salary max must be a number.'); return }
    if (min != null && max != null && min > max) {
      setError('Salary min cannot be greater than salary max.')
      return
    }

    const cities = splitList(city)
    const countries = splitList(country)

    const patch: RolePatch = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      location_requirement: locationRequirement.trim() || null,
      city: cities.length > 0 ? cities : null,
      country: countries.length > 0 ? countries : null,
      salary_min: min,
      salary_max: max,
      budget_currency: budgetCurrency.trim() || null,
      start_deadline: startDeadline || null,
      provides_sponsorship:
        sponsorship === 'unknown' ? null : sponsorship === 'yes',
    }

    setSaving(true)
    const toastId = toast.show('loading', `Saving "${patch.title}"…`)
    try {
      await telemetry.timed(
        'role_edit_save',
        () => updateRole(role.id, patch),
        { props: { role_id: role.id } },
      )
      telemetry.capture('role_edited', {
        role_id: role.id,
        fields_changed: Object.keys(patch).length,
      })
      toast.update(toastId, 'success', `Saved "${patch.title}".`)
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      onSaved()
    } catch (err) {
      const msg = (err as Error).message
      setError(msg)
      toast.update(toastId, 'error', `Save failed: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  // Soft, non-blocking sanity checks surfaced inline.
  const cityCount = splitList(city).length
  const countryCount = splitList(country).length
  const locationCountMismatch =
    cityCount > 0 && countryCount > 0 && cityCount !== countryCount

  const salaryWarning = useMemo(() => {
    const band = salaryBand(budgetCurrency)
    if (!band) return null
    const vals = [salaryMin, salaryMax]
      .map((s) => (s.trim() ? Number(s) : null))
      .filter((n): n is number => n != null && Number.isFinite(n))
    if (!vals.some((n) => n < band.lo || n > band.hi)) return null
    const cur = budgetCurrency.trim().toUpperCase()
    return `That looks outside the usual monthly ${cur} range (${band.lo.toLocaleString()}–${band.hi.toLocaleString()}). Double-check it's a monthly figure.`
  }, [budgetCurrency, salaryMin, salaryMax])

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-5 max-w-2xl mx-auto">
      <Field label="Title" required>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          className={`${inputClass} resize-y min-h-[120px]`}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as RoleStatus)}
            className={inputClass}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="draft">Draft</option>
          </select>
        </Field>
        <Field label="Sponsorship">
          <select
            value={sponsorship}
            onChange={(e) => setSponsorship(e.target.value as 'unknown' | 'yes' | 'no')}
            className={inputClass}
          >
            <option value="unknown">Unknown</option>
            <option value="yes">Yes — provided</option>
            <option value="no">No — not provided</option>
          </select>
        </Field>
      </div>

      <Field
        label="Location requirement"
        hint="Work arrangement for the role."
      >
        <select
          value={locationRequirement}
          onChange={(e) => setLocationRequirement(e.target.value)}
          className={inputClass}
        >
          <option value="">Unspecified</option>
          <option value="remote">Remote</option>
          <option value="onsite">Onsite</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="City" hint="Comma-separated, one per location.">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Kuala Lumpur, Paris"
            className={inputClass}
          />
        </Field>
        <Field label="Country" hint="Comma-separated, aligned with City.">
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Malaysia, France"
            className={inputClass}
          />
        </Field>
      </div>
      {locationCountMismatch && (
        <p className="-mt-3 text-[11px] text-amber-700">
          City and Country have different counts ({cityCount} vs {countryCount}) — they pair up by position, so an entry will misalign.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field label="Salary min" hint="Monthly">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={salaryMin}
            onChange={(e) => setSalaryMin(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Salary max" hint="Monthly">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={salaryMax}
            onChange={(e) => setSalaryMax(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Currency">
          <input
            type="text"
            value={budgetCurrency}
            onChange={(e) => setBudgetCurrency(e.target.value)}
            placeholder="USD"
            maxLength={8}
            className={inputClass}
          />
        </Field>
      </div>
      {salaryWarning && (
        <p className="-mt-3 text-[11px] text-amber-700">⚠ {salaryWarning}</p>
      )}

      <Field label="Start deadline">
        <input
          type="date"
          value={startDeadline}
          onChange={(e) => setStartDeadline(e.target.value)}
          className={inputClass}
        />
      </Field>

      {error && (
        <p className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          data-telemetry-id="role-edit-save"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-white font-semibold active:bg-primaryDark transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Split a comma-separated input into a trimmed, non-empty string array. */
function splitList(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

/** Sanity band for a *monthly* salary, by currency. USD/EUR share a band;
 *  MYR is ~5×. Unknown currencies are not checked. */
function salaryBand(currency: string): { lo: number; hi: number } | null {
  const c = currency.trim().toUpperCase()
  if (c === 'USD' || c === 'EUR') return { lo: 1000, hi: 10000 }
  if (c === 'MYR') return { lo: 5000, hi: 50000 }
  return null
}

// ─── Tiny field wrapper ────────────────────────────────────────────────────

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-treeTextSec uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && (
        <span className="block text-[11px] text-treeTextSec mt-1 leading-snug">
          {hint}
        </span>
      )}
    </label>
  )
}

const inputClass =
  'w-full bg-treeSurface border border-treeBorder text-treeText rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary'
