// Auth state, Google OAuth helpers, and the React context that drives the
// app-level gate (LoginScreen / NoAccessScreen / app shell).
//
// Identity flow:
//   1. Supabase Google OAuth populates auth.users.email
//   2. We look up _recruiters by email (case-insensitive)
//   3. Status:
//      - 'loading'         → checking session
//      - 'unauthenticated' → no session, show LoginScreen
//      - 'no-access'       → session but no _recruiters row, show NoAccessScreen
//      - 'ready'           → session + recruiter row, render the app
//
// Admins (is_admin = true on the recruiter row) get the dropdown + see all
// recruiters' data. Non-admins are scoped to their own email. The actual
// dropdown/scoping logic lives in App.tsx and the hooks — this file only
// resolves the identity.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Recruiter } from '../types'

export type AuthStatus = 'loading' | 'unauthenticated' | 'no-access' | 'ready'

export interface AuthState {
  status: AuthStatus
  user: User | null
  recruiter: Recruiter | null
  isAdmin: boolean
}

const initialState: AuthState = {
  status: 'loading',
  user: null,
  recruiter: null,
  isAdmin: false,
}

const AuthContext = createContext<AuthState>(initialState)

async function fetchRecruiterByEmail(email: string): Promise<Recruiter | null> {
  // ilike for case-insensitive equality — recruiter rows might have been
  // entered with mixed casing, but Google always returns a canonical email.
  const { data, error } = await supabase
    .from('_recruiters')
    .select('id, email, name, company, verified, is_admin')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[auth] _recruiters lookup failed:', error.message)
    return null
  }
  return (data as Recruiter | null) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState)

  useEffect(() => {
    let cancelled = false

    async function resolveSession(user: User | null) {
      if (!user || !user.email) {
        if (!cancelled) {
          setState({
            status: 'unauthenticated',
            user: null,
            recruiter: null,
            isAdmin: false,
          })
        }
        return
      }
      const recruiter = await fetchRecruiterByEmail(user.email)
      if (cancelled) return
      if (!recruiter) {
        setState({ status: 'no-access', user, recruiter: null, isAdmin: false })
        return
      }
      setState({
        status: 'ready',
        user,
        recruiter,
        isAdmin: Boolean(recruiter.is_admin),
      })
    }

    // Initial session load (handles page refresh).
    void supabase.auth.getSession().then(({ data }) => {
      void resolveSession(data.session?.user ?? null)
    })

    // Subscribe to subsequent changes: sign-in, sign-out, token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolveSession(session?.user ?? null)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}

export async function signInWithGoogle(): Promise<void> {
  // Explicit redirectTo overrides the Supabase project's Site URL — the
  // shared Supabase project has Treelance's URL as Site URL, so without
  // this override we'd bounce there after login.
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
