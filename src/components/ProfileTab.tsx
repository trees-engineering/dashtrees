import {
  useEffect, useState,
  type ChangeEvent, type ReactNode, type InputHTMLAttributes,
} from 'react'
import { Loader2, Save } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { updateProfile } from '../lib/api'
import { useToast } from './Toast'
import { telemetry } from '../lib/telemetry'

const ABOUT_MAX = 1000 // keep in sync with the server (ABOUT_MAX in index.ts)

interface Form {
  name: string
  position: string
  linkedin_url: string
  booking_link: string
  about: string
}
const EMPTY: Form = { name: '', position: '', linkedin_url: '', booking_link: '', about: '' }

/** Self-service recruiter profile. Reads the logged-in recruiter's own row via
 *  the Supabase client; saves through the backend (which forces the row id and
 *  keeps email immutable). */
export function ProfileTab() {
  const { recruiter } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Form>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!recruiter) return
    let cancelled = false
    telemetry.capture('profile_viewed', {})
    void supabase
      .from('_recruiters')
      .select('name, position, linkedin_url, booking_link, about')
      .eq('id', recruiter.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          toast.show('error', 'Could not load your profile.')
        } else if (data) {
          setForm({
            name: data.name ?? '',
            position: data.position ?? '',
            linkedin_url: data.linkedin_url ?? '',
            booking_link: data.booking_link ?? '',
            about: data.about ?? '',
          })
        }
        setLoading(false)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recruiter?.id])

  const update = (key: keyof Form) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const aboutOver = form.about.length > ABOUT_MAX
  const canSave = !saving && !loading && !aboutOver

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      await updateProfile({
        name: form.name,
        position: form.position,
        linkedin_url: form.linkedin_url,
        booking_link: form.booking_link,
        about: form.about,
      })
      telemetry.capture('profile_saved', { about_length: form.about.length })
      queryClient.invalidateQueries({ queryKey: ['recruiters'] })
      toast.show('success', 'Profile saved.')
    } catch (err) {
      toast.show('error', `Save failed: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h2 className="text-xs font-semibold text-treeTextSec uppercase tracking-wider">Profile</h2>
          <p className="text-xs text-treeTextSec mt-1">
            Manage how you appear across the dashboard and candidate dossiers.
          </p>
        </div>

        {loading ? (
          <div className="h-64 bg-treeSurface border border-treeBorder rounded-xl animate-pulse" />
        ) : (
          <div className="bg-treeSurface border border-treeBorder rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
            <Field label="Email">
              <input
                type="email"
                value={recruiter?.email ?? ''}
                disabled
                className="w-full rounded-lg border border-treeBorder bg-treeSurface2 text-treeTextSec text-sm px-3 py-2 cursor-not-allowed"
              />
              <p className="text-[11px] text-treeTextSec mt-1">
                Managed by your Google login — can't be changed here.
              </p>
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Name">
                <Input value={form.name} onChange={update('name')} placeholder="Your full name" />
              </Field>
              <Field label="Position">
                <Input value={form.position} onChange={update('position')} placeholder="e.g. Senior Recruiter" />
              </Field>
            </div>

            <Field label="LinkedIn">
              <Input value={form.linkedin_url} onChange={update('linkedin_url')} placeholder="https://linkedin.com/in/..." />
            </Field>

            <Field label="Booking link">
              <Input value={form.booking_link} onChange={update('booking_link')} placeholder="https://calendar.app.google/..." />
            </Field>

            <Field label="About">
              <textarea
                data-telemetry-id="profile-about"
                value={form.about}
                onChange={update('about')}
                rows={5}
                placeholder="A short bio shown to clients on candidate dossiers (max 1000 characters)..."
                className="w-full rounded-lg border border-treeBorder bg-white text-treeText text-sm px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              />
              <p className={`text-[11px] mt-1 text-right ${aboutOver ? 'text-statusRed font-semibold' : 'text-treeTextSec'}`}>
                {form.about.length} / {ABOUT_MAX}
              </p>
            </Field>

            <div className="flex justify-end">
              <button
                data-telemetry-id="profile-save"
                onClick={handleSave}
                disabled={!canSave}
                className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-lg active:bg-primaryDark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-treeTextSec mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-treeBorder bg-white text-treeText text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
    />
  )
}
