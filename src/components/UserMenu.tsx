import { useState, useRef, useEffect } from 'react'
import { LogOut } from 'lucide-react'
import { signOut, useAuth } from '../lib/auth'
import { telemetry } from '../lib/telemetry'

// Header avatar + popover. Always shown once authenticated so every user
// has a way to sign out (the recruiter dropdown is admin-only).
export function UserMenu() {
  const { user, recruiter, isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const name = recruiter?.name ?? user?.email ?? '?'
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  const email = user?.email ?? ''

  return (
    <div ref={ref} className="relative">
      <button
        data-telemetry-id="user-menu-toggle"
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-primary text-white text-sm font-semibold flex items-center justify-center hover:opacity-90 transition-opacity"
        aria-label="Account menu"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[220px]">
          <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
          {email && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{email}</p>
          )}
          {isAdmin && (
            <span className="inline-block mt-2 text-[10px] uppercase tracking-wider font-semibold text-primary bg-primary/10 border border-primary/30 rounded-full px-2 py-0.5">
              Admin
            </span>
          )}
          <hr className="my-2 border-slate-200" />
          <button
            data-telemetry-id="user-menu-sign-out"
            onClick={() => {
              telemetry.capture('user_signed_out', { is_admin: isAdmin })
              void signOut()
            }}
            className="w-full flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded px-2 py-1.5 transition-colors"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
