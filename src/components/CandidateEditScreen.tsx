import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { getCandidate, updateCandidate, type CandidateDetail, type CandidatePatch } from '../lib/api'
import { useToast } from './Toast'
import { telemetry } from '../lib/telemetry'

interface CandidateEditScreenProps {
  talentId: string
  onClose: () => void
  onSaved: (talentId: string) => void
}

export function CandidateEditScreen({ talentId, onClose, onSaved }: CandidateEditScreenProps) {
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFetchError(null)
    getCandidate(talentId)
      .then((c) => { if (!cancelled) { setCandidate(c); setLoading(false) } })
      .catch((err) => { if (!cancelled) { setFetchError((err as Error).message); setLoading(false) } })
    return () => { cancelled = true }
  }, [talentId])

  const handleBack = () => {
    if (isDirty) {
      const ok = window.confirm('Discard unsaved changes?')
      if (!ok) {
        telemetry.capture('candidate_edit_discard_cancelled', { talent_id: talentId })
        return
      }
      telemetry.capture('candidate_edit_discarded', { talent_id: talentId })
    }
    onClose()
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-treeBg">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-4 h-[50px] flex items-center gap-3 z-10">
        <button
          data-telemetry-id="candidate-edit-back"
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900 -ml-2 px-2 py-1 rounded"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <h1 className="text-sm font-semibold text-slate-800 truncate flex-1">
          {candidate?.name ?? 'Edit candidate'}
        </h1>
        {isDirty && (
          <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">
            Unsaved
          </span>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-treeSurface border border-treeBorder rounded-xl animate-pulse" />
            ))}
          </div>
        ) : fetchError ? (
          <div className="p-6 text-center text-sm text-red-700">{fetchError}</div>
        ) : candidate ? (
          <CandidateEditForm
            candidate={candidate}
            onSaved={() => onSaved(talentId)}
            onDirtyChange={setIsDirty}
          />
        ) : null}
      </main>
    </div>
  )
}

// ─── Form ──────────────────────────────────────────────────────────────────

interface CandidateEditFormProps {
  candidate: CandidateDetail
  onSaved: () => void
  onDirtyChange: (dirty: boolean) => void
}

function CandidateEditForm({ candidate, onSaved, onDirtyChange }: CandidateEditFormProps) {
  const toast = useToast()

  const initialSkills = candidate.skills.map((s) => s.skill_name).join(', ')
  const initialCertifications = (candidate.certifications ?? []).join(', ')
  const initialLanguages = (candidate.languages ?? []).join(', ')

  const [name, setName] = useState(candidate.name ?? '')
  const [email, setEmail] = useState(candidate.email ?? '')
  const [phone, setPhone] = useState(candidate.phone ?? '')
  const [city, setCity] = useState(candidate.city ?? '')
  const [country, setCountry] = useState(candidate.country ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(candidate.linkedin_url ?? '')
  const [visaStatus, setVisaStatus] = useState(candidate.visa_status ?? '')
  const [visaExpirationDate, setVisaExpirationDate] = useState(
    candidate.visa_expiration_date ? candidate.visa_expiration_date.slice(0, 10) : '',
  )
  const [workRights, setWorkRights] = useState(candidate.work_rights ?? '')
  const [availability, setAvailability] = useState(candidate.availability_status ?? '')
  const [availableFrom, setAvailableFrom] = useState(
    candidate.available_from ? candidate.available_from.slice(0, 10) : '',
  )
  const [noticeDays, setNoticeDays] = useState(
    candidate.notice_period_days != null ? String(candidate.notice_period_days) : '',
  )
  const [rate, setRate] = useState(candidate.rate != null ? String(candidate.rate) : '')
  const [rateType, setRateType] = useState(candidate.rate_type ?? '')
  const [currency, setCurrency] = useState(candidate.currency ?? '')
  const [rotation, setRotation] = useState(candidate.rotation_preference ?? '')
  const [skills, setSkills] = useState(initialSkills)
  const [certifications, setCertifications] = useState(initialCertifications)
  const [languages, setLanguages] = useState(initialLanguages)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty = useMemo(() => (
    name !== (candidate.name ?? '') ||
    email !== (candidate.email ?? '') ||
    phone !== (candidate.phone ?? '') ||
    city !== (candidate.city ?? '') ||
    country !== (candidate.country ?? '') ||
    linkedinUrl !== (candidate.linkedin_url ?? '') ||
    visaStatus !== (candidate.visa_status ?? '') ||
    visaExpirationDate !== (candidate.visa_expiration_date ? candidate.visa_expiration_date.slice(0, 10) : '') ||
    workRights !== (candidate.work_rights ?? '') ||
    availability !== (candidate.availability_status ?? '') ||
    availableFrom !== (candidate.available_from ? candidate.available_from.slice(0, 10) : '') ||
    noticeDays !== (candidate.notice_period_days != null ? String(candidate.notice_period_days) : '') ||
    rate !== (candidate.rate != null ? String(candidate.rate) : '') ||
    rateType !== (candidate.rate_type ?? '') ||
    currency !== (candidate.currency ?? '') ||
    rotation !== (candidate.rotation_preference ?? '') ||
    skills !== initialSkills ||
    certifications !== initialCertifications ||
    languages !== initialLanguages
  ), [
    candidate, name, email, phone, city, country, linkedinUrl, visaStatus,
    visaExpirationDate, workRights, availability, availableFrom, noticeDays,
    rate, rateType, currency, rotation, skills, certifications, languages,
    initialSkills, initialCertifications, initialLanguages,
  ])

  useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) { setError('Name is required.'); return }

    const rateNum = rate.trim() ? Number(rate) : null
    if (rateNum != null && !Number.isFinite(rateNum)) { setError('Rate must be a number.'); return }
    const noticeDaysNum = noticeDays.trim() ? Number(noticeDays) : null
    if (noticeDaysNum != null && (!Number.isFinite(noticeDaysNum) || noticeDaysNum < 0)) {
      setError('Notice period must be a non-negative number.'); return
    }

    const skillList = skills.split(',').map((s) => s.trim()).filter(Boolean)
    const certList = certifications.split(',').map((s) => s.trim()).filter(Boolean)
    const langList = languages.split(',').map((s) => s.trim()).filter(Boolean)

    const patch: CandidatePatch = {
      name: name.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      city: city.trim() || null,
      country: country.trim() || null,
      linkedin_url: linkedinUrl.trim() || null,
      visa_status: visaStatus || null,
      visa_expiration_date: visaExpirationDate || null,
      work_rights: workRights.trim() || null,
      availability_status: availability || null,
      available_from: availableFrom || null,
      notice_period_days: noticeDaysNum,
      rate: rateNum,
      rate_type: rateType || null,
      currency: currency.trim() || null,
      rotation_preference: rotation || null,
      skills: skillList,
      certifications: certList,
      languages: langList,
    }

    setSaving(true)
    const toastId = toast.show('loading', `Saving "${name.trim()}"…`)
    try {
      await telemetry.timed(
        'candidate_edit_save',
        () => updateCandidate(candidate.id, patch),
        { props: { talent_id: candidate.id } },
      )
      telemetry.capture('candidate_edited', { talent_id: candidate.id })
      toast.update(toastId, 'success', `Saved "${name.trim()}".`)
      onSaved()
    } catch (err) {
      const msg = (err as Error).message
      setError(msg)
      toast.update(toastId, 'error', `Save failed: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-5 max-w-2xl mx-auto">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" required>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </Field>
        <Field label="LinkedIn URL">
          <input type="url" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kuala Lumpur" className={inputClass} />
        </Field>
        <Field label="Country">
          <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Malaysia" className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Visa status">
          <select value={visaStatus} onChange={(e) => setVisaStatus(e.target.value)} className={inputClass}>
            <option value="">Unspecified</option>
            <option value="citizen">Citizen</option>
            <option value="permanent_resident">Permanent resident</option>
            <option value="work_visa">Work visa</option>
            <option value="sponsorship_needed">Sponsorship needed</option>
          </select>
        </Field>
        <Field label="Visa expiry date">
          <input type="date" value={visaExpirationDate} onChange={(e) => setVisaExpirationDate(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field label="Work rights" hint="e.g. Malaysian PR, eligible to work in MY/SG without sponsorship">
        <input type="text" value={workRights} onChange={(e) => setWorkRights(e.target.value)} className={inputClass} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Rotation preference">
          <select value={rotation} onChange={(e) => setRotation(e.target.value)} className={inputClass}>
            <option value="">Unspecified</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
        </Field>
        <Field label="Languages" hint="Comma-separated, e.g. English, Malay, French">
          <input type="text" value={languages} onChange={(e) => setLanguages(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Availability">
          <select value={availability} onChange={(e) => setAvailability(e.target.value)} className={inputClass}>
            <option value="">Unspecified</option>
            <option value="yes">Yes — available now</option>
            <option value="maybe">Maybe — open to offers</option>
            <option value="no">No — not looking</option>
          </select>
        </Field>
        <Field label="Available from">
          <input type="date" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field label="Notice period (days)">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={noticeDays}
          onChange={(e) => setNoticeDays(e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Rate">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Rate type">
          <select value={rateType} onChange={(e) => setRateType(e.target.value)} className={inputClass}>
            <option value="">Unspecified</option>
            <option value="day">Day rate</option>
            <option value="hourly">Hourly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>
        <Field label="Currency">
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="USD"
            maxLength={8}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Skills" hint="Comma-separated list of skills.">
        <textarea
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          rows={3}
          placeholder="Python, Reservoir engineering, Petrel, …"
          className={`${inputClass} resize-y`}
        />
      </Field>

      <Field label="Certifications" hint="Comma-separated list of certifications.">
        <textarea
          value={certifications}
          onChange={(e) => setCertifications(e.target.value)}
          rows={2}
          placeholder="BOSIET, H2S, PMP, …"
          className={`${inputClass} resize-y`}
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
          data-telemetry-id="candidate-edit-save"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-white font-semibold active:bg-primaryDark transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving…' : 'Save candidate'}
        </button>
      </div>
    </form>
  )
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
        <span className="block text-[11px] text-treeTextSec mt-1 leading-snug">{hint}</span>
      )}
    </label>
  )
}

const inputClass =
  'w-full bg-treeSurface border border-treeBorder text-treeText rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary'
